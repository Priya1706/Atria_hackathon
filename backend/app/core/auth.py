import sqlite3
from typing import Optional
from dataclasses import dataclass
from fastapi import Header, HTTPException, Depends
from backend.app.db.connection import get_db_connection
from backend.app.db.repository import TelemetryRepository


@dataclass
class CollectorAuthContext:
    collector_id: str
    tenant_id: str
    collector_name: str
    tenant_name: str


@dataclass
class TenantAuthContext:
    tenant_id: str
    tenant_name: str


def get_db():
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()


def get_authenticated_collector(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    conn: sqlite3.Connection = Depends(get_db),
) -> CollectorAuthContext:
    """
    Validates X-API-Key against the database for Tier-1 telemetry ingestion.
    Derives authorized collector_id and tenant_id securely.
    Rejects missing or invalid keys with HTTP 401.
    """
    if not x_api_key or not x_api_key.strip():
        raise HTTPException(status_code=401, detail="Missing or invalid API key")

    repo = TelemetryRepository(conn)
    row = repo.get_collector_by_api_key(x_api_key.strip())

    if not row or not row["is_active"]:
        raise HTTPException(status_code=401, detail="Missing or invalid API key")

    return CollectorAuthContext(
        collector_id=row["collector_id"],
        tenant_id=row["tenant_id"],
        collector_name=row["name"],
        tenant_name=row["tenant_name"],
    )


def get_authenticated_tenant(
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-ID"),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    conn: sqlite3.Connection = Depends(get_db),
) -> TenantAuthContext:
    """
    Validates tenant context for Dashboard & Frontend APIs.
    Accepts either:
    1. X-Tenant-ID header verified against registered tenants.
    2. X-API-Key header resolved to authorized tenant.
    Guarantees that unauthenticated or non-existent tenants are rejected with HTTP 401.
    """
    repo = TelemetryRepository(conn)

    # 1. Try resolving via X-Tenant-ID
    if x_tenant_id and x_tenant_id.strip():
        tenant_row = repo.get_tenant_by_id(x_tenant_id.strip())
        if not tenant_row:
            raise HTTPException(status_code=401, detail="Invalid or unknown tenant identifier")
        return TenantAuthContext(tenant_id=tenant_row["id"], tenant_name=tenant_row["name"])

    # 2. Fall back to resolving via X-API-Key
    if x_api_key and x_api_key.strip():
        collector_row = repo.get_collector_by_api_key(x_api_key.strip())
        if collector_row and collector_row["is_active"]:
            return TenantAuthContext(
                tenant_id=collector_row["tenant_id"],
                tenant_name=collector_row["tenant_name"],
            )
        raise HTTPException(status_code=401, detail="Missing or invalid API key")

    raise HTTPException(
        status_code=401,
        detail="Missing tenant authentication header. Provide 'X-Tenant-ID' or 'X-API-Key'.",
    )
