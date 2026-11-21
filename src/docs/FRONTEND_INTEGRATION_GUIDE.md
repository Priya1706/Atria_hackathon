# Frontend integration guide

The active Vite entrypoint is `src/main.jsx` and renders `src/App.jsx`. The app
retains the existing dashboard design and uses a top-bar control to choose between
live API data and explicitly selected demo fixtures. Live request failures remain
visible; they do not silently switch to mocks.

## Local services

- SaaS backend: `127.0.0.1:8000`, served under `/api/v1`.
- Local collector: `127.0.0.1:8001`, served under `/collector`.
- Vite dev server: `127.0.0.1:5173`.

The Vite server proxies `/api` and `/collector` to these local services. For direct
cross-origin SaaS access, set `CORS_ORIGINS` to trusted browser origins. CORS is
not authentication.

## Configuration and credentials

Set `VITE_TENANT_ID` to a provisioned tenant identifier. The frontend sends this as
`X-Tenant-ID` to tenant-scoped read and incident routes. This value identifies a
tenant context only; it does not authenticate a user. The frontend login is a
local demo gate. Never expose `SAAS_API_KEY` in browser environment variables; the
collector uses it server-side for ingestion.

## Existing component routes

- Dashboard, health, telemetry, incidents, anomalies, recommendations: SaaS API.
- Collector status, normalized local events, egress audit and retry queue: local
  collector API.
- Raw logs remain local. The collector API has no raw inspection route, so the UI
  intentionally offers no raw payload/passkey screen.
- Per-stage processing timings, collector resource inventory, SaaS egress history,
  tenant directory and notification APIs are not provided. Live pages identify
  missing information rather than fabricate values.

Use `src/docs/API_CONTRACTS.md` for request/response route mapping and limitations.
