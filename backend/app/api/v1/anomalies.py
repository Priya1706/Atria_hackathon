import sqlite3
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from backend.app.core.auth import TenantAuthContext, get_authenticated_tenant, get_db
from backend.app.db.repository import TelemetryRepository
from backend.app.schemas.anomaly import AnomalyResponse

router = APIRouter(prefix="/api/v1/anomalies", tags=["Anomalies"])


@router.get("", response_model=List[AnomalyResponse])
def get_tenant_anomalies(
    source: Optional[str] = Query(None, description="Filter anomalies by source"),
    limit: int = Query(50, ge=1, le=200, description="Page limit"),
    tenant: TenantAuthContext = Depends(get_authenticated_tenant),
    conn: sqlite3.Connection = Depends(get_db),
):
    """
    Returns detected anomalies for the authenticated tenant:
    - Metric name, observed value, baseline value
    - Severity (WARNING or CRITICAL)
    - Explainable detection reason
    """
    repo = TelemetryRepository(conn)
    rows = repo.get_tenant_anomalies(tenant_id=tenant.tenant_id, source=source, limit=limit)
    return [
        AnomalyResponse(
            anomaly_id=r["anomaly_id"],
            tenant_id=r["tenant_id"],
            source=r["source"],
            metric_name=r["metric_name"],
            observed_value=r["observed_value"],
            baseline_value=r["baseline_value"],
            severity=r["severity"],
            explanation=r["explanation"],
            detected_at=r["detected_at"],
        )
        for r in rows
    ]
