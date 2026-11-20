# CICADA 2026 local collector

Tier 1 is a local-first telemetry collector. It validates and stores input inside the customer environment, creates a separate privacy-filtered SaaS batch, analyzes recent metrics, tracks health, and records the exact outgoing request before sending it. The repository does not contain the organizer's telemetry stream; the included simulator is clearly synthetic and replaceable. The central SaaS request is a proposal documented in [collector/contract.md](collector/contract.md), not a confirmed team agreement.

## Architecture and data flow

1. `TelemetryInput` validates fields, accepted metric names, values, and timestamps. Naive timestamps are interpreted as UTC; timezone-aware values are converted to UTC.
2. `Pipeline` verifies the configured local tenant/collector identity, keeps the original input in SQLite, normalizes event attributes, and replaces the source name with a keyed pseudonym.
3. `saas_contract.make_batch` builds a new versioned request using only approved metric fields. Tenant ID, logs, credentials, and arbitrary input fields never enter it.
4. Historical metric samples are persisted and used by the simple explainable baseline. Health uses recent required metrics and labels missing or stale input.
5. `Store.enqueue` writes the exact compact JSON, SHA-256 hash, field audit, destination, and batch ID to SQLite before any network call.
6. The background worker and `POST /collector/transmit` claim a batch atomically, send the exact stored JSON over HTTPS with `X-API-Key` and an idempotency key, and record delivery or exponential retry time.

Plain-language module guide: `models.py` checks input; `pipeline.py` processes local telemetry and computes analysis; `saas_contract.py` controls the outward format; `store.py` handles durable local records; `transport.py` handles retries and HTTPS; `app.py` exposes API routes and runs the retry worker; `simulator.py` supplies invented demo values.

More detail: [docs/architecture.md](docs/architecture.md) and [docs/demo-guide.md](docs/demo-guide.md).

## Setup on Windows PowerShell

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m collector.main
```

The API binds to `127.0.0.1:8000`; Swagger/OpenAPI is at `http://127.0.0.1:8000/docs`. The `.env` file is loaded at startup, and process environment values override it. Use a random stable `PSEUDONYM_SALT`; keep `.env` private. Do not expose this unauthenticated local API on a network.

To connect after contract confirmation, set `SAAS_INGEST_URL` to the full HTTPS ingestion URL and set `SAAS_API_KEY`. The collector does not invent a destination. It sends `X-API-Key`, `Idempotency-Key: <batch_id>`, and the exact stored payload. Until both URL and key are configured, batches stay buffered. TLS certificate validation remains on.

## Demo and inspection

Call `POST http://127.0.0.1:8000/collector/demo` to collect nine clearly synthetic metrics as one batch. Send custom data to `POST /collector/collect`; a request shape is in [docs/demo-guide.md](docs/demo-guide.md). Browse `/collector/metrics`, `/collector/events`, `/collector/anomalies`, `/collector/alerts`, `/collector/status`, and `/collector/queue`. For egress proof, use `/collector/egress` and `/collector/egress/{batch_id}`. Egress detail includes the exact JSON string, hash, attempts, timestamps, destination, and field lists. No endpoint returns stored raw input.

## API routes

- `GET /health`
- `GET /collector/status`
- `GET /collector/metrics`
- `GET /collector/events`
- `GET /collector/anomalies`
- `GET /collector/alerts`
- `GET /collector/egress`
- `GET /collector/egress/{payload_id}` (ID is also the contract `batch_id`)
- `GET /collector/queue`
- `POST /collector/collect`
- `POST /collector/demo`
- `POST /collector/transmit`

## Tests

```powershell
python -m pytest -q
```

The tests cover collection, validation, persistence, UTC conversion, default-deny export, HMAC pseudonyms, anomaly history after restart, out-of-order measurements, health transitions and staleness, audit/hash/body equality, successful and failed transmission, retry recovery, duplicate queue IDs, application restart, background worker execution, and API errors.

## Limitations to know

The SaaS schema and endpoint/auth/acknowledgement behavior still require confirmation with Amit. The baseline is a small moving average and the health score is a transparent demo heuristic. There is no raw-record management API, queue retention/deletion policy, automatic dead-letter policy, tenant-aware multi-collector process, or local API authentication. Failed batches retry indefinitely with a capped delay until the SaaS accepts them. The local SQLite file can grow; plan retention before production use.
