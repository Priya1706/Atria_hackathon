import sqlite3
from typing import List
from fastapi import APIRouter, Depends, Query
from backend.app.core.auth import TenantAuthContext, get_authenticated_tenant, get_db
from backend.app.db.repository import TelemetryRepository
from backend.app.schemas.recommendation import RecommendationResponse

router = APIRouter(prefix="/api/v1/recommendations", tags=["Explainable Recommendations"])


@router.get("", response_model=List[RecommendationResponse])
def get_tenant_recommendations(
    limit: int = Query(50, ge=1, le=200, description="Page limit"),
    tenant: TenantAuthContext = Depends(get_authenticated_tenant),
    conn: sqlite3.Connection = Depends(get_db),
):
    """
    Returns explainable recommendations for the authenticated tenant.
    Each recommendation answers:
    1. What happened?
    2. Which metric caused concern?
    3. What value was observed?
    4. Why is it a problem?
    5. What should the operator do next?
    """
    repo = TelemetryRepository(conn)
    rows = repo.get_tenant_recommendations(tenant_id=tenant.tenant_id, limit=limit)
    return [
        RecommendationResponse(
            recommendation_id=r["recommendation_id"],
            tenant_id=r["tenant_id"],
            incident_id=r["incident_id"],
            title=r["title"],
            explanation=r["explanation"],
            suggested_action=r["suggested_action"],
            severity=r["severity"],
            created_at=r["created_at"],
        )
        for r in rows
    ]
