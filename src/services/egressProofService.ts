import { fetchCollector } from './apiConfig';
import { isDemoMode } from './dataMode';
import { EgressProofRecord } from '../types/security';
import { MOCK_EGRESS_RECORDS } from './mockData';

export interface ServiceResponse<T> {
  data: T;
  isLive: boolean;
  source: 'live_saas' | 'live_local_collector' | 'offline_demo_fixture';
  error?: string;
}

type LocalEgress = {
  payload_id: string; event_ids: string[]; processing_timestamp: string;
  fields_removed: string[]; fields_redacted: string[]; approved_fields: string[];
  payload_json: string; destination: string; status: string; retry_attempts: number;
  last_error?: string | null; collector_id: string; payload_hash: string;
  last_attempt_at?: string | null; next_attempt_at?: string | null; fields_sent: string[];
};
type LocalEvent = {
  event_id: string; tenant_id: string; collector_id: string; timestamp_utc: string;
  metric_name: string; metric_value: number; category: string; severity: string;
};

const asArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
const asObject = (value: unknown) => {
  if (typeof value !== 'string') return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
};

export const egressProofService = {
  async getEvents(collectorId?: string): Promise<ServiceResponse<EgressProofRecord[]>> {
    if (isDemoMode()) {
      const data = collectorId ? MOCK_EGRESS_RECORDS.filter((record) => record.transmission.collector_id === collectorId) : MOCK_EGRESS_RECORDS;
      return { data, isLive: false, source: 'offline_demo_fixture' };
    }
    const [egress, events] = await Promise.all([
      fetchCollector<LocalEgress[]>('/egress?limit=100'),
      fetchCollector<LocalEvent[]>('/events?limit=1000'),
    ]);
    const eventById = new Map(events.map((event) => [event.event_id, event]));
    const data = egress
      .filter((row) => !collectorId || row.collector_id === collectorId)
      .map((row): EgressProofRecord => {
        const event = eventById.get(row.event_ids?.[0]);
        const fieldsRemoved = asArray(row.fields_removed);
        const fieldsRedacted = asArray(row.fields_redacted);
        const fieldsSent = asArray(row.fields_sent);
        const status = row.status === 'sent' ? 'sent' : row.status === 'failed' ? 'failed' : row.status === 'inflight' ? 'retrying' : 'pending';
        return {
          event: {
            event_id: row.event_ids?.[0] || row.payload_id,
            source_id: event?.metric_name || 'local event',
            collector_id: row.collector_id,
            timestamp: event?.timestamp_utc || row.processing_timestamp,
            category: event?.category || 'telemetry',
            severity: (event?.severity || 'info') as EgressProofRecord['event']['severity'],
            raw_available_locally: true,
            raw_unavailability_reason: 'Raw event inspection is local-only and no collector inspection API is exposed. No raw payload was requested or sent.',
          },
          processing: {
            event_id: row.event_ids?.[0] || row.payload_id,
            processed_at: row.processing_timestamp,
            received_fields: undefined,
            removed_fields: fieldsRemoved.length,
            redacted_fields: fieldsRedacted.length,
            retained_fields: fieldsSent.length,
            transformations: [
              ...fieldsRemoved.map((field) => ({ field_name: field, action: 'removed' as const, reason: 'Recorded by local collector egress audit' })),
              ...fieldsRedacted.map((field) => ({ field_name: field, action: 'redacted' as const, reason: 'Recorded by local collector egress audit' })),
              ...fieldsSent.map((field) => ({ field_name: field, action: 'retained' as const, reason: 'Included in approved telemetry payload' })),
              ...asArray(row.approved_fields).map((field) => ({ field_name: field, action: 'approved' as const, reason: 'Explicitly listed in the collector approved fields audit' })),
            ],
            approved_fields: asArray(row.approved_fields).length,
            validation_status: 'unknown',
            redaction_policy_version: 'not reported by collector API',
            enclave_validated: false,
          },
          payload: {
            payload_id: row.payload_id,
            original_event_id: row.event_ids?.[0] || row.payload_id,
            destination_endpoint: row.destination,
            created_at: row.processing_timestamp,
            collector_id: row.collector_id,
            validation_digest: row.payload_hash,
            payload_json: asObject(row.payload_json),
            validation_status: 'unknown',
            size_bytes: new TextEncoder().encode(typeof row.payload_json === 'string' ? row.payload_json : JSON.stringify(row.payload_json)).length,
            schema_version: 'not reported by collector API',
          },
          transmission: {
            transmission_id: row.payload_id,
            payload_id: row.payload_id,
            event_id: row.event_ids?.[0] || row.payload_id,
            collector_id: row.collector_id,
            destination: row.destination,
            status,
            retry_count: row.retry_attempts || 0,
            transmitted_at: row.last_attempt_at || undefined,
            error_message: row.last_error || undefined,
          },
        };
      });
    return { data, isLive: true, source: 'live_local_collector' };
  },

  async getEventById(eventId: string): Promise<ServiceResponse<EgressProofRecord | null>> {
    const result = await this.getEvents();
    return { ...result, data: result.data.find((record) => record.event.event_id === eventId || record.payload.payload_id === eventId) || null };
  },

  async inspectLocalRawEvent(_eventId: string): Promise<{ authorized: false; reason: string }> {
    return { authorized: false, reason: 'Raw event inspection is not available through the collector API. Raw data remains in the collector local store.' };
  },
};
