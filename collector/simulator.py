"""Replaceable synthetic adapter. Values here are invented demo data, not organizer data."""
from datetime import datetime, timezone
from .settings import settings


SCENARIOS = {"normal", "sudden_cpu", "compound", "recovery"}


def sample_events(scenario: str = "normal"):
    if not settings.simulator_enabled:
        return []
    if scenario not in SCENARIOS:
        raise ValueError("unknown demo scenario")
    now = datetime.now(timezone.utc)
    samples = [("cpu_utilization", 31.0), ("memory_utilization", 48.0), ("disk_utilization", 54.0), ("bandwidth_utilization_percent", 42.0), ("network_latency_ms", 22.0), ("packet_loss_percent", 0.0), ("service_availability", 1.0), ("connectivity", 1.0), ("failed_auth_attempts", 0.0), ("security_event_summary", 0.0)]
    if scenario == "sudden_cpu":
        samples[0] = ("cpu_utilization", 98.0)
    elif scenario == "compound":
        samples[0] = ("cpu_utilization", 98.0)
        samples[1] = ("memory_utilization", 97.0)
        samples[4] = ("network_latency_ms", 550.0)
        samples[5] = ("packet_loss_percent", 6.0)
    return [dict(tenant_id=settings.tenant_id, collector_id=settings.collector_id, timestamp_utc=now, source_timezone="UTC", metric_name=metric, metric_value=value, source_identifier="demo-host-01", category="simulated", severity="info") for metric, value in samples]
