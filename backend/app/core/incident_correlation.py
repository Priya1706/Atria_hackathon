import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from backend.app.db.repository import TelemetryRepository

CORRELATION_WINDOW_SECONDS = 600  # 10-minute correlation window for related alerts


def correlate_anomalies_to_incidents(
    tenant_id: str,
    anomalies: List[Dict[str, Any]],
    repo: TelemetryRepository,
) -> List[Dict[str, Any]]:
    """
    Correlates detected anomalies into meaningful incidents:
    - Clusters anomalies occurring on the same source within a rolling time window.
    - Avoids duplicate open incidents by updating existing active incidents.
    - Strictly frames causes as hypotheses, never asserting confirmed facts.
    """
    if not anomalies:
        return []

    incidents_handled = []

    # Group anomalies by source
    anomalies_by_source: Dict[str, List[Dict[str, Any]]] = {}
    for a in anomalies:
        src = a["source"]
        anomalies_by_source.setdefault(src, []).append(a)

    for source, source_anomalies in anomalies_by_source.items():
        # Determine highest severity among new anomalies
        has_critical = any(a["severity"] == "CRITICAL" for a in source_anomalies)
        batch_severity = "CRITICAL" if has_critical else "WARNING"

        new_metric_names = list({a["metric_name"] for a in source_anomalies})
        latest_ts = max(a["detected_at"] for a in source_anomalies)

        dt = datetime.fromisoformat(latest_ts.replace("Z", "+00:00"))
        window_start = (dt - timedelta(seconds=CORRELATION_WINDOW_SECONDS)).isoformat()

        # Check if an active incident already exists for this tenant & source
        existing = repo.find_active_incident(tenant_id, source, window_start)

        if existing:
            inc_id = existing["incident_id"]
            existing_metrics = json.loads(existing["related_metrics_json"])
            merged_metrics = list(set(existing_metrics + new_metric_names))

            final_severity = "CRITICAL" if (existing["severity"] == "CRITICAL" or batch_severity == "CRITICAL") else "WARNING"

            repo.update_incident(
                incident_id=inc_id,
                tenant_id=tenant_id,
                severity=final_severity,
                updated_at=latest_ts,
                related_metrics=merged_metrics,
            )

            incidents_handled.append({
                "incident_id": inc_id,
                "tenant_id": tenant_id,
                "affected_source": source,
                "severity": final_severity,
                "title": existing["title"],
                "description": existing["description"],
                "status": existing["status"],
                "first_detected_at": existing["first_detected_at"],
                "last_updated_at": latest_ts,
                "related_metrics": merged_metrics,
                "is_new": False,
            })
        else:
            # Create a new incident
            inc_id = f"inc-{uuid.uuid4()}"

            # Formulate title and hypothesis-based description
            if len(new_metric_names) > 1:
                title = f"Compound Performance Degradation on {source}"
                description = (
                    f"Correlated multi-signal anomaly detected across metrics: {', '.join(new_metric_names)}. "
                    f"Possible cause (Hypothesis): Concurrent metric deviations suggest potential resource contention, "
                    f"cascading request backlog, or underlying subsystem saturation."
                )
            else:
                metric = new_metric_names[0]
                title = f"Elevated {metric} on {source}"
                description = (
                    f"Abnormal telemetry observed for {metric}. "
                    f"Possible cause (Hypothesis): Deviation exceeds baseline tolerance; potential service stress or background job overload."
                )

            repo.create_incident(
                incident_id=inc_id,
                tenant_id=tenant_id,
                affected_source=source,
                severity=batch_severity,
                title=title,
                description=description,
                status="OPEN",
                detected_at=latest_ts,
                related_metrics=new_metric_names,
            )

            incidents_handled.append({
                "incident_id": inc_id,
                "tenant_id": tenant_id,
                "affected_source": source,
                "severity": batch_severity,
                "title": title,
                "description": description,
                "status": "OPEN",
                "first_detected_at": latest_ts,
                "last_updated_at": latest_ts,
                "related_metrics": new_metric_names,
                "is_new": True,
            })

    return incidents_handled
