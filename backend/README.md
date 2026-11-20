# CICADA 2026 — Secure AIOps Observability SaaS Backend

Welcome to the **Central SaaS Ingestion & Analytics Backend** for the **CICADA 2026 Secure AIOps Observability Platform**.

This Tier-2 service is responsible for receiving approved, redacted telemetry metadata from Tier-1 local collectors, persisting metrics securely with strict multi-tenant isolation, evaluating system health, detecting statistical anomalies, correlating alerts into incidents, and generating explainable, actionable triage recommendations for operations engineers.

---

## 1. Project Architecture

The system implements a decoupled, two-tier architecture:

```
[ Tier 1: Local Collector ]
  - Collects local system telemetry (CPU, memory, disk, network, error rates).
  - Redacts sensitive credentials, passwords, and raw payloads locally.
  - Sends normalized telemetry metadata via HTTPS.
          │
          │ POST /api/v1/ingest/telemetry (Header: X-API-Key)
          ▼
[ Tier 2: Central SaaS Backend (This Service) ]
  ├── 1. Authentication & Security Middleware
  │      └── Verifies X-API-Key, derives tenant_id, blocks cross-tenant tampering.
  ├── 2. Telemetry Ingestion & Idempotency Engine
  │      └── Validates payload schema, checks batch_id deduplication (HTTP 409).
  ├── 3. Persistence Layer (SQLite)
  │      └── Atomic multi-record commits with strict tenant isolation (WHERE tenant_id = ?).
  ├── 4. Central Health Calculation Engine
  │      └── Evaluates 4 states (Excellent, Good, Fair, Poor) + stale telemetry detection.
  ├── 5. Anomaly Detection Engine
  │      └── Moving average baseline & threshold fallback with duplicate suppression.
  ├── 6. Incident Correlation Engine
  │      └── Clusters multi-signal alerts across time windows into unified incidents.
  ├── 7. Explainable Recommendation Engine
  │      └── 5-pillar structured triage advice (What, Which, Value, Why, Next Action).
  └── 8. Frontend & Dashboard REST APIs
         └── Tenant-isolated endpoints for overview, health, metrics, incidents, recs.
```

---

## 2. Folder Structure

```text
backend/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── telemetry.py         # Telemetry Ingestion endpoint (POST /api/v1/ingest/telemetry)
│   │       ├── dashboard.py         # Dashboard Overview (GET /api/v1/dashboard/overview)
│   │       ├── health.py            # Central Health (GET /api/v1/health)
│   │       ├── telemetry_query.py   # Telemetry Records (GET /api/v1/telemetry)
│   │       ├── anomalies.py         # Anomalies list (GET /api/v1/anomalies)
│   │       ├── incidents.py         # Incident list & lifecycle (GET, PATCH /api/v1/incidents)
│   │       └── recommendations.py   # Explainable recommendations (GET /api/v1/recommendations)
│   │
│   ├── core/
│   │   ├── auth.py                  # Collector API-key auth & Tenant session auth
│   │   ├── ingestion.py             # End-to-end telemetry ingestion pipeline
│   │   ├── health_engine.py         # 4-state health scoring & stale heartbeat detection
│   │   ├── anomaly_detection.py     # Statistical moving baseline & threshold detector
│   │   ├── incident_correlation.py  # Alert clustering & hypothesis generation
│   │   └── recommendation_engine.py # 5-pillar explainable recommendations generator
│   │
│   ├── db/
│   │   ├── connection.py            # SQLite connection factory (PRAGMA foreign_keys = ON)
│   │   ├── schema.py                # Database DDL script and table creation
│   │   └── repository.py            # Strict tenant-isolated database repository
│   │
│   ├── schemas/
│   │   ├── telemetry.py             # Telemetry ingestion request/response Pydantic models
│   │   ├── health.py                # Health evaluation response models
│   │   ├── anomaly.py               # Anomaly response models
│   │   ├── incident.py              # Incident response and status patch models
│   │   ├── recommendation.py        # Recommendation response models
│   │   └── dashboard.py             # Dashboard overview and paginated metric schemas
│   │
│   ├── config.py                    # Environment and database configuration
│   └── main.py                      # FastAPI application, exception handlers, and routing
│
├── tests/
│   ├── conftest.py                  # Pytest fixtures and isolated in-memory test database
│   ├── test_phase1_ingestion.py     # Phase 1 ingestion, deduplication & auth unit tests
│   └── test_full_suite.py           # Comprehensive integration tests covering all 18 requirements
│
├── requirements.txt                 # Minimum required backend dependencies
└── README.md                        # Complete backend documentation
```

