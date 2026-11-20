from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from fastapi import HTTPException

from backend.app.core.anomaly_detection import process_batch_anomalies
from backend.app.core.auth import CollectorAuthContext
from backend.app.core.health_engine import calculate_source_health
from backend.app.core.incident_correlation import correlate_anomalies_to_incidents
from backend.app.core.recommendation_engine import generate_recommendations_for_incident
from backend.app.db.repository import TelemetryRepository
from backend.app.schemas.telemetry import TelemetryIngestRequest


@dataclass
class IngestionResult:
    is_duplicate: bool
    batch_id: str
    records_received: int
    is_metric_duplicate: bool = False
    duplicate_metric_id: Optional[str] = None
    anomalies_detected: int = 0
    incidents_updated: int = 0
    recommendations_generated: int = 0


def process_telemetry_batch(
    payload: TelemetryIngestRequest,
    auth: CollectorAuthContext,
    repo: TelemetryRepository,
) -> IngestionResult:
    """
    End-to-end telemetry ingestion pipeline:
    1. Enforces collector identity match (payload.collector_id == auth.collector_id).
    2. Performs batch deduplication via batch_id (idempotency key).
    3. Enforces global uniqueness of metric_id across all telemetry records.
    4. Persists the batch and metric records under the authenticated tenant_id.
    5. Runs anomaly detection across ingested metrics.
    6. Correlates anomalies into incidents.
    7. Generates explainable recommendations.
    8. Updates central health state evaluation for affected sources.
    """
    batch_id_str = str(payload.batch_id)

    # 1. Collector identity mismatch check
    if payload.collector_id != auth.collector_id:
        raise HTTPException(status_code=403, detail="Collector identity mismatch")

    # 2. Batch deduplication check (Idempotency)
    if repo.batch_exists(batch_id_str):
        return IngestionResult(
            is_duplicate=True,
            batch_id=batch_id_str,
            records_received=0,
        )

    # 3. Global metric_id uniqueness check
    for m in payload.metrics:
        m_id_str = str(m.metric_id)
        if repo.metric_id_exists(m_id_str):
            return IngestionResult(
                is_duplicate=False,
                is_metric_duplicate=True,
                duplicate_metric_id=m_id_str,
                batch_id=batch_id_str,
                records_received=0,
            )

    # 4. Serialize and persist valid telemetry records
    metrics_data = [
        {
            "metric_id": str(m.metric_id),
            "source": m.source,
            "metric_name": m.metric_name,
            "value": m.value,
            "unit": m.unit,
            "timestamp": m.timestamp.isoformat(),
        }
        for m in payload.metrics
    ]

    repo.save_batch(
        batch_id=batch_id_str,
        tenant_id=auth.tenant_id,
        collector_id=auth.collector_id,
        timestamp=payload.timestamp.isoformat(),
        schema_version=payload.schema_version or "1.0",
        metadata=payload.metadata,
        metrics=metrics_data,
    )

    # 5. Anomaly detection
    anomalies = process_batch_anomalies(
        tenant_id=auth.tenant_id,
        metrics=metrics_data,
        repo=repo,
    )

    # 6. Incident correlation
    incidents = correlate_anomalies_to_incidents(
        tenant_id=auth.tenant_id,
        anomalies=anomalies,
        repo=repo,
    )

    # 7. Recommendation generation
    total_recs = 0
    for inc in incidents:
        recs = generate_recommendations_for_incident(
            tenant_id=auth.tenant_id,
            incident=inc,
            anomalies=anomalies,
            repo=repo,
        )
        total_recs += len(recs)

    # 8. Central health evaluation update for affected sources
    affected_sources = {m["source"] for m in metrics_data}
    for src in affected_sources:
        calculate_source_health(
            tenant_id=auth.tenant_id,
            source=src,
            repo=repo,
        )

    return IngestionResult(
        is_duplicate=False,
        batch_id=batch_id_str,
        records_received=len(payload.metrics),
        anomalies_detected=len(anomalies),
        incidents_updated=len(incidents),
        recommendations_generated=total_recs,
    )
