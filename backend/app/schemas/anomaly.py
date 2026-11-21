from typing import Optional
from pydantic import BaseModel


class AnomalyResponse(BaseModel):
    anomaly_id: str
    tenant_id: str
    source: str
    metric_name: str
    observed_value: float
    baseline_value: Optional[float] = None
    severity: str
    explanation: str
    detected_at: str
