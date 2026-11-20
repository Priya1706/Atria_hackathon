from typing import List, Optional
from pydantic import BaseModel
from backend.app.schemas.anomaly import AnomalyResponse
from backend.app.schemas.incident import IncidentResponse


class DashboardOverviewResponse(BaseModel):
    tenant_id: str
    tenant_name: str
    total_monitored_sources: int
    healthy_sources: int
    unhealthy_sources: int
    active_incidents: int
    recent_anomalies: int
    overall_health_status: str
    overall_health_score: float
    summary: str


class TelemetryRecordItem(BaseModel):
    metric_id: str
    batch_id: str
    tenant_id: str
    collector_id: str
    source: str
    metric_name: str
    value: float
    unit: str
    timestamp: str


class TelemetryListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    records: List[TelemetryRecordItem]
