import json
import sqlite3
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from backend.app.core.auth import TenantAuthContext, get_authenticated_tenant, get_db
from backend.app.core.incident_analysis import analyze_incident
from backend.app.db.repository import TelemetryRepository
from backend.app.schemas.incident import IncidentResponse, IncidentStatusUpdate

router = APIRouter(prefix="/api/v1/incidents", tags=["Incidents"])


@router.get("", response_model=List[IncidentResponse])
def get_tenant_incidents(
    status: Optional[str] = Query(None, description="Filter by status: OPEN, ACKNOWLEDGED, RESOLVED"),
    limit: int = Query(50, ge=1, le=200, description="Page limit"),
    tenant: TenantAuthContext = Depends(get_authenticated_tenant),
    conn: sqlite3.Connection = Depends(get_db),
):
    """
    Returns correlated incidents for the authenticated tenant.
    Incidents group related multi-signal anomalies and present possible causes as hypotheses.
    """
    repo = TelemetryRepository(conn)
    rows = repo.get_tenant_incidents(tenant_id=tenant.tenant_id, status=status, limit=limit)
    incidents = []
    for r in rows:
        related_metrics = json.loads(r["related_metrics_json"]) if r["related_metrics_json"] else []
        incident_data = {
            "incident_id": r["incident_id"],
            "tenant_id": r["tenant_id"],
            "affected_source": r["affected_source"],
            "severity": r["severity"],
            "title": r["title"],
            "description": r["description"],
            "status": r["status"],
            "first_detected_at": r["first_detected_at"],
            "last_updated_at": r["last_updated_at"],
            "related_metrics": related_metrics,
            "lifecycle_stage": r["lifecycle_stage"],
            "recovery_since": r["recovery_since"],
            "lifecycle_events": [dict(event) for event in repo.get_incident_lifecycle_events(tenant.tenant_id, r["incident_id"])],
        }
        analysis = analyze_incident(tenant.tenant_id, incident_data, repo)
        incidents.append(IncidentResponse(**incident_data, **analysis))
    return incidents


@router.patch("/{incident_id}", response_model=IncidentResponse)
def update_incident_status(
    incident_id: str,
    update: IncidentStatusUpdate,
    tenant: TenantAuthContext = Depends(get_authenticated_tenant),
    conn: sqlite3.Connection = Depends(get_db),
):
    """
    Updates the lifecycle status of an incident:
    Supported transitions: OPEN -> ACKNOWLEDGED -> RESOLVED (or reopening).
    Strictly tenant-isolated.
    """
    repo = TelemetryRepository(conn)
    existing = repo.get_incident_by_id(incident_id, tenant.tenant_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Incident not found for this tenant")

    new_status = update.status.upper().strip()
    if new_status not in ("OPEN", "ACKNOWLEDGED", "RESOLVED"):
        raise HTTPException(
            status_code=400,
            detail="Invalid status. Allowed values: OPEN, ACKNOWLEDGED, RESOLVED",
        )

    if new_status == "RESOLVED" and existing["lifecycle_stage"] != "RESOLVED":
        raise HTTPException(
            status_code=409,
            detail="Incident cannot be resolved until all contributing metrics pass the configured recovery window.",
        )
    if not repo.set_incident_status(incident_id, tenant.tenant_id, new_status):
        raise HTTPException(status_code=409, detail="Incident lifecycle transition was not accepted")
    updated = repo.get_incident_by_id(incident_id, tenant.tenant_id)

    incident_data = {
        "incident_id": updated["incident_id"],
        "tenant_id": updated["tenant_id"],
        "affected_source": updated["affected_source"],
        "severity": updated["severity"],
        "title": updated["title"],
        "description": updated["description"],
        "status": updated["status"],
        "first_detected_at": updated["first_detected_at"],
        "last_updated_at": updated["last_updated_at"],
        "related_metrics": json.loads(updated["related_metrics_json"]) if updated["related_metrics_json"] else [],
        "lifecycle_stage": updated["lifecycle_stage"],
        "recovery_since": updated["recovery_since"],
        "lifecycle_events": [dict(event) for event in repo.get_incident_lifecycle_events(tenant.tenant_id, incident_id)],
    }
    analysis = analyze_incident(tenant.tenant_id, incident_data, repo)
    return IncidentResponse(**incident_data, **analysis)
