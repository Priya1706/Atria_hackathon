"""Lifecycle, privacy, persistence, API and retry tests for the local collector."""
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from collector import app as app_module
from collector.models import TelemetryInput
from collector.pipeline import Pipeline, REQUIRED_HEALTH_METRICS
from collector.saas_contract import APPROVED_METRIC_FIELDS
from collector.store import Store
import collector.pipeline as pipeline_module
import collector.transport as transport


def sample(**updates):
    data = dict(tenant_id="demo-tenant", collector_id="collector-001", timestamp_utc=datetime.now(timezone.utc), source_timezone="Asia/Calcutta", metric_name="cpu_utilization", metric_value=42.0, source_identifier="host-secret-name", password="dont-export", api_key="key-123", raw_log="private log text", sensitive_payload={"ssn": "123"}, unknown="nope")
    data.update(updates)
    return TelemetryInput(**data)


def pipeline_settings(monkeypatch, **updates):
    values = dict(tenant_id="demo-tenant", collector_id="collector-001", saas_url="", pseudonym_salt="local-only-change-me", stale_after_seconds=300, health_good_threshold=60, health_fair_threshold=75, health_poor_threshold=90)
    values.update(updates)
    monkeypatch.setattr(pipeline_module, "settings", SimpleNamespace(**values))


def health_events(cpu, timestamp=None):
    timestamp = timestamp or datetime.now(timezone.utc)
    values = {"cpu_utilization": cpu, "memory_utilization": 20, "disk_utilization": 25, "network_latency_ms": 20, "packet_loss_percent": 0, "service_availability": 1, "connectivity": 1, "failed_auth_attempts": 0, "security_event_summary": 0}
    return [sample(metric_name=name, metric_value=value, timestamp_utc=timestamp, password=None, api_key=None, raw_log=None, sensitive_payload=None, unknown=None) for name, value in values.items()]


def test_valid_collect_batches_records_and_persists_locally(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch)
    store = Store(str(tmp_path / "local.db"))
    ids, anomalies, health, batch_id = Pipeline(store).accept([sample(), sample(metric_name="memory_utilization", metric_value=51)])
    assert len(ids) == 2 and len(set(ids)) == 2 and batch_id
    assert store.get_egress(batch_id)["event_ids"] == json.dumps(ids)
    reopened = Store(str(tmp_path / "local.db"))
    assert len(reopened.rows("events")) == 2
    assert reopened.counts()["pending"] == 1
    assert health["state"] == "Fair"  # required telemetry set is incomplete


def test_validation_rejects_bad_metrics_and_nonfinite_values():
    with pytest.raises(ValueError):
        sample(metric_name="not-a-metric")
    with pytest.raises(ValueError):
        sample(metric_value=float("nan"))
    # Missing timestamp gets a UTC default; naive input is treated as UTC by the pipeline.
    missing = TelemetryInput(tenant_id="demo-tenant", collector_id="collector-001", metric_name="cpu_utilization", metric_value=1, source_identifier="host")
    assert missing.timestamp_utc.tzinfo == timezone.utc
    naive = sample(timestamp_utc=datetime(2026, 11, 20, 12, 0))
    assert naive.timestamp_utc.tzinfo is None


def test_normalization_converts_offset_timestamp_to_utc(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch)
    event = sample(timestamp_utc="2026-11-20T17:30:00+05:30")
    Pipeline(Store(str(tmp_path / "utc.db"))).accept([event])
    normalized = json.loads(Store(str(tmp_path / "utc.db")).rows("events")[0]["raw_json"])
    # Original raw record is preserved verbatim as local audit data.
    assert normalized["timestamp_utc"].endswith("+05:30")
    body = json.loads(Store(str(tmp_path / "utc.db")).rows("egress")[0]["payload_json"])
    assert body["metrics"][0]["timestamp"] == "2026-11-20T12:00:00Z"


def test_allowlist_drops_sensitive_values_and_records_removed_fields(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch)
    store = Store(str(tmp_path / "privacy.db"))
    Pipeline(store).accept([sample()])
    row = store.rows("egress")[0]
    payload = row["payload_json"]
    for secret in ("dont-export", "key-123", "private log text", "123", "nope", "demo-tenant", "host-secret-name"):
        assert secret not in payload
    assert "tenant_id" in row["fields_removed"] and "password" in row["fields_removed"]
    assert "password" in row["fields_redacted"] and "raw_log" in row["fields_redacted"]
    metric = json.loads(payload)["metrics"][0]
    assert metric["value"] == 42 and set(metric) == set(APPROVED_METRIC_FIELDS)


