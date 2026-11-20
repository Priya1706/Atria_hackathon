"""FastAPI local collector. Run bound to 127.0.0.1 by default."""
import logging
import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from .models import CollectRequest, CollectResponse, TelemetryInput, TransmitResponse
from .pipeline import Pipeline
from .settings import settings
from .simulator import sample_events
from .store import Store
from .transport import transmit_pending

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
store = Store(settings.database_path)
pipeline = Pipeline(store)


async def _retry_worker():
    while True:
        try:
            await asyncio.to_thread(transmit_pending, store)
        except Exception as exc:
            logging.getLogger("collector.worker").warning("Retry worker error (%s)", type(exc).__name__)
        await asyncio.sleep(max(0.25, settings.retry_interval_seconds))


@asynccontextmanager
async def lifespan(_app):
    worker = asyncio.create_task(_retry_worker())
    try:
        yield
    finally:
        worker.cancel()
        try:
            await worker
        except asyncio.CancelledError:
            pass


app = FastAPI(title="CICADA Local Collector", version="0.2.0", description="Local-first telemetry collector with default-deny egress. SaaS contract remains proposed.", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError):
    # FastAPI's default error may echo the invalid input value. Return only safe metadata.
    safe = [{"loc": list(error.get("loc", ())), "msg": error.get("msg", "Invalid input"), "type": error.get("type", "value_error")} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": safe})


@app.get("/health")
def health():
    return {"status": "ok", "timestamp_utc": datetime.now(timezone.utc).isoformat()}


@app.get("/collector/status")
def status():
    return {"tenant_id": settings.tenant_id, "collector_id": settings.collector_id, "health": pipeline.classify(), "queue": store.counts(), "simulator_enabled": settings.simulator_enabled, "saas_configured": bool(settings.saas_url and settings.saas_api_key)}


@app.get("/collector/metrics")
def metrics():
    latest = {}
    for row in store.rows("events", 1000):
        latest.setdefault(row["metric_name"], {"metric_name": row["metric_name"], "metric_value": row["metric_value"], "timestamp_utc": row["timestamp_utc"]})
    return list(latest.values())


@app.get("/collector/events")
def events(limit: int = Query(100, ge=1, le=1000)):
    # Raw input remains local; API returns normalized non-raw attributes only.
    return [{k: row[k] for k in ("event_id", "tenant_id", "collector_id", "timestamp_utc", "source_timezone", "metric_name", "metric_value", "category", "severity")} for row in store.rows("events", limit)]


@app.get("/collector/anomalies")
def anomalies(limit: int = Query(100, ge=1, le=1000)):
    return store.rows("anomalies", limit)


@app.get("/collector/alerts")
def alerts(limit: int = Query(100, ge=1, le=1000)):
    return [a for a in store.rows("anomalies", limit) if a["severity"] in ("warning", "critical")]


@app.get("/collector/egress")
def egress(limit: int = Query(100, ge=1, le=1000)):
    return [_egress_public(row) for row in store.rows("egress", limit)]


def _egress_public(row):
    for field in ("event_ids", "fields_removed", "fields_redacted", "approved_fields", "fields_sent"):
        try:
            row[field] = json.loads(row[field])
        except (KeyError, TypeError, json.JSONDecodeError):
            row[field] = []
    row["batch_id"] = row["payload_id"]
    row["creation_timestamp"] = row["processing_timestamp"]
    return row


@app.get("/collector/egress/{payload_id}")
def egress_detail(payload_id: str):
    row = store.get_egress(payload_id)
    if row is None:
        raise HTTPException(status_code=404, detail="payload not found")
    return _egress_public(row)


@app.get("/collector/queue")
def queue():
    return [r for r in store.all_queue(1000) if r["status"] in ("pending", "failed", "inflight")]


@app.post("/collector/collect", response_model=CollectResponse)
def collect(request: CollectRequest):
    try:
        ids, found, health_result, batch_id = pipeline.accept(request.events)
        return {"accepted": len(ids), "event_ids": ids, "batch_id": batch_id, "anomalies": found, "health": health_result}
    except ValueError as exc:
        raise HTTPException(status_code=403 if "tenant_id" in str(exc) else 422, detail=str(exc)) from exc


@app.post("/collector/transmit", response_model=TransmitResponse)
def transmit():
    attempted = len(store.pending(due_only=True))
    sent = transmit_pending(store)
    counts = store.counts()
    return {"attempted": attempted, "delivered": sent, "pending": counts["pending"] + counts["failed"] + counts["inflight"]}


@app.post("/collector/demo", response_model=CollectResponse)
def demo():
    samples = sample_events()
    if not samples:
        raise HTTPException(status_code=409, detail="simulator is disabled")
    ids, found, health_result, batch_id = pipeline.accept([TelemetryInput(**e) for e in samples])
    return {"accepted": len(ids), "event_ids": ids, "batch_id": batch_id, "anomalies": found, "health": health_result}
