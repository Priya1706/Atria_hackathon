import uuid
from datetime import datetime, timezone, timedelta
import pytest
from backend.app.db.repository import TelemetryRepository
from backend.app.core.health_engine import calculate_source_health, calculate_tenant_health_summary
from backend.app.core.anomaly_detection import detect_anomaly_for_metric, process_batch_anomalies
from backend.app.core.incident_correlation import correlate_anomalies_to_incidents
from backend.app.core.recommendation_engine import generate_recommendations_for_incident


# ============================================================================
# 1. AUTHENTICATION & SECURITY TESTS
# ============================================================================

def test_auth_inactive_collector(client, test_db_conn):
    """Inactive collector must be rejected with HTTP 401."""
    test_db_conn.execute("UPDATE collectors SET is_active = 0 WHERE id = 'collector-001'")
    test_db_conn.commit()

    payload = {
        "batch_id": str(uuid.uuid4()),
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [{
            "metric_id": str(uuid.uuid4()),
            "source": "server-01",
            "metric_name": "cpu_usage",
            "value": 50.0,
            "unit": "percent",
            "timestamp": "2026-11-20T10:30:00Z",
        }],
    }
    response = client.post(
        "/api/v1/ingest/telemetry",
        json=payload,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert response.status_code == 401
    assert response.json()["status"] == "error"


def test_reject_nested_sensitive_metadata(client):
    """Rejects sensitive keys hidden inside nested dictionaries or lists."""
    payload = {
        "batch_id": str(uuid.uuid4()),
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [{
            "metric_id": str(uuid.uuid4()),
            "source": "server-01",
            "metric_name": "cpu_usage",
            "value": 50.0,
            "unit": "percent",
            "timestamp": "2026-11-20T10:30:00Z",
        }],
        "metadata": {
            "app": "payment-service",
            "config": {
                "db": {
                    "password": "supersecretpassword123"  # Nested sensitive key!
                }
            }
        },
    }
    response = client.post(
        "/api/v1/ingest/telemetry",
        json=payload,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert response.status_code == 422
    data = response.json()
    assert data["status"] == "error"
    assert "Forbidden or sensitive field" in data["message"]


def test_reject_empty_metrics(client):
    """Rejects telemetry batches with empty metric lists."""
    payload = {
        "batch_id": str(uuid.uuid4()),
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [],  # Empty!
    }
    response = client.post(
        "/api/v1/ingest/telemetry",
        json=payload,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert response.status_code == 422
    assert response.json()["status"] == "error"


def test_reject_unexpected_request_fields(client):
    """Strict schema enforcement rejects unexpected fields at root."""
    payload = {
        "batch_id": str(uuid.uuid4()),
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [{
            "metric_id": str(uuid.uuid4()),
            "source": "server-01",
            "metric_name": "cpu_usage",
            "value": 50.0,
            "unit": "percent",
            "timestamp": "2026-11-20T10:30:00Z",
        }],
        "unexpected_field": "injected-value",
    }
    response = client.post(
        "/api/v1/ingest/telemetry",
        json=payload,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert response.status_code == 422
    assert response.json()["status"] == "error"


def test_reject_invalid_timestamp(client):
    """Invalid non-ISO timestamps must be rejected with 422."""
    payload = {
        "batch_id": str(uuid.uuid4()),
        "collector_id": "collector-001",
        "timestamp": "not-a-valid-timestamp",
        "metrics": [{
            "metric_id": str(uuid.uuid4()),
            "source": "server-01",
            "metric_name": "cpu_usage",
            "value": 50.0,
            "unit": "percent",
            "timestamp": "2026-11-20T10:30:00Z",
        }],
    }
    response = client.post(
        "/api/v1/ingest/telemetry",
        json=payload,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert response.status_code == 422
    assert response.json()["status"] == "error"


# ============================================================================
# 2. HEALTH CALCULATION TESTS
# ============================================================================

def test_health_evaluation_states(test_db_conn):
    """Verifies that all 4 health states (Excellent, Good, Fair, Poor) evaluate correctly."""
    repo = TelemetryRepository(test_db_conn)
    now = datetime.now(timezone.utc).isoformat()

    # 1. Seed Excellent metrics
    batch_id = str(uuid.uuid4())
    repo.save_batch(
        batch_id=batch_id,
        tenant_id="tenant-alpha",
        collector_id="collector-001",
        timestamp=now,
        schema_version="1.0",
        metadata=None,
        metrics=[
            {"metric_id": str(uuid.uuid4()), "source": "server-excellent", "metric_name": name,
             "value": value, "unit": unit, "timestamp": now}
            for name, value, unit in [
                ("cpu_usage", 45.0, "percent"), ("memory_usage", 45.0, "percent"),
                ("disk_usage", 45.0, "percent"), ("bandwidth_usage", 45.0, "percent"),
                ("network_latency", 20.0, "ms"), ("packet_loss", 0.0, "percent"),
                ("service_availability", 1.0, "ratio"), ("connectivity", 1.0, "ratio"),
            ]
        ],
    )
    h_exc = calculate_source_health("tenant-alpha", "server-excellent", repo)
    assert h_exc["health_status"] == "Excellent"
    assert h_exc["health_score"] >= 90.0

    # 2. Seed Fair metric
    repo.save_batch(
        batch_id=str(uuid.uuid4()),
        tenant_id="tenant-alpha",
        collector_id="collector-001",
        timestamp=now,
        schema_version="1.0",
        metadata=None,
        metrics=[{
            "metric_id": str(uuid.uuid4()),
            "source": "server-fair",
            "metric_name": "cpu_usage",
            "value": 88.0,  # 85-92%
            "unit": "percent",
            "timestamp": now,
        }],
    )
    h_fair = calculate_source_health("tenant-alpha", "server-fair", repo)
    assert h_fair["health_status"] == "Fair"
    assert 50.0 <= h_fair["health_score"] <= 75.0

    # 3. Seed Poor metric
    repo.save_batch(
        batch_id=str(uuid.uuid4()),
        tenant_id="tenant-alpha",
        collector_id="collector-001",
        timestamp=now,
        schema_version="1.0",
        metadata=None,
        metrics=[{
            "metric_id": str(uuid.uuid4()),
            "source": "server-poor",
            "metric_name": "cpu_usage",
            "value": 96.0,  # > 92%
            "unit": "percent",
            "timestamp": now,
        }],
    )
    h_poor = calculate_source_health("tenant-alpha", "server-poor", repo)
    assert h_poor["health_status"] == "Poor"
    assert h_poor["health_score"] <= 45.0


def test_stale_telemetry_health_handling(test_db_conn):
    """Telemetry older than threshold must be classified as Poor with 10.0 score."""
    repo = TelemetryRepository(test_db_conn)
    # 10 minutes ago
    stale_time = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()

    repo.save_batch(
        batch_id=str(uuid.uuid4()),
        tenant_id="tenant-alpha",
        collector_id="collector-001",
        timestamp=stale_time,
        schema_version="1.0",
        metadata=None,
        metrics=[{
            "metric_id": str(uuid.uuid4()),
            "source": "server-stale",
            "metric_name": "cpu_usage",
            "value": 20.0,  # Value looks low, but it's stale!
            "unit": "percent",
            "timestamp": stale_time,
        }],
    )
    h_stale = calculate_source_health("tenant-alpha", "server-stale", repo)
    assert h_stale["health_status"] == "Poor"
    assert "stale" in h_stale["explanation"].lower()


def test_missing_telemetry_source_health(test_db_conn):
    """A source with no telemetry must return Poor status with 0.0 score."""
    repo = TelemetryRepository(test_db_conn)
    h_empty = calculate_source_health("tenant-alpha", "nonexistent-server", repo)
    assert h_empty["health_status"] == "Poor"
    assert h_empty["health_score"] == 0.0
    assert "no telemetry" in h_empty["explanation"].lower()


def test_health_requires_complete_fresh_metrics_for_excellent(test_db_conn):
    repo = TelemetryRepository(test_db_conn)
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    stale_iso = (now - timedelta(minutes=5)).isoformat()
    repo.save_batch(
        batch_id=str(uuid.uuid4()), tenant_id="tenant-alpha", collector_id="collector-001",
        timestamp=now_iso, schema_version="1.0", metadata=None,
        metrics=[
            {"metric_id": str(uuid.uuid4()), "source": "partial", "metric_name": "cpu_usage",
             "value": 30.0, "unit": "percent", "timestamp": now_iso},
        ],
    )
    partial = calculate_source_health("tenant-alpha", "partial", repo, as_of_time=now)
    assert partial["health_status"] == "Good"
    assert "missing" in partial["explanation"].lower()

    repo.save_batch(
        batch_id=str(uuid.uuid4()), tenant_id="tenant-alpha", collector_id="collector-001",
        timestamp=now_iso, schema_version="1.0", metadata=None,
        metrics=[
            {"metric_id": str(uuid.uuid4()), "source": "mixed-age", "metric_name": "cpu_usage",
             "value": 30.0, "unit": "percent", "timestamp": now_iso},
            {"metric_id": str(uuid.uuid4()), "source": "mixed-age", "metric_name": "network_latency",
             "value": 10.0, "unit": "ms", "timestamp": stale_iso},
        ],
    )
    mixed = calculate_source_health("tenant-alpha", "mixed-age", repo, as_of_time=now)
    assert mixed["health_status"] == "Poor"
    assert any(metric["metric_name"] == "network_latency" and metric["status"] == "Stale"
               for metric in mixed["contributing_metrics"])


# ============================================================================
# 3. ANOMALY DETECTION & DUPLICATE SUPPRESSION
# ============================================================================

def test_anomaly_detection_and_duplicate_suppression(test_db_conn):
    """
    Verifies anomaly detection on high values and ensures duplicate anomaly
    events are suppressed within cooldown window.
    """
    repo = TelemetryRepository(test_db_conn)
    now = datetime.now(timezone.utc).isoformat()

    # 1. Trigger first anomaly (CPU 95% is critical)
    anom1 = detect_anomaly_for_metric(
        tenant_id="tenant-alpha",
        source="db-server-01",
        metric_name="cpu_usage",
        observed_value=95.0,
        metric_id=str(uuid.uuid4()),
        timestamp=now,
        repo=repo,
    )
    assert anom1 is not None
    assert anom1["severity"] == "CRITICAL"
    assert "critically high" in anom1["explanation"]

    # 2. Second reading 10 seconds later with same value must be suppressed
    later_time = (datetime.now(timezone.utc) + timedelta(seconds=10)).isoformat()
    anom2 = detect_anomaly_for_metric(
        tenant_id="tenant-alpha",
        source="db-server-01",
        metric_name="cpu_usage",
        observed_value=95.0,
        metric_id=str(uuid.uuid4()),
        timestamp=later_time,
        repo=repo,
    )
    assert anom2 is None  # Suppressed!


def test_anomaly_baseline_excludes_current_and_same_batch_records(test_db_conn):
    repo = TelemetryRepository(test_db_conn)
    start = datetime(2026, 11, 20, 10, 0, tzinfo=timezone.utc)
    history = [
        {"metric_id": str(uuid.uuid4()), "source": "baseline-host", "metric_name": "cpu_usage",
         "value": value, "unit": "percent", "timestamp": (start + timedelta(minutes=i)).isoformat()}
        for i, value in enumerate((20.0, 30.0, 40.0))
    ]
    current_id = str(uuid.uuid4())
    peer_id = str(uuid.uuid4())
    incoming = [
        {"metric_id": current_id, "source": "baseline-host", "metric_name": "cpu_usage",
         "value": 86.0, "unit": "percent", "timestamp": (start + timedelta(minutes=4)).isoformat()},
        {"metric_id": peer_id, "source": "baseline-host", "metric_name": "cpu_usage",
         "value": 100.0, "unit": "percent", "timestamp": (start + timedelta(minutes=4)).isoformat()},
    ]
    repo.save_batch(
        batch_id=str(uuid.uuid4()), tenant_id="tenant-alpha", collector_id="collector-001",
        timestamp=(start + timedelta(minutes=4)).isoformat(), schema_version="1.0", metadata=None,
        metrics=history + incoming,
    )
    anomalies = process_batch_anomalies("tenant-alpha", incoming, repo)
    assert len(anomalies) == 2
    assert all(anomaly["baseline_value"] == 30.0 for anomaly in anomalies)
    assert all("3 readings" in anomaly["explanation"] for anomaly in anomalies)
    assert all("sample standard deviation" in anomaly["explanation"] for anomaly in anomalies)


def test_anomaly_out_of_order_reading_ignores_future_history(test_db_conn):
    repo = TelemetryRepository(test_db_conn)
    now = datetime(2026, 11, 20, 10, 0, tzinfo=timezone.utc)
    future_metrics = [
        {"metric_id": str(uuid.uuid4()), "source": "ordered-host", "metric_name": "cpu_usage",
         "value": value, "unit": "percent", "timestamp": (now + timedelta(minutes=i)).isoformat()}
        for i, value in enumerate((10.0, 20.0, 30.0), 1)
    ]
    repo.save_batch(
        batch_id=str(uuid.uuid4()), tenant_id="tenant-alpha", collector_id="collector-001",
        timestamp=(now + timedelta(minutes=3)).isoformat(), schema_version="1.0", metadata=None,
        metrics=future_metrics,
    )
    anomaly = detect_anomaly_for_metric(
        "tenant-alpha", "ordered-host", "cpu_usage", 86.0, str(uuid.uuid4()), now.isoformat(), repo,
    )
    assert anomaly is not None
    assert anomaly["baseline_value"] is None
    assert "warning threshold" in anomaly["explanation"]


def test_repository_orders_offset_timestamps_by_instant(test_db_conn):
    repo = TelemetryRepository(test_db_conn)
    repo.save_batch(
        batch_id=str(uuid.uuid4()), tenant_id="tenant-alpha", collector_id="collector-001",
        timestamp="2026-01-01T09:00:00Z", schema_version="1.0", metadata=None,
        metrics=[
            {"metric_id": str(uuid.uuid4()), "source": "offset-host", "metric_name": "cpu_usage",
             "value": 50.0, "unit": "percent", "timestamp": "2026-01-01T09:00:00+02:00"},
            {"metric_id": str(uuid.uuid4()), "source": "offset-host", "metric_name": "cpu_usage",
             "value": 90.0, "unit": "percent", "timestamp": "2026-01-01T08:30:00Z"},
        ],
    )
    history = repo.get_metric_history(
        "tenant-alpha", "offset-host", "cpu_usage", before_timestamp="2026-01-01T08:00:00Z"
    )
    assert history == [50.0]
    latest = repo.get_latest_metrics_per_source("tenant-alpha", "offset-host")
    assert len(latest) == 1 and latest[0]["value"] == 90.0


def test_normal_telemetry_triggers_no_anomalies(client, test_db_conn):
    """Normal metrics within safe operating limits must produce zero anomalies."""
    now = datetime.now(timezone.utc).isoformat()
    res = client.post(
        "/api/v1/ingest/telemetry",
        json={
            "batch_id": str(uuid.uuid4()),
            "collector_id": "collector-001",
            "timestamp": now,
            "metrics": [{
                "metric_id": str(uuid.uuid4()),
                "source": "healthy-web-server",
                "metric_name": "cpu_usage",
                "value": 42.0,
                "unit": "percent",
                "timestamp": now,
            }],
        },
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert res.status_code == 200

    repo = TelemetryRepository(test_db_conn)
    anomalies = repo.get_tenant_anomalies("tenant-alpha", source="healthy-web-server")
    assert len(anomalies) == 0


# ============================================================================
# 4. INCIDENT CORRELATION & RECOMMENDATIONS
# ============================================================================

def test_incident_correlation_pipeline(client, test_db_conn):
    """
    Ingesting anomalous metrics should automatically:
    1. Create an incident grouping the metrics.
    2. Generate explainable recommendations answering the 5 questions.
    """
    batch_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    payload = {
        "batch_id": batch_id,
        "collector_id": "collector-001",
        "timestamp": now,
        "metrics": [
            {
                "metric_id": str(uuid.uuid4()),
                "source": "api-gateway",
                "metric_name": "cpu_usage",
                "value": 94.0,  # Critical CPU spike
                "unit": "percent",
                "timestamp": now,
            },
            {
                "metric_id": str(uuid.uuid4()),
                "source": "api-gateway",
                "metric_name": "network_latency",
                "value": 550.0,  # Critical latency spike
                "unit": "ms",
                "timestamp": now,
            },
        ],
    }

    res = client.post(
        "/api/v1/ingest/telemetry",
        json=payload,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert res.status_code == 200

    repo = TelemetryRepository(test_db_conn)

    # Verify incident was created
    incidents = repo.get_tenant_incidents("tenant-alpha")
    assert len(incidents) >= 1
    inc = incidents[0]
    assert inc["affected_source"] == "api-gateway"
    assert inc["severity"] == "CRITICAL"
    assert inc["status"] == "OPEN"
    assert "Hypothesis" in inc["description"]

    # Verify recommendations were generated answering the 5 questions
    recs = repo.get_tenant_recommendations("tenant-alpha")
    assert len(recs) >= 1
    rec = recs[0]
    assert "1. What happened:" in rec["explanation"]
    assert "2. Metric of concern:" in rec["explanation"]
    assert "3. Observed value:" in rec["explanation"]
    assert "4. Why it matters:" in rec["explanation"]
    assert "5. What operator should do:" in rec["explanation"]


def test_duplicate_incident_prevention_on_continuous_telemetry(client, test_db_conn):
    """
    Continuous anomalous readings on the same source within correlation window
    must update the existing OPEN incident instead of creating duplicate incidents.
    """
    now = datetime.now(timezone.utc)
    t1 = now.isoformat()
    t2 = (now + timedelta(seconds=60)).isoformat()

    # Batch 1: High CPU
    client.post(
        "/api/v1/ingest/telemetry",
        json={
            "batch_id": str(uuid.uuid4()),
            "collector_id": "collector-001",
            "timestamp": t1,
            "metrics": [{
                "metric_id": str(uuid.uuid4()),
                "source": "worker-pool-1",
                "metric_name": "cpu_usage",
                "value": 96.0,
                "unit": "percent",
                "timestamp": t1,
            }],
        },
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )

    repo = TelemetryRepository(test_db_conn)
    incidents_after_1 = repo.get_tenant_incidents("tenant-alpha")
    count_1 = len(incidents_after_1)
    assert count_1 >= 1

    # Batch 2: High Memory 60 seconds later on same source
    client.post(
        "/api/v1/ingest/telemetry",
        json={
            "batch_id": str(uuid.uuid4()),
            "collector_id": "collector-001",
            "timestamp": t2,
            "metrics": [{
                "metric_id": str(uuid.uuid4()),
                "source": "worker-pool-1",
                "metric_name": "memory_usage",
                "value": 97.0,
                "unit": "percent",
                "timestamp": t2,
            }],
        },
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )

    incidents_after_2 = repo.get_tenant_incidents("tenant-alpha")
    # Must NOT have created an extra duplicate incident for worker-pool-1
    worker_incidents = [i for i in incidents_after_2 if i["affected_source"] == "worker-pool-1"]
    assert len(worker_incidents) == 1
    # Related metrics must now include memory_usage
    assert "memory_usage" in worker_incidents[0]["related_metrics_json"]


def test_incident_window_clusters_and_is_tenant_scoped(test_db_conn, monkeypatch):
    import backend.app.core.incident_correlation as correlation

    monkeypatch.setattr(correlation, "CORRELATION_WINDOW_SECONDS", 60)
    repo = TelemetryRepository(test_db_conn)
    start = datetime(2026, 11, 20, 10, 0, tzinfo=timezone.utc)

    def anomaly(tenant, offset, metric="cpu_usage"):
        return {"tenant_id": tenant, "source": "shared-name", "metric_name": metric,
                "severity": "WARNING", "detected_at": (start + timedelta(seconds=offset)).isoformat()}

    clustered = correlation.correlate_anomalies_to_incidents(
        "tenant-alpha", [anomaly("tenant-alpha", 0), anomaly("tenant-alpha", 50, "memory_usage")], repo,
    )
    assert len(clustered) == 1
    assert set(clustered[0]["related_metrics"]) == {"cpu_usage", "memory_usage"}
    updated = correlation.correlate_anomalies_to_incidents(
        "tenant-alpha", [anomaly("tenant-alpha", 55, "disk_usage")], repo,
    )
    assert len(updated) == 1 and updated[0]["incident_id"] == clustered[0]["incident_id"]
    separated = correlation.correlate_anomalies_to_incidents(
        "tenant-alpha", [anomaly("tenant-alpha", 120, "network_latency")], repo,
    )
    assert len(separated) == 1 and separated[0]["is_new"] is True
    other_tenant = correlation.correlate_anomalies_to_incidents(
        "tenant-beta", [anomaly("tenant-beta", 55)], repo,
    )
    assert other_tenant[0]["is_new"] is True
    assert other_tenant[0]["incident_id"] != clustered[0]["incident_id"]


def test_recommendations_use_persisted_evidence_and_deduplicate(test_db_conn):
    repo = TelemetryRepository(test_db_conn)
    detected_at = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    repo.save_anomaly(
        anomaly_id="anomaly-recommendation-test", tenant_id="tenant-alpha", metric_id=None,
        source="recommendation-host", metric_name="cpu_usage", observed_value=96.0,
        baseline_value=62.5, severity="CRITICAL",
        explanation="Observed 96.0 exceeds critical threshold 92.0 after a 3-sample baseline.",
        detected_at=detected_at,
    )
    repo.save_anomaly(
        anomaly_id="anomaly-after-incident", tenant_id="tenant-alpha", metric_id=None,
        source="recommendation-host", metric_name="cpu_usage", observed_value=99.0,
        baseline_value=70.0, severity="CRITICAL",
        explanation="Later anomaly unrelated to the original incident.",
        detected_at=datetime.now(timezone.utc).isoformat(),
    )
    incident_id = "incident-recommendation-test"
    repo.create_incident(
        incident_id=incident_id, tenant_id="tenant-alpha", affected_source="recommendation-host",
        severity="CRITICAL", title="CPU issue", description="Test incident", status="OPEN",
        detected_at=detected_at, related_metrics=["cpu_usage"],
    )
    incident = {"incident_id": incident_id, "affected_source": "recommendation-host",
                "severity": "CRITICAL", "related_metrics": ["cpu_usage"],
                "first_detected_at": detected_at, "last_updated_at": detected_at}
    first = generate_recommendations_for_incident("tenant-alpha", incident, [], repo)
    test_db_conn.execute(
        "UPDATE recommendations SET explanation = '3. Observed value: N/A.' WHERE incident_id = ?",
        (incident_id,),
    )
    test_db_conn.commit()
    second = generate_recommendations_for_incident("tenant-alpha", incident, [], repo)
    assert len(first) == 1
    assert second == []
    saved = repo.get_tenant_recommendations("tenant-alpha")[0]
    explanation = saved["explanation"]
    assert "N/A" not in explanation
    assert "Observed value: 96.0" in explanation
    assert "Baseline: 62.5" in explanation
    assert "critical=92.0" in explanation
    assert "exceeds critical threshold" in explanation


# ============================================================================
# 5. FRONTEND / DASHBOARD APIS & TENANT ISOLATION
# ============================================================================

def test_dashboard_overview_and_tenant_isolation(client, test_db_conn):
    """
    Verifies /api/v1/dashboard/overview and strict isolation:
    Tenant Alpha only sees Tenant Alpha data.
    """
    now = datetime.now(timezone.utc).isoformat()

    # Seed data for Alpha
    client.post(
        "/api/v1/ingest/telemetry",
        json={
            "batch_id": str(uuid.uuid4()),
            "collector_id": "collector-001",
            "timestamp": now,
            "metrics": [{
                "metric_id": str(uuid.uuid4()),
                "source": "alpha-auth-service",
                "metric_name": "cpu_usage",
                "value": 60.0,
                "unit": "percent",
                "timestamp": now,
            }],
        },
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )

    # Seed data for Beta
    client.post(
        "/api/v1/ingest/telemetry",
        json={
            "batch_id": str(uuid.uuid4()),
            "collector_id": "collector-002",
            "timestamp": now,
            "metrics": [{
                "metric_id": str(uuid.uuid4()),
                "source": "beta-payment-service",
                "metric_name": "cpu_usage",
                "value": 95.0,  # Critical
                "unit": "percent",
                "timestamp": now,
            }],
        },
        headers={"X-API-Key": "key-beta-valid-5678"},
    )

    # 1. Query Dashboard Overview for Alpha
    res_a = client.get("/api/v1/dashboard/overview", headers={"X-Tenant-ID": "tenant-alpha"})
    assert res_a.status_code == 200
    data_a = res_a.json()
    assert data_a["tenant_id"] == "tenant-alpha"
    assert data_a["total_monitored_sources"] == 1
    assert data_a["healthy_sources"] == 1
    assert data_a["unhealthy_sources"] == 0

    # 2. Query Dashboard Overview for Beta
    res_b = client.get("/api/v1/dashboard/overview", headers={"X-Tenant-ID": "tenant-beta"})
    assert res_b.status_code == 200
    data_b = res_b.json()
    assert data_b["tenant_id"] == "tenant-beta"
    assert data_b["unhealthy_sources"] == 1

    # 3. Verify Telemetry Filtering
    res_tel = client.get(
        "/api/v1/telemetry?metric_name=cpu_usage&limit=10",
        headers={"X-Tenant-ID": "tenant-alpha"},
    )
    assert res_tel.status_code == 200
    tel_data = res_tel.json()
    assert tel_data["total"] == 1
    assert tel_data["records"][0]["source"] == "alpha-auth-service"
    for rec in tel_data["records"]:
        assert rec["tenant_id"] == "tenant-alpha"
        assert "beta" not in rec["source"]

    # 4. Verify Cross-Tenant Isolation on Anomalies & Recommendations
    res_anom_beta = client.get("/api/v1/anomalies", headers={"X-Tenant-ID": "tenant-alpha"})
    assert res_anom_beta.status_code == 200
    for anom in res_anom_beta.json():
        assert anom["tenant_id"] == "tenant-alpha"
        assert "beta" not in anom["source"]


def test_incident_status_lifecycle_patch(client, test_db_conn):
    """
    Tests PATCH /api/v1/incidents/{incident_id}
    OPEN -> ACKNOWLEDGED -> RESOLVED
    """
    now = datetime.now(timezone.utc).isoformat()
    inc_batch_id = str(uuid.uuid4())
    client.post(
        "/api/v1/ingest/telemetry",
        json={
            "batch_id": inc_batch_id,
            "collector_id": "collector-001",
            "timestamp": now,
            "metrics": [{
                "metric_id": str(uuid.uuid4()),
                "source": "database-cluster",
                "metric_name": "cpu_usage",
                "value": 98.0,
                "unit": "percent",
                "timestamp": now,
            }],
        },
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )

    repo = TelemetryRepository(test_db_conn)
    incidents = repo.get_tenant_incidents("tenant-alpha")
    assert len(incidents) >= 1
    incident_id = incidents[0]["incident_id"]

    # 1. Acknowledge incident
    res_ack = client.patch(
        f"/api/v1/incidents/{incident_id}",
        json={"status": "ACKNOWLEDGED"},
        headers={"X-Tenant-ID": "tenant-alpha"},
    )
    assert res_ack.status_code == 200
    assert res_ack.json()["status"] == "ACKNOWLEDGED"

    # 2. Resolve incident
    res_res = client.patch(
        f"/api/v1/incidents/{incident_id}",
        json={"status": "RESOLVED"},
        headers={"X-Tenant-ID": "tenant-alpha"},
    )
    assert res_res.status_code == 200
    assert res_res.json()["status"] == "RESOLVED"

    # 3. Cross-tenant attempt to patch Alpha's incident with Beta's header must fail with 404
    res_cross = client.patch(
        f"/api/v1/incidents/{incident_id}",
        json={"status": "OPEN"},
        headers={"X-Tenant-ID": "tenant-beta"},
    )
    assert res_cross.status_code == 404


def test_atomic_transaction_behavior(client, test_db_conn):
    """
    If a batch contains an invalid metric_id (already ingested globally),
    the entire transaction must fail with 409 and NO part of the batch is committed.
    """
    reused_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Ingest metric first
    client.post(
        "/api/v1/ingest/telemetry",
        json={
            "batch_id": str(uuid.uuid4()),
            "collector_id": "collector-001",
            "timestamp": now,
            "metrics": [{
                "metric_id": reused_id,
                "source": "initial-server",
                "metric_name": "cpu_usage",
                "value": 50.0,
                "unit": "percent",
                "timestamp": now,
            }],
        },
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )

    failing_batch_id = str(uuid.uuid4())
    new_metric_id = str(uuid.uuid4())

    # Try ingesting a batch containing 1 new metric and 1 reused metric
    res_fail = client.post(
        "/api/v1/ingest/telemetry",
        json={
            "batch_id": failing_batch_id,
            "collector_id": "collector-001",
            "timestamp": now,
            "metrics": [
                {
                    "metric_id": new_metric_id,
                    "source": "atomic-test-server",
                    "metric_name": "cpu_usage",
                    "value": 50.0,
                    "unit": "percent",
                    "timestamp": now,
                },
                {
                    "metric_id": reused_id,  # Reused!
                    "source": "atomic-test-server",
                    "metric_name": "memory_usage",
                    "value": 50.0,
                    "unit": "percent",
                    "timestamp": now,
                },
            ],
        },
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert res_fail.status_code == 409

    # Verify that neither the batch nor the new metric was saved
    repo = TelemetryRepository(test_db_conn)
    assert not repo.batch_exists(failing_batch_id)
    assert not repo.metric_id_exists(new_metric_id)
