from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class IncidentStatusUpdate(BaseModel):
    status: str = Field(..., description="Allowed statuses: OPEN, ACKNOWLEDGED, RESOLVED")


class IncidentResponse(BaseModel):
    incident_id: str
    tenant_id: str
    affected_source: str
    severity: str
    title: str
    description: str
    status: str
    first_detected_at: str
    last_updated_at: str
    related_metrics: List[str]
    contextual_summary: Optional[str] = None
    contributing_metrics: List[Dict[str, Any]] = Field(default_factory=list)
    root_cause_hypotheses: List[Dict[str, Any]] = Field(default_factory=list)
    lifecycle_stage: str = "DETECTED"
    recovery_since: Optional[str] = None
    lifecycle_events: List[Dict[str, Any]] = Field(default_factory=list)
