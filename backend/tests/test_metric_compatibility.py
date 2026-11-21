from backend.app.core.anomaly_detection import STATIC_THRESHOLDS
from backend.app.core.health_engine import DEFAULT_METRIC_THRESHOLDS, evaluate_metric_state


def test_every_exported_collector_metric_has_central_health_and_anomaly_rules():
    high_is_bad = {
        "cpu_usage", "memory_usage", "disk_usage", "bandwidth_usage", "network_latency",
        "packet_loss", "failed_authentication_count", "security_event_count",
    }
    for metric in high_is_bad:
        assert metric in DEFAULT_METRIC_THRESHOLDS
        assert metric in STATIC_THRESHOLDS
        assert evaluate_metric_state(metric, DEFAULT_METRIC_THRESHOLDS[metric]["poor"] + 1)[0] == "Poor"
    assert evaluate_metric_state("service_availability", 0.9)[0] == "Poor"
    assert evaluate_metric_state("connectivity", 0.0)[0] == "Poor"
    # Future unsupported metrics are surfaced as Fair, not silently labeled healthy.
    assert evaluate_metric_state("future_unknown_metric", 1.0)[0] == "Fair"
