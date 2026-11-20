# Collector architecture

## Boundaries

The collector's main security boundary is the `make_batch` function in `collector/saas_contract.py`. It creates the SaaS JSON from normalized values, using a fixed mapping. The local incoming Pydantic model permits extra keys so varied agents can submit private fields, but no input dictionary is used as the outgoing object. The SaaS payload deliberately omits `tenant_id`; the central service is expected to derive tenant identity from its API key.

Raw input is stored in the local `events.raw_json` SQLite column. Collector endpoints only return normalized metadata, and no raw-record read route exists. Host/source identifiers are transformed using HMAC-SHA256 and `PSEUDONYM_SALT`. Passwords, API credentials, raw logs, personal data, and unknown fields are absent from the schema built for SaaS.

## Persistence

SQLite tables hold normalized event columns plus local raw JSON, anomaly results, state transitions, the egress queue/audit record, and baseline measurements. Egress rows are written before network delivery. `payload_json` is the actual string passed to HTTPX and `payload_hash` is its SHA-256. A unique batch primary key, HTTP idempotency header, atomic claim, and sent-state exclusion prevent ordinary application retries from creating new SaaS batches.

An `inflight` batch older than 60 seconds is returned to `pending` at startup. This gives a crashed process a recovery path while avoiding immediate reclaims from another live process. Run one Uvicorn worker per local database.

## Analysis

The baseline uses up to 20 previous values for the same metric whose measurement timestamps are no later than the current reading. It waits for three prior readings. An anomaly is raised when the absolute deviation is at least the larger of 25% of the baseline or one metric unit. The record gives observed value, baseline, signed deviation, severity, and an explanation with the actual sample count.

Health requires recent CPU, memory, disk, latency, packet loss, service availability, and connectivity. Missing required measurements or stale latest input yields `Fair` with a reason. Otherwise a transparent score maps the worst current metric to `Excellent`, `Good`, `Fair`, or `Poor` using environment thresholds. Each change is stored with UTC time and reason.

## Retry and integration

The lifespan starts an asynchronous loop that runs the synchronous HTTP sender in a worker thread. A manual transmit endpoint uses the same sender. SQLite claims batches before sending; errors are stored as safe exception class names and retried with capped exponential backoff. Both URL and API key are required; the URL must use HTTPS. Any HTTP 2xx is currently treated as accepted. Confirm duplicate response codes, `Retry-After`, and permanent-error behavior with the SaaS owner.

## Safe local operation

`collector.main` binds Uvicorn to loopback. Routes have no local authentication and are intended for development/demo on the same machine. Do not bind to a public or shared network without an agreed access-control layer. TLS is verified for SaaS requests; credentials never appear in payloads or logs.
