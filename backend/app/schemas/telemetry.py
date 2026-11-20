from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


def _check_sensitive_keys(data: Any) -> Optional[str]:
    """Recursively inspects dicts and lists for sensitive or unauthorized keys."""
    forbidden = {
        "password",
        "secret",
        "token",
        "credential",
        "authorization",
        "api_key",
        "private_key",
        "tenant_id",
        "health_status",
    }
    if isinstance(data, dict):
        for k, v in data.items():
            if str(k).lower() in forbidden:
                return str(k)
            found = _check_sensitive_keys(v)
            if found:
                return found
    elif isinstance(data, list):
        for item in data:
            found = _check_sensitive_keys(item)
            if found:
                return found
    return None


class MetricItem(BaseModel):
    """
    Individual metric object within a telemetry batch.
    metric_id must be a valid, globally unique UUID.
    """
    model_config = ConfigDict(extra="forbid")

    metric_id: UUID = Field(..., description="Globally unique UUID for the metric record")
    source: str = Field(..., min_length=1, description="Originating host or service name")
    metric_name: str = Field(..., min_length=1, description="Metric identifier, e.g. cpu_usage")
    value: float = Field(..., description="Observed numeric metric value")
    unit: str = Field(..., min_length=1, description="Metric unit, e.g. percent, ms, bytes")
    timestamp: datetime = Field(..., description="UTC ISO8601 timestamp of measurement")


class TelemetryIngestRequest(BaseModel):
    """
    Contract-compliant telemetry batch ingestion request.
    Tenant identity must NOT be accepted in the payload (derived from server auth).
    Health status must NOT be accepted from client (calculated centrally).
    Sensitive metadata is strictly rejected recursively.
    """
    model_config = ConfigDict(extra="forbid")

    schema_version: Optional[str] = Field(default="1.0", description="Contract schema version")
    batch_id: UUID = Field(..., description="Idempotency key and unique batch UUID")
    collector_id: str = Field(..., min_length=1, description="Assigned collector identifier")
    timestamp: datetime = Field(..., description="UTC ISO8601 timestamp of batch creation")
    metrics: List[MetricItem] = Field(..., min_length=1, description="List of metric data points")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Metadata dictionary")

    @field_validator("metadata")
    @classmethod
    def reject_unauthorized_fields(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is not None:
            found_sensitive = _check_sensitive_keys(v)
            if found_sensitive:
                raise ValueError(f"Forbidden or sensitive field '{found_sensitive}' detected in metadata")
        return v


class IngestSuccessResponse(BaseModel):
    status: str = "success"
    batch_id: str
    records_received: int


class IngestDuplicateResponse(BaseModel):
    status: str = "duplicate"
    batch_id: str
    message: str = "Batch already processed"


class IngestErrorResponse(BaseModel):
    status: str = "error"
    message: str
