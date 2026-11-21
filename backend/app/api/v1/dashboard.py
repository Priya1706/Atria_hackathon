import sqlite3
from fastapi import APIRouter, Depends
from backend.app.core.auth import TenantAuthContext, get_authenticated_tenant, get_db
from backend.app.core.health_engine import calculate_tenant_health_summary
from backend.app.db.repository import TelemetryRepository
from backend.app.schemas.dashboard import DashboardOverviewResponse

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])


@router.get("/overview", response_model=DashboardOverviewResponse)
def get_dashboard_overview(
    tenant: TenantAuthContext = Depends(get_authenticated_tenant),
    conn: sqlite3.Connection = Depends(get_db),
):
    """
    Returns an aggregated observability overview for the authenticated tenant:
    - Total monitored sources
    - Healthy vs. unhealthy sources
    - Active incidents count
    - Recent anomalies count
    - Overall health status and score
    """
    repo = TelemetryRepository(conn)
    health_summary = calculate_tenant_health_summary(tenant.tenant_id, repo)

    sources = health_summary.get("sources", [])
    total_sources = len(sources)
    healthy_sources = sum(1 for s in sources if s["health_status"] in ("Excellent", "Good"))
    unhealthy_sources = sum(1 for s in sources if s["health_status"] in ("Fair", "Poor"))

    active_incidents = len(repo.get_tenant_incidents(tenant.tenant_id, status="OPEN"))
    recent_anomalies = len(repo.get_tenant_anomalies(tenant.tenant_id, limit=20))

    summary = (
        f"Tenant '{tenant.tenant_name}' has {total_sources} monitored source(s). "
        f"{healthy_sources} healthy, {unhealthy_sources} unhealthy. "
        f"{active_incidents} active incident(s) currently open."
    )

    return DashboardOverviewResponse(
        tenant_id=tenant.tenant_id,
        tenant_name=tenant.tenant_name,
        total_monitored_sources=total_sources,
        healthy_sources=healthy_sources,
        unhealthy_sources=unhealthy_sources,
        active_incidents=active_incidents,
        recent_anomalies=recent_anomalies,
        overall_health_status=health_summary["overall_health_status"],
        overall_health_score=health_summary["overall_health_score"],
        summary=summary,
    )
