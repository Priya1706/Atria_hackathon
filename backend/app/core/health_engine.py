import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from backend.app.db.repository import TelemetryRepository
from backend.app.config import STALE_TELEMETRY_SECONDS

# Documented Provisional Thresholds (Configurable)
DEFAULT_METRIC_THRESHOLDS = {
    "cpu_usage": {"good": 70.0, "fair": 85.0, "poor": 92.0, "unit": "percent"},
    "memory_usage": {"good": 75.0, "fair": 88.0, "poor": 95.0, "unit": "percent"},
    "disk_usage": {"good": 80.0, "fair": 90.0, "poor": 96.0, "unit": "percent"},
    "bandwidth_usage": {"good": 70.0, "fair": 85.0, "poor": 95.0, "unit": "percent"},
    "network_latency": {"good": 100.0, "fair": 250.0, "poor": 500.0, "unit": "ms"},
    "packet_loss": {"good": 0.5, "fair": 3.0, "poor": 5.0, "unit": "percent"},
    "error_rate": {"good": 1.0, "fair": 3.0, "poor": 8.0, "unit": "percent"},
    "failed_authentication_count": {"good": 1.0, "fair": 5.0, "poor": 20.0, "unit": "count"},
    "security_event_count": {"good": 0.0, "fair": 1.0, "poor": 5.0, "unit": "count"},
}
LOWER_IS_BETTER = {
    "service_availability": {"excellent": 0.999, "good": 0.99, "fair": 0.95},
    "connectivity": {"excellent": 0.999, "good": 0.99, "fair": 0.5},
}

# These are the SaaS-normalized equivalents of collector.REQUIRED_HEALTH_METRICS.
REQUIRED_HEALTH_METRICS = {
    "cpu_usage", "memory_usage", "disk_usage", "bandwidth_usage",
    "network_latency", "packet_loss", "service_availability", "connectivity",
}


def evaluate_metric_state(metric_name: str, value: float) -> Tuple[str, float, Optional[float]]:
    """
    Evaluates an individual metric value against thresholds.
    Returns: (health_state, score, threshold_breached)
    """
    inverse = LOWER_IS_BETTER.get(metric_name)
    if inverse:
        if value >= inverse["excellent"]:
            return "Excellent", 100.0, inverse["excellent"]
        if value >= inverse["good"]:
            return "Good", 85.0, inverse["good"]
        if value >= inverse["fair"]:
            return "Fair", 60.0, inverse["fair"]
        return "Poor", 20.0, inverse["fair"]

    thresholds = DEFAULT_METRIC_THRESHOLDS.get(metric_name)
    if not thresholds:
        # Unknown signals must be visible as requiring attention, never silently healthy.
        return "Fair", 50.0, None

    if value <= thresholds["good"]:
        score = max(90.0, 100.0 - (value / max(thresholds["good"], 1.0)) * 10.0)
        return "Excellent", round(score, 1), thresholds["good"]
    elif value <= thresholds["fair"]:
        score = 75.0 + (1.0 - (value - thresholds["good"]) / max(thresholds["fair"] - thresholds["good"], 1.0)) * 14.0
        return "Good", round(score, 1), thresholds["good"]
    elif value <= thresholds["poor"]:
        score = 50.0 + (1.0 - (value - thresholds["fair"]) / max(thresholds["poor"] - thresholds["fair"], 1.0)) * 24.0
        return "Fair", round(score, 1), thresholds["fair"]
    else:
        score = max(10.0, 50.0 - (value - thresholds["poor"]) * 2.0)
        return "Poor", round(score, 1), thresholds["poor"]


