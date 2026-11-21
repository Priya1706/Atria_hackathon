import { EgressProofRecord, CollectorHealth, PipelineStageMetric, TransmissionMonitoringStats } from '../types/security';

export const MOCK_EGRESS_RECORDS: EgressProofRecord[] = [
  {
    event: {
      event_id: "evt-auth-9842",
      source_id: "k8s-ingress-auth-svc",
      collector_id: "col-prod-us-east-01",
      timestamp: "2026-11-20T17:45:12.104Z",
      category: "identity_access",
      severity: "high",
      raw_available_locally: false,
      raw_unavailability_reason: "Raw payload is unavailable in demo fixtures.",
    },
    processing: {
      event_id: "evt-auth-9842",
      processed_at: "2026-11-20T17:45:12.118Z",
      received_fields: 11,
      removed_fields: 3,
      redacted_fields: 2,
      retained_fields: 6,
      approved_fields: 6,
      validation_status: "passed",
      redaction_policy_version: "2026.3-strict-nist-sp800-53",
      enclave_validated: true,
      transformations: [
        {
          field_name: "body.password",
          action: "removed",
          reason: "Secret Credential: Plaintext passwords strictly barred from egress by Zero-Trust Rule #101",
          classification: "secret",
          rule_id: "ZT-CRED-01"
        },
        {
          field_name: "body.otp_seed",
          action: "removed",
          reason: "Cryptographic Seed: Multi-factor seeds barred by Zero-Trust Rule #104",
          classification: "secret",
          rule_id: "ZT-CRED-04"
        },
        {
          field_name: "headers.Authorization",
          action: "removed",
          reason: "Authentication Token: Bearer token excluded by Rule #102",
          classification: "auth_token",
          rule_id: "ZT-AUTH-02"
        },
        {
          field_name: "source",
          redacted_value: "192.168.xxx.xxx:[EPHEMERAL]",
          action: "redacted",
          reason: "Internal IP Masking: Private subnet topology protected by Rule #201",
          classification: "internal_ip",
          rule_id: "ZT-NET-01"
        },
        {
          field_name: "body.username",
          redacted_value: "s***n@corp.internal",
          action: "redacted",
          reason: "PII Masking: Email identity partially masked per GDPR/CCPA Policy #302",
          classification: "pii",
          rule_id: "ZT-PII-02"
        },
        {
          field_name: "path",
          action: "retained",
          reason: "Operational Telemetry: Safe route identifier needed for incident clustering",
          classification: "telemetry_metric"
        },
        {
          field_name: "method",
          action: "retained",
          reason: "Operational Telemetry: HTTP verb retained",
          classification: "telemetry_metric"
        },
        {
          field_name: "internal_pod_ip",
          action: "retained",
          reason: "Sanitized Infrastructure Identifier: Anonymized namespace pod tag",
          classification: "telemetry_metric"
        },
        {
          field_name: "timestamp",
          action: "retained",
          reason: "Temporal Correlation: Canonical microsecond epoch retained",
          classification: "telemetry_metric"
        },
        {
          field_name: "headers.User-Agent",
          action: "retained",
          reason: "Client Categorization: Browser family metadata retained",
          classification: "telemetry_metric"
        },
        {
          field_name: "cluster_node",
          action: "retained",
          reason: "Capacity Attribution: Physical cluster tag retained",
          classification: "telemetry_metric"
        }
      ]
    },
    payload: {
      payload_id: "pld-egress-77210",
      original_event_id: "evt-auth-9842",
      collector_id: "col-prod-us-east-01",
      destination_endpoint: "https://saas.cicada-aiops.net/v1/telemetry/ingest",
      created_at: "2026-11-20T17:45:12.122Z",
      validation_status: "passed",
      validation_digest: "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
      size_bytes: 412,
      schema_version: "v2.6-safe-metadata",
      payload_json: {
        "event_id": "evt-auth-9842",
        "collector_id": "col-prod-us-east-01",
        "timestamp": "2026-11-20T17:45:12.104Z",
        "source_sanitized": "192.168.xxx.xxx:[EPHEMERAL]",
        "path": "/api/v2/auth/login",
        "method": "POST",
        "user_masked": "s***n@corp.internal",
        "classification": "identity_access",
        "security_verdict": "AUTHENTICATION_FAILED",
        "failure_count_window": 5,
        "egress_verification": {
          "redaction_verified": true,
          "zero_secrets_detected": true,
          "enclave_signature": "ecdsa-p256:3045022100a982f..."
        }
      }
    },
    transmission: {
      transmission_id: "tx-ack-44109",
      payload_id: "pld-egress-77210",
      event_id: "evt-auth-9842",
      collector_id: "col-prod-us-east-01",
      destination: "https://saas.cicada-aiops.net/v1/telemetry/ingest",
      status: "delivered",
      retry_count: 0,
      max_retries: 3,
      transmitted_at: "2026-11-20T17:45:12.130Z",
      acknowledged_at: "2026-11-20T17:45:12.185Z",
      latency_ms: 55,
      saas_ack_token: "ack_tok_9918237198",
      http_status_code: 200
    }
  },
  {
    event: {
      event_id: "evt-db-5501",
      source_id: "pg-order-cluster-pool",
      collector_id: "col-prod-eu-west-02",
      timestamp: "2026-11-20T17:47:03.441Z",
      category: "database_latency",
      severity: "critical",
      raw_available_locally: false,
      raw_unavailability_reason: "Raw payload is unavailable in demo fixtures.",
    },
    processing: {
      event_id: "evt-db-5501",
      processed_at: "2026-11-20T17:47:03.455Z",
      received_fields: 6,
      removed_fields: 2,
      redacted_fields: 1,
      retained_fields: 3,
      approved_fields: 3,
      validation_status: "passed",
      redaction_policy_version: "2026.3-strict-nist-sp800-53",
      enclave_validated: true,
      transformations: [
        {
          field_name: "dsn",
          action: "removed",
          reason: "Database Connection URI: Master credentials and VPC hostname removed by Rule #103",
          classification: "secret",
          rule_id: "ZT-CONN-03"
        },
        {
          field_name: "query",
          redacted_value: "SELECT * FROM orders WHERE customer_ssn = [REDACTED_SSN] AND credit_card_num = [REDACTED_PAN]",
          action: "redacted",
          reason: "PCI-DSS / PII Scrubbing: Raw SSN and Card numbers scrubbed from SQL statement",
          classification: "pii",
          rule_id: "ZT-PCI-01"
        },
        {
          field_name: "error",
          action: "retained",
          reason: "Error Taxonomy: Generic timeout message retained for root-cause diagnosis",
          classification: "telemetry_metric"
        },
        {
          field_name: "pool_exhausted",
          action: "retained",
          reason: "Resource Saturation Flag: Retained for capacity bottleneck prediction",
          classification: "telemetry_metric"
        },
        {
          field_name: "active_connections",
          action: "retained",
          reason: "Operational Metric: Connection count retained",
          classification: "telemetry_metric"
        },
        {
          field_name: "max_connections",
          action: "removed",
          reason: "Redundant static configuration metric pruned",
          classification: "telemetry_metric"
        }
      ]
    },
    payload: {
      payload_id: "pld-egress-77211",
      original_event_id: "evt-db-5501",
      collector_id: "col-prod-eu-west-02",
      destination_endpoint: "https://saas.cicada-aiops.net/v1/telemetry/ingest",
      created_at: "2026-11-20T17:47:03.460Z",
      validation_status: "passed",
      validation_digest: "sha256:d82e175f81c9a10f882365df0e7b99217c0932a1e050882e34bfb56df3d12a21",
      size_bytes: 384,
      schema_version: "v2.6-safe-metadata",
      payload_json: {
        "event_id": "evt-db-5501",
        "collector_id": "col-prod-eu-west-02",
        "timestamp": "2026-11-20T17:47:03.441Z",
        "incident_type": "DATABASE_CONNECTION_EXHAUSTION",
        "sanitized_query_pattern": "SELECT * FROM orders WHERE customer_ssn = ? AND credit_card_num = ?",
        "pool_utilization_ratio": 1.0,
        "active_connections": 100,
        "error_category": "TIMEOUT",
        "remediation_hint": "SCALE_CONNECTION_POOL_OR_RECYCLE_LEAKED_CLIENTS"
      }
    },
    transmission: {
      transmission_id: "tx-ack-44110",
      payload_id: "pld-egress-77211",
      event_id: "evt-db-5501",
      collector_id: "col-prod-eu-west-02",
      destination: "https://saas.cicada-aiops.net/v1/telemetry/ingest",
      status: "delivered",
      retry_count: 0,
      max_retries: 3,
      transmitted_at: "2026-11-20T17:47:03.465Z",
      acknowledged_at: "2026-11-20T17:47:03.518Z",
      latency_ms: 53,
      saas_ack_token: "ack_tok_9918237199",
      http_status_code: 200
    }
  },
  {
    event: {
      event_id: "evt-net-3109",
      source_id: "border-gateway-gw01",
      collector_id: "col-edge-ap-south-01",
      timestamp: "2026-11-20T17:49:22.880Z",
      category: "network_anomaly",
      severity: "medium",
      raw_available_locally: false,
      raw_unavailability_reason: "Raw payload is unavailable in demo fixtures.",
    },
    processing: {
      event_id: "evt-net-3109",
      processed_at: "2026-11-20T17:49:22.891Z",
      received_fields: 5,
      removed_fields: 1,
      redacted_fields: 1,
      retained_fields: 3,
      approved_fields: 3,
      validation_status: "passed",
      redaction_policy_version: "2026.3-strict-nist-sp800-53",
      enclave_validated: true,
      transformations: [
        {
          field_name: "raw_packet_dump_hex",
          action: "removed",
          reason: "Packet Payload Security: Raw packet payload dump removed to prevent telemetry exfiltration",
          classification: "secret",
          rule_id: "ZT-PKT-09"
        },
        {
          field_name: "peer_endpoint",
          redacted_value: "203.0.xxx.xxx:443",
          action: "redacted",
          reason: "Egress Destination Anonymization: External IP subnet obscured",
          classification: "internal_ip",
          rule_id: "ZT-NET-02"
        },
        {
          field_name: "packet_loss_percent",
          action: "retained",
          reason: "SLA Observability Metric",
          classification: "telemetry_metric"
        },
        {
          field_name: "interface",
          action: "retained",
          reason: "Interface Telemetry Tag",
          classification: "telemetry_metric"
        },
        {
          field_name: "tcp_retransmits",
          action: "retained",
          reason: "Network Quality Metric",
          classification: "telemetry_metric"
        }
      ]
    },
    payload: {
      payload_id: "pld-egress-77212",
      original_event_id: "evt-net-3109",
      collector_id: "col-edge-ap-south-01",
      destination_endpoint: "https://saas.cicada-aiops.net/v1/telemetry/ingest",
      created_at: "2026-11-20T17:49:22.894Z",
      validation_status: "passed",
      validation_digest: "sha256:1a84c98e0a12e345f91b72c91834160a67cf39171e21974100918731b9921098",
      size_bytes: 298,
      schema_version: "v2.6-safe-metadata",
      payload_json: {
        "event_id": "evt-net-3109",
        "collector_id": "col-edge-ap-south-01",
        "timestamp": "2026-11-20T17:49:22.880Z",
        "interface": "eth0",
        "packet_loss_percent": 14.2,
        "tcp_retransmits": 420,
        "target_masked": "203.0.xxx.xxx:443"
      }
    },
    transmission: {
      transmission_id: "tx-ack-44111",
      payload_id: "pld-egress-77212",
      event_id: "evt-net-3109",
      collector_id: "col-edge-ap-south-01",
      destination: "https://saas.cicada-aiops.net/v1/telemetry/ingest",
      status: "retrying",
      retry_count: 2,
      max_retries: 5,
      transmitted_at: "2026-11-20T17:49:23.010Z",
      next_retry_at: "2026-11-20T17:51:23.000Z",
      error_message: "HTTP 503 Service Unavailable: Central SaaS ingestion endpoint temporarily rate-limited; backoff active",
      http_status_code: 503
    }
  },
  {
    event: {
      event_id: "evt-pay-8199",
      source_id: "checkout-payment-api",
      collector_id: "col-prod-us-east-01",
      timestamp: "2026-11-20T17:50:41.112Z",
      category: "payment_webhook",
      severity: "high",
      raw_available_locally: false, // Simulates an event where local enclave raw storage has reached retention purge
      raw_unavailability_reason: "Raw payload is unavailable in demo fixtures.",
    },
    processing: {
      event_id: "evt-pay-8199",
      processed_at: "2026-11-20T17:50:41.120Z",
      received_fields: 9,
      removed_fields: 4,
      redacted_fields: 2,
      retained_fields: 3,
      approved_fields: 3,
      validation_status: "passed",
      redaction_policy_version: "2026.3-strict-nist-sp800-53",
      enclave_validated: true,
      transformations: [
        {
          field_name: "cvv",
          action: "removed",
          reason: "PCI-DSS Rule #3.2: Card verification value never permitted in telemetry",
          classification: "secret",
          rule_id: "ZT-PCI-04"
        },
        {
          field_name: "pin_block",
          action: "removed",
          reason: "PIN Data purged",
          classification: "secret",
          rule_id: "ZT-PCI-05"
        },
        {
          field_name: "cardholder_name",
          action: "removed",
          reason: "Cardholder identity removed",
          classification: "pii",
          rule_id: "ZT-PII-08"
        },
        {
          field_name: "billing_street_address",
          action: "removed",
          reason: "Physical address removed",
          classification: "pii",
          rule_id: "ZT-PII-09"
        },
        {
          field_name: "card_number",
          action: "redacted",
          redacted_value: "4111-XXXX-XXXX-1129",
          reason: "Primary Account Number (PAN) truncated to last 4 digits",
          classification: "pii",
          rule_id: "ZT-PCI-01"
        },
        {
          field_name: "customer_email",
          action: "redacted",
          redacted_value: "b***r@gmail.com",
          reason: "Masked consumer contact",
          classification: "pii",
          rule_id: "ZT-PII-01"
        },
        {
          field_name: "transaction_status",
          action: "retained",
          reason: "Payment gateway state: DECLINED_INSUFFICIENT_FUNDS",
          classification: "telemetry_metric"
        },
        {
          field_name: "currency",
          action: "retained",
          reason: "Monetary currency tag: USD",
          classification: "telemetry_metric"
        },
        {
          field_name: "response_latency_ms",
          action: "retained",
          reason: "Gateway round-trip duration",
          classification: "telemetry_metric"
        }
      ]
    },
    payload: {
      payload_id: "pld-egress-77213",
      original_event_id: "evt-pay-8199",
      collector_id: "col-prod-us-east-01",
      destination_endpoint: "https://saas.cicada-aiops.net/v1/telemetry/ingest",
      created_at: "2026-11-20T17:50:41.124Z",
      validation_status: "passed",
      validation_digest: "sha256:8899aabbccddeeff00112233445566778899aabbccddeeff0011223344556677",
      size_bytes: 350,
      schema_version: "v2.6-safe-metadata",
      payload_json: {
        "event_id": "evt-pay-8199",
        "collector_id": "col-prod-us-east-01",
        "timestamp": "2026-11-20T17:50:41.112Z",
        "masked_pan": "4111-XXXX-XXXX-1129",
        "transaction_status": "DECLINED_INSUFFICIENT_FUNDS",
        "currency": "USD",
        "latency_ms": 312,
        "compliance_proof": "PCI_DSS_LEVEL_1_COMPLIANT_EGRESS"
      }
    },
    transmission: {
      transmission_id: "tx-ack-44112",
      payload_id: "pld-egress-77213",
      event_id: "evt-pay-8199",
      collector_id: "col-prod-us-east-01",
      destination: "https://saas.cicada-aiops.net/v1/telemetry/ingest",
      status: "delivered",
      retry_count: 0,
      max_retries: 3,
      transmitted_at: "2026-11-20T17:50:41.130Z",
      acknowledged_at: "2026-11-20T17:50:41.172Z",
      latency_ms: 42,
      saas_ack_token: "ack_tok_9918237201",
      http_status_code: 200
    }
  }
];

