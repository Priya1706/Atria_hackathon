# End-to-end local demo

## Install and configure

Run from repository root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pip install -r backend/requirements.txt
Copy-Item .env.example .env
```

Provision a fresh local tenant, collector, and key:

```powershell
python -m backend.dev_provision --tenant-name 'CICADA Demo' --collector-name 'Local Collector'
```

Copy the one-time generated API key into `.env` as `SAAS_API_KEY`; set `COLLECTOR_TENANT_ID` and `COLLECTOR_ID` there to the IDs printed by the command. Keep the `.env` private and ignored.

## Start both services

Open one PowerShell window for each service.

SaaS service, port 8000:

```powershell
python -m backend.main
```

Collector, port 8001:

```powershell
python -m collector.main
```

Open `http://127.0.0.1:8000/docs` and `http://127.0.0.1:8001/docs` for OpenAPI.

## Generate, send, inspect

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:8001/collector/demo
Invoke-RestMethod http://127.0.0.1:8001/collector/status | ConvertTo-Json -Depth 6
Invoke-RestMethod http://127.0.0.1:8001/collector/egress | ConvertTo-Json -Depth 8
```

The synthetic adapter creates ten metrics including bandwidth utilization; these are demo values, not organizer telemetry. When both services are ready and `.env` has the key, the collector's background worker sends the batch to SaaS. Observe the queue record transition to `sent`.

Inspect central persistence using the tenant ID printed during provisioning:

```powershell
$headers = @{ 'X-Tenant-ID' = '<tenant id from provisioning>' }
Invoke-RestMethod http://127.0.0.1:8000/api/v1/telemetry -Headers $headers | ConvertTo-Json -Depth 8
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health -Headers $headers | ConvertTo-Json -Depth 8
Invoke-RestMethod http://127.0.0.1:8000/api/v1/anomalies -Headers $headers | ConvertTo-Json -Depth 8
```

Dashboard APIs use `X-Tenant-ID`; the telemetry ingestion endpoint instead authenticates with `X-API-Key` and derives the tenant server-side.

## Retry and idempotency

The automated E2E test simulates SaaS accepting a batch but the response being lost. The collector retries identical audited JSON; SaaS answers 409 `status: duplicate`; collector marks the matching batch `sent`. A separate case reuses a metric UUID in a new batch, receives 409 `status: error`, and remains failed. No live SaaS server is required for that test.

## Staged statistical AIOps demonstration

The simulator's named scenarios are sent through the real collector pipeline,
the normal privacy/egress allow-list, collector transport, SaaS authentication,
telemetry persistence, anomaly detection, incident correlation and recommendation
routes. Values are synthetic demonstration inputs, not production or organizer data.

Run the scenarios in order and ensure each batch is delivered before continuing:

```powershell
Invoke-RestMethod -Method Post 'http://127.0.0.1:8001/collector/demo?scenario=normal'
Start-Sleep -Seconds 2
Invoke-RestMethod -Method Post http://127.0.0.1:8001/collector/transmit

Invoke-RestMethod -Method Post 'http://127.0.0.1:8001/collector/demo?scenario=sudden_cpu'
Start-Sleep -Seconds 2
Invoke-RestMethod -Method Post http://127.0.0.1:8001/collector/transmit

Invoke-RestMethod -Method Post 'http://127.0.0.1:8001/collector/demo?scenario=compound'
Start-Sleep -Seconds 2
Invoke-RestMethod -Method Post http://127.0.0.1:8001/collector/transmit
```

Inspect incidents and recommendations using the provisioned tenant:

```powershell
$headers = @{ 'X-Tenant-ID' = '<tenant id from provisioning>' }
Invoke-RestMethod http://127.0.0.1:8000/api/v1/incidents -Headers $headers | ConvertTo-Json -Depth 10
Invoke-RestMethod http://127.0.0.1:8000/api/v1/recommendations -Headers $headers | ConvertTo-Json -Depth 10
```

Incident responses include contributing metric evidence and ranked,
rule-weighted hypotheses. Evidence scores are deterministic heuristics, not
probabilities or confirmed causes. Recovery requires every contributing metric
to remain inside its recovery range for the configured window (five minutes by
default), with at least two observations per metric and a fresh final sample.
To demonstrate this, transmit the recovery scenario once per minute for five
minutes, including the initial sample that establishes recovery:

```powershell
for ($i = 0; $i -lt 6; $i++) {
    Invoke-RestMethod -Method Post 'http://127.0.0.1:8001/collector/demo?scenario=recovery'
    Start-Sleep -Seconds 2
    Invoke-RestMethod -Method Post http://127.0.0.1:8001/collector/transmit
    if ($i -lt 5) { Start-Sleep -Seconds 60 }
}
Invoke-RestMethod http://127.0.0.1:8000/api/v1/incidents -Headers $headers | ConvertTo-Json -Depth 10
```

Only incident state changes automatically; the system does not execute
remediation. Adjust `INCIDENT_RECOVERY_WINDOW_SECONDS` in local `.env` only for
a shorter demo and disclose that setting.

## Synthetic detector evaluation

Run the deterministic offline dataset without external services or credentials:

```powershell
python -m backend.evaluate_aiops
```

It prints the dataset description, scenario-label assumptions, confusion
counts, precision, recall, F1 and false-positive rate. Results describe only
that small synthetic sequence, not production detector performance.

Run the full suite:

```powershell
python -m pytest -q
```
