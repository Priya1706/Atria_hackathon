"""Validated wire models for local telemetry and SaaS batches."""
from datetime import datetime, timezone
import math
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, field_validator

METRICS = {
    "cpu_utilization", "memory_utilization", "disk_utilization", "bandwidth_utilization_percent", "network_latency_ms",
    "packet_loss_percent", "service_availability", "connectivity",
    "network_bytes_sent_per_second", "network_bytes_received_per_second",
    "failed_auth_attempts", "security_event_summary",
}


class TelemetryInput(BaseModel):
    """Local input accepts extras intentionally; extras never cross export allow-list."""
    model_config = ConfigDict(extra="allow")
    tenant_id: str = Field(min_length=1, max_length=128)
    collector_id: str = Field(min_length=1, max_length=128)
    timestamp_utc: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source_timezone: str = Field(default="UTC", min_length=1, max_length=64)
    metric_name: str
    metric_value: float | bool
    source_identifier: str = Field(min_length=1, max_length=256)
    category: str = Field(default="infrastructure", max_length=64)
    severity: str = Field(default="info", max_length=32)
    password: str | None = None
    api_key: str | None = None
    raw_log: str | None = None
    sensitive_payload: Any = None

    @field_validator("timestamp_utc")
    @classmethod
    def normalize_timestamp(cls, value: datetime) -> datetime:
        # Preserve the source timestamp for local audit; the pipeline converts it
        # to UTC before analysis and export.
        return value

    @field_validator("metric_name")
    @classmethod
    def known_metric(cls, value: str) -> str:
        if value not in METRICS:
            raise ValueError("unsupported metric_name")
        return value

    @field_validator("metric_value")
    @classmethod
    def valid_value(cls, value: float | bool) -> float | bool:
        if isinstance(value, bool):
            return value
        if not math.isfinite(value):
            raise ValueError("metric_value must be finite")
        return value

    @field_validator("metric_value")
    @classmethod
    def metric_range(cls, value: float | bool, info):
        if isinstance(value, bool):
            return value
        metric = info.data.get("metric_name")
        if metric in {"cpu_utilization", "memory_utilization", "disk_utilization", "bandwidth_utilization_percent", "packet_loss_percent"} and not 0 <= value <= 100:
            raise ValueError(f"{metric} must be between 0 and 100 percent")
        if metric == "service_availability" and not 0 <= value <= 1:
            raise ValueError("service_availability must be between 0 and 1")
        if metric in {"network_latency_ms", "network_bytes_sent_per_second", "network_bytes_received_per_second", "failed_auth_attempts", "security_event_summary"} and value < 0:
            raise ValueError(f"{metric} must be non-negative")
        if metric == "connectivity" and value not in (0, 1):
            raise ValueError("connectivity must be 0 or 1")
        return value


class CollectRequest(BaseModel):
    events: list[TelemetryInput] = Field(min_length=1, max_length=1000)


class CollectResponse(BaseModel):
    accepted: int
    event_ids: list[str]
    batch_id: str
    anomalies: list[dict[str, Any]]
    health: dict[str, Any]


class TransmitResponse(BaseModel):
    attempted: int
    delivered: int
    pending: int