export const MOCK_COLLECTORS: CollectorHealth[] = [
  {
    collector_id: "col-prod-us-east-01",
    hostname: "collector-enclave-us-east-prod-01",
    status: "online",
    version: "cicada-agent-v2.6.2",
    last_heartbeat: new Date(Date.now() - 6000).toISOString(),
    heartbeat_age_seconds: 6,
    cpu_percent: 14.8,
    memory_percent: 32.4,
    enclave_active: true,
    config_version: "cfg-2026-nov-v4",
    active_rules_count: 48,
    events_per_second: 342
  },
  {
    collector_id: "col-prod-eu-west-02",
    hostname: "collector-enclave-eu-west-prod-02",
    status: "online",
    version: "cicada-agent-v2.6.2",
    last_heartbeat: new Date(Date.now() - 14000).toISOString(),
    heartbeat_age_seconds: 14,
    cpu_percent: 22.1,
    memory_percent: 45.7,
    enclave_active: true,
    config_version: "cfg-2026-nov-v4",
    active_rules_count: 52,
    events_per_second: 512
  },
  {
    collector_id: "col-edge-ap-south-01",
    hostname: "collector-enclave-edge-bangalore-01",
    status: "degraded",
    version: "cicada-agent-v2.5.9",
    last_heartbeat: new Date(Date.now() - 48000).toISOString(),
    heartbeat_age_seconds: 48,
    cpu_percent: 78.5,
    memory_percent: 84.1,
    enclave_active: true,
    config_version: "cfg-2026-nov-v3",
    active_rules_count: 44,
    events_per_second: 89
  }
];

