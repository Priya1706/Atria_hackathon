from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.app.api.v1.telemetry import router as telemetry_ingest_router
from backend.app.api.v1.dashboard import router as dashboard_router
from backend.app.api.v1.health import router as health_router
from backend.app.api.v1.telemetry_query import router as telemetry_query_router
from backend.app.api.v1.anomalies import router as anomalies_router
from backend.app.api.v1.incidents import router as incidents_router
from backend.app.api.v1.recommendations import router as recommendations_router
from backend.app.db.connection import get_db_connection
from backend.app.db.schema import init_db
from backend.app.config import CORS_ORIGINS


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables and schema upon startup safely
    conn = get_db_connection()
    try:
        init_db(conn)
    finally:
        conn.close()
    yield


app = FastAPI(
    title="CICADA 2026 — Secure AIOps Observability Platform",
    description="Central SaaS Ingestion, Health Evaluation, Anomaly Detection, Incident Correlation & Explainable Analytics",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Explicit trusted browser origins for direct deployments. The Vite development
# proxy is same-origin and does not require CORS. No credentials are exposed to
# the browser by this policy; collector auth remains server-to-server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(CORS_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-API-Key", "X-Tenant-ID", "Idempotency-Key"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Transforms Pydantic validation errors into the agreed standard error response format:
    { "status": "error", "message": "..." } with HTTP 422.
    """
    error_details = []
    for err in exc.errors():
        field_path = " -> ".join(str(loc) for loc in err["loc"] if loc != "body")
        msg = err["msg"]
        error_details.append(f"{field_path}: {msg}" if field_path else msg)

    return JSONResponse(
        status_code=422,
        content={
            "status": "error",
            "message": f"Invalid payload: {'; '.join(error_details)}",
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """
    Ensures HTTP exceptions follow the agreed standard error structure.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "message": exc.detail,
        },
    )


# Register all API routers
app.include_router(telemetry_ingest_router)
app.include_router(dashboard_router)
app.include_router(health_router)
app.include_router(telemetry_query_router)
app.include_router(anomalies_router)
app.include_router(incidents_router)
app.include_router(recommendations_router)


@app.get("/health", tags=["System"])
def system_health():
    """Liveness probe for backend infrastructure."""
    return {"status": "ok", "service": "CICADA 2026 Central SaaS Observability Backend"}