def test_pseudonymous_source_identifier_is_stable_and_hmac(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch, pseudonym_salt="a-private-salt")
    store = Store(str(tmp_path / "pseudo.db"))
    Pipeline(store).accept([sample()])
    source = json.loads(store.rows("egress")[0]["payload_json"])["metrics"][0]["source"]
    expected = hmac.new(b"a-private-salt", b"host-secret-name", hashlib.sha256).hexdigest()[:24]
    assert source == expected


def test_persisted_baseline_detects_anomaly_after_restart(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch)
    path = str(tmp_path / "baseline.db")
    p = Pipeline(Store(path))
    base = datetime.now(timezone.utc)
    for i, value in enumerate((10, 10, 10)):
        p.accept([sample(timestamp_utc=base + timedelta(seconds=i), metric_value=value)])
    restarted = Pipeline(Store(path))
    restarted.accept([sample(timestamp_utc=base + timedelta(seconds=5), metric_value=50)])
    anomalies = restarted.store.rows("anomalies")
    assert anomalies and anomalies[0]["observed"] == 50 and "3 preceding" in anomalies[0]["explanation"]


def test_out_of_order_event_uses_timestamp_order_for_baseline(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch)
    p = Pipeline(Store(str(tmp_path / "order.db")))
    base = datetime.now(timezone.utc) - timedelta(minutes=1)
    for i in range(3):
        p.accept([sample(timestamp_utc=base + timedelta(seconds=i), metric_value=10)])
    p.accept([sample(timestamp_utc=base - timedelta(seconds=3), metric_value=100)])
    assert len(p.store.rows("anomalies")) == 0  # no earlier history exists at that measurement time


def test_four_health_states_transitions_and_stale_data(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch)
    p = Pipeline(Store(str(tmp_path / "health.db")))
    assert p.classify()["state"] == "Fair" and p.classify()["stale"]
    for cpu, state in ((20, "Excellent"), (65, "Good"), (80, "Fair"), (95, "Poor")):
        p.accept(health_events(cpu))
        assert p.classify()["state"] == state
    transitions = p.store.rows("health_transitions", 10)
    assert len(transitions) == 5 and all(t["reason"] and t["timestamp_utc"].endswith("+00:00") for t in transitions)
    stale = Pipeline(Store(str(tmp_path / "stale-health.db")))
    stale.accept(health_events(10, datetime.now(timezone.utc) - timedelta(hours=1)))
    assert stale.classify()["stale"] is True and stale.classify()["state"] == "Fair"


def test_missing_required_metrics_are_explicitly_unhealthy(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch)
    p = Pipeline(Store(str(tmp_path / "missing.db")))
    p.accept([sample()])
    health = p.classify()
    assert health["state"] == "Fair" and "missing recent metrics" in health["reason"]
    assert "connectivity" in health["reason"]


class FakeResponse:
    def __init__(self, status=200):
        self.status_code = status
        self.request = httpx.Request("POST", "https://saas.example/api/v1/ingest/telemetry")
    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("response failure", request=self.request, response=httpx.Response(self.status_code, request=self.request))


class FakeClient:
    def __init__(self, statuses):
        self.statuses = list(statuses)
        self.sent = []
    def post(self, url, **kwargs):
        self.sent.append((url, kwargs))
        status = self.statuses.pop(0)
        if isinstance(status, Exception):
            raise status
        return FakeResponse(status)


def transport_settings(monkeypatch, **updates):
    values = dict(saas_url="https://saas.example/api/v1/ingest/telemetry", saas_api_key="demo-key", retry_base_seconds=0, retry_max_seconds=1)
    values.update(updates)
    monkeypatch.setattr(transport, "settings", SimpleNamespace(**values))


def test_success_transmits_exact_hashed_audit_body_with_contract_headers(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch, saas_url="https://saas.example/api/v1/ingest/telemetry")
    store = Store(str(tmp_path / "success.db"))
    _, _, _, batch_id = Pipeline(store).accept([sample()])
    original = store.get_egress(batch_id)
    transport_settings(monkeypatch)
    client = FakeClient([201])
    assert transport.transmit_pending(store, client) == 1
    record = store.get_egress(batch_id)
    sent_body = client.sent[0][1]["content"]
    assert sent_body == record["payload_json"]
    assert hashlib.sha256(sent_body.encode()).hexdigest() == record["payload_hash"]
    headers = client.sent[0][1]["headers"]
    assert headers["X-API-Key"] == "demo-key" and headers["Idempotency-Key"] == batch_id
    body = json.loads(sent_body)
    assert body["batch_id"] == batch_id and "tenant_id" not in body
    assert record["status"] == "sent" and record["retry_attempts"] == 1 and record["last_attempt_at"]
    assert original["payload_json"] == sent_body


