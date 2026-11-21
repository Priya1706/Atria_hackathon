# Integrated frontend API map

This document describes routes present in this repository. The frontend defaults to
live mode and does not silently fall back to fixtures. Use the visible mode selector
to opt into demo fixtures.

## SaaS backend (`127.0.0.1:8000`)

Frontend requests use the Vite `/api` proxy and send `X-Tenant-ID`, sourced from
`VITE_TENANT_ID` or the browser's `atria_tenant_id`. This is tenant context, not
user authentication. Never put `SAAS_API_KEY` in a `VITE_*` variable.

| Route | Frontend purpose | Response use |
|---|---|---|
| `GET /api/v1/dashboard/overview` | Dashboard and current tenant summary | Tenant name/id, health score/state, source and incident counts |
| `GET /api/v1/health` | Health distribution and source metrics | `sources[]`, contributing metrics, evaluated state |
| `GET /api/v1/telemetry` | Dashboard and infrastructure | `records[]`, each with source, metric, value, unit, timestamp |
| `GET /api/v1/anomalies` | Alerts and AIOps evidence | Read-only statistical/rule findings and explanation |
| `GET /api/v1/incidents` | Incident list and evidence | Correlated tenant incidents, lifecycle, causes, supporting metrics |
| `PATCH /api/v1/incidents/{incident_id}` | Incident lifecycle action | Status body `{ "status": "OPEN" | "ACKNOWLEDGED" | "RESOLVED" }`; recovery rules may reject resolution |
| `GET /api/v1/recommendations` | Incident recommendations | Explainable recommendation text and suggested action |

## Local collector (`127.0.0.1:8001`)

Requests use the Vite `/collector` proxy and never include the SaaS API key.

| Route | Frontend purpose | Response use |
|---|---|---|
| `GET /health` | Local API liveness | UTC liveness timestamp |
| `GET /collector/status` | Collector status | Configured IDs, health, queue counts, SaaS configured flag |
| `GET /collector/metrics` | Collector metrics | Latest metric values reported locally |
| `GET /collector/events` | Local event list | Sanitized normalized fields only; no raw JSON/source identifier |
| `GET /collector/egress` | Egress audit | Batch IDs, exact safe payload body, removed/redacted/approved fields, payload hash, delivery state and retry metadata |
| `GET /collector/queue` | Retry view | Pending, failed, and in-flight egress records |
| `POST /collector/transmit` | Explicit retry action | Attempted, delivered, and pending counts |

The collector has no raw-event inspection route, no detailed processing-stage timing
route, and no transport-summary route. The frontend does not invent these APIs or
proxy raw logs through SaaS. It shows only sanitized event metadata and local egress
evidence. A payload hash is an integrity digest, not a digital signature. HTTPS is
used for HTTPS destinations; local development uses loopback HTTP. The implementation
does not claim mTLS.

The SaaS service has no tenant directory, browser login, notification preferences,
or anomaly acknowledgement route. The frontend demo login is local-only and must not
be treated as authentication.
