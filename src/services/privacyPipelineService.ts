import { API_CONFIG, fetchWithTimeout, ApiError } from './apiConfig';
import { PipelineStageMetric } from '../types/security';
import { MOCK_PIPELINE_STAGES } from './mockData';
import { ServiceResponse } from './egressProofService';

export const privacyPipelineService = {
  async getPipelineStages(collectorId?: string, eventId?: string): Promise<ServiceResponse<PipelineStageMetric[]>> {
    const params = new URLSearchParams();
    if (collectorId) params.append('collector_id', collectorId);
    if (eventId) params.append('event_id', eventId);
    
    const url = `${API_CONFIG.saasBaseUrl}/collectors/processing-stats?${params.toString()}`;
    try {
      const response = await fetchWithTimeout(url);
      if (response.ok) {
        const data = await response.json();
        return { data, isLive: true, source: 'live_saas' };
      }
      throw new ApiError(`Failed to fetch pipeline stages: ${response.statusText}`, response.status);
    } catch (err: any) {
      if (API_CONFIG.allowMockFallback) {
        return {
          data: MOCK_PIPELINE_STAGES,
          isLive: false,
          source: 'offline_demo_fixture',
          error: `Realtime pipeline telemetry offline. Showing verified stage benchmarks.`,
        };
      }
      throw err;
    }
  }
};
