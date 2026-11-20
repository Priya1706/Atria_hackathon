/**
 * CICADA 2026 — Security Observability & Egress Proof Type Definitions
 * Strict TypeScript types for Collector, Privacy Pipeline, Egress Proof, and Transmission Telemetry.
 */

export type SeverityLevel = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type DeliveryStatus = 'delivered' | 'pending' | 'failed' | 'rejected' | 'retrying';

export type ValidationStatus = 'passed' | 'failed' | 'warning' | 'pending' | 'unknown';

export type PipelineStageName = 'COLLECT' | 'FILTER' | 'REDACT' | 'AGGREGATE' | 'APPROVE' | 'TRANSMIT';

export type PipelineStageStatus = 'completed' | 'in_progress' | 'warning' | 'failed' | 'skipped' | 'unknown';

export interface FieldTransformation {
  field_name: string;
  original_value?: string; // Only populated if authorized in local mode
  redacted_value?: string;
  action: 'removed' | 'redacted' | 'retained' | 'aggregated';
  reason: string;
  rule_id?: string;
  classification?: 'secret' | 'pii' | 'auth_token' | 'internal_ip' | 'telemetry_metric';
}

export interface OriginalEvent {
  event_id: string;
  source_id: string;
  collector_id: string;
  timestamp: string;
  category: string;
  severity: SeverityLevel;
  raw_available_locally: boolean;
  local_access_authorized?: boolean;
  raw_payload?: Record<string, unknown> | string; // Local-only; NEVER sent to SaaS
  raw_unavailability_reason?: string;
}

export interface ProcessingResult {
  event_id: string;
  processed_at: string;
  received_fields: number;
  removed_fields: number;
  redacted_fields: number;
  retained_fields: number;
  approved_fields: number;
  validation_status: ValidationStatus;
  validation_errors?: string[];
  transformations: FieldTransformation[];
  redaction_policy_version: string;
  enclave_validated: boolean;
}

export interface ApprovedPayload {
  payload_id: string;
  original_event_id: string;
  collector_id: string;
  destination_endpoint: string;
  created_at: string;
  validation_status: ValidationStatus;
  validation_digest?: string; // SHA-256 hash verifying integrity of approved metadata
  payload_json: Record<string, unknown>;
  size_bytes: number;
  schema_version: string;
}

export interface TransmissionRecord {
  transmission_id: string;
  payload_id: string;
  event_id: string;
  collector_id: string;
  destination: string;
  status: DeliveryStatus;
  retry_count: number;
  max_retries: number;
  transmitted_at?: string;
  acknowledged_at?: string;
  next_retry_at?: string;
  error_message?: string;
  latency_ms?: number;
  saas_ack_token?: string;
  http_status_code?: number;
}

export interface EgressProofRecord {
  event: OriginalEvent;
  processing: ProcessingResult;
  payload: ApprovedPayload;
  transmission: TransmissionRecord;
}

export interface PipelineStageMetric {
  stage: PipelineStageName;
  status: PipelineStageStatus;
  timestamp: string;
  input_field_count: number;
  output_field_count: number;
  processing_latency_ms: number;
  result_summary: string;
  failure_reason?: string;
  details: string[];
}

export interface CollectorHealth {
  collector_id: string;
  hostname?: string;
  status: 'online' | 'degraded' | 'offline';
  version: string;
  last_heartbeat: string;
  heartbeat_age_seconds: number;
  cpu_percent: number;
  memory_percent: number;
  enclave_active: boolean;
  config_version: string;
  active_rules_count: number;
  events_per_second: number;
}

export interface TransmissionMonitoringStats {
  saas_connected: boolean;
  last_successful_connection: string;
  last_successful_delivery: string;
  connection_error?: string;
  
  // Delivery stats
  total_delivered: number;
  total_failed: number;
  total_pending: number;
  total_rejected: number;

  // Retry management
  active_retries: number;
  last_retry_at?: string;
  next_retry_at?: string;
  retry_policy: string;

  // Buffer stats
  buffered_count: number;
  buffer_capacity: number;
  oldest_pending_timestamp?: string;
  buffer_health: 'healthy' | 'warning' | 'critical';

  // Duplicate protection
  duplicate_payload_count: number;
  duplicate_rejections: Array<{
    payload_id: string;
    detected_at: string;
    reason: string;
    original_transmission_id: string;
  }>;
}
