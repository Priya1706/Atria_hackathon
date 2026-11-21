import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.db.repository import TelemetryRepository
from backend.app.core.anomaly_detection import LOWER_IS_ANOMALOUS, STATIC_THRESHOLDS


def _event_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)

RECOMMENDATION_TEMPLATES = {
    "cpu_usage": {
        "title": "Investigate High CPU Utilization & Thread Contention",
        "why_it_matters": "Sustained high CPU saturation increases queue wait times, throttles processing threads, and leads to request timeouts.",
        "suggested_action": "Inspect top CPU processes and profile active threads; review optimization or capacity options with the service owner before making changes.",
        "expected_outcome": "CPU utilization should fall below the warning threshold and remain stable.",
        "risks": "Profiling can add overhead; scale changes require capacity and cost review.",
        "verification": "Confirm CPU is below 85% for at least two consecutive telemetry samples.",
    },
    "memory_usage": {
        "title": "Address Severe Memory Pressure & OOM Risk",
        "why_it_matters": "Approaching memory exhaustion can trigger kernel Out-Of-Memory (OOM) killer terminations, dropping active connections unexpectedly.",
        "suggested_action": "Review memory and cache telemetry; if a heap dump is approved, store it securely, then plan any restart or capacity change with the service owner.",
        "expected_outcome": "Memory utilization should fall below the warning threshold without increasing restart or OOM events.",
        "risks": "Heap dumps may contain sensitive data; restarts can interrupt active work.",
        "verification": "Confirm memory is below 88% for two consecutive samples and no new OOM event is reported.",
    },
    "disk_usage": {
        "title": "Mitigate Critical Disk Volume Saturation",
        "why_it_matters": "Exhausting storage space prevents write operations, leading to database lockups and corrupt transaction logs.",
        "suggested_action": "Inspect disk consumers and retention policy; identify approved cleanup or capacity options without deleting data until an operator validates them.",
        "expected_outcome": "Disk utilization should fall below the warning threshold with adequate free capacity.",
        "risks": "Deleting files can remove needed artifacts; verify retention and backup policy first.",
        "verification": "Confirm disk utilization is below 90% for two consecutive samples and writes succeed.",
    },
    "network_latency": {
        "title": "Triage Network Congestion & Upstream Delays",
        "why_it_matters": "High latency degrades end-user response times and cascades timeout failures to downstream dependent microservices.",
        "suggested_action": "Inspect routing, packet drops, upstream connection pools and DNS latency; coordinate any proposed network changes with the service owner.",
        "expected_outcome": "Latency should return below the warning threshold and packet loss should stabilize.",
        "risks": "Network changes may affect other services; coordinate routing or DNS changes with operators.",
        "verification": "Confirm latency is below 250 ms and packet loss below 1% for two consecutive samples.",
    },
    "error_rate": {
        "title": "Resolve Spiking Application Error Rate",
        "why_it_matters": "Elevated 5xx or unhandled application errors directly degrade service availability and violate customer SLAs.",
        "suggested_action": "Inspect recent application errors and dependency health; review any rollback proposal with the release owner before acting.",
        "expected_outcome": "The error rate should fall below its warning threshold and service availability should recover.",
        "risks": "Rollback may discard a needed change; inspect deployment and dependency evidence first.",
        "verification": "Confirm error rate is below 3% and availability remains at least 99% for two samples.",
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
    lower_bound = incident.get("first_detected_at")
    upper_bound = incident.get("last_updated_at")

    for metric_name in related_metrics:
        # Prefer current batch detail, then persisted anomaly evidence so an
        # incident update never loses values from its earlier contributing metrics.
        batch_candidates = [
            anomaly for anomaly in anomalies
            if anomaly["source"] == source and anomaly["metric_name"] == metric_name
            and (lower_bound is None or _event_time(anomaly["detected_at"]) >= _event_time(lower_bound))
            and (upper_bound is None or _event_time(anomaly["detected_at"]) <= _event_time(upper_bound))
        ]
        matching_anomaly = (
            max(batch_candidates, key=lambda item: _event_time(item["detected_at"]))
            if batch_candidates else None
        )
        if matching_anomaly is None:
            matching_anomaly = repo.get_latest_anomaly_for_metric(
                tenant_id, source, metric_name, lower_bound, upper_bound
            )
        latest_metric = None
        if matching_anomaly is None:
            latest_metric = repo.get_latest_metric_for_source(
                tenant_id, source, metric_name, upper_bound
            )
        observed_val = (
            matching_anomaly["observed_value"] if matching_anomaly is not None
            else latest_metric["value"] if latest_metric is not None
            else "unavailable"
        )
        baseline = matching_anomaly["baseline_value"] if matching_anomaly is not None else None
        thresholds = STATIC_THRESHOLDS.get(metric_name) or LOWER_IS_ANOMALOUS.get(metric_name)
        threshold_text = (
            ", ".join(f"{key}={value}" for key, value in thresholds.items())
            if thresholds else "no configured static threshold"
        )
        evidence_reason = (
            matching_anomaly["explanation"] if matching_anomaly is not None
            else f"Latest persisted value for {metric_name} is {observed_val}; no anomaly explanation is available."
        )
        template = RECOMMENDATION_TEMPLATES.get(
            metric_name,
            {
                "title": f"Triage Elevated {metric_name}",
                "why_it_matters": f"Unusual deviation in {metric_name} can indicate underlying system instability.",
                "suggested_action": f"Inspect system telemetry and monitor {metric_name} for stabilization.",
                "expected_outcome": f"{metric_name} returns to its configured normal range.",
                "risks": "Review proposed operational changes before applying them.",
                "verification": f"Confirm {metric_name} remains within its normal range for two consecutive samples.",
            },
        )

        # Formulate comprehensive 5-part explanation
        baseline_text = str(baseline) if baseline is not None else "unavailable (insufficient prior history)"
        evidence_strength = min(
            95,
            50 + (20 if baseline is not None else 0)
            + (15 if matching_anomaly is not None and matching_anomaly["severity"] == "CRITICAL" else 0)
            + (10 if len(related_metrics) > 1 else 0),
        )
        explanation = (
            f"1. What happened: Elevated telemetry detected on {source}. "
            f"2. Metric of concern: {metric_name}. "
            f"3. Observed value: {observed_val}. "
            f"Baseline: {baseline_text}. Thresholds: {threshold_text}. "
            f"Detection reason: {evidence_reason} "
            f"4. Why it matters: {template['why_it_matters']} "
            f"5. What operator should do: {template['suggested_action']} "
            f"Expected outcome: {template['expected_outcome']} "
            f"Evidence strength: {evidence_strength}/100 (deterministic heuristic, not probability). "
            f"Risks/prerequisites: {template['risks']} "
            f"Verification: {template['verification']} "
            "No remediation is executed automatically."
        )

        title = f"[{source}] {template['title']}"
        if repo.refresh_recommendation_for_incident_metric(
            tenant_id, inc_id, title, explanation, template["suggested_action"], severity
        ):
            continue

        rec_id = f"rec-{uuid.uuid4()}"
        repo.save_recommendation(
            recommendation_id=rec_id,
            tenant_id=tenant_id,
            incident_id=inc_id,
            title=title,
            explanation=explanation,
            suggested_action=template["suggested_action"],
            severity=severity,
            created_at=now_iso,
        )

        recommendations_created.append({
            "recommendation_id": rec_id,
            "tenant_id": tenant_id,
            "incident_id": inc_id,
            "title": title,
            "explanation": explanation,
            "suggested_action": template["suggested_action"],
            "severity": severity,
            "created_at": now_iso,
        })

    return recommendations_created
