import sqlite3
from typing import Optional
from fastapi import APIRouter, Depends, Query
from backend.app.core.auth import TenantAuthContext, get_authenticated_tenant, get_db
from backend.app.core.health_engine import calculate_source_health, calculate_tenant_health_summary
from backend.app.db.repository import TelemetryRepository
from backend.app.schemas.health import SourceHealthResponse, TenantHealthSummaryResponse

router = APIRouter(prefix="/api/v1/health", tags=["Health Evaluation"])


@router.get("", response_model=TenantHealthSummaryResponse)
def get_tenant_health(
    source: Optional[str] = Query(None, description="Filter health by specific source name"),
    tenant: TenantAuthContext = Depends(get_authenticated_tenant),
    conn: sqlite3.Connection = Depends(get_db),
):
    """
    Returns central health evaluations for the authenticated tenant.
    Evaluates health centrally per source using deterministic rules, contributing metrics,
    and stale/missing telemetry detection.
    """
    repo = TelemetryRepository(conn)

    if source:
        single_source = calculate_source_health(tenant.tenant_id, source, repo)
        return TenantHealthSummaryResponse(
            tenant_id=tenant.tenant_id,
            overall_health_status=single_source["health_status"],
            overall_health_score=single_source["health_score"],
            sources=[SourceHealthResponse(**single_source)],
        )

    summary = calculate_tenant_health_summary(tenant.tenant_id, repo)
    return TenantHealthSummaryResponse(
        tenant_id=tenant.tenant_id,
        overall_health_status=summary["overall_health_status"],
        overall_health_score=summary["overall_health_score"],
        sources=[SourceHealthResponse(**s) for s in summary.get("sources", [])],
    )
