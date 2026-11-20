import sqlite3

import pytest

import backend.dev_provision as provisioner
import backend.app.db.connection as db_connection
from backend.app.db.repository import TelemetryRepository


def test_dev_provision_creates_tenant_collector_and_random_key(tmp_path, monkeypatch):
    db_path = str(tmp_path / "new-backend.db")
    monkeypatch.setattr(provisioner, "APP_ENV", "development")
    monkeypatch.setattr(db_connection, "DATABASE_PATH", db_path)
    tenant_id, collector_id, api_key = provisioner.provision("Test Tenant", "Test Collector")
    assert tenant_id.startswith("tenant-") and collector_id.startswith("collector-")
    assert len(api_key) >= 40
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        record = TelemetryRepository(conn).get_collector_by_api_key(api_key)
        assert record["tenant_id"] == tenant_id and record["collector_id"] == collector_id
        assert record["is_active"] == 1
    finally:
        conn.close()


def test_dev_provision_refuses_production(monkeypatch):
    monkeypatch.setattr(provisioner, "APP_ENV", "production")
    with pytest.raises(RuntimeError, match="disabled"):
        provisioner.provision("No tenant", "No collector")
