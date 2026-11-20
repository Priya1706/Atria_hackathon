import math
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from backend.app.db.repository import TelemetryRepository

ANOMALY_COOLDOWN_SECONDS = 300  # 5-minute suppression window for duplicate anomalies

STATIC_THRESHOLDS = {
    "cpu_usage": {"warning": 85.0, "critical": 92.0},
    "memory_usage": {"warning": 88.0, "critical": 95.0},
    "disk_usage": {"warning": 90.0, "critical": 96.0},
    "bandwidth_usage": {"warning": 85.0, "critical": 95.0},
    "network_latency": {"warning": 250.0, "critical": 500.0},
    "packet_loss": {"warning": 1.0, "critical": 5.0},
    "error_rate": {"warning": 3.0, "critical": 8.0},
    "failed_authentication_count": {"warning": 5.0, "critical": 20.0},
    "security_event_count": {"warning": 1.0, "critical": 5.0},
}
LOWER_IS_ANOMALOUS = {"service_availability": {"warning": 0.99, "critical": 0.95}, "connectivity": {"warning": 0.99, "critical": 0.5}}


def detect_anomaly_for_metric(
    tenant_id: str,
    source: str,
    metric_name: str,
    observed_value: float,
    metric_id: Optional[str],
    timestamp: str,
    repo: TelemetryRepository,
) -> Optional[Dict[str, Any]]:
    """
    Evaluates whether an incoming metric is anomalous using:
    1. Statistical moving baseline when history >= 3 data points exists.
    2. Threshold-based fallback when history is sparse.
    3. Cooldown-based duplicate suppression.
    """
    # 1. Fetch recent history for baseline calculation
    history = repo.get_metric_history(tenant_id, source, metric_name, limit=20)
    baseline_value = None
    is_anomaly = False
    severity = "WARNING"
    explanation = ""

    threshold_cfg = STATIC_THRESHOLDS.get(metric_name)
    lower_thresholds = LOWER_IS_ANOMALOUS.get(metric_name)

    if lower_thresholds and observed_value < lower_thresholds["warning"]:
        is_anomaly = True
        severity = "CRITICAL" if observed_value < lower_thresholds["critical"] else "WARNING"
        explanation = f"{metric_name} fell to {observed_value}, below the availability threshold {lower_thresholds['warning']}."

    if len(history) >= 3:
        # Calculate moving average and sample standard deviation
        mean = sum(history) / len(history)
        variance = sum((x - mean) ** 2 for x in history) / (len(history) - 1)
        std_dev = math.sqrt(variance)
        baseline_value = round(mean, 2)

        # Deviation check: >= 2 standard deviations or >= 30% above baseline
        deviation_amount = observed_value - mean
        percent_above_baseline = ((observed_value - mean) / max(mean, 0.001)) * 100.0

        if (std_dev > 0 and deviation_amount >= 2.0 * std_dev) or (percent_above_baseline >= 30.0):
            # Only trigger if value also passes minimum warning floor
            warning_floor = threshold_cfg["warning"] if threshold_cfg else mean * 1.2
            if observed_value >= warning_floor:
                is_anomaly = True
                if threshold_cfg and observed_value >= threshold_cfg["critical"]:
                    severity = "CRITICAL"
                else:
                    severity = "WARNING"
                explanation = (
                    f"{metric_name} observed at {observed_value} is {percent_above_baseline:+.1f}% "
                    f"above moving baseline ({baseline_value}). Deviation exceeds 2 sigma threshold."
                )

    # Fallback to threshold-based detection if history is sparse or baseline didn't catch it
    if not is_anomaly and threshold_cfg:
        if observed_value >= threshold_cfg["critical"]:
            is_anomaly = True
            severity = "CRITICAL"
            explanation = f"{metric_name} critically high at {observed_value} (exceeds critical threshold {threshold_cfg['critical']})."
        elif observed_value >= threshold_cfg["warning"]:
            is_anomaly = True
            severity = "WARNING"
            explanation = f"{metric_name} elevated at {observed_value} (exceeds warning threshold {threshold_cfg['warning']})."

    if not is_anomaly:
        return None

    # 2. Check duplicate suppression cooldown
    dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    since_ts = (dt - timedelta(seconds=ANOMALY_COOLDOWN_SECONDS)).isoformat()

    if repo.has_recent_identical_anomaly(tenant_id, source, metric_name, severity, since_ts):
        # Suppress duplicate anomaly within cooldown window
        return None

    # 3. Persist and return new anomaly
    anomaly_id = f"anom-{uuid.uuid4()}"
    repo.save_anomaly(
        anomaly_id=anomaly_id,
        tenant_id=tenant_id,
        metric_id=metric_id,
        source=source,
        metric_name=metric_name,
        observed_value=observed_value,
        baseline_value=baseline_value,
        severity=severity,
        explanation=explanation,
        detected_at=timestamp,
    )

    return {
        "anomaly_id": anomaly_id,
        "tenant_id": tenant_id,
        "source": source,
        "metric_name": metric_name,
        "observed_value": observed_value,
        "baseline_value": baseline_value,
        "severity": severity,
        "explanation": explanation,
        "detected_at": timestamp,
    }


def process_batch_anomalies(
    tenant_id: str,
    metrics: List[Dict[str, Any]],
    repo: TelemetryRepository,
) -> List[Dict[str, Any]]:
    """Evaluates all metrics in an ingested batch for anomalies."""
    detected = []
    for m in metrics:
        anom = detect_anomaly_for_metric(
            tenant_id=tenant_id,
            source=m["source"],
            metric_name=m["metric_name"],
            observed_value=float(m["value"]),
            metric_id=str(m["metric_id"]),
            timestamp=m["timestamp"],
            repo=repo,
        )
        if anom:
            detected.append(anom)
    return detected