---

## 3. Installation & Environment Setup

### Prerequisites
* Python 3.11+ (Tested on Python 3.13)
* Git

### Installation Steps
1. Clone the repository and navigate to the project root:
   ```bash
   git checkout backend/core
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   # On Windows:
   .venv\Scripts\activate
   # On Linux / macOS:
   source .venv/bin/activate
   ```
3. Install required dependencies:
   ```bash
   python -m pip install -r backend/requirements.txt
   ```
4. Configure environment variables (optional for development):
   ```bash
   cp .env.example .env
   ```

---

## 4. Database Initialization & Starting the Server

The database schema is initialized automatically on application startup via FastAPI's lifespan context manager. No manual migration scripts are required for the SQLite MVP.

To start the development server:
```bash
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Once running, interactive documentation is available at:
* Swagger UI: `http://localhost:8000/docs`
* ReDoc UI: `http://localhost:8000/redoc`
* OpenAPI JSON: `http://localhost:8000/openapi.json`
* Liveness Health Check: `http://localhost:8000/health`

---

## 5. API Authentication & Security

### Tier-1 Collector Authentication
* Header: `X-API-Key: <collector_api_key>`
* The server looks up the collector in the database and automatically resolves its assigned `tenant_id`.
* Client requests **cannot** specify `tenant_id` or `health_status` in the payload; any attempt to supply these fields is rejected with `HTTP 422`.
* Payloads containing sensitive credentials (e.g. `password`, `secret`, `token`, `credential`, `private_key`) are recursively rejected.

### Dashboard & Frontend Authentication
* Header: `X-Tenant-ID: <tenant_id>` (or `X-API-Key: <collector_api_key>`)
* Validates that the tenant exists and scopes every database query strictly with `WHERE tenant_id = :tenant_id`. Cross-tenant data leaks are mathematically prevented.

---

## 6. Telemetry Ingestion Contract

### Endpoint
`POST /api/v1/ingest/telemetry`

### Headers
```http
Content-Type: application/json
X-API-Key: key-alpha-valid-1234
```

### Request Payload Example
```json
{
  "schema_version": "1.0",
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "collector_id": "collector-001",
  "timestamp": "2026-11-20T10:30:00Z",
  "metrics": [
    {
      "metric_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "source": "server-01",
      "metric_name": "cpu_usage",
      "value": 78.5,
      "unit": "percent",
      "timestamp": "2026-11-20T10:30:00Z"
    }
  ],
  "metadata": {
    "environment": "production"
  }
}
```

### Success Response (`HTTP 200`)
```json
{
  "status": "success",
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "records_received": 1
}
```

### Duplicate Batch Response (`HTTP 409`)
```json
{
  "status": "duplicate",
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Batch already processed"
}
```

---

## 7. Dashboard Endpoints (Frontend Integration)

### 1. Dashboard Overview
* **Route**: `GET /api/v1/dashboard/overview`
* **Header**: `X-Tenant-ID: tenant-alpha`
* **Response**:
```json
{
  "tenant_id": "tenant-alpha",
  "tenant_name": "Alpha Enterprises",
  "total_monitored_sources": 2,
  "healthy_sources": 1,
  "unhealthy_sources": 1,
  "active_incidents": 1,
  "recent_anomalies": 2,
  "overall_health_status": "Poor",
  "overall_health_score": 42.5,
  "summary": "Tenant 'Alpha Enterprises' has 2 monitored source(s). 1 healthy, 1 unhealthy. 1 active incident(s) currently open."
}
```

### 2. Central Health Evaluations
* **Route**: `GET /api/v1/health` (optional query: `?source=server-01`)
* **Header**: `X-Tenant-ID: tenant-alpha`
* **Response**:
```json
{
  "tenant_id": "tenant-alpha",
  "overall_health_status": "Poor",
  "overall_health_score": 42.5,
  "sources": [
    {
      "source": "api-gateway",
      "health_status": "Poor",
      "health_score": 35.0,
      "contributing_metrics": [
        {
          "metric_name": "cpu_usage",
          "observed_value": 94.0,
          "unit": "percent",
          "status": "Poor",
          "threshold": 92.0
        }
      ],
      "explanation": "Source health is critical: cpu_usage is critical at 94.0percent (exceeds 92.0percent).",
      "evaluated_at": "2026-11-20T10:30:00+00:00"
    }
  ]
}
```

