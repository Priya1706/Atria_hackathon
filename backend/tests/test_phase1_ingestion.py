import uuid
import pytest
from backend.app.db.repository import TelemetryRepository


def test_valid_telemetry_ingestion(client, test_db_conn):
    """
    Valid telemetry ingestion with correct API key, batch_id, and metrics.
    Must return HTTP 200 with status: success, matching batch_id, and records_received count.
    """
    batch_id = str(uuid.uuid4())
    metric_id = str(uuid.uuid4())

    payload = {
        "schema_version": "1.0",
        "batch_id": batch_id,
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [
            {
                "metric_id": metric_id,
                "source": "server-01",
                "metric_name": "cpu_usage",
                "value": 78.5,
                "unit": "percent",
                "timestamp": "2026-11-20T10:30:00Z",
            }
        ],
        "metadata": {
            "environment": "production"
        },
    }

    response = client.post(
        "/api/v1/ingest/telemetry",
        json=payload,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["batch_id"] == batch_id
    assert data["records_received"] == 1


def test_missing_required_fields(client):
    """
    Requests missing mandatory fields (e.g., collector_id, metrics) must be rejected with 422.
    """
    incomplete_payload = {
        "batch_id": str(uuid.uuid4()),
        # Missing collector_id, timestamp, and metrics
    }

    response = client.post(
        "/api/v1/ingest/telemetry",
        json=incomplete_payload,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )

    assert response.status_code == 422
    data = response.json()
    assert data["status"] == "error"
    assert "Invalid payload" in data["message"]


def test_invalid_uuids(client):
    """
    batch_id and metric_id must be valid UUIDs. Invalid strings must be rejected with 422.
    """
    invalid_uuid_payload = {
        "batch_id": "not-a-valid-uuid",
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [
            {
                "metric_id": "also-not-a-uuid",
                "source": "server-01",
                "metric_name": "cpu_usage",
                "value": 45.0,
                "unit": "percent",
                "timestamp": "2026-11-20T10:30:00Z",
            }
        ],
    }

    response = client.post(
        "/api/v1/ingest/telemetry",
        json=invalid_uuid_payload,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )

    assert response.status_code == 422
    data = response.json()
    assert data["status"] == "error"


def test_missing_api_key(client):
    """
    Requests without X-API-Key must be rejected with HTTP 401.
    """
    payload = {
        "batch_id": str(uuid.uuid4()),
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [
            {
                "metric_id": str(uuid.uuid4()),
                "source": "server-01",
                "metric_name": "cpu_usage",
                "value": 50.0,
                "unit": "percent",
                "timestamp": "2026-11-20T10:30:00Z",
            }
        ],
    }

    response = client.post("/api/v1/ingest/telemetry", json=payload)
    assert response.status_code == 401
    data = response.json()
    assert data["status"] == "error"
    assert "Missing or invalid API key" in data["message"]


def test_invalid_api_key(client):
    """
    Requests with an unrecognized API key must be rejected with HTTP 401.
    """
    payload = {
        "batch_id": str(uuid.uuid4()),
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [
            {
                "metric_id": str(uuid.uuid4()),
                "source": "server-01",
                "metric_name": "cpu_usage",
                "value": 50.0,
                "unit": "percent",
                "timestamp": "2026-11-20T10:30:00Z",
            }
        ],
    }

    response = client.post(
        "/api/v1/ingest/telemetry",
        json=payload,
        headers={"X-API-Key": "wrong-bogus-key"},
    )
    assert response.status_code == 401
    data = response.json()
    assert data["status"] == "error"
    assert "Missing or invalid API key" in data["message"]


def test_collector_identity_mismatch(client):
    """
    If API key belongs to collector-001, but payload claims collector_id is collector-002,
    must return HTTP 403 Forbidden.
    """
    payload = {
        "batch_id": str(uuid.uuid4()),
        "collector_id": "collector-002",  # Mismatch with key-alpha-valid-1234
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [
            {
                "metric_id": str(uuid.uuid4()),
                "source": "server-01",
                "metric_name": "cpu_usage",
                "value": 50.0,
                "unit": "percent",
                "timestamp": "2026-11-20T10:30:00Z",
            }
        ],
    }

    response = client.post(
        "/api/v1/ingest/telemetry",
        json=payload,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert response.status_code == 403
    data = response.json()
    assert data["status"] == "error"
    assert "Collector identity mismatch" in data["message"]


def test_duplicate_batch_id_deduplication(client):
    """
    Sending the same batch_id twice must return HTTP 409 Conflict with status: duplicate.
    """
    batch_id = str(uuid.uuid4())
    payload = {
        "batch_id": batch_id,
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [
            {
                "metric_id": str(uuid.uuid4()),
                "source": "server-01",
                "metric_name": "cpu_usage",
                "value": 60.0,
                "unit": "percent",
                "timestamp": "2026-11-20T10:30:00Z",
            }
        ],
    }

    # First call: Success
    res1 = client.post(
        "/api/v1/ingest/telemetry",
        json=payload,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert res1.status_code == 200
    assert res1.json()["status"] == "success"

    # Second call: Duplicate batch
    res2 = client.post(
        "/api/v1/ingest/telemetry",
        json=payload,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert res2.status_code == 409
    data = res2.json()
    assert data["status"] == "duplicate"
    assert data["batch_id"] == batch_id
    assert data["message"] == "Batch already processed"


def test_globally_duplicate_metric_ids(client):
    """
    metric_id must be globally unique. Reusing a metric_id across different batches
    must be rejected with HTTP 409.
    """
    reused_metric_id = str(uuid.uuid4())

    batch1 = {
        "batch_id": str(uuid.uuid4()),
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [
            {
                "metric_id": reused_metric_id,
                "source": "server-01",
                "metric_name": "cpu_usage",
                "value": 60.0,
                "unit": "percent",
                "timestamp": "2026-11-20T10:30:00Z",
            }
        ],
    }

    batch2 = {
        "batch_id": str(uuid.uuid4()),  # New batch ID
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:35:00Z",
        "metrics": [
            {
                "metric_id": reused_metric_id,  # Reused metric ID!
                "source": "server-01",
                "metric_name": "memory_usage",
                "value": 75.0,
                "unit": "percent",
                "timestamp": "2026-11-20T10:35:00Z",
            }
        ],
    }

    res1 = client.post(
        "/api/v1/ingest/telemetry",
        json=batch1,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert res1.status_code == 200

    res2 = client.post(
        "/api/v1/ingest/telemetry",
        json=batch2,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert res2.status_code == 409
    data = res2.json()
    assert data["status"] == "error"
    assert "already been ingested" in data["message"]


def test_client_cannot_supply_tenant_or_health_status(client):
    """
    Contract rule: client must not supply tenant_id or health_status.
    Payloads containing them in metadata must be rejected with 422.
    """
    payload = {
        "batch_id": str(uuid.uuid4()),
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [
            {
                "metric_id": str(uuid.uuid4()),
                "source": "server-01",
                "metric_name": "cpu_usage",
                "value": 60.0,
                "unit": "percent",
                "timestamp": "2026-11-20T10:30:00Z",
            }
        ],
        "metadata": {
            "tenant_id": "tenant-beta",  # Attempt to spoof tenant!
            "health_status": "Excellent",  # Attempt to dictate health status!
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
    assert "Forbidden" in data["message"]


def test_database_persistence_and_cross_tenant_isolation(client, test_db_conn):
    """
    Verifies that:
    1. Ingested records are persisted in the database.
    2. Tenant A's metrics are strictly isolated from Tenant B.
    """
    batch_alpha = {
        "batch_id": str(uuid.uuid4()),
        "collector_id": "collector-001",
        "timestamp": "2026-11-20T10:30:00Z",
        "metrics": [
            {
                "metric_id": str(uuid.uuid4()),
                "source": "alpha-server",
                "metric_name": "cpu_usage",
                "value": 85.0,
                "unit": "percent",
                "timestamp": "2026-11-20T10:30:00Z",
            }
        ],
    }

    batch_beta = {
        "batch_id": str(uuid.uuid4()),
        "collector_id": "collector-002",
        "timestamp": "2026-11-20T10:31:00Z",
        "metrics": [
            {
                "metric_id": str(uuid.uuid4()),
                "source": "beta-server",
                "metric_name": "cpu_usage",
                "value": 30.0,
                "unit": "percent",
                "timestamp": "2026-11-20T10:31:00Z",
            }
        ],
    }

    # Ingest for Alpha
    res_a = client.post(
        "/api/v1/ingest/telemetry",
        json=batch_alpha,
        headers={"X-API-Key": "key-alpha-valid-1234"},
    )
    assert res_a.status_code == 200

    # Ingest for Beta
    res_b = client.post(
        "/api/v1/ingest/telemetry",
        json=batch_beta,
        headers={"X-API-Key": "key-beta-valid-5678"},
    )
    assert res_b.status_code == 200

    repo = TelemetryRepository(test_db_conn)

    # 1. Verify Alpha tenant metrics only contains Alpha's metric
    alpha_metrics = repo.get_tenant_metrics(tenant_id="tenant-alpha")
    assert len(alpha_metrics) == 1
    assert alpha_metrics[0]["source"] == "alpha-server"
    assert alpha_metrics[0]["value"] == 85.0
    assert alpha_metrics[0]["tenant_id"] == "tenant-alpha"

    # 2. Verify Beta tenant metrics only contains Beta's metric
    beta_metrics = repo.get_tenant_metrics(tenant_id="tenant-beta")
    assert len(beta_metrics) == 1
    assert beta_metrics[0]["source"] == "beta-server"
    assert beta_metrics[0]["value"] == 30.0
    assert beta_metrics[0]["tenant_id"] == "tenant-beta"

    # 3. Verify heartbeats were updated
    collector_a = repo.get_collector_by_api_key("key-alpha-valid-1234")
    cursor = test_db_conn.cursor()
    cursor.execute("SELECT last_heartbeat FROM collectors WHERE id = 'collector-001'")
    row = cursor.fetchone()
    assert "2026-11-20T10:30:00" in row["last_heartbeat"]
