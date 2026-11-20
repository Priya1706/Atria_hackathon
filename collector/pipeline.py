"""Local normalize/filter/analyze pipeline with a single explicit export boundary."""
import hashlib
import hmac
import json
import statistics
import uuid
from datetime import datetime, timezone

from .models import TelemetryInput
from .saas_contract import make_batch
from .settings import settings
from .store import Store

EXPORT_FIELDS = ("metric_id", "source", "metric_name", "value", "unit", "timestamp")
SENSITIVE_NAMES = {"password", "api_key", "token", "secret", "raw_log", "log", "sensitive_payload", "authorization", "email", "phone", "ssn"}
REQUIRED_HEALTH_METRICS = {"cpu_utilization", "memory_utilization", "disk_utilization", "network_latency_ms", "packet_loss_percent", "service_availability", "connectivity"}


class Pipeline:
    def __init__(self, store: Store):
        self.store = store
        transitions = store.rows("health_transitions", 1)
        self.health = transitions[0]["new_state"] if transitions else "Excellent"

    def accept(self, inputs: list[TelemetryInput]):
        if not inputs:
            raise ValueError("at least one telemetry event is required")
        normalized, removed, redacted, ids, anomalies = [], set(), set(), [], []
        # Validate tenant/collector identity for the entire batch before persisting any item.
        for item in inputs:
            if item.tenant_id != settings.tenant_id:
                raise ValueError("tenant_id does not match this collector")
            if item.collector_id != settings.collector_id:
                raise ValueError("collector_id does not match this collector")
        for item in inputs:
            event_id = str(uuid.uuid4())
            raw = item.model_dump(mode="json")
            timestamp_utc = item.timestamp_utc.replace(tzinfo=timezone.utc) if item.timestamp_utc.tzinfo is None else item.timestamp_utc.astimezone(timezone.utc)
            normalized_event = {
                "event_id": event_id, "tenant_id": item.tenant_id, "collector_id": item.collector_id,
                "timestamp_utc": timestamp_utc.isoformat().replace("+00:00", "Z"),
                "source_timezone": item.source_timezone, "metric_name": item.metric_name,
                "metric_value": item.metric_value, "source_identifier": self._pseudonym(item.source_identifier),
                "category": item.category, "severity": item.severity,
            }
            # This explicit allow-list creates the local normalized form for processing.
            if set(normalized_event) != {"event_id", "tenant_id", "collector_id", "timestamp_utc", "source_timezone", "metric_name", "metric_value", "source_identifier", "category", "severity"}:
                raise ValueError("normalized schema validation failed")
            excluded = set(raw) - {"timestamp_utc", "collector_id", "metric_name", "metric_value", "source_identifier"}
            removed.update(excluded)
            redacted.update(key for key in raw if key.lower() in SENSITIVE_NAMES)
            redacted.add("source_identifier")  # source was transformed to a keyed pseudonym
            # Raw input is retained only in the local database for local audit/debug.
            with self.store.db() as c:
                c.execute("INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?)", (event_id, item.tenant_id, item.collector_id, normalized_event["timestamp_utc"], item.source_timezone, item.metric_name, float(item.metric_value), normalized_event["source_identifier"], item.category, item.severity, json.dumps(raw, ensure_ascii=False, allow_nan=False)))
            anomaly = self._analyze(event_id, item.metric_name, float(item.metric_value), normalized_event["timestamp_utc"])
            if anomaly:
                anomalies.append(anomaly)
                with self.store.db() as c:
                    c.execute("INSERT INTO anomalies VALUES(?,?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), event_id, anomaly["metric_name"], anomaly["observed"], anomaly["baseline"], anomaly["deviation"], anomaly["severity"], anomaly["timestamp_utc"], anomaly["explanation"]))
            normalized.append(normalized_event)
            ids.append(event_id)

        batch_id = str(uuid.uuid4())
        payload, exact_json, _ = make_batch(normalized, settings.collector_id, batch_id)
        fields = ["schema_version", "batch_id", "collector_id", "timestamp", "metrics[]"] + list(EXPORT_FIELDS)
        # The tenant key never enters make_batch; final check is deliberately explicit.
        if "tenant_id" in payload or any("raw_log" in m or "password" in m for m in payload["metrics"]):
            raise ValueError("export policy validation failed")
        self.store.enqueue(batch_id, ids, payload, sorted(removed), sorted(redacted), fields, settings.saas_url or "unconfigured", settings.collector_id, exact_json)
        health = self.classify()
        return ids, anomalies, health, batch_id

    def _pseudonym(self, source: str) -> str:
        return hmac.new(settings.pseudonym_salt.encode("utf-8"), source.encode("utf-8"), hashlib.sha256).hexdigest()[:24]

    def _analyze(self, event_id: str, metric: str, value: float, timestamp: str):
        history = self.store.baseline_values(metric, timestamp, 20)
        anomaly = None
        if len(history) >= 3:
            baseline = statistics.mean(history)
            deviation = value - baseline
            scale = max(abs(baseline) * 0.25, 1.0)
            if abs(deviation) >= scale:
                severity = "critical" if abs(deviation) >= scale * 2 else "warning"
                direction = "above" if deviation > 0 else "below"
                anomaly = {"event_id": event_id, "metric_name": metric, "observed": value, "baseline": round(baseline, 4), "deviation": round(deviation, 4), "severity": severity, "timestamp_utc": timestamp, "explanation": f"Observed {value:g}, {abs(deviation):g} {direction} the mean of {len(history)} preceding {metric} measurements ({baseline:.4g})."}
        self.store.add_baseline(metric, value, timestamp)
        return anomaly

    def classify(self):
        events = self.store.latest_events(10000)
        now = datetime.now(timezone.utc)
        if not events:
            new, reason, stale = "Fair", "No telemetry has been collected.", True
        else:
            latest_time = datetime.fromisoformat(events[0]["timestamp_utc"].replace("Z", "+00:00"))
            age = (now - latest_time).total_seconds()
            stale = age > settings.stale_after_seconds
            if stale:
                new, reason = "Fair", f"Latest telemetry is stale ({max(0, int(age))} seconds old)."
            else:
                latest_by_metric = {}
                for event in events:
                    latest_by_metric.setdefault(event["metric_name"], float(event["metric_value"]))
                missing = sorted(REQUIRED_HEALTH_METRICS - latest_by_metric.keys())
                if missing:
                    new, reason = "Fair", "Telemetry is incomplete; missing recent metrics: " + ", ".join(missing)
                else:
                    cpu = latest_by_metric["cpu_utilization"]
                    loss = latest_by_metric["packet_loss_percent"]
                    auth = latest_by_metric.get("failed_auth_attempts", 0)
                    disk = latest_by_metric["disk_utilization"]
                    memory = latest_by_metric["memory_utilization"]
                    latency = latest_by_metric["network_latency_ms"]
                    availability = latest_by_metric["service_availability"]
                    connected = latest_by_metric["connectivity"]
                    security = latest_by_metric.get("security_event_summary", 0)
                    score = max(cpu, disk, memory, loss * 10, auth * 10, security * 10, min(100, latency / 10), 100 if availability < 1 else 0, 100 if connected < 1 else 0)
                    if score >= settings.health_poor_threshold:
                        new = "Poor"
                    elif score >= settings.health_fair_threshold:
                        new = "Fair"
                    elif score >= settings.health_good_threshold:
                        new = "Good"
                    else:
                        new = "Excellent"
                    reason = f"Telemetry health score {score:g}; based on latest CPU, memory, disk, latency, packet loss, availability, connectivity, and security counts."
        if new != self.health:
            previous = self.health
            self.health = new
            with self.store.db() as c:
                c.execute("INSERT INTO health_transitions(previous_state,new_state,reason,timestamp_utc) VALUES(?,?,?,?)", (previous, new, reason, now.isoformat()))
        return {"state": self.health, "stale": stale, "reason": reason}
