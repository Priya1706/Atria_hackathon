import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from backend.app.config import CORRELATION_WINDOW_SECONDS
from backend.app.db.repository import TelemetryRepository


def _utc_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def correlate_anomalies_to_incidents(
    tenant_id: str,
    anomalies: List[Dict[str, Any]],
    repo: TelemetryRepository,
) -> List[Dict[str, Any]]:
    """Group same-source anomalies in bounded windows and update active incidents."""
    if not anomalies:
        return []

    by_source: Dict[str, List[Dict[str, Any]]] = {}
    for anomaly in anomalies:
        by_source.setdefault(anomaly["source"], []).append(anomaly)

    handled: List[Dict[str, Any]] = []
    for source, source_anomalies in by_source.items():
        ordered = sorted(source_anomalies, key=lambda item: _utc_datetime(item["detected_at"]))
        groups: List[List[Dict[str, Any]]] = []
        for anomaly in ordered:
            timestamp = _utc_datetime(anomaly["detected_at"])
            if (not groups or timestamp - _utc_datetime(groups[-1][0]["detected_at"])
                    > timedelta(seconds=CORRELATION_WINDOW_SECONDS)):
                groups.append([anomaly])
            else:
                groups[-1].append(anomaly)

        for group in groups:
            latest_dt = max(_utc_datetime(item["detected_at"]) for item in group)
            latest_ts = latest_dt.isoformat()
            window_start = (latest_dt - timedelta(seconds=CORRELATION_WINDOW_SECONDS)).isoformat()
            names = sorted({item["metric_name"] for item in group})
            severity = "CRITICAL" if any(item["severity"] == "CRITICAL" for item in group) else "WARNING"
            existing = repo.find_active_incident(tenant_id, source, window_start, latest_ts)

            if existing:
                incident_id = existing["incident_id"]
                merged = sorted(set(json.loads(existing["related_metrics_json"]) + names))
                severity = "CRITICAL" if existing["severity"] == "CRITICAL" or severity == "CRITICAL" else "WARNING"
                last_updated = max(_utc_datetime(existing["last_updated_at"]), latest_dt).isoformat()
                repo.update_incident(
                    incident_id=incident_id,
                    tenant_id=tenant_id,
                    severity=severity,
                    updated_at=last_updated,
                    related_metrics=merged,
                )
                if existing["lifecycle_stage"] == "RECOVERING":
                    repo.set_incident_lifecycle(
                        incident_id, tenant_id, "INVESTIGATING", None, latest_ts,
                        "A new anomaly occurred during recovery; the recovery window was reset.",
                        status=existing["status"],
                    )
                handled.append({
                    "incident_id": incident_id,
                    "tenant_id": tenant_id,
                    "affected_source": source,
                    "severity": severity,
                    "title": existing["title"],
                    "description": existing["description"],
                    "status": existing["status"],
                    "first_detected_at": existing["first_detected_at"],
                    "last_updated_at": last_updated,
                    "related_metrics": merged,
                    "is_new": False,
                })
                continue

            incident_id = f"inc-{uuid.uuid4()}"
            if len(names) > 1:
                title = f"Compound Performance Degradation on {source}"
                description = (
                    f"Correlated multi-signal anomaly detected across metrics: {', '.join(names)}. "
                    "Possible cause (Hypothesis): Concurrent metric deviations suggest potential resource "
                    "contention, cascading request backlog, or underlying subsystem saturation."
                )
            else:
                name = names[0]
                title = f"Elevated {name} on {source}"
                description = (
                    f"Abnormal telemetry observed for {name}. "
                    "Possible cause (Hypothesis): Deviation exceeds baseline tolerance; potential service "
                    "stress or background job overload."
                )
            repo.create_incident(
                incident_id=incident_id,
                tenant_id=tenant_id,
                affected_source=source,
                severity=severity,
                title=title,
                description=description,
                status="OPEN",
                detected_at=latest_ts,
                related_metrics=names,
            )
            handled.append({
                "incident_id": incident_id,
                "tenant_id": tenant_id,
                "affected_source": source,
                "severity": severity,
                "title": title,
                "description": description,
                "status": "OPEN",
                "first_detected_at": latest_ts,
                "last_updated_at": latest_ts,
                "related_metrics": names,
                "is_new": True,
            })
    return handled
