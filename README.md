# CICADA 2026 integrated backend

This repository contains two separate FastAPI applications:

- **Local collector (Tier 1):** validates telemetry, keeps raw input local, pseudonymizes source identifiers, calculates local health/anomalies, and queues only approved metric metadata.
- **Central SaaS backend (Tier 2):** authenticates collectors with `X-API-Key`, derives tenant identity from the key, persists telemetry, and computes central health, anomalies, incidents, and recommendations.

The integration contract is implemented at `POST /api/v1/ingest/telemetry` and described in [collector/contract.md](collector/contract.md). The two services use separate configuration and SQLite files.

## Setup (Windows PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pip install -r backend/requirements.txt
Copy-Item .env.example .env
```

The root `.env` combines namespaced collector settings (`COLLECTOR_*`, `SAAS_*`) with SaaS settings (`APP_ENV`, `HOST`, `PORT`, `DATABASE_PATH`). It is ignored by Git. The collector loads it directly; the SaaS config loads the same file. Process environment values take precedence. No real credentials are included.

## Provision a development collector

With `APP_ENV=development` in `.env`, run:

```powershell
python -m backend.dev_provision --tenant-name "CICADA Demo" --collector-name "Local Collector"
```

The command creates a tenant and collector in the SaaS SQLite database and prints a fresh API key once. Copy it into the ignored `.env` as `SAAS_API_KEY`. Also copy the printed tenant and collector IDs to `COLLECTOR_TENANT_ID` and `COLLECTOR_ID`. Provisioning refuses to run when `APP_ENV=production`. The backend currently stores API keys as plaintext in its local development database; do not use this MVP provisioning path for production keys.

## Start both applications

Open two PowerShell windows from the repository root.

**SaaS backend (port 8000):**

```powershell
python -m backend.main
```

**Local collector (port 8001):**

```powershell
python -m collector.main
```

The collector binds loopback at `127.0.0.1:8001` by default. SaaS binds loopback at `127.0.0.1:8000`. Swagger is at `/docs` on each service. The collector accepts plain HTTP only for localhost/loopback development; remote destinations must use HTTPS with certificate verification enabled.

## Run the integrated demo

After provisioning and starting both apps:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:8001/collector/demo
Invoke-RestMethod http://127.0.0.1:8001/collector/egress | ConvertTo-Json -Depth 8
Invoke-RestMethod http://127.0.0.1:8000/api/v1/telemetry -Headers @{"X-Tenant-ID"="<tenant id from provisioning>"} | ConvertTo-Json -Depth 8
```

`/collector/demo` creates ten synthetic metric records in one privacy-filtered batch. They are invented sample values, not organizer telemetry. The collector audit shows the exact sent JSON and SHA-256. The SaaS service assigns the tenant from `SAAS_API_KEY`; tenant ID is absent from the request body.

The SaaS returns `409` with `status: duplicate` for an already-processed batch. The collector treats this as successful delivery only when the returned batch ID matches. A `409` with `status: error` (for example a repeated metric UUID) remains failed and is retried; the collector does not weaken metric uniqueness.

## Telemetry compatibility

Collector exports CPU (`cpu_usage`), memory (`memory_usage`), disk (`disk_usage`), bandwidth utilization (`bandwidth_usage`), latency (`network_latency`), packet loss (`packet_loss`), connectivity, service availability, failed-authentication counts, and security-event counts. The SaaS health/anomaly engines have thresholds for all these signals; unknown metrics evaluate as `Fair`, not healthy. Bandwidth is a percent of known link capacity; a real collector adapter needs an actual counter and capacity. The demo value is synthetic.

## API routes

Collector: `GET /health`, `/collector/status`, `/collector/metrics`, `/collector/events`, `/collector/anomalies`, `/collector/alerts`, `/collector/egress`, `/collector/egress/{batch_id}`, `/collector/queue`; `POST /collector/collect`, `/collector/demo`, `/collector/transmit`.

SaaS: `GET /health`; `POST /api/v1/ingest/telemetry`; dashboard, health, telemetry, anomalies, incidents, and recommendation routes are listed in [backend/README.md](backend/README.md).

## Tests

```powershell
python -m pytest -q
```

This runs collector unit tests, SaaS tests, metric compatibility tests, development provisioning tests, and a mocked in-process end-to-end collector-to-SaaS test. The integration test simulates a lost first acknowledgement, retries the identical body, validates the SaaS duplicate acknowledgement, and verifies tenant assignment, persistence, anomalies, and health processing.

More details: [docs/architecture.md](docs/architecture.md), [docs/demo-guide.md](docs/demo-guide.md), and [backend/README.md](backend/README.md).
