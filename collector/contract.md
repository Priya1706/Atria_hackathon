# Collector ↔ SaaS integration contract

This contract is matched to Amit's implementation under `backend/app/`. Its endpoint, API-key header, request fields, and duplicate response were verified against the actual route/schema and automated tests in this repository.

## Request

- `POST /api/v1/ingest/telemetry`
- Header: `X-API-Key: <provisioned collector key>`
- Content type: `application/json`
- `Idempotency-Key: <batch_id>` is also sent by the collector; SaaS batch deduplication uses `batch_id` in the body.
- Development can use HTTP only on localhost/loopback. Deployed communication requires HTTPS.
- Tenant ID is never in the body. SaaS derives the tenant from the API key and verifies that `collector_id` belongs to that key.

## JSON payload (`schema_version` 1.0)

```json
{
  "schema_version": "1.0",
  "batch_id": "uuid",
  "collector_id": "collector-001",
  "timestamp": "2026-11-20T10:30:00Z",
  "metrics": [
    {
      "metric_id": "uuid",
      "source": "24-character-HMAC-pseudonym",
      "metric_name": "cpu_usage",
      "value": 78.5,
      "unit": "percent",
      "timestamp": "2026-11-20T10:29:59Z"
    }
  ]
}
```

`schema_version`, `batch_id`, `collector_id`, batch `timestamp`, and `metrics` are required. `metadata` is optional in the SaaS schema but the collector omits it. Each metric requires `metric_id` (UUID), `source`, `metric_name`, numeric `value`, `unit`, and measurement `timestamp`. No other per-metric fields are accepted by SaaS.

The metric mapping is isolated in `collector/saas_contract.py`:

| Local collector metric | SaaS name | Unit / meaning |
|---|---|---|
| `cpu_utilization` | `cpu_usage` | percent |
| `memory_utilization` | `memory_usage` | percent |
| `disk_utilization` | `disk_usage` | percent |
| `bandwidth_utilization_percent` | `bandwidth_usage` | percent of configured/observed link capacity |
| `network_latency_ms` | `network_latency` | ms |
| `packet_loss_percent` | `packet_loss` | percent |
| `connectivity` | `connectivity` | ratio, 0 or 1 |
| `service_availability` | `service_availability` | ratio, 0 through 1 |
| `failed_auth_attempts` | `failed_authentication_count` | count |
| `security_event_summary` | `security_event_count` | count |

Bandwidth input is utilization percent, not an invented throughput estimate. A real adapter must obtain it from the supplied infrastructure agent/counter and convert observed bytes per interval to utilization using known link capacity. The included simulator's 42% value is synthetic only.

## Responses and idempotency

- `200`, `status: success`: batch accepted and records processed.
- `409`, `status: duplicate`, matching `batch_id`: the same batch was already processed. This is a safe acknowledgement. Collector marks it `sent` and stops retrying.
- `409`, `status: error`: a metric ID was reused or another payload conflict occurred. This is not an acknowledgement; collector retains the batch as `failed` and retries with backoff for operator review.
- `401`/`403`: missing/invalid key or collector identity mismatch. Retained and retried; check provisioning/configuration.
- `422`: schema or validation error. Retained and retried; fix the collector contract/input.
- network errors, `429`, and `5xx`: retained and retried with the same batch ID and exact body.

Collector only accepts the duplicate response if HTTP status is 409, JSON `status` equals `duplicate`, and the response `batch_id` equals the outgoing batch ID. It does not infer success from a 409 message. Other 409 responses remain failures.

## Central processing and provisioning

The SaaS backend validates metric UUIDs and collector identity, derives tenant from `X-API-Key`, stores the batch atomically, runs health/anomaly/incident/recommendation processing, and rejects globally reused metric IDs. For local development, provision a tenant/collector/key with `python -m backend.dev_provision`; the command is disabled unless `APP_ENV` is development, dev, or test. It prints the generated key once. Store it in ignored `.env` as `SAAS_API_KEY`.

## Egress audit

The collector records the exact compact JSON before sending, along with its SHA-256, batch/collector IDs, approved/removed/redacted field names, destination, attempt count, last attempt, and safe error class. The request body sent on every retry is byte-for-byte the audited string. Raw local records, credentials, tenant identity, and original source identifiers are excluded.
