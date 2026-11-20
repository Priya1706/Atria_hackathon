from typing import Optional
from pydantic import BaseModel


class RecommendationResponse(BaseModel):
    recommendation_id: str
    tenant_id: str
    incident_id: Optional[str] = None
    title: str
    explanation: str
    suggested_action: str
    severity: str
    created_at: str
