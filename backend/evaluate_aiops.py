"""Deterministic synthetic evaluation for the central statistical detector."""
import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from statistics import median, mean, stdev

from backend.app.core.anomaly_detection import process_batch_anomalies
from backend.app.db.repository import TelemetryRepository
from backend.app.db.schema import init_db


def build_dataset():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    normal_values = [50, 51, 49, 50, 52, 48] * 3
    rows = [(value, False) for value in normal_values]
    rows.append((110.0, True))  # one sudden spike
    rows.extend((value, False) for value in [50, 51, 49, 52, 50, 48, 51, 49, 50, 52, 48])
    rows.extend((value, True) for value in [60, 61, 62, 63])  # known gradual-degradation interval
    return [
        {
            "metric_id": str(uuid.uuid4()),
            "source": "synthetic-evaluation-host",
            "metric_name": "custom_signal",
            "value": float(value),
            "unit": "units",
            "timestamp": (start + timedelta(minutes=index)).isoformat(),
            "label": is_anomaly,
        }
        for index, (value, is_anomaly) in enumerate(rows)
    ]


def evaluate():
    samples = build_dataset()
    original = _evaluate_run(samples, apply_recall_adjustments=False)
    improved = _evaluate_run(samples, apply_recall_adjustments=True)
    return {
        "dataset": "fixed synthetic custom_signal sequence; 18 normal baseline points, one spike, 11 normal points, four labeled gradual-rise points",
        "assumptions": "Labels are unchanged scenario-author assumptions; one-minute spacing; each sample is scored independently; duplicate cooldown remains active except for qualifying monotonic trend continuations in the improved detector.",
        "samples": len(samples),
        "original": original,
        "improved": improved,
        "outlier_statistic_comparison": _compare_robustness(),
    }


def _evaluate_run(samples, apply_recall_adjustments):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    created = datetime(2026, 1, 1, tzinfo=timezone.utc).isoformat()
    conn.execute("INSERT INTO tenants VALUES (?, ?, ?)", ("eval-tenant", "Synthetic evaluation", created))
    conn.execute(
        "INSERT INTO collectors (id, tenant_id, name, api_key, is_active, last_heartbeat) VALUES (?, ?, ?, ?, 1, NULL)",
        ("eval-collector", "eval-tenant", "Synthetic evaluation", "not-a-real-key"),
    )
    conn.commit()
    repo = TelemetryRepository(conn)
    counts = {"tp": 0, "fp": 0, "tn": 0, "fn": 0}
    outcomes = []
    for index, sample in enumerate(samples):
        timestamp = sample["timestamp"]
        metric = {key: value for key, value in sample.items() if key != "label"}
        repo.save_batch(
            batch_id=str(uuid.uuid4()), tenant_id="eval-tenant", collector_id="eval-collector",
            timestamp=timestamp, schema_version="1.0", metadata=None, metrics=[metric],
        )
        found = bool(process_batch_anomalies(
            "eval-tenant", [metric], repo,
            apply_recall_adjustments=apply_recall_adjustments,
        ))
        label = sample["label"]
        if found and label:
            counts["tp"] += 1
        elif found:
            counts["fp"] += 1
        elif label:
            counts["fn"] += 1
        else:
            counts["tn"] += 1
        outcomes.append({
            "index": index,
            "timestamp": sample["timestamp"],
            "value": sample["value"],
            "label": "anomaly" if label else "normal",
            "detected": found,
            "outcome": "TP" if found and label else "FP" if found else "FN" if label else "TN",
        })

    precision = counts["tp"] / (counts["tp"] + counts["fp"]) if counts["tp"] + counts["fp"] else 0.0
    recall = counts["tp"] / (counts["tp"] + counts["fn"]) if counts["tp"] + counts["fn"] else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    false_positive_rate = counts["fp"] / (counts["fp"] + counts["tn"]) if counts["fp"] + counts["tn"] else 0.0
    result = {
        "confusion_counts": counts,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "false_positive_rate": round(false_positive_rate, 4),
        "false_negative_samples": [item for item in outcomes if item["outcome"] == "FN"],
    }
    conn.close()
    return result


def _compare_robustness():
    """Show a fixed contaminated-history case for mean/std-dev vs median/MAD."""
    history = [10.0, 10.0, 10.0, 10.0, 1000.0]
    observed = 100.0
    average = mean(history)
    sample_sd = stdev(history)
    old_rule = (
        observed - average >= 2 * sample_sd
        or (observed - average) / max(average, 0.001) * 100 >= 30
    )
    center = median(history)
    mad = median([abs(value - center) for value in history])
    robust_rule = (
        (mad > 0 and (observed - center) / (1.4826 * mad) >= 3.5)
        or (observed - center) / max(abs(center), 0.001) * 100 >= 30
    )
    return {
        "history": history,
        "observed": observed,
        "mean": average,
        "sample_standard_deviation": round(sample_sd, 4),
        "median": center,
        "mad": mad,
        "mean_std_rule_detects": bool(old_rule),
        "median_mad_rule_detects": bool(robust_rule),
        "interpretation": "The single extreme prior sample pulls the mean upward and inflates sample deviation; median/MAD preserves the typical level.",
    }


if __name__ == "__main__":
    print(json.dumps(evaluate(), indent=2))
