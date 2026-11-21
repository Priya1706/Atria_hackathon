import uuid
from datetime import datetime, timezone, timedelta
from statistics import median
from typing import Any, Dict, List, Optional

from backend.app.config import ANOMALY_BASELINE_WINDOW_SECONDS, ANOMALY_COOLDOWN_SECONDS
from backend.app.db.repository import TelemetryRepository

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
LOWER_IS_ANOMALOUS = {
    "service_availability": {"warning": 0.99, "critical": 0.95},
    "connectivity": {"warning": 0.99, "critical": 0.5},
}
BASELINE_SAMPLE_LIMIT = 20
MIN_BASELINE_SAMPLES = 3
ROBUST_Z_THRESHOLD = 3.5
RELATIVE_DEVIATION_THRESHOLD = 30.0
GRADUAL_TREND_THRESHOLD = 20.0


def _utc_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def detect_anomaly_for_metric(
    tenant_id: str,
    source: str,
    metric_name: str,
    observed_value: float,
    metric_id: Optional[str],
    timestamp: str,
    repo: TelemetryRepository,
    exclude_metric_ids: Optional[List[str]] = None,
    apply_recall_adjustments: bool = True,
) -> Optional[Dict[str, Any]]:
    """Detect high deviations and gradual rises from a rolling robust baseline.

    The baseline is the median of at most 20 prior readings in the configured
    time window. Median/MAD is used instead of mean/sample-standard-deviation:
    an extreme historic point moves a mean and inflates a standard deviation,
    while median and MAD remain stable unless outliers become the majority.
    """
    current_dt = _utc_datetime(timestamp)
    current_timestamp = current_dt.isoformat()
    window_start = (current_dt - timedelta(seconds=ANOMALY_BASELINE_WINDOW_SECONDS)).isoformat()
    excluded_ids = set(str(value) for value in (exclude_metric_ids or []))
    if metric_id:
        excluded_ids.add(str(metric_id))

    history = repo.get_metric_history(
        tenant_id,
        source,
        metric_name,
        limit=BASELINE_SAMPLE_LIMIT,
        before_timestamp=current_timestamp,
        since_timestamp=window_start,
        exclude_metric_ids=sorted(excluded_ids),
    )
    baseline_value: Optional[float] = None
    is_anomaly = False
    gradual_rise = False
    severity = "WARNING"
    explanation = ""
    threshold_cfg = STATIC_THRESHOLDS.get(metric_name)
    lower_thresholds = LOWER_IS_ANOMALOUS.get(metric_name)

    if lower_thresholds and observed_value < lower_thresholds["warning"]:
        is_anomaly = True
        severity = "CRITICAL" if observed_value < lower_thresholds["critical"] else "WARNING"
        explanation = (
            f"{metric_name} fell to {observed_value}, below the availability warning "
            f"threshold {lower_thresholds['warning']}."
        )

    baseline_details = (
        f"Rolling baseline unavailable (eligible prior sample count={len(history)}; "
        f"minimum required={MIN_BASELINE_SAMPLES}; window={ANOMALY_BASELINE_WINDOW_SECONDS}s)."
    )
    if len(history) >= MIN_BASELINE_SAMPLES:
        center = median(history)
        mad = median([abs(value - center) for value in history])
        robust_sigma = 1.4826 * mad
        baseline_value = round(center, 2)
        deviation = observed_value - center
        relative_change = deviation / max(abs(center), 0.001) * 100.0
        robust_z = deviation / robust_sigma if robust_sigma > 0 else None
        baseline_details = (
            f"Rolling baseline median={baseline_value}, MAD={mad:.2f}, "
            f"robust_sigma={robust_sigma:.2f}, sample_count={len(history)}, "
            f"window={ANOMALY_BASELINE_WINDOW_SECONDS}s, "
            f"observed_deviation={observed_value - center:+.2f}."
        )

        robust_deviation = (
            (robust_z is not None and robust_z >= ROBUST_Z_THRESHOLD)
            or relative_change >= RELATIVE_DEVIATION_THRESHOLD
        )
        ordered_history = list(reversed(history))  # Query returns newest first.
        trend_details = ""
        trend_percent = 0.0
        if len(ordered_history) >= 6:
            older_window = ordered_history[:-3]
            recent_window = ordered_history[-3:]
            older_median = median(older_window)
            recent_median = median(recent_window)
            trend_percent = (recent_median - older_median) / max(abs(older_median), 0.001) * 100.0
            gradual_rise = (
                recent_window[0] < recent_window[1] < recent_window[2]
                and trend_percent >= GRADUAL_TREND_THRESHOLD
                and observed_value > recent_window[-1]
            )
            trend_details = (
                f" Recent-three median={recent_median:.2f}; older-window median="
                f"{older_median:.2f}; trend={trend_percent:+.1f}%."
            )

        if robust_deviation or gradual_rise:
            # The robust rule keeps a fixed warning floor; the gradual rule can
            # surface a rising trend before it reaches a static warning limit.
            warning_floor = threshold_cfg["warning"] if threshold_cfg else center * 1.2
            if gradual_rise or observed_value >= warning_floor:
                is_anomaly = True
                severity = (
                    "CRITICAL" if threshold_cfg and observed_value >= threshold_cfg["critical"]
                    else "WARNING"
                )
                rule = "monotonic gradual-rise rule" if gradual_rise else "robust deviation rule"
                z_text = f"{robust_z:.2f}" if robust_z is not None else "undefined because MAD is zero"
                explanation = (
                    f"{metric_name} observed at {observed_value}; deviation={deviation:+.2f} "
                    f"({relative_change:+.1f}%) from the rolling median. Rule={rule}; "
                    f"robust_z={z_text} (threshold {ROBUST_Z_THRESHOLD}); relative threshold="
                    f"{RELATIVE_DEVIATION_THRESHOLD:.1f}%; trend threshold="
                    f"{GRADUAL_TREND_THRESHOLD:.1f}%. {baseline_details}{trend_details}"
                )

    if not is_anomaly and threshold_cfg:
        if observed_value >= threshold_cfg["critical"]:
            is_anomaly = True
            severity = "CRITICAL"
            explanation = (
                f"{metric_name} critically high at {observed_value} (exceeds critical "
                f"threshold {threshold_cfg['critical']}). {baseline_details}"
            )
        elif observed_value >= threshold_cfg["warning"]:
            is_anomaly = True
            severity = "WARNING"
            explanation = (
                f"{metric_name} elevated at {observed_value} (exceeds warning threshold "
                f"{threshold_cfg['warning']}). {baseline_details}"
            )
    elif is_anomaly and lower_thresholds:
        explanation = f"{explanation} Detection rule=static low-value threshold. {baseline_details}"

    if not is_anomaly:
        return None

    since_timestamp = (current_dt - timedelta(seconds=ANOMALY_COOLDOWN_SECONDS)).isoformat()
    recently_alerted = repo.has_recent_identical_anomaly(
        tenant_id, source, metric_name, severity, since_timestamp, current_timestamp
    )
    # Keep cooldown suppression for repeated/static readings. A continuing,
    # strictly rising trend is new evidence and should update the ongoing incident.
    if recently_alerted and not (apply_recall_adjustments and gradual_rise):
        return None

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
        detected_at=current_timestamp,
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
        "detected_at": current_timestamp,
    }


def process_batch_anomalies(
    tenant_id: str,
    metrics: List[Dict[str, Any]],
    repo: TelemetryRepository,
    apply_recall_adjustments: bool = True,
) -> List[Dict[str, Any]]:
    """Evaluates all ingested metrics without admitting same-batch peers to history."""
    detected = []
    batch_metric_ids = [str(metric["metric_id"]) for metric in metrics]
    for metric in metrics:
        anomaly = detect_anomaly_for_metric(
            tenant_id=tenant_id,
            source=metric["source"],
            metric_name=metric["metric_name"],
            observed_value=float(metric["value"]),
            metric_id=str(metric["metric_id"]),
            timestamp=metric["timestamp"],
            repo=repo,
            exclude_metric_ids=batch_metric_ids,
            apply_recall_adjustments=apply_recall_adjustments,
        )
        if anomaly:
            detected.append(anomaly)
    return detected
