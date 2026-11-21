# Atria Hackathon — CICADA AIOps

This repository contains the CICADA local collector, the central SaaS backend,
and the React/Vite monitoring frontend. The collector transmits approved metric
metadata to SaaS. Raw event input stays in the collector's local SQLite store.

## Prerequisites

- Python 3.11 or newer and Node.js/npm compatible with `package-lock.json`
- Windows PowerShell commands below assume the project virtual environment is
  `.venv`

## Configure the backend and collector

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pip install -r backend/requirements.txt
Copy-Item .env.example .env
python -m backend.dev_provision --tenant-name "CICADA Demo" --collector-name "Local Collector"
```

Provisioning prints a tenant ID, collector ID, and one-time SaaS API key. Put
those values in the ignored `.env` as `COLLECTOR_TENANT_ID`, `COLLECTOR_ID`, and
`SAAS_API_KEY`. Keep `SAAS_API_KEY` server-side: it must never be placed in a
`VITE_*` variable or bundled into the frontend. Replace the placeholder
`PSEUDONYM_SALT` with a local random value.

Set `VITE_TENANT_ID` in `.env` to the provisioned tenant ID. This is a tenant
selector, not an authentication credential. The backend frontend-facing routes
accept `X-Tenant-ID`; the demo login does not authenticate users. Do not expose
real customer data through this unauthenticated tenant-context mechanism.

## Run the unified application

Start each service in its own PowerShell window from the repository root:

```powershell
.\.venv\Scripts\python.exe -m backend.main
```

```powershell
.\.venv\Scripts\python.exe -m collector.main
```

Then install and start the frontend:

```powershell
npm ci
npm run dev -- --host 127.0.0.1
```

Open the Vite URL printed in the terminal (normally `http://127.0.0.1:5173`).
Vite proxies `/api/*` to the SaaS backend on `127.0.0.1:8000` and `/collector/*`
to the local collector on `127.0.0.1:8001`. The browser never receives the
SaaS API key. `VITE_DATA_MODE=live` is the default; the visible mode control
allows explicitly switching to sample demo data. Failed live requests show an
error instead of silently falling back to fixtures.

Create synthetic telemetry through the collector UI or API:

```powershell
Invoke-RestMethod -Method Post 'http://127.0.0.1:8001/collector/demo?scenario=normal'
Invoke-RestMethod -Method Post 'http://127.0.0.1:8001/collector/demo?scenario=compound'
```

The collector's retry worker sends queued batches to SaaS. The frontend refreshes
live API views periodically and shows collection, transmission, retry, and
incident states where the APIs report them.

## Frontend-to-backend routes

| Frontend data | Actual service route | Notes |
|---|---|---|
| Dashboard summary | `GET /api/v1/dashboard/overview` | Tenant scoped |
| Health by source | `GET /api/v1/health` | Tenant scoped |
| Telemetry and infrastructure charts | `GET /api/v1/telemetry` | Tenant scoped; histories are only available for persisted samples |
| Anomalies and alerts | `GET /api/v1/anomalies` | Alert status mutation is not available |
| Incidents and lifecycle | `GET /api/v1/incidents`, `PATCH /api/v1/incidents/{id}` | Resolution requires verified recovery |
| Recommendations / AIOps evidence | `GET /api/v1/recommendations`, incident response evidence | Statistical and rule based, not LLM output |
| Local collector state | `GET /collector/status`, `/collector/metrics`, `/collector/events` | Events route returns normalized metadata only |
| Egress audit and retry queue | `GET /collector/egress`, `/collector/queue`; `POST /collector/transmit` | Local collector only; no SaaS egress-history route exists |

The tenant directory, user login, notification preferences, collector resource
usage, detailed pipeline traces, and raw-event inspection do not have matching
backend routes. The frontend labels or disables those views instead of
fabricating live values. Raw-event inspection is not routed through SaaS; the
current collector API exposes only sanitized event metadata, not raw payloads.

## CORS and API configuration

The Vite development proxy keeps browser requests same-origin. For direct
frontend-to-backend deployments, configure `CORS_ORIGINS` on the SaaS service
with explicit trusted origins. CORS does not provide authentication. The SaaS
ingest API authenticates collectors using `X-API-Key`; dashboard APIs use the
configured tenant context and are not a substitute for user authentication.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest -q
npm ci
npm run build
npm run lint
```

The backend suite covers collector privacy and lifecycle, SaaS ingestion,
idempotency, AIOps behavior, tenant isolation, and a real loopback HTTP
collector-to-SaaS integration. Frontend build and lint commands are listed above.

Additional details: [backend/README.md](backend/README.md),
[docs/architecture.md](docs/architecture.md),
[docs/demo-guide.md](docs/demo-guide.md), and
[collector/contract.md](collector/contract.md).
