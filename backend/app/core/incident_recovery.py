import json
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from backend.app.config import INCIDENT_RECOVERY_WINDOW_SECONDS, STALE_TELEMETRY_SECONDS
from backend.app.core.anomaly_detection import LOWER_IS_ANOMALOUS, STATIC_THRESHOLDS, _utc_datetime
from backend.app.db.repository import TelemetryRepository


def _is_recovered(metric_name: str, value: float, baseline: float | None = None) -> bool:
    thresholds = STATIC_THRESHOLDS.get(metric_name)
    if thresholds:
        return value < thresholds["warning"]
    inverse = LOWER_IS_ANOMALOUS.get(metric_name)
    if inverse:
        return value >= inverse["warning"]
    # Unknown metrics have no fixed healthy range. Use their persisted anomaly
    # baseline conservatively; if no baseline exists, do not auto-resolve.
    return baseline is not None and value <= baseline + max(abs(baseline) * 0.20, 0.001)


def evaluate_source_incident_recovery(
    tenant_id: str,
    source: str,
    incoming_metrics: List[Dict[str, Any]],
    repo: TelemetryRepository,
    as_of_time: datetime | None = None,
) -> List[str]:
    """Move active incidents through recovery only on sustained normal evidence.

    A recovery window requires every contributing metric to be observed at least
    twice, remain normal throughout its observations, and have a fresh sample at
    or beyond the end of the configured window.
    """
    relevant = [item for item in incoming_metrics if item["source"] == source]
    if not relevant:
        return []
    now = as_of_time or datetime.now(timezone.utc)
    now = now.astimezone(timezone.utc)
    if any(_utc_datetime(item["timestamp"]) > now + timedelta(seconds=30) for item in relevant):
        return []  # Future-dated telemetry cannot advance automatic resolution.
    now_iso = now.isoformat()
    by_name = {item["metric_name"]: float(item["value"]) for item in relevant}
    resolved_ids = []

    for incident in repo.get_active_incidents_for_source(tenant_id, source):
        metric_names = json.loads(incident["related_metrics_json"])
        if not metric_names:
            continue
        baselines = {}
        for metric_name in metric_names:
            anomaly = repo.get_latest_anomaly_for_metric(
                tenant_id, source, metric_name,
                incident["first_detected_at"], incident["last_updated_at"],
            )
            if anomaly is not None and anomaly["baseline_value"] is not None:
                baselines[metric_name] = float(anomaly["baseline_value"])
        recovery_since = incident["recovery_since"]
        if not recovery_since:
            if all(name in by_name and _is_recovered(name, by_name[name], baselines.get(name)) for name in metric_names):
                repo.set_incident_lifecycle(
                    incident["incident_id"], tenant_id, "RECOVERING",
                    max(_utc_datetime(item["timestamp"]) for item in relevant).isoformat(), now_iso,
                    "All contributing metrics are currently within their recovery ranges.",
                )
            continue

        start = _utc_datetime(recovery_since)
        if now < start:
            continue  # Do not let backfilled telemetry move lifecycle time backward.
        readings = repo.get_metric_readings(tenant_id, source, metric_names, recovery_since, now_iso)
        grouped: Dict[str, List[Any]] = {name: [] for name in metric_names}
        for reading in readings:
            grouped[reading["metric_name"]].append(reading)

        abnormal = [
            reading for rows in grouped.values() for reading in rows
            if not _is_recovered(
                reading["metric_name"], float(reading["value"]), baselines.get(reading["metric_name"])
            )
        ]
        if abnormal:
            repo.set_incident_lifecycle(
                incident["incident_id"], tenant_id, "INVESTIGATING", None, now_iso,
                "A contributing metric returned to its anomaly range; recovery window reset.",
            )
            continue

        window_end = start + timedelta(seconds=INCIDENT_RECOVERY_WINDOW_SECONDS)
        if now < window_end:
            continue
        complete = True
        for name, rows in grouped.items():
            if len(rows) < 2:
                complete = False
                break
            sample_times = [_utc_datetime(row["timestamp"]) for row in rows]
            latest_time = sample_times[-1]
            if any((right - left).total_seconds() > STALE_TELEMETRY_SECONDS
                   for left, right in zip(sample_times, sample_times[1:])):
                complete = False
                break
            if latest_time < window_end or (now - latest_time).total_seconds() > STALE_TELEMETRY_SECONDS:
                complete = False
                break
        if complete:
            repo.set_incident_lifecycle(
                incident["incident_id"], tenant_id, "RESOLVED", recovery_since, now_iso,
                f"All contributing metrics remained within recovery ranges for {INCIDENT_RECOVERY_WINDOW_SECONDS}s.",
                status="RESOLVED",
            )
            resolved_ids.append(incident["incident_id"])
        elif now >= window_end:
            repo.set_incident_lifecycle(
                incident["incident_id"], tenant_id, "INVESTIGATING", None, now_iso,
                "Recovery could not be verified because a contributing metric lacked enough fresh observations; window reset.",
            )

    return resolved_ids