def calculate_source_health(
    tenant_id: str,
    source: str,
    repo: TelemetryRepository,
    as_of_time: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Centrally calculates the health of a specific source for a tenant.
    Never trusts client-supplied health.
    Handles stale telemetry and missing metrics.
    """
    now = as_of_time or datetime.now(timezone.utc)
    now_iso = now.isoformat()

    latest_records = repo.get_latest_metrics_per_source(tenant_id, source)

    # 1. Handle missing telemetry
    if not latest_records:
        return {
            "source": source,
            "health_status": "Poor",
            "health_score": 0.0,
            "contributing_metrics": [],
            "explanation": "No telemetry readings recorded for this source. Missing telemetry is treated as critical risk.",
            "evaluated_at": now_iso,
        }

    # 2. Evaluate freshness independently for every metric's latest reading.
    # A fresh CPU sample cannot mask an old availability or latency sample.
    contributing_metrics = []
    has_poor = False
    has_fair = False
    has_good = False
    metric_scores = []
    explanations = []
    stale_names = []
    latest_names = {r["metric_name"] for r in latest_records}
    missing_required = sorted(REQUIRED_HEALTH_METRICS - latest_names)

    for r in latest_records:
        name = r["metric_name"]
        val = r["value"]
        unit = r["unit"]
        ts_text = r["timestamp"].replace("Z", "+00:00")
        ts = datetime.fromisoformat(ts_text)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        age_seconds = max(0.0, (now - ts.astimezone(timezone.utc)).total_seconds())
        if age_seconds > STALE_TELEMETRY_SECONDS:
            stale_names.append(name)
            contributing_metrics.append({
                "metric_name": name,
                "observed_value": val,
                "unit": unit,
                "status": "Stale",
                "threshold": None,
            })
            explanations.append(
                f"{name} is stale ({int(age_seconds)}s old; limit {STALE_TELEMETRY_SECONDS}s)"
            )
            continue
        state, score, threshold = evaluate_metric_state(name, val)

        metric_scores.append(score)
        contributing_metrics.append({
            "metric_name": name,
            "observed_value": val,
            "unit": unit,
            "status": state,
            "threshold": threshold,
        })

        if state == "Poor":
            has_poor = True
            explanations.append(f"{name} is critical at {val}{unit} (exceeds {threshold}{unit})")
        elif state == "Fair":
            has_fair = True
            explanations.append(f"{name} is elevated at {val}{unit} (exceeds {threshold}{unit})")
        elif state == "Good":
            has_good = True

    # 3. Determine overall status and composite score. Missing required signals
    # cap health at Good; any observed stale signal is Poor because its current
    # state is unknown. Four public health states remain unchanged.
    avg_score = sum(metric_scores) / len(metric_scores) if metric_scores else 50.0

    if stale_names:
        overall_status = "Poor"
        overall_score = 10.0
        overall_explanation = f"Source health is critical: {'; '.join(explanations)}."
    elif has_poor:
        overall_status = "Poor"
        overall_score = min(avg_score, 45.0)
        overall_explanation = f"Source health is critical: {'; '.join(explanations)}."
    elif has_fair:
        overall_status = "Fair"
        overall_score = min(avg_score, 70.0)
        overall_explanation = f"Source health requires attention: {'; '.join(explanations)}."
    elif has_good:
        overall_status = "Good"
        overall_score = min(avg_score, 88.0)
        overall_explanation = "All observed metrics are operating within acceptable thresholds."
    else:
        overall_status = "Excellent"
        overall_score = max(avg_score, 92.0)
        overall_explanation = "All telemetry signals indicate optimal operating condition."

    if missing_required:
        if overall_status == "Excellent":
            overall_status = "Good"
            overall_score = min(overall_score, 88.0)
        overall_explanation += (
            f" Required health metrics missing: {', '.join(missing_required)}; "
            "health is capped at Good until they are reported."
        )

    # Persist evaluation
    eval_id = f"eval-{uuid.uuid4()}"
    repo.save_health_evaluation(
        evaluation_id=eval_id,
        tenant_id=tenant_id,
        source=source,
        health_status=overall_status,
        health_score=overall_score,
        contributing_metrics=contributing_metrics,
        explanation=overall_explanation,
        evaluated_at=now_iso,
    )

    return {
        "source": source,
        "health_status": overall_status,
        "health_score": overall_score,
        "contributing_metrics": contributing_metrics,
        "explanation": overall_explanation,
        "evaluated_at": now_iso,
    }


def calculate_tenant_health_summary(
    tenant_id: str, repo: TelemetryRepository
) -> Dict[str, Any]:
    """Calculates health across all monitored sources belonging to the tenant."""
    sources = repo.get_distinct_sources(tenant_id)
    if not sources:
        return {
            "tenant_id": tenant_id,
            "overall_health_status": "Poor",
            "overall_health_score": 0.0,
            "sources": [],
        }

    source_reports = [calculate_source_health(tenant_id, src, repo) for src in sources]

    scores = [s["health_score"] for s in source_reports]
    avg_score = sum(scores) / len(scores) if scores else 0.0

    statuses = [s["health_status"] for s in source_reports]
    if "Poor" in statuses:
        overall_status = "Poor"
    elif "Fair" in statuses:
        overall_status = "Fair"
    elif "Good" in statuses:
        overall_status = "Good"
    else:
        overall_status = "Excellent"

    return {
        "tenant_id": tenant_id,
        "overall_health_status": overall_status,
        "overall_health_score": round(avg_score, 1),
        "sources": source_reports,
    }
