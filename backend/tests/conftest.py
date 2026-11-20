import sqlite3
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.auth import get_db
from backend.app.db.schema import init_db


@pytest.fixture
def test_db_conn():
    """
    Creates an isolated in-memory SQLite database pre-seeded with
    two tenants and their respective authorized collectors.
    """
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    init_db(conn)

    now = datetime.now(timezone.utc).isoformat()

    # Seed Tenants
    conn.execute(
        "INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)",
        ("tenant-alpha", "Alpha Enterprises", now),
    )
    conn.execute(
        "INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)",
        ("tenant-beta", "Beta Systems", now),
    )

    # Seed Collectors
    conn.execute(
        """
        INSERT INTO collectors (id, tenant_id, name, api_key, is_active, last_heartbeat)
        VALUES (?, ?, ?, ?, 1, NULL)
        """,
        ("collector-001", "tenant-alpha", "Alpha Gateway Node", "key-alpha-valid-1234"),
    )
    conn.execute(
        """
        INSERT INTO collectors (id, tenant_id, name, api_key, is_active, last_heartbeat)
        VALUES (?, ?, ?, ?, 1, NULL)
        """,
        ("collector-002", "tenant-beta", "Beta Worker Node", "key-beta-valid-5678"),
    )

    conn.commit()
    try:
        yield conn
    finally:
        conn.close()


@pytest.fixture
def client(test_db_conn):
    """
    TestClient that overrides the get_db dependency with the isolated test database.
    """
    def override_get_db():
        yield test_db_conn

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
