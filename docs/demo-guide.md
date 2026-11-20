# Collector demo guide

## Start it

In PowerShell from the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m collector.main
```

Open `http://127.0.0.1:8000/docs` for interactive API documentation. SQLite stores the demo database in `collector.db`.

## Generate sample telemetry

In another PowerShell window:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:8000/collector/demo
Invoke-RestMethod http://127.0.0.1:8000/collector/status | ConvertTo-Json -Depth 6
Invoke-RestMethod http://127.0.0.1:8000/collector/metrics | ConvertTo-Json -Depth 6
```

The generated telemetry is invented and tagged `simulated`; it is not organizer-provided input.

## Show the privacy and egress proof

```powershell
$batch = Invoke-RestMethod http://127.0.0.1:8000/collector/egress
$batch | Select-Object batch_id, status, payload_hash, approved_fields, fields_removed, fields_redacted | ConvertTo-Json -Depth 6
Invoke-RestMethod "http://127.0.0.1:8000/collector/egress/$($batch[0].batch_id)" | ConvertTo-Json -Depth 8
```

The detail response includes `payload_json`. Explain that this is the same string the sender transmits and that its SHA-256 is recorded alongside it. It contains metric values and a pseudonymous source, but no tenant ID, raw log, password, or original host identifier.

## Demonstrate validation and local collection

```powershell
$body = @{
  events = @(@{
    tenant_id = 'demo-tenant'
    collector_id = 'collector-001'
    timestamp_utc = [DateTime]::UtcNow.ToString('o')
    source_timezone = 'Asia/Calcutta'
    metric_name = 'cpu_utilization'
    metric_value = 47.5
    source_identifier = 'private-host-01'
    password = 'local-only-demo-secret'
    raw_log = 'local-only demo log text'
  })
} | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Post http://127.0.0.1:8000/collector/collect -ContentType 'application/json' -Body $body
```

Then inspect `/collector/egress`; those private values should be listed as removed/redacted and should not appear inside `payload_json`.

## SaaS retry demo

The test suite uses mocked HTTP responses to exercise outage and recovery without Amit's server. For a real integration demo, first confirm the endpoint and authentication contract with Amit. Set `SAAS_INGEST_URL` to the agreed full HTTPS endpoint and `SAAS_API_KEY` in the ignored `.env`; then collect a batch and observe its queue status change from pending to sent (or failed/backoff if unavailable). Never use a real production key for a public demo.
