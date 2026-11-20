"""Create a development tenant/collector and print a fresh one-time API key.

Run from the repository root: python -m backend.dev_provision
This is intentionally a CLI-only, development/test tool, not a public API route.
"""
import argparse
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone

from backend.app.config import APP_ENV
from backend.app.db.connection import get_db_connection
from backend.app.db.schema import init_db


def provision(tenant_name: str, collector_name: str, tenant_id: str | None = None, collector_id: str | None = None):
    if APP_ENV.lower() not in {"development", "dev", "test"}:
        raise RuntimeError("Provisioning is disabled unless APP_ENV is development, dev, or test")
    tenant_id = tenant_id or f"tenant-{uuid.uuid4().hex[:12]}"
    collector_id = collector_id or f"collector-{uuid.uuid4().hex[:12]}"
    api_key = secrets.token_urlsafe(32)
    conn = get_db_connection()
    try:
        init_db(conn)
        now = datetime.now(timezone.utc).isoformat()
        with conn:
            conn.execute("INSERT INTO tenants(id,name,created_at) VALUES(?,?,?)", (tenant_id, tenant_name, now))
            conn.execute("INSERT INTO collectors(id,tenant_id,name,api_key,is_active,last_heartbeat) VALUES(?,?,?,?,1,NULL)", (collector_id, tenant_id, collector_name, api_key))
    except sqlite3.IntegrityError as exc:
        raise RuntimeError("Tenant or collector ID already exists; choose different IDs") from exc
    finally:
        conn.close()
    return tenant_id, collector_id, api_key


def main():
    parser = argparse.ArgumentParser(description="Provision local CICADA development credentials")
    parser.add_argument("--tenant-name", default="CICADA Local Demo")
    parser.add_argument("--collector-name", default="Local Collector")
    parser.add_argument("--tenant-id")
    parser.add_argument("--collector-id")
    args = parser.parse_args()
    tenant_id, collector_id, api_key = provision(args.tenant_name, args.collector_name, args.tenant_id, args.collector_id)
    print(f"Tenant ID: {tenant_id}")
    print(f"Collector ID: {collector_id}")
    print(f"API key (shown once): {api_key}")
    print("Store the key in the ignored .env as SAAS_API_KEY; do not commit or share it.")


if __name__ == "__main__":
    main()
