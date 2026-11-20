"""End-to-end local collector -> authenticated SaaS ingestion tests."""
import json
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import httpx

from backend.app.db.repository import TelemetryRepository
from collector.models import TelemetryInput
from collector.pipeline import Pipeline
from collector.store import Store
import collector.pipeline as pipeline_module
import collector.transport as transport


SAAS_URL = "http://127.0.0.1:8000/api/v1/ingest/telemetry"


def _configure_collector(monkeypatch):
    monkeypatch.setattr(pipeline_module, "settings", SimpleNamespace(
        tenant_id="tenant-alpha", collector_id="collector-001", pseudonym_salt="integration-test-salt",
        saas_url=SAAS_URL, stale_after_seconds=300,
        health_good_threshold=60, health_fair_threshold=75, health_poor_threshold=90,
    ))
    monkeypatch.setattr(transport, "settings", SimpleNamespace(
        saas_url=SAAS_URL, saas_api_key="key-alpha-valid-1234",
        retry_base_seconds=0, retry_max_seconds=1,
    ))


def _synthetic_batch():
    """Deterministic test values; these are not production/organizer measurements."""
    now = datetime.now(timezone.utc)
    values = [
        ("cpu_utilization", 98.0),
        ("memory_utilization", 55.0),
        ("disk_utilization", 60.0),
        ("bandwidth_utilization_percent", 87.0),
        ("network_latency_ms", 35.0),
        ("packet_loss_percent", 6.0),
        ("service_availability", 1.0),
        ("connectivity", 1.0),
        ("failed_auth_attempts", 0.0),
        ("security_event_summary", 0.0),
    ]
    return [TelemetryInput(
        tenant_id="tenant-alpha", collector_id="collector-001", timestamp_utc=now,
        source_timezone="UTC", metric_name=name, metric_value=value,
        source_identifier="integration-private-host", category="synthetic", severity="info",
        password="local-only-test-secret", raw_log="local-only test log",
    ) for name, value in values]


class SaaSGateway:
    """Routes transport calls through the real SaaS FastAPI app's test client."""
    def __init__(self, client, lose_first_ack=False):
        self.client = client
        self.lose_first_ack = lose_first_ack
        self.requests = []

    def post(self, url, **kwargs):
        response = self.client.post(url, content=kwargs["content"], headers=kwargs["headers"])
        self.requests.append((url, kwargs["content"], kwargs["headers"], response))
        if self.lose_first_ack and len(self.requests) == 1:
            # SaaS accepted and stored, but the collector lost the response in transit.
            raise httpx.ReadTimeout("simulated lost acknowledgement")
        return response


def test_e2e_collector_to_saas_duplicate_ack_and_metric_conflict(client, test_db_conn, tmp_path, monkeypatch):
    _configure_collector(monkeypatch)
    store = Store(str(tmp_path / "collector-integration.db"))
    pipeline = Pipeline(store)
    ids, anomalies, local_health, batch_id = pipeline.accept(_synthetic_batch())
    audit = store.get_egress(batch_id)
    body = json.loads(audit["payload_json"])

    # Contract and privacy checks before the actual HTTP handoff.
    assert body["batch_id"] == batch_id and body["collector_id"] == "collector-001"
    assert set(body) == {"schema_version", "batch_id", "collector_id", "timestamp", "metrics"}
    assert len(body["metrics"]) == 10 and "tenant_id" not in body
    assert "integration-private-host" not in audit["payload_json"]
    assert "local-only-test-secret" not in audit["payload_json"]
    assert "local-only test log" not in audit["payload_json"]
    assert local_health["state"] == "Poor"

    gateway = SaaSGateway(client, lose_first_ack=True)
    # First request is stored centrally but the collector observes a timeout.
    assert transport.transmit_pending(store, gateway) == 0
    assert store.get_egress(batch_id)["status"] == "failed"

    # Retry sends identical audited bytes. SaaS returns 409/status=duplicate; collector safely acks it.
    assert transport.transmit_pending(store, gateway) == 1
    egress = store.get_egress(batch_id)
    assert egress["status"] == "sent" and egress["retry_attempts"] == 2
    assert gateway.requests[0][1] == gateway.requests[1][1] == egress["payload_json"]
    assert gateway.requests[1][3].status_code == 409
    assert gateway.requests[1][3].json()["status"] == "duplicate"
    assert gateway.requests[1][2]["X-API-Key"] == "key-alpha-valid-1234"
    assert gateway.requests[1][2]["Idempotency-Key"] == batch_id

    # API key, not the absent payload tenant, assigns the saved tenant.
    repo = TelemetryRepository(test_db_conn)
    stored = repo.get_tenant_metrics("tenant-alpha")
    assert len(stored) == 10
    assert all(record["tenant_id"] == "tenant-alpha" for record in stored)
    assert {record["metric_name"] for record in stored} >= {
        "cpu_usage", "memory_usage", "disk_usage", "bandwidth_usage",
        "network_latency", "packet_loss", "connectivity", "service_availability",
        "failed_authentication_count", "security_event_count",
    }
    assert repo.get_tenant_anomalies("tenant-alpha")
    health = client.get("/api/v1/health", headers={"X-Tenant-ID": "tenant-alpha"}).json()
    assert health["sources"] and health["sources"][0]["health_status"] == "Poor"

    # A sent batch is not attempted again by the collector.
    assert transport.transmit_pending(store, gateway) == 0
    assert len(gateway.requests) == 2

    # A different batch reusing a stored metric ID gets a genuine 409/error, not duplicate acknowledgement.
    conflicting_batch_id = str(uuid.uuid4())
    conflicting_payload = dict(body)
    conflicting_payload["batch_id"] = conflicting_batch_id
    store.enqueue(conflicting_batch_id, ids, conflicting_payload, [], [], [], SAAS_URL, "collector-001")
    assert transport.transmit_pending(store, gateway) == 0
    conflict = store.get_egress(conflicting_batch_id)
    assert conflict["status"] == "failed"
    assert gateway.requests[-1][3].status_code == 409
    assert gateway.requests[-1][3].json()["status"] == "error"
    assert len(repo.get_tenant_metrics("tenant-alpha")) == 10
