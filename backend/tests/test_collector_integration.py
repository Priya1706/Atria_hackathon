"""End-to-end local collector -> authenticated SaaS ingestion tests."""
import json
import sqlite3
import socket
import threading
import time
import uuid
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace

import httpx
import uvicorn
from fastapi.testclient import TestClient as CollectorTestClient

from backend.app.db.repository import TelemetryRepository
from collector.models import TelemetryInput
from collector.pipeline import Pipeline
from collector.store import Store
import collector.app as collector_app
import collector.pipeline as pipeline_module
import collector.simulator as simulator_module
import collector.transport as transport


SAAS_URL = "http://127.0.0.1:8000/api/v1/ingest/telemetry"


def _configure_collector(monkeypatch, saas_url=SAAS_URL, api_key="key-alpha-valid-1234"):
    monkeypatch.setattr(pipeline_module, "settings", SimpleNamespace(
        tenant_id="tenant-alpha", collector_id="collector-001", pseudonym_salt="integration-test-salt",
        saas_url=saas_url, stale_after_seconds=300,
        health_good_threshold=60, health_fair_threshold=75, health_poor_threshold=90,
    ))
    monkeypatch.setattr(transport, "settings", SimpleNamespace(
        saas_url=saas_url, saas_api_key=api_key,
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


def test_compound_demo_scenario_uses_collector_and_saas_pipeline(client, test_db_conn, tmp_path, monkeypatch):
    _configure_collector(monkeypatch)
    store = Store(str(tmp_path / "compound-demo.db"))
    pipeline = Pipeline(store)
    collector_settings = SimpleNamespace(
        tenant_id="tenant-alpha", collector_id="collector-001", simulator_enabled=True,
        saas_url=SAAS_URL, saas_api_key="key-alpha-valid-1234", retry_interval_seconds=30,
    )
    monkeypatch.setattr(collector_app, "settings", collector_settings)
    monkeypatch.setattr(collector_app, "store", store)
    monkeypatch.setattr(collector_app, "pipeline", pipeline)
    monkeypatch.setattr(collector_app, "transmit_pending", lambda _store: 0)
    monkeypatch.setattr(simulator_module, "settings", collector_settings)

    with CollectorTestClient(collector_app.app) as collector_client:
        collected = collector_client.post("/collector/demo?scenario=compound")
        assert collected.status_code == 200
        assert collected.json()["accepted"] == 10

    egress = store.get_egress(collected.json()["batch_id"])
    gateway = SaaSGateway(client)
    assert transport.transmit_pending(store, gateway) == 1
    assert store.get_egress(collected.json()["batch_id"])["status"] == "sent"
    payload = json.loads(egress["payload_json"])
    assert all(set(metric) == {"metric_id", "source", "metric_name", "value", "unit", "timestamp"}
               for metric in payload["metrics"])

    repo = TelemetryRepository(test_db_conn)
    assert len(repo.get_tenant_metrics("tenant-alpha")) == 10
    response = client.get("/api/v1/incidents", headers={"X-Tenant-ID": "tenant-alpha"})
    assert response.status_code == 200
    compound = next(item for item in response.json() if item["affected_source"])
    assert {metric["metric_name"] for metric in compound["contributing_metrics"]} >= {
        "cpu_usage", "memory_usage", "network_latency",
    }
    assert compound["root_cause_hypotheses"]


def test_real_http_collector_to_saas_recovery_and_outage_retry(
    client, test_db_conn, tmp_path, monkeypatch
):
    """Exercise the real collector and SaaS apps over a loopback HTTP socket."""
    from backend.app.core import incident_recovery
    from backend.app.main import app as saas_app

    monkeypatch.setattr(incident_recovery, "INCIDENT_RECOVERY_WINDOW_SECONDS", 0.1)
    def create_listener(port=0):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("127.0.0.1", port))
        sock.listen(128)
        return sock

    listener = create_listener()
    port = listener.getsockname()[1]
    base_url = f"http://127.0.0.1:{port}"
    config = uvicorn.Config(saas_app, log_level="critical", lifespan="off")
    server = uvicorn.Server(config)
    server_thread = None

    def start_saas():
        nonlocal server_thread, listener
        if listener.fileno() < 0:
            listener = create_listener(port)
        server.should_exit = False
        server_thread = threading.Thread(
            target=server.run, kwargs={"sockets": [listener]}, daemon=True
        )
        server_thread.start()
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                if httpx.get(base_url + "/health", timeout=0.2).status_code == 200:
                    return
            except httpx.HTTPError:
                time.sleep(0.01)
        raise AssertionError("SaaS HTTP server did not start")

    def stop_saas():
        server.should_exit = True
        if server_thread is not None:
            server_thread.join(timeout=5)
            assert not server_thread.is_alive()

    _configure_collector(monkeypatch, base_url + "/api/v1/ingest/telemetry")
    store = Store(str(tmp_path / "real-http-collector.db"))
    pipeline = Pipeline(store)
    collector_settings = SimpleNamespace(
        tenant_id="tenant-alpha", collector_id="collector-001", simulator_enabled=True,
        saas_url=base_url + "/api/v1/ingest/telemetry", saas_api_key="key-alpha-valid-1234",
        pseudonym_salt="real-http-integration-salt", stale_after_seconds=300,
        health_good_threshold=60, health_fair_threshold=75, health_poor_threshold=90,
        retry_interval_seconds=30,
    )
    monkeypatch.setattr(collector_app, "settings", collector_settings)
    monkeypatch.setattr(collector_app, "store", store)
    monkeypatch.setattr(collector_app, "pipeline", pipeline)
    # Keep the background loop idle so each real HTTP delivery is deterministic;
    # the transport called below is the production implementation.
    monkeypatch.setattr(collector_app, "transmit_pending", lambda _store: 0)
    monkeypatch.setattr(simulator_module, "settings", collector_settings)
    start_saas()
    try:
        with CollectorTestClient(collector_app.app) as collector_client:
            collected = collector_client.post("/collector/demo?scenario=compound")
            assert collected.status_code == 200
            batch_id = collected.json()["batch_id"]
            audit = store.get_egress(batch_id)
            payload = audit["payload_json"]
            assert transport.transmit_pending(store) == 1
            assert store.get_egress(batch_id)["status"] == "sent"

            # The exact same body and batch key produce SaaS's duplicate ACK.
            replay = httpx.post(
                base_url + "/api/v1/ingest/telemetry",
                content=payload,
                headers={
                    "X-API-Key": "key-alpha-valid-1234",
                    "Idempotency-Key": batch_id,
                    "Content-Type": "application/json",
                },
                timeout=2,
            )
            assert replay.status_code == 409
            assert replay.json()["status"] == "duplicate"

            # Secret and raw-log canaries remain in the local event row and are
            # absent from the exact request body sent over the real socket.
            canaries = (
                "AUDIT_PASSWORD_CANARY", "AUDIT_API_KEY_CANARY", "AUDIT_RAW_LOG_CANARY",
                "AUDIT_PRIVATE_HOST_CANARY", "AUDIT_UNKNOWN_FIELD_CANARY",
            )
            privacy_event = {
                "tenant_id": "tenant-alpha",
                "collector_id": "collector-001",
                "timestamp_utc": datetime.now(timezone(timedelta(hours=5, minutes=30))).isoformat(),
                "source_timezone": "Asia/Calcutta",
                "metric_name": "disk_utilization",
                "metric_value": 54.0,
                "source_identifier": canaries[3],
                "category": "audit",
                "severity": "info",
                "password": canaries[0],
                "api_key": canaries[1],
                "raw_log": canaries[2],
                "unknown_field": canaries[4],
            }
            private_batch = collector_client.post(
                "/collector/collect", json={"events": [privacy_event]}
            )
            assert private_batch.status_code == 200
            private_id = private_batch.json()["batch_id"]
            private_audit = store.get_egress(private_id)
            assert transport.transmit_pending(store) == 1
            assert not any(value in private_audit["payload_json"] for value in canaries)
            assert "password" in json.loads(private_audit["fields_redacted"])
            assert "raw_log" in json.loads(private_audit["fields_redacted"])
            outbound_source = json.loads(private_audit["payload_json"])["metrics"][0]["source"]
            assert outbound_source != canaries[3] and len(outbound_source) == 24
            with sqlite3.connect(store.path) as local_conn:
                raw_json = local_conn.execute(
                    "SELECT raw_json FROM events WHERE event_id = ?",
                    (private_batch.json()["event_ids"][0],),
                ).fetchone()[0]
            assert all(value in raw_json for value in canaries)

            headers = {"X-Tenant-ID": "tenant-alpha"}
            telemetry = httpx.get(base_url + "/api/v1/telemetry", headers=headers, timeout=2).json()
            assert telemetry["total"] == 11
            timestamps = [
                datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
                for row in telemetry["records"]
            ]
            assert all(value.utcoffset() == timedelta(0) for value in timestamps)
            assert all(left >= right for left, right in zip(timestamps, timestamps[1:]))

            incidents = httpx.get(base_url + "/api/v1/incidents", headers=headers, timeout=2).json()
            issue = next(item for item in incidents if "cpu_usage" in item["related_metrics"])
            assert {"memory_usage", "network_latency"}.issubset(issue["related_metrics"])
            assert issue["contributing_metrics"] and issue["root_cause_hypotheses"]
            recs = httpx.get(base_url + "/api/v1/recommendations", headers=headers, timeout=2).json()
            recommendation = next(item for item in recs if item["incident_id"] == issue["incident_id"])
            assert "Observed value:" in recommendation["explanation"]
            assert "Detection reason:" in recommendation["explanation"]
            overview = httpx.get(
                base_url + "/api/v1/dashboard/overview", headers=headers, timeout=2
            ).json()
            assert overview["active_incidents"] == 1 and overview["recent_anomalies"] >= 1
            assert httpx.get(
                base_url + "/api/v1/incidents", headers={"X-Tenant-ID": "tenant-beta"}, timeout=2
            ).json() == []

            first_recovery = collector_client.post("/collector/demo?scenario=recovery")
            assert first_recovery.status_code == 200
            assert transport.transmit_pending(store) == 1
            time.sleep(0.2)
            second_recovery = collector_client.post("/collector/demo?scenario=recovery")
            assert second_recovery.status_code == 200
            assert transport.transmit_pending(store) == 1
            recovered = httpx.get(base_url + "/api/v1/incidents", headers=headers, timeout=2).json()
            issue = next(item for item in recovered if item["incident_id"] == issue["incident_id"])
            assert issue["status"] == "RESOLVED"
            assert issue["lifecycle_stage"] == "RESOLVED"
            final_overview = httpx.get(
                base_url + "/api/v1/dashboard/overview", headers=headers, timeout=2
            ).json()
            assert final_overview["active_incidents"] == 0

            # SaaS outage leaves the batch on the collector; restarting SaaS lets
            # the unchanged queued body be retried and persisted.
            stop_saas()
            outage = collector_client.post("/collector/demo?scenario=normal")
            assert outage.status_code == 200
            outage_batch_id = outage.json()["batch_id"]
            assert transport.transmit_pending(store) == 0
            assert store.get_egress(outage_batch_id)["status"] == "failed"
            start_saas()
            assert transport.transmit_pending(store) == 1
            assert store.get_egress(outage_batch_id)["status"] == "sent"
            after_retry = httpx.get(base_url + "/api/v1/telemetry", headers=headers, timeout=2).json()
            assert any(row["batch_id"] == outage_batch_id for row in after_retry["records"])
    finally:
        stop_saas()
        listener.close()