def test_failed_transmission_is_retained_with_safe_error_and_backoff(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch)
    store = Store(str(tmp_path / "failed.db"))
    _, _, _, batch_id = Pipeline(store).accept([sample()])
    transport_settings(monkeypatch, retry_base_seconds=30, retry_max_seconds=60)
    client = FakeClient([httpx.ConnectError("sensitive response text")])
    assert transport.transmit_pending(store, client) == 0
    row = store.get_egress(batch_id)
    assert row["status"] == "failed" and row["retry_attempts"] == 1 and row["last_attempt_at"]
    assert row["last_error"] == "ConnectError" and "sensitive" not in row["last_error"]
    assert store.pending() == [] and len(store.pending(due_only=False)) == 1


def test_retry_after_recovery_uses_same_batch_and_prevents_duplicate_queue(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch)
    store = Store(str(tmp_path / "recovery.db"))
    _, _, _, batch_id = Pipeline(store).accept([sample()])
    transport_settings(monkeypatch, retry_base_seconds=0)
    outage = FakeClient([503])
    assert transport.transmit_pending(store, outage) == 0
    store.update_egress(batch_id, "failed", "HTTPStatusError", backoff_seconds=0)
    recover = FakeClient([200])
    assert transport.transmit_pending(store, recover) == 1
    assert recover.sent[0][1]["headers"]["Idempotency-Key"] == batch_id
    assert store.get_egress(batch_id)["status"] == "sent"
    original = store.get_egress(batch_id)["payload_json"]
    store.enqueue(batch_id, [], {}, [], [], [], "unused", "collector-001")
    assert len(store.rows("egress")) == 1 and store.get_egress(batch_id)["payload_json"] == original
    assert transport.transmit_pending(store, FakeClient([200])) == 0


def test_pending_batches_recover_after_store_restart(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch)
    path = str(tmp_path / "restart.db")
    _, _, _, batch_id = Pipeline(Store(path)).accept([sample()])
    restarted = Store(path)
    assert restarted.get_egress(batch_id)["status"] == "pending"
    transport_settings(monkeypatch)
    client = FakeClient([200])
    assert transport.transmit_pending(restarted, client) == 1


def test_background_retry_worker_executes_while_api_is_running(tmp_path, monkeypatch):
    store = Store(str(tmp_path / "worker.db"))
    calls = []
    monkeypatch.setattr(app_module, "store", store)
    monkeypatch.setattr(app_module, "settings", SimpleNamespace(retry_interval_seconds=0.01))
    monkeypatch.setattr(app_module, "transmit_pending", lambda target: calls.append(target))
    with TestClient(app_module.app):
        time.sleep(0.04)
    assert calls and calls[0] is store


def test_api_error_handling_collect_status_and_egress_routes(tmp_path, monkeypatch):
    pipeline_settings(monkeypatch)
    monkeypatch.setattr(app_module, "settings", SimpleNamespace(tenant_id="demo-tenant", collector_id="collector-001", simulator_enabled=True, saas_url="", saas_api_key=""))
    monkeypatch.setattr(app_module, "store", Store(str(tmp_path / "api.db")))
    monkeypatch.setattr(app_module, "pipeline", Pipeline(app_module.store))
    client = TestClient(app_module.app)
    assert client.get("/health").status_code == 200
    assert client.post("/collector/collect", json={"events": []}).status_code == 422
    payload = sample().model_dump(mode="json")
    ok = client.post("/collector/collect", json={"events": [payload]})
    assert ok.status_code == 200 and ok.json()["accepted"] == 1
    batch_id = ok.json()["batch_id"]
    detail = client.get(f"/collector/egress/{batch_id}")
    assert detail.status_code == 200 and detail.json()["batch_id"] == batch_id
    assert isinstance(detail.json()["fields_removed"], list)
    assert client.get("/collector/egress/unknown").status_code == 404
    payload["tenant_id"] = "other-tenant"
    assert client.post("/collector/collect", json={"events": [payload]}).status_code == 403
    payload["tenant_id"] = "demo-tenant"
    payload["metric_value"] = "do-not-echo-secret"
    invalid = client.post("/collector/collect", json={"events": [payload]})
    assert invalid.status_code == 422 and "do-not-echo-secret" not in invalid.text


def test_no_saas_configuration_keeps_queue_pending(tmp_path, monkeypatch):
    store = Store(str(tmp_path / "no-saas.db"))
    pipeline_settings(monkeypatch)
    _, _, _, batch_id = Pipeline(store).accept([sample()])
    transport_settings(monkeypatch, saas_url="", saas_api_key="")
    assert transport.transmit_pending(store, FakeClient([])) == 0
    assert store.get_egress(batch_id)["status"] == "pending"