export const MOCK_PIPELINE_STAGES: PipelineStageMetric[] = [
  {
    stage: "COLLECT",
    status: "completed",
    timestamp: "2026-11-20T17:45:12.106Z",
    input_field_count: 11,
    output_field_count: 11,
    processing_latency_ms: 2.1,
    result_summary: "11 raw fields captured from local kernel eBPF log stream",
    details: [
      "Stream: Kubernetes ingress audit socket",
      "Format: JSON RFC-8259 validated",
      "Buffer: Local non-volatile memory ring"
    ]
  },
  {
    stage: "FILTER",
    status: "completed",
    timestamp: "2026-11-20T17:45:12.110Z",
    input_field_count: 11,
    output_field_count: 8,
    processing_latency_ms: 3.4,
    result_summary: "3 sensitive credential fields permanently stripped at local memory boundary",
    details: [
      "Zero-Trust Policy: ZT-CRED-01 purged 'body.password'",
      "Zero-Trust Policy: ZT-CRED-04 purged 'body.otp_seed'",
      "Zero-Trust Policy: ZT-AUTH-02 purged 'headers.Authorization'"
    ]
  },
  {
    stage: "REDACT",
    status: "completed",
    timestamp: "2026-11-20T17:45:12.114Z",
    input_field_count: 8,
    output_field_count: 8,
    processing_latency_ms: 4.2,
    result_summary: "2 fields masked (Internal IP address & User email identity)",
    details: [
      "Subnet Masking: 192.168.1.142 -> 192.168.xxx.xxx",
      "PII Obfuscation: sysadmin@corp.internal -> s***n@corp.internal",
      "Entropy Check: Shannon entropy verified < 3.2"
    ]
  },
  {
    stage: "AGGREGATE",
    status: "completed",
    timestamp: "2026-11-20T17:45:12.117Z",
    input_field_count: 8,
    output_field_count: 6,
    processing_latency_ms: 1.8,
    result_summary: "Synthesized operational metrics (failure window count = 5)",
    details: [
      "Sliding Window: 60-second authentication failure counter incremented",
      "Categorization: Tagged 'identity_access / AUTHENTICATION_FAILED'",
      "Enclave Correlation: Matched signature SIG-BRUTE-FORCE-ATTEMPT"
    ]
  },
  {
    stage: "APPROVE",
    status: "completed",
    timestamp: "2026-11-20T17:45:12.122Z",
    input_field_count: 6,
    output_field_count: 6,
    processing_latency_ms: 5.0,
    result_summary: "Approved metadata schema passed strict NIST SP 800-53 privacy checks",
    details: [
      "Schema Validation: Complies with v2.6-safe-metadata spec",
      "Cryptographic Attestation: Enclave signed ECDSA digest sha256:7f83b165...",
      "Egress Permission: APPROVED for SaaS ingestion"
    ]
  },
  {
    stage: "TRANSMIT",
    status: "completed",
    timestamp: "2026-11-20T17:45:12.185Z",
    input_field_count: 6,
    output_field_count: 6,
    processing_latency_ms: 55.0,
    result_summary: "Delivered to Central SaaS over mTLS. SaaS Ack Token received.",
    details: [
      "Protocol: HTTPS/2 TLS 1.3 with client certificate auth",
      "Destination: saas.cicada-aiops.net",
      "Ack: HTTP 200 with ack_tok_9918237198"
    ]
  }
];