### 3. Filtered Telemetry Records
* **Route**: `GET /api/v1/telemetry?metric_name=cpu_usage&limit=10&offset=0`
* **Header**: `X-Tenant-ID: tenant-alpha`

### 4. Incident Management
* **List Incidents**: `GET /api/v1/incidents?status=OPEN`
* **Update Incident Lifecycle**: `PATCH /api/v1/incidents/{incident_id}`
  * Body: `{"status": "ACKNOWLEDGED"}` or `{"status": "RESOLVED"}`

### 5. Explainable Recommendations
* **Route**: `GET /api/v1/recommendations`
* **Header**: `X-Tenant-ID: tenant-alpha`
* **Response Structure**:
```json
[
  {
    "recommendation_id": "rec-3914a1f5-19e4-4a25-a130-cbcfef305c4b",
    "tenant_id": "tenant-alpha",
    "incident_id": "inc-4b896ec0-e29b-41d4-a716-446655440001",
    "title": "[api-gateway] Investigate High CPU Utilization & Thread Contention",
    "explanation": "1. What happened: Elevated telemetry detected on api-gateway. 2. Metric of concern: cpu_usage. 3. Observed value: 94.0. 4. Why it matters: Sustained high CPU saturation increases queue wait times, throttles processing threads, and leads to request timeouts. 5. What operator should do: 1. Inspect running processes via top/htop. 2. Profile active threads for infinite loops or locks. 3. Consider scaling compute capacity or optimizing hot code paths.",
    "suggested_action": "1. Inspect running processes via top/htop. 2. Profile active threads for infinite loops or locks. 3. Consider scaling compute capacity or optimizing hot code paths.",
    "severity": "CRITICAL",
    "created_at": "2026-11-20T10:30:00+00:00"
  }
]
```

---

## 8. Analytics & Intelligence Engines

### Health Monitoring Engine
* **4 Distinct States**: `Excellent`, `Good`, `Fair`, `Poor`.
* **Provisional Thresholds**:
  * `cpu_usage`: Excellent (<=70%), Good (70-85%), Fair (85-92%), Poor (>92%)
  * `memory_usage`: Excellent (<=75%), Good (75-88%), Fair (88-95%), Poor (>95%)
  * `disk_usage`: Excellent (<=80%), Good (80-90%), Fair (90-96%), Poor (>96%)
  * `network_latency`: Excellent (<=100ms), Good (100-250ms), Fair (250-500ms), Poor (>500ms)
  * `error_rate`: Excellent (<=1%), Good (1-3%), Fair (3-8%), Poor (>8%)
* **Stale Telemetry Handling**: If no reading has arrived from a monitored source within 120 seconds, health drops to `Poor` (Score: 10.0) with an explicit explanation.

### Explainable Anomaly Detection
* **Statistical Rolling Baseline**: Computes moving average ($\mu$) and standard deviation ($\sigma$) over the last $N$ readings. Triggered when observed values deviate by $\ge 2\sigma$ or $\ge 30\%$ from baseline.
* **Sparse History Fallback**: Falls back to configured static thresholds when $< 3$ historical readings exist.
* **Duplicate Suppression**: Suppresses duplicate alerts for the same source, metric, and severity within a 5-minute cooldown window.

### Incident Correlation Engine
* Clusters multi-metric anomalies occurring on the same source within a 10-minute sliding window into a single unified incident.
* Updates existing open incidents rather than spawning redundant tickets.
* **Hypothesis Guardrail**: Strictly presents root causes as hypotheses ("Possible Cause: ..."), never asserting speculation as fact.

### Explainable Recommendations
* Every recommendation deterministically answers:
  1. What happened?
  2. Which metric caused concern?
  3. What value was observed?
  4. Why is it a problem?
  5. What should the operator do next?

---

## 9. Automated Testing

Run the test suite using pytest:
```bash
python -m pytest backend/tests -v
```

All 25 automated unit, integration, security, and tenant isolation tests execute in an isolated, in-memory SQLite database in under **0.5 seconds**.

---

## 10. Known MVP Limitations

1. **Database**: Implemented using Python's standard library `sqlite3` for zero-setup 24-hour hackathon execution. While ACID-compliant and tenant-isolated, high-concurrency production deployments should migrate to PostgreSQL.
2. **API Keys**: Stored in the SQLite `collectors` table. Production environments should incorporate salt-hashed tokens (e.g. bcrypt/Argon2) and an automated key rotation vault.
3. **Correlation Window**: Alert correlation operates in-process over a 10-minute sliding window. Large-scale multi-region setups should back this with Redis or Apache Kafka.
