import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.db.repository import TelemetryRepository

RECOMMENDATION_TEMPLATES = {
    "cpu_usage": {
        "title": "Investigate High CPU Utilization & Thread Contention",
        "why_it_matters": "Sustained high CPU saturation increases queue wait times, throttles processing threads, and leads to request timeouts.",
        "suggested_action": "1. Inspect running processes via top/htop. 2. Profile active threads for infinite loops or locks. 3. Consider scaling compute capacity or optimizing hot code paths.",
    },
    "memory_usage": {
        "title": "Address Severe Memory Pressure & OOM Risk",
        "why_it_matters": "Approaching memory exhaustion can trigger kernel Out-Of-Memory (OOM) killer terminations, dropping active connections unexpectedly.",
        "suggested_action": "1. Capture heap dumps to identify memory leaks. 2. Verify cache size limits and eviction policies. 3. Restart leaky worker processes and scale instance RAM.",
    },
    "disk_usage": {
        "title": "Mitigate Critical Disk Volume Saturation",
        "why_it_matters": "Exhausting storage space prevents write operations, leading to database lockups and corrupt transaction logs.",
        "suggested_action": "1. Clean temporary files and rotate old log files. 2. Purge unneeded containers/artifacts. 3. Expand persistent disk volume quota.",
    },
    "network_latency": {
        "title": "Triage Network Congestion & Upstream Delays",
        "why_it_matters": "High latency degrades end-user response times and cascades timeout failures to downstream dependent microservices.",
        "suggested_action": "1. Inspect network routing and packet drop rates. 2. Check connection pool saturation to upstream databases. 3. Verify DNS resolution latencies.",
    },
    "error_rate": {
        "title": "Resolve Spiking Application Error Rate",
        "why_it_matters": "Elevated 5xx or unhandled application errors directly degrade service availability and violate customer SLAs.",
        "suggested_action": "1. Inspect recent application logs for unhandled exceptions. 2. Verify health of backing databases and third-party APIs. 3. Consider rolling back recent deployment.",
    },
}


def generate_recommendations_for_incident(
    tenant_id: str,
    incident: Dict[str, Any],
    anomalies: List[Dict[str, Any]],
    repo: TelemetryRepository,
) -> List[Dict[str, Any]]:
    """
    Generates explainable, actionable recommendations answering the 5 core questions:
    1. What happened?
    2. Which metric caused concern?
    3. What value was observed?
    4. Why is it a problem?
    5. What should the operator do next?
    """
    recommendations_created = []
    now_iso = datetime.now(timezone.utc).isoformat()
    inc_id = incident["incident_id"]
    source = incident["affected_source"]
    severity = incident["severity"]
    related_metrics = incident.get("related_metrics", [])

    for metric_name in related_metrics:
        # Find corresponding anomaly for observed value details
        matching_anomaly = next(
            (a for a in anomalies if a["source"] == source and a["metric_name"] == metric_name),
            None,
        )
        observed_val = matching_anomaly["observed_value"] if matching_anomaly else "N/A"
        template = RECOMMENDATION_TEMPLATES.get(
            metric_name,
            {
                "title": f"Triage Elevated {metric_name}",
                "why_it_matters": f"Unusual deviation in {metric_name} can indicate underlying system instability.",
                "suggested_action": f"Inspect system telemetry and monitor {metric_name} for stabilization.",
            },
        )

        # Formulate comprehensive 5-part explanation
        explanation = (
            f"1. What happened: Elevated telemetry detected on {source}. "
            f"2. Metric of concern: {metric_name}. "
            f"3. Observed value: {observed_val}. "
            f"4. Why it matters: {template['why_it_matters']} "
            f"5. What operator should do: {template['suggested_action']}"
        )

        rec_id = f"rec-{uuid.uuid4()}"
        repo.save_recommendation(
            recommendation_id=rec_id,
            tenant_id=tenant_id,
            incident_id=inc_id,
            title=f"[{source}] {template['title']}",
            explanation=explanation,
            suggested_action=template["suggested_action"],
            severity=severity,
            created_at=now_iso,
        )

        recommendations_created.append({
            "recommendation_id": rec_id,
            "tenant_id": tenant_id,
            "incident_id": inc_id,
            "title": f"[{source}] {template['title']}",
            "explanation": explanation,
            "suggested_action": template["suggested_action"],
            "severity": severity,
            "created_at": now_iso,
        })

    return recommendations_created