export const MOCK_TRANSMISSION_STATS: TransmissionMonitoringStats = {
  saas_connected: true,
  last_successful_connection: new Date(Date.now() - 15000).toISOString(),
  last_successful_delivery: new Date(Date.now() - 32000).toISOString(),

  total_delivered: 148920,
  total_failed: 12,
  total_pending: 4,
  total_rejected: 2,

  active_retries: 1,
  last_retry_at: new Date(Date.now() - 45000).toISOString(),
  next_retry_at: new Date(Date.now() + 75000).toISOString(),
  retry_policy: "Exponential backoff with jitter (initial=5s, max=120s, max_attempts=5)",

  buffered_count: 18,
  buffer_capacity: 5000,
  oldest_pending_timestamp: new Date(Date.now() - 120000).toISOString(),
  buffer_health: "healthy",

  duplicate_payload_count: 4,
  duplicate_rejections: [
    {
      payload_id: "pld-egress-77102",
      detected_at: new Date(Date.now() - 180000).toISOString(),
      reason: "Idempotency collision: Payload SHA-256 hash was previously acknowledged in transmission tx-ack-43990",
      original_transmission_id: "tx-ack-43990"
    },
    {
      payload_id: "pld-egress-77085",
      detected_at: new Date(Date.now() - 420000).toISOString(),
      reason: "Replay defense: Nonce expired or already marked as processed by SaaS ingest gateway",
      original_transmission_id: "tx-ack-43971"
    }
  ]
};
