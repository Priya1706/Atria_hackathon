import json
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID


class TelemetryRepository:
    """
    Handles all database persistence operations with strict tenant isolation.
    Every query that accesses operational data MUST filter on tenant_id.
    """

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    # -------------------------------------------------------------
    # Tenants & Collectors
    # -------------------------------------------------------------
    def get_tenant_by_id(self, tenant_id: str) -> Optional[sqlite3.Row]:
        """Looks up a tenant by tenant_id."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,))
        return cursor.fetchone()

    def get_collector_by_api_key(self, api_key: str) -> Optional[sqlite3.Row]:
        """Resolves an API key to an authorized collector and tenant."""
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT c.id AS collector_id, c.tenant_id, c.name, c.is_active, t.name AS tenant_name
            FROM collectors c
            JOIN tenants t ON c.tenant_id = t.id
            WHERE c.api_key = ?
            """,
            (api_key,),
        )
        return cursor.fetchone()

    # -------------------------------------------------------------
    # Telemetry Ingestion & Idempotency
    # -------------------------------------------------------------
    def batch_exists(self, batch_id: str) -> bool:
        """Checks if a batch_id has already been processed (idempotency key)."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT 1 FROM telemetry_batches WHERE batch_id = ?", (batch_id,))
        return cursor.fetchone() is not None

    def metric_id_exists(self, metric_id: str) -> bool:
        """Enforces global uniqueness of metric_id across all batches and tenants."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT 1 FROM telemetry_records WHERE metric_id = ?", (metric_id,))
        return cursor.fetchone() is not None

    def save_batch(
        self,
        batch_id: str,
        tenant_id: str,
        collector_id: str,
        timestamp: str,
        schema_version: str,
        metadata: Optional[Dict[str, Any]],
        metrics: List[Dict[str, Any]],
    ) -> None:
        """
        Atomically saves the telemetry batch and all its individual metric records,
        and updates the collector's last_heartbeat timestamp.
        """
        now_utc = datetime.now(timezone.utc).isoformat()
        metadata_str = json.dumps(metadata) if metadata else None

        cursor = self.conn.cursor()
        try:
            # 1. Insert telemetry batch
            cursor.execute(
                """
                INSERT INTO telemetry_batches (
                    batch_id, tenant_id, collector_id, timestamp, schema_version, metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (batch_id, tenant_id, collector_id, timestamp, schema_version, metadata_str, now_utc),
            )

            # 2. Insert metric records
            for m in metrics:
                cursor.execute(
                    """
                    INSERT INTO telemetry_records (
                        metric_id, batch_id, tenant_id, collector_id, source, metric_name, value, unit, timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(m["metric_id"]),
                        batch_id,
                        tenant_id,
                        collector_id,
                        m["source"],
                        m["metric_name"],
                        float(m["value"]),
                        m["unit"],
                        m["timestamp"],
                    ),
                )

            # 3. Update collector heartbeat
            cursor.execute(
                "UPDATE collectors SET last_heartbeat = ? WHERE id = ? AND tenant_id = ?",
                (timestamp, collector_id, tenant_id),
            )

            self.conn.commit()
        except Exception:
            self.conn.rollback()
            raise

    # -------------------------------------------------------------
    # Telemetry Querying
    # -------------------------------------------------------------
    def get_tenant_metrics(
        self,
        tenant_id: str,
        metric_name: Optional[str] = None,
        source: Optional[str] = None,
        from_time: Optional[str] = None,
        to_time: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[sqlite3.Row]:
        """
        Tenant-isolated retrieval of metric records with optional filtering.
        """
        cursor = self.conn.cursor()
        query = "SELECT * FROM telemetry_records WHERE tenant_id = ?"
        params: List[Any] = [tenant_id]

        if metric_name:
            query += " AND metric_name = ?"
            params.append(metric_name)
        if source:
            query += " AND source = ?"
            params.append(source)
        if from_time:
            query += " AND timestamp >= ?"
            params.append(from_time)
        if to_time:
            query += " AND timestamp <= ?"
            params.append(to_time)

        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, tuple(params))
        return cursor.fetchall()

    def count_tenant_metrics(
        self,
        tenant_id: str,
        metric_name: Optional[str] = None,
        source: Optional[str] = None,
        from_time: Optional[str] = None,
        to_time: Optional[str] = None,
    ) -> int:
        cursor = self.conn.cursor()
        query = "SELECT COUNT(*) AS cnt FROM telemetry_records WHERE tenant_id = ?"
        params: List[Any] = [tenant_id]
        if metric_name:
            query += " AND metric_name = ?"
            params.append(metric_name)
        if source:
            query += " AND source = ?"
            params.append(source)
        if from_time:
            query += " AND timestamp >= ?"
            params.append(from_time)
        if to_time:
            query += " AND timestamp <= ?"
            params.append(to_time)
        cursor.execute(query, tuple(params))
        row = cursor.fetchone()
        return row["cnt"] if row else 0

    def get_metric_history(
        self, tenant_id: str, source: str, metric_name: str, limit: int = 20
    ) -> List[float]:
        """Fetches historical values for baseline calculation."""
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT value FROM telemetry_records
            WHERE tenant_id = ? AND source = ? AND metric_name = ?
            ORDER BY timestamp DESC LIMIT ?
            """,
            (tenant_id, source, metric_name, limit),
        )
        rows = cursor.fetchall()
        return [r["value"] for r in rows]

    def get_distinct_sources(self, tenant_id: str) -> List[str]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT DISTINCT source FROM telemetry_records WHERE tenant_id = ?",
            (tenant_id,),
        )
        return [r["source"] for r in cursor.fetchall()]

    def get_latest_metrics_per_source(self, tenant_id: str, source: str) -> List[sqlite3.Row]:
        """Gets the most recent reading for each metric name for a given source."""
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT t1.*
            FROM telemetry_records t1
            INNER JOIN (
                SELECT metric_name, MAX(timestamp) AS max_time
                FROM telemetry_records
                WHERE tenant_id = ? AND source = ?
                GROUP BY metric_name
            ) t2 ON t1.metric_name = t2.metric_name AND t1.timestamp = t2.max_time
            WHERE t1.tenant_id = ? AND t1.source = ?
            """,
            (tenant_id, source, tenant_id, source),
        )
        return cursor.fetchall()

    # -------------------------------------------------------------
    # Anomalies
    # -------------------------------------------------------------
    def save_anomaly(
        self,
        anomaly_id: str,
        tenant_id: str,
        metric_id: Optional[str],
        source: str,
        metric_name: str,
        observed_value: float,
        baseline_value: Optional[float],
        severity: str,
        explanation: str,
        detected_at: str,
    ) -> None:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            INSERT INTO anomalies (
                anomaly_id, tenant_id, metric_id, source, metric_name,
                observed_value, baseline_value, severity, explanation, detected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                anomaly_id,
                tenant_id,
                metric_id,
                source,
                metric_name,
                observed_value,
                baseline_value,
                severity,
                explanation,
                detected_at,
            ),
        )
        self.conn.commit()

    def has_recent_identical_anomaly(
        self, tenant_id: str, source: str, metric_name: str, severity: str, since_timestamp: str
    ) -> bool:
        """Suppresses duplicate anomalies for identical metric & severity within cooldown window."""
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT 1 FROM anomalies
            WHERE tenant_id = ? AND source = ? AND metric_name = ? AND severity = ?
              AND detected_at >= ?
            LIMIT 1
            """,
            (tenant_id, source, metric_name, severity, since_timestamp),
        )
        return cursor.fetchone() is not None

    def get_tenant_anomalies(
        self, tenant_id: str, source: Optional[str] = None, limit: int = 50
    ) -> List[sqlite3.Row]:
        cursor = self.conn.cursor()
        if source:
            cursor.execute(
                """
                SELECT * FROM anomalies
                WHERE tenant_id = ? AND source = ?
                ORDER BY detected_at DESC LIMIT ?
                """,
                (tenant_id, source, limit),
            )
        else:
            cursor.execute(
                """
                SELECT * FROM anomalies
                WHERE tenant_id = ?
                ORDER BY detected_at DESC LIMIT ?
                """,
                (tenant_id, limit),
            )
        return cursor.fetchall()

    # -------------------------------------------------------------
    # Incidents
    # -------------------------------------------------------------
    def find_active_incident(
        self, tenant_id: str, source: str, since_timestamp: str
    ) -> Optional[sqlite3.Row]:
        """Finds open/acknowledged incident for this tenant & source within correlation window."""
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT * FROM incidents
            WHERE tenant_id = ? AND affected_source = ? AND status IN ('OPEN', 'ACKNOWLEDGED')
              AND last_updated_at >= ?
            ORDER BY last_updated_at DESC LIMIT 1
            """,
            (tenant_id, source, since_timestamp),
        )
        return cursor.fetchone()

    def create_incident(
        self,
        incident_id: str,
        tenant_id: str,
        affected_source: str,
        severity: str,
        title: str,
        description: str,
        status: str,
        detected_at: str,
        related_metrics: List[str],
    ) -> None:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            INSERT INTO incidents (
                incident_id, tenant_id, affected_source, severity, title, description,
                status, first_detected_at, last_updated_at, related_metrics_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                incident_id,
                tenant_id,
                affected_source,
                severity,
                title,
                description,
                status,
                detected_at,
                detected_at,
                json.dumps(related_metrics),
            ),
        )
        self.conn.commit()

    def update_incident(
        self,
        incident_id: str,
        tenant_id: str,
        severity: str,
        updated_at: str,
        related_metrics: List[str],
        additional_desc: Optional[str] = None,
    ) -> None:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            UPDATE incidents
            SET severity = ?, last_updated_at = ?, related_metrics_json = ?
            WHERE incident_id = ? AND tenant_id = ?
            """,
            (severity, updated_at, json.dumps(related_metrics), incident_id, tenant_id),
        )
        self.conn.commit()

    def set_incident_status(self, incident_id: str, tenant_id: str, status: str) -> bool:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            UPDATE incidents
            SET status = ?, last_updated_at = ?
            WHERE incident_id = ? AND tenant_id = ?
            """,
            (status, datetime.now(timezone.utc).isoformat(), incident_id, tenant_id),
        )
        self.conn.commit()
        return cursor.rowcount > 0

    def get_incident_by_id(self, incident_id: str, tenant_id: str) -> Optional[sqlite3.Row]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT * FROM incidents WHERE incident_id = ? AND tenant_id = ?",
            (incident_id, tenant_id),
        )
        return cursor.fetchone()

    def get_tenant_incidents(
        self, tenant_id: str, status: Optional[str] = None, limit: int = 50
    ) -> List[sqlite3.Row]:
        cursor = self.conn.cursor()
        if status:
            cursor.execute(
                """
                SELECT * FROM incidents
                WHERE tenant_id = ? AND status = ?
                ORDER BY last_updated_at DESC LIMIT ?
                """,
                (tenant_id, status.upper(), limit),
            )
        else:
            cursor.execute(
                """
                SELECT * FROM incidents
                WHERE tenant_id = ?
                ORDER BY last_updated_at DESC LIMIT ?
                """,
                (tenant_id, limit),
            )
        return cursor.fetchall()

    # -------------------------------------------------------------
    # Recommendations
    # -------------------------------------------------------------
    def save_recommendation(
        self,
        recommendation_id: str,
        tenant_id: str,
        incident_id: Optional[str],
        title: str,
        explanation: str,
        suggested_action: str,
        severity: str,
        created_at: str,
    ) -> None:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            INSERT INTO recommendations (
                recommendation_id, tenant_id, incident_id, title, explanation,
                suggested_action, severity, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                recommendation_id,
                tenant_id,
                incident_id,
                title,
                explanation,
                suggested_action,
                severity,
                created_at,
            ),
        )
        self.conn.commit()

    def get_tenant_recommendations(
        self, tenant_id: str, limit: int = 50
    ) -> List[sqlite3.Row]:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT * FROM recommendations
            WHERE tenant_id = ?
            ORDER BY created_at DESC LIMIT ?
            """,
            (tenant_id, limit),
        )
        return cursor.fetchall()

    # -------------------------------------------------------------
    # Health Evaluations
    # -------------------------------------------------------------
    def save_health_evaluation(
        self,
        evaluation_id: str,
        tenant_id: str,
        source: str,
        health_status: str,
        health_score: float,
        contributing_metrics: List[Dict[str, Any]],
        explanation: str,
        evaluated_at: str,
    ) -> None:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            INSERT OR REPLACE INTO health_evaluations (
                evaluation_id, tenant_id, source, health_status, health_score,
                contributing_metrics_json, explanation, evaluated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                evaluation_id,
                tenant_id,
                source,
                health_status,
                health_score,
                json.dumps(contributing_metrics),
                explanation,
                evaluated_at,
            ),
        )
        self.conn.commit()

    def get_latest_health_evaluations(self, tenant_id: str) -> List[sqlite3.Row]:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT * FROM health_evaluations
            WHERE tenant_id = ?
            ORDER BY evaluated_at DESC
            """,
            (tenant_id,),
        )
        return cursor.fetchall()
