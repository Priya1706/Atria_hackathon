# Integrated backend architecture

There are two independent FastAPI processes and two SQLite files:

| Service | Module | Default local address | Database setting |
|---|---|---|---|
| Local collector | `collector.app:app` via `python -m collector.main` | `127.0.0.1:8001` | `COLLECTOR_DB` (`collector.db`) |
| Central SaaS | `backend.app.main:app` via Uvicorn | `127.0.0.1:8000` | `DATABASE_PATH` (`backend/saas_platform.db`) |

The root `.env.example` lists both sets. Collector variables use `COLLECTOR_`/`SAAS_` prefixes; SaaS variables use `APP_ENV`, `HOST`, `PORT`, `DATABASE_PATH`, and engine-specific names. Each process reads the root `.env`; OS environment variables have priority. Dependencies are declared separately and intentionally use compatible FastAPI/Pydantic/HTTPX versions.

## Data flow

1. Collector validates source records, preserves raw input only in collector SQLite, normalizes measurement time to UTC, and computes local baseline/health signals.
2. A contract adapter constructs a new batch with a UUID `batch_id`, configured `collector_id`, UTC batch time, and metric records with UUID `metric_id`, HMAC pseudonym `source`, mapped name/value/unit/time.
3. Collector records exact compact JSON and SHA-256 in its egress queue before network I/O. Tenant ID, raw logs, credentials, and original source identifiers are not sent.
4. The configured API key is sent in `X-API-Key`. SaaS authentication maps that key to an active collector and tenant; the JSON tenant is not accepted. SaaS also verifies that payload collector ID matches the registered collector.
5. SaaS stores each batch/metric atomically, rejects reused metric UUIDs, and runs central anomaly detection, health calculation, incident correlation, and recommendations.
6. The collector retries network/server/validation errors with the same exact body and ID. A 409 is acknowledged only when its JSON has `status: duplicate` and a matching `batch_id`; a 409 metric-ID `status: error` remains failed.

## Contract and privacy boundary

See [collector/contract.md](../collector/contract.md). `collector/saas_contract.py` holds the outbound field mapping. Source names are replaced with HMAC-SHA256 pseudonyms. The collector's audit includes approved/removed/redacted field names, destination, attempt timestamps, and the exact request string/hash.

## Metric compatibility

CPU, memory, disk, bandwidth utilization, latency, packet loss, connectivity, availability, failed auth counts, and security event counts map to explicit SaaS names. Health and anomaly rules are maintained centrally for each. Unknown metrics are Fair in SaaS health until deliberately configured. The synthetic adapter uses made-up bandwidth percent values; a real input adapter must derive percent utilization from a local bandwidth counter and known link capacity.

## Development and security

Provision a dev tenant and collector with `python -m backend.dev_provision`; generated API keys are printed once and should be kept in ignored `.env`. Provisioning is disabled in production. The SaaS MVP stores these keys in plaintext in SQLite; restrict this workflow to demo credentials. Collector accepts HTTP only to loopback addresses for local integration; all remote transmission requires HTTPS and normal certificate verification. Keep both APIs bound to loopback during development. The local collector API has no local authentication.
