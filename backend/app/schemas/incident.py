from typing import List
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
