from typing import List, Optional
from pydantic import BaseModel, Field


class ContributingMetric(BaseModel):
    metric_name: str
    observed_value: float
    unit: str
    status: str
    threshold: Optional[float] = None


class SourceHealthResponse(BaseModel):
    source: str
    health_status: str = Field(..., description="Excellent, Good, Fair, or Poor")
    health_score: float = Field(..., ge=0.0, le=100.0, description="Deterministic 0-100 score")
    contributing_metrics: List[ContributingMetric]
    explanation: str
    evaluated_at: str


class TenantHealthSummaryResponse(BaseModel):
    tenant_id: str
    overall_health_status: str
    overall_health_score: float
    sources: List[SourceHealthResponse]
