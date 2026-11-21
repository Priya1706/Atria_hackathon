import { fetchCollector } from './apiConfig';
import { isDemoMode } from './dataMode';
import { PipelineStageMetric } from '../types/security';
import { MOCK_PIPELINE_STAGES } from './mockData';
import { ServiceResponse } from './egressProofService';

export const privacyPipelineService = {
  async getPipelineStages(_collectorId?: string, _eventId?: string): Promise<ServiceResponse<PipelineStageMetric[]>> {
    if (isDemoMode()) return { data: MOCK_PIPELINE_STAGES, isLive: false, source: 'offline_demo_fixture' };
    // The collector exposes egress audit fields and delivery state, but no per-stage
    // execution trace or latency endpoint. Do not synthesize stage measurements.
    await fetchCollector('/status');
    return { data: [], isLive: true, source: 'live_local_collector', error: 'Per-stage timings and execution traces are not exposed by the collector API.' };
  },
};
