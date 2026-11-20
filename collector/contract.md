# Proposed collector to SaaS contract

**Status: proposed, not confirmed.** The local collector implements the payload format below because it was supplied in the CICADA backend prompt. Amit should confirm the path, authentication, units, acknowledgement semantics, and duplicate behavior before the two services are connected. No SaaS destination URL is hard-coded.

## Request

- Method/path: `POST /api/v1/ingest/telemetry` (configure the full URL through `SAAS_INGEST_URL`).
- Authentication: `X-API-Key: <key>` from `SAAS_API_KEY`, sent only over HTTPS.
- Idempotency: `Idempotency-Key: <batch_id>` plus the same stable `batch_id` in the JSON body. The SaaS service should deduplicate on this identifier.
- Tenant: deliberately omitted. The SaaS service derives tenant identity from the API key.
- Content type: `application/json`.

## Payload schema version 1.0

```json
{
  "schema_version": "1.0",
  "batch_id": "unique-uuid",
  "collector_id": "collector-001",
  "timestamp": "2026-11-20T10:30:00Z",
  "metrics": [
    {
      "metric_id": "unique-event-uuid",
      "source": "24-char-pseudonymous-id",
      "metric_name": "cpu_usage",
      "value": 78.5,
      "unit": "percent",
      "timestamp": "2026-11-20T10:29:59Z"
    }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `schema_version` | yes | Version of this wire format. |
| `batch_id` | yes | Stable UUID used for retries and deduplication. |
| `collector_id` | yes | Configured collector identity. |
| `timestamp` | yes | UTC batch creation time in ISO 8601. |
| `metrics` | yes | One or more approved metric records. |
| `metric_id` | yes | Stable event UUID retained across retries. |
| `source` | yes | HMAC pseudonym; original host/source identifier is not exported. |
| `metric_name` | yes | SaaS metric name mapped by `collector/saas_contract.py`. |
| `value` | yes | Finite numeric/boolean telemetry value. |
| `unit` | yes | Normalized unit string. |
| `timestamp` | yes | Measurement time normalized to UTC. |

Input-to-contract metric mapping is centralized in `collector/saas_contract.py`. It covers CPU, memory, disk, latency, packet loss, connectivity, availability, failed authentication count, and security event count. Raw logs, tenant ID, local category/severity, source timezone, passwords, tokens, personal data, and unapproved fields do not appear in this schema.

## Response expectations to confirm with SaaS owner

The collector currently treats **any 2xx** response as successful delivery and retains the batch ID for deduplication. Proposed responses:

- `200` or `201`: `{"status":"accepted","batch_id":"<same-id>"}`.
- Duplicate: preferably `200` with `{"status":"duplicate","batch_id":"<same-id>"}` so retries can be acknowledged as delivered.
- `400`/`422`: permanent schema/validation error. Current collector records failure and retries with bounded exponential delay; a permanent-failure/DLQ policy needs agreement.
- `401`/`403`: invalid API key; current collector keeps the batch locally and retries with backoff.
- `429`/`5xx`/network error: transient failure; retry the same body and batch ID.

Response body is not parsed yet. Confirm duplicate status codes, error format, and whether `Retry-After` must be honored.

## Local privacy and egress proof

Raw records are stored only in local SQLite. `make_batch` builds a new object from an explicit field mapping, and `Store.enqueue` hashes and stores the exact compact JSON string. HTTP transport sends that same string. Egress records contain batch ID, collector, destination, approved/removed/redacted fields, SHA-256 payload hash, exact JSON, status, attempt count, last attempt, and safe error type. The audit API decodes field-list columns but leaves `payload_json` as the exact string.

## Frontend routes

The local collector API remains loopback-only by default and has OpenAPI at `/docs`. It does not expose raw SQLite input. `GET /collector/egress` and `GET /collector/egress/{payload_id}` provide audit metadata and the exact outgoing JSON body.
