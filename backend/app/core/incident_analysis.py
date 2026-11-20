from typing import Any, Dict, List

from backend.app.core.anomaly_detection import LOWER_IS_ANOMALOUS, STATIC_THRESHOLDS
from backend.app.db.repository import TelemetryRepository


RULES = {
    "resource_saturation": {
        "signals": {"cpu_usage", "memory_usage", "disk_usage", "bandwidth_usage"},
        "possible_impacts": {"network_latency"},
        "label": "Resource saturation",
    },
    "network_degradation": {
        "signals": {"network_latency", "packet_loss", "connectivity"},
        "possible_impacts": set(),
        "label": "Network degradation",
    },
    "service_availability_degradation": {
        "signals": {"service_availability", "connectivity", "error_rate"},
        "possible_impacts": set(),
        "label": "Service availability or application errors",
    },
    "security_activity": {
        "signals": {"failed_authentication_count", "security_event_count"},
        "possible_impacts": set(),
        "label": "Security-related activity",
    },
}


def _is_abnormal(metric_name: str, value: float) -> bool:
    threshold = STATIC_THRESHOLDS.get(metric_name)
    if threshold:
        return value >= threshold["warning"]
    lower = LOWER_IS_ANOMALOUS.get(metric_name)
    return bool(lower and value < lower["warning"])


def analyze_incident(
    tenant_id: str, incident: Dict[str, Any], repo: TelemetryRepository,
) -> Dict[str, Any]:
    """Return persisted incident evidence and transparent, rule-weighted hypotheses."""
    source = incident["affected_source"]
    metric_names = incident.get("related_metrics", [])
    start = incident["first_detected_at"]
    end = incident["last_updated_at"]
    anomalies = repo.get_incident_anomalies(tenant_id, source, metric_names, start, end)

    latest_by_metric = {}
    for row in anomalies:
        # Repository order is by absolute UTC instant, not ISO string spelling.
        latest_by_metric[row["metric_name"]] = row

    readings = repo.get_latest_metrics_per_source(tenant_id, source, start, end)
    readings_by_name = {row["metric_name"]: row for row in readings}
    contributors: List[Dict[str, Any]] = []
    for name in sorted(latest_by_metric):
        row = latest_by_metric[name]
        threshold = STATIC_THRESHOLDS.get(name) or LOWER_IS_ANOMALOUS.get(name)
        contributors.append({
            "metric_name": name,
            "observed_value": row["observed_value"],
            "baseline_value": row["baseline_value"],
            "severity": row["severity"],
            "detected_at": row["detected_at"],
            "thresholds": threshold,
            "reason": row["explanation"],
        })

    abnormal_names = set(latest_by_metric)
    hypotheses = []
    for rule_name, rule in RULES.items():
        support_names = sorted(abnormal_names & rule["signals"])
        impact_names = sorted(abnormal_names & rule["possible_impacts"])
        if not support_names:
            continue
        supporting = [
            f"{name} was anomalous at {latest_by_metric[name]['observed_value']} "
            f"({latest_by_metric[name]['severity']})."
            for name in support_names
        ]
        supporting.extend(
            f"{name} was also anomalous and may be an associated impact at "
            f"{latest_by_metric[name]['observed_value']}."
            for name in impact_names
        )
        relevant_names = rule["signals"] | rule["possible_impacts"]
        contradicting = []
        for name in sorted(relevant_names - abnormal_names):
            reading = readings_by_name.get(name)
            if reading is not None and not _is_abnormal(name, float(reading["value"])):
                contradicting.append(
                    f"{name} was within its warning threshold at {reading['value']} "
                    f"during the incident window."
                )

        # This is a deterministic evidence score, not a probability.
        score = max(0, min(100, 25 + 25 * len(support_names) + 10 * len(impact_names) - 15 * len(contradicting)))
        hypotheses.append({
            "hypothesis": rule["label"],
            "rule": rule_name,
            "evidence_strength": score,
            "score_meaning": "Heuristic evidence score (0-100), not a probability or confirmed cause.",
            "supporting_evidence": supporting,
            "contradicting_evidence": contradicting,
        })

    hypotheses.sort(key=lambda item: (-item["evidence_strength"], item["rule"]))
    observed_text = ", ".join(
        f"{item['metric_name']}={item['observed_value']} ({item['severity']})"
        for item in contributors
    ) or "no persisted anomaly evidence was found in the incident window"
    contextual_summary = f"Contributing observations: {observed_text}."
    if len(contributors) > 1:
        contextual_summary += " Co-occurrence is evidence of temporal association, not proof of causation."

    return {
        "contributing_metrics": contributors,
        "root_cause_hypotheses": hypotheses,
        "contextual_summary": contextual_summary,
    }
