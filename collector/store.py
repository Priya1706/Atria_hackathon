"""SQLite persistence for local raw input, analytics history, and exact egress bodies."""
import hashlib
import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


class Store:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.RLock()
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def db(self):
        conn = sqlite3.connect(self.path, timeout=15)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def initialize(self):
        with self._lock, self.db() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS events(event_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, collector_id TEXT NOT NULL, timestamp_utc TEXT NOT NULL, source_timezone TEXT NOT NULL, metric_name TEXT NOT NULL, metric_value REAL NOT NULL, source_identifier TEXT NOT NULL, category TEXT NOT NULL, severity TEXT NOT NULL, raw_json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS anomalies(anomaly_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, metric_name TEXT NOT NULL, observed REAL NOT NULL, baseline REAL NOT NULL, deviation REAL NOT NULL, severity TEXT NOT NULL, timestamp_utc TEXT NOT NULL, explanation TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS health_transitions(id INTEGER PRIMARY KEY AUTOINCREMENT, previous_state TEXT NOT NULL, new_state TEXT NOT NULL, reason TEXT NOT NULL, timestamp_utc TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS egress(payload_id TEXT PRIMARY KEY, event_ids TEXT NOT NULL, processing_timestamp TEXT NOT NULL, fields_removed TEXT NOT NULL, fields_redacted TEXT NOT NULL, approved_fields TEXT NOT NULL, payload_json TEXT NOT NULL, destination TEXT NOT NULL, status TEXT NOT NULL, retry_attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, collector_id TEXT NOT NULL DEFAULT '', payload_hash TEXT NOT NULL DEFAULT '', last_attempt_at TEXT, next_attempt_at TEXT, fields_sent TEXT NOT NULL DEFAULT '[]');
            CREATE TABLE IF NOT EXISTS baseline_measurements(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_name TEXT NOT NULL, value REAL NOT NULL, timestamp_utc TEXT NOT NULL, UNIQUE(metric_name,timestamp_utc,value));
            CREATE INDEX IF NOT EXISTS idx_events_metric_time ON events(metric_name,timestamp_utc);
            CREATE INDEX IF NOT EXISTS idx_baseline_metric ON baseline_measurements(metric_name,id);
            """)
            # Upgrade databases created by the first collector milestone in place.
            existing = {r[1] for r in c.execute("PRAGMA table_info(egress)")}
            for name, declaration in (("collector_id", "TEXT NOT NULL DEFAULT ''"), ("payload_hash", "TEXT NOT NULL DEFAULT ''"), ("last_attempt_at", "TEXT"), ("next_attempt_at", "TEXT"), ("fields_sent", "TEXT NOT NULL DEFAULT '[]'")):
                if name not in existing:
                    c.execute(f"ALTER TABLE egress ADD COLUMN {name} {declaration}")
            c.execute("CREATE INDEX IF NOT EXISTS idx_egress_status_due ON egress(status,next_attempt_at)")
            c.execute("UPDATE egress SET status='sent' WHERE status='delivered'")
            retry_before = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
            c.execute("UPDATE egress SET status='pending' WHERE status='inflight' AND (last_attempt_at IS NULL OR last_attempt_at<?)", (retry_before,))

    def rows(self, table: str, limit: int = 100):
        if table not in {"events", "anomalies", "health_transitions", "egress"}:
            raise ValueError("invalid table")
        limit = max(1, min(int(limit), 1000))
        with self.db() as c:
            return [dict(r) for r in c.execute(f"SELECT * FROM {table} ORDER BY rowid DESC LIMIT ?", (limit,))]

    def latest_events(self, limit: int = 10000):
        limit = max(1, min(int(limit), 10000))
        with self.db() as c:
            return [dict(r) for r in c.execute("SELECT * FROM events ORDER BY timestamp_utc DESC,rowid DESC LIMIT ?", (limit,))]

    def baseline_values(self, metric: str, before_timestamp: str, limit: int = 20):
        with self.db() as c:
            rows = c.execute("SELECT value FROM baseline_measurements WHERE metric_name=? AND timestamp_utc<=? ORDER BY timestamp_utc DESC,id DESC LIMIT ?", (metric, before_timestamp, limit)).fetchall()
            return [float(r[0]) for r in reversed(rows)]

    def add_baseline(self, metric: str, value: float, timestamp: str):
        with self.db() as c:
            c.execute("INSERT OR IGNORE INTO baseline_measurements(metric_name,value,timestamp_utc) VALUES(?,?,?)", (metric, value, timestamp))

    def enqueue(self, payload_id: str, event_ids: list[str], payload: dict[str, Any], removed: list[str], redacted: list[str], fields: list[str], destination: str, collector_id: str, exact_json: str | None = None):
        body = exact_json if exact_json is not None else json.dumps(payload, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
        created = datetime.now(timezone.utc).isoformat()
        digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
        with self.db() as c:
            c.execute("""INSERT OR IGNORE INTO egress(payload_id,event_ids,processing_timestamp,fields_removed,fields_redacted,approved_fields,payload_json,destination,status,retry_attempts,last_error,collector_id,payload_hash,last_attempt_at,next_attempt_at,fields_sent)
                         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (payload_id, json.dumps(event_ids), created, json.dumps(removed), json.dumps(redacted), json.dumps(fields), body, destination, "pending", 0, None, collector_id, digest, None, created, json.dumps(fields)))

    def pending(self, due_only: bool = True):
        now = datetime.now(timezone.utc).isoformat()
        with self.db() as c:
            sql = "SELECT * FROM egress WHERE status IN ('pending','failed')"
            params: tuple[Any, ...] = ()
            if due_only:
                sql += " AND (next_attempt_at IS NULL OR next_attempt_at<=?)"
                params = (now,)
            sql += " ORDER BY processing_timestamp"
            return [dict(r) for r in c.execute(sql, params)]

    def all_queue(self, limit: int = 100):
        with self.db() as c:
            return [dict(r) for r in c.execute("SELECT * FROM egress ORDER BY processing_timestamp DESC LIMIT ?", (max(1, min(limit, 1000)),))]

    def get_egress(self, payload_id: str):
        with self.db() as c:
            row = c.execute("SELECT * FROM egress WHERE payload_id=?", (payload_id,)).fetchone()
            return dict(row) if row else None

    def claim(self, payload_id: str):
        """Atomic in-process and SQLite claim prevents concurrent duplicate attempts."""
        with self._lock, self.db() as c:
            c.execute("BEGIN IMMEDIATE")
            now = datetime.now(timezone.utc).isoformat()
            updated = c.execute("UPDATE egress SET status='inflight', retry_attempts=retry_attempts+1, last_attempt_at=? WHERE payload_id=? AND status IN ('pending','failed') AND (next_attempt_at IS NULL OR next_attempt_at<=?)", (now, payload_id, now)).rowcount
            if not updated:
                return None
            return dict(c.execute("SELECT * FROM egress WHERE payload_id=?", (payload_id,)).fetchone())

    def update_egress(self, payload_id: str, status: str, error: str | None = None, backoff_seconds: float = 0):
        if status not in {"pending", "failed", "sent"}:
            raise ValueError("invalid egress status")
        now = datetime.now(timezone.utc)
        next_at = (now + timedelta(seconds=backoff_seconds)).isoformat() if status == "failed" else now.isoformat()
        with self.db() as c:
            c.execute("UPDATE egress SET status=?, last_error=?, next_attempt_at=? WHERE payload_id=?", (status, error[:300] if error else None, next_at, payload_id))

    def counts(self):
        with self.db() as c:
            counts = {r[0]: r[1] for r in c.execute("SELECT status, count(*) FROM egress GROUP BY status")}
        return {key: counts.get(key, 0) for key in ("pending", "inflight", "sent", "failed")}
