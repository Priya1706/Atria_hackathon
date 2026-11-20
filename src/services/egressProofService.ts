import { API_CONFIG, fetchWithTimeout, ApiError } from './apiConfig';
import { EgressProofRecord } from '../types/security';
import { MOCK_EGRESS_RECORDS } from './mockData';

export interface ServiceResponse<T> {
  data: T;
  isLive: boolean;
  source: 'live_saas' | 'live_local_collector' | 'offline_demo_fixture';
  error?: string;
}

export const egressProofService = {
  /**
   * Fetch list of egress proof events
   */
  async getEvents(collectorId?: string): Promise<ServiceResponse<EgressProofRecord[]>> {
    const url = `${API_CONFIG.saasBaseUrl}/egress/events${collectorId ? `?collector_id=${encodeURIComponent(collectorId)}` : ''}`;
    try {
      const response = await fetchWithTimeout(url);
      if (response.ok) {
        const data = await response.json();
        return { data, isLive: true, source: 'live_saas' };
      }
      throw new ApiError(`Failed to fetch egress events: ${response.statusText}`, response.status);
    } catch (err: any) {
      if (API_CONFIG.allowMockFallback) {
        let filtered = MOCK_EGRESS_RECORDS;
        if (collectorId) {
          filtered = filtered.filter(r => r.event.collector_id === collectorId);
        }
        return {
          data: filtered,
          isLive: false,
          source: 'offline_demo_fixture',
          error: `Central SaaS API not responding (${err.message || 'offline'}). Displaying local demonstration records.`,
        };
      }
      throw err;
    }
  },

  /**
   * Fetch single egress proof by event ID
   */
  async getEventById(eventId: string): Promise<ServiceResponse<EgressProofRecord | null>> {
    const url = `${API_CONFIG.saasBaseUrl}/egress/events/${encodeURIComponent(eventId)}`;
    try {
      const response = await fetchWithTimeout(url);
      if (response.ok) {
        const data = await response.json();
        return { data, isLive: true, source: 'live_saas' };
      }
      throw new ApiError(`Event ${eventId} not found`, response.status);
    } catch (err: any) {
      if (API_CONFIG.allowMockFallback) {
        const record = MOCK_EGRESS_RECORDS.find(r => r.event.event_id === eventId) || null;
        return {
          data: record,
          isLive: false,
          source: 'offline_demo_fixture',
          error: record ? undefined : `Event ${eventId} not found in offline records`,
        };
      }
      throw err;
    }
  },

  /**
   * Local-only authorization request to inspect raw log on the local collector.
   * STRICT SECURITY ENFORCEMENT:
   * This endpoint is ONLY called against localCollectorBaseUrl (127.0.0.1:8080) and requires local token.
   * Central SaaS NEVER receives or handles this request.
   */
  async inspectLocalRawEvent(eventId: string, localAuthToken: string): Promise<{ authorized: boolean; raw?: Record<string, unknown> | string; reason?: string }> {
    if (!localAuthToken || localAuthToken.trim().length < 6) {
      return {
        authorized: false,
        reason: "Unauthorized: Invalid or missing Local Enclave Authorization Token. Plaintext secrets protected.",
      };
    }

    try {
      const response = await fetchWithTimeout(`${API_CONFIG.localCollectorBaseUrl}/raw-event/${encodeURIComponent(eventId)}`, {
        headers: {
          'X-Local-Enclave-Key': localAuthToken,
        },
      });
      if (response.ok) {
        const data = await response.json();
        return { authorized: true, raw: data.raw_payload };
      }
      return { authorized: false, reason: `Local Collector denied access (HTTP ${response.status})` };
    } catch (err: any) {
      // Local collector offline or demo mode
      const mockRecord = MOCK_EGRESS_RECORDS.find(r => r.event.event_id === eventId);
      if (mockRecord && localAuthToken === "ENCLAVE_LOCAL_ADMIN") {
        return {
          authorized: true,
          raw: mockRecord.event.raw_payload,
        };
      }
      return {
        authorized: false,
        reason: `Local Collector unreachable at ${API_CONFIG.localCollectorBaseUrl}. Enter demo passkey 'ENCLAVE_LOCAL_ADMIN' to simulate authorized on-prem inspection.`,
      };
    }
  }
};
