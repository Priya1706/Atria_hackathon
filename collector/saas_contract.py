"""Versioned SaaS payload builder; isolated so the proposed contract can change."""
from datetime import datetime, timezone
import hashlib
import json
import uuid

SCHEMA_VERSION = "1.0"
METRIC_NAMES = {
    "cpu_utilization": ("cpu_usage", "percent"),
    "memory_utilization": ("memory_usage", "percent"),
    "disk_utilization": ("disk_usage", "percent"),
    "bandwidth_utilization_percent": ("bandwidth_usage", "percent"),
    "network_latency_ms": ("network_latency", "ms"),
    "network_bytes_sent_per_second": ("network_bytes_sent_per_second", "bytes/second"),
    "network_bytes_received_per_second": ("network_bytes_received_per_second", "bytes/second"),
    "packet_loss_percent": ("packet_loss", "percent"),
    "connectivity": ("connectivity", "ratio"),
    "service_availability": ("service_availability", "ratio"),
    "failed_auth_attempts": ("failed_authentication_count", "count"),
    "security_event_summary": ("security_event_count", "count"),
}
APPROVED_METRIC_FIELDS = ("metric_id", "source", "metric_name", "value", "unit", "timestamp")


def make_batch(metrics: list[dict], collector_id: str, batch_id: str | None = None, timestamp: datetime | None = None):
    batch_id = batch_id or str(uuid.uuid4())
    timestamp = timestamp or datetime.now(timezone.utc)
    output_metrics = []
    for event in metrics:
        metric_name, unit = METRIC_NAMES[event["metric_name"]]
        output_metrics.append({
            "metric_id": event["event_id"],
            "source": event["source_identifier"],
            "metric_name": metric_name,
            "value": event["metric_value"],
            "unit": unit,
            "timestamp": event["timestamp_utc"],
        })
    body = {
        "schema_version": SCHEMA_VERSION,
        "batch_id": batch_id,
        "collector_id": collector_id,
        "timestamp": timestamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "metrics": output_metrics,
    }
    # Defensive final schema assertion at the serialization boundary.
    if any(set(metric) != set(APPROVED_METRIC_FIELDS) for metric in output_metrics):
        raise ValueError("SaaS metric schema validation failed")
    serialized = json.dumps(body, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return body, serialized, hashlib.sha256(serialized.encode("utf-8")).hexdigest()
