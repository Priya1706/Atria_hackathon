import sqlite3
from typing import Optional
from fastapi import APIRouter, Depends, Query
from backend.app.core.auth import TenantAuthContext, get_authenticated_tenant, get_db
from backend.app.db.repository import TelemetryRepository
from backend.app.schemas.dashboard import TelemetryListResponse, TelemetryRecordItem

router = APIRouter(prefix="/api/v1/telemetry", tags=["Telemetry Records"])


@router.get("", response_model=TelemetryListResponse)
def get_telemetry_records(
    metric_name: Optional[str] = Query(None, description="Filter by metric name, e.g. cpu_usage"),
    source: Optional[str] = Query(None, description="Filter by source, e.g. server-01"),
    from_time: Optional[str] = Query(None, description="Filter by ISO timestamp start"),
    to_time: Optional[str] = Query(None, description="Filter by ISO timestamp end"),
    limit: int = Query(50, ge=1, le=500, description="Page limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
    tenant: TenantAuthContext = Depends(get_authenticated_tenant),
    conn: sqlite3.Connection = Depends(get_db),
):
    """
    Returns tenant-isolated telemetry records supporting filtering and pagination.
    """
    repo = TelemetryRepository(conn)
    rows = repo.get_tenant_metrics(
        tenant_id=tenant.tenant_id,
        metric_name=metric_name,
        source=source,
        from_time=from_time,
        to_time=to_time,
        limit=limit,
        offset=offset,
    )
    total = repo.count_tenant_metrics(
        tenant_id=tenant.tenant_id,
        metric_name=metric_name,
        source=source,
        from_time=from_time,
        to_time=to_time,
    )

    records = [
        TelemetryRecordItem(
            metric_id=r["metric_id"],
            batch_id=r["batch_id"],
            tenant_id=r["tenant_id"],
            collector_id=r["collector_id"],
            source=r["source"],
            metric_name=r["metric_name"],
            value=r["value"],
            unit=r["unit"],
            timestamp=r["timestamp"],
        )
        for r in rows
    ]

    return TelemetryListResponse(
        total=total,
        limit=limit,
        offset=offset,
        records=records,
    )
