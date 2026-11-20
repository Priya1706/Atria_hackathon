import { API_CONFIG, fetchWithTimeout, ApiError } from './apiConfig';
import { CollectorHealth } from '../types/security';
import { MOCK_COLLECTORS } from './mockData';
import { ServiceResponse } from './egressProofService';

export const collectorService = {
  async getCollectors(): Promise<ServiceResponse<CollectorHealth[]>> {
    const url = `${API_CONFIG.saasBaseUrl}/collectors`;
    try {
      const response = await fetchWithTimeout(url);
      if (response.ok) {
        const data = await response.json();
        return { data, isLive: true, source: 'live_saas' };
      }
      throw new ApiError(`Failed to fetch collectors: ${response.statusText}`, response.status);
    } catch (err: any) {
      if (API_CONFIG.allowMockFallback) {
        return {
          data: MOCK_COLLECTORS,
          isLive: false,
          source: 'offline_demo_fixture',
          error: `Central SaaS API unavailable (${err.message}). Displaying local collector telemetry.`,
        };
      }
      throw err;
    }
  },

  async getCollectorHealth(collectorId: string): Promise<ServiceResponse<CollectorHealth | null>> {
    const url = `${API_CONFIG.saasBaseUrl}/collectors/${encodeURIComponent(collectorId)}/health`;
    try {
      const response = await fetchWithTimeout(url);
      if (response.ok) {
        const data = await response.json();
        return { data, isLive: true, source: 'live_saas' };
      }
      throw new ApiError(`Collector ${collectorId} not found`, response.status);
    } catch (err: any) {
      if (API_CONFIG.allowMockFallback) {
        const col = MOCK_COLLECTORS.find(c => c.collector_id === collectorId) || null;
        return {
          data: col,
          isLive: false,
          source: 'offline_demo_fixture',
        };
      }
      throw err;
    }
  }
};
