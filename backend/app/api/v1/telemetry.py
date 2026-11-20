import sqlite3
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from backend.app.core.auth import CollectorAuthContext, get_authenticated_collector, get_db
from backend.app.core.ingestion import process_telemetry_batch
from backend.app.db.repository import TelemetryRepository
from backend.app.schemas.telemetry import TelemetryIngestRequest

router = APIRouter(prefix="/api/v1/ingest", tags=["Telemetry Ingestion"])


@router.post(
    "/telemetry",
    summary="Ingest validated telemetry metadata batch from authorized collectors",
)
def ingest_telemetry(
    payload: TelemetryIngestRequest,
    auth: CollectorAuthContext = Depends(get_authenticated_collector),
    conn: sqlite3.Connection = Depends(get_db),
):
    """
    Ingests telemetry batches from authorized collectors:
    - Verifies collector and tenant authentication.
    - Rejects cross-tenant collector identity mismatches.
    - Handles deduplication via unique batch_id (HTTP 409).
    - Enforces global metric_id uniqueness.
    - Persists approved telemetry records securely.
    """
    repo = TelemetryRepository(conn)
    result = process_telemetry_batch(payload=payload, auth=auth, repo=repo)

    if result.is_duplicate:
        return JSONResponse(
            status_code=409,
            content={
                "status": "duplicate",
                "batch_id": result.batch_id,
                "message": "Batch already processed",
            },
        )

    if result.is_metric_duplicate:
        return JSONResponse(
            status_code=409,
            content={
                "status": "error",
                "message": f"Metric ID '{result.duplicate_metric_id}' has already been ingested",
            },
        )

    return JSONResponse(
        status_code=200,
        content={
            "status": "success",
            "batch_id": result.batch_id,
            "records_received": result.records_received,
        },
    )
