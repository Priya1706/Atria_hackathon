import { API_CONFIG, fetchWithTimeout, ApiError } from './apiConfig';
import { TransmissionMonitoringStats } from '../types/security';
import { MOCK_TRANSMISSION_STATS } from './mockData';
import { ServiceResponse } from './egressProofService';

export const transmissionService = {
  async getMonitoringStats(): Promise<ServiceResponse<TransmissionMonitoringStats>> {
    const url = `${API_CONFIG.saasBaseUrl}/transmissions/summary`;
    try {
      const response = await fetchWithTimeout(url);
      if (response.ok) {
        const data = await response.json();
        return { data, isLive: true, source: 'live_saas' };
      }
      throw new ApiError(`Failed to fetch transmission stats: ${response.statusText}`, response.status);
    } catch (err: any) {
      if (API_CONFIG.allowMockFallback) {
        return {
          data: MOCK_TRANSMISSION_STATS,
          isLive: false,
          source: 'offline_demo_fixture',
          error: `Central telemetry gateway unreachable. Displaying cached buffer telemetry.`,
        };
      }
      throw err;
    }
  }
};
