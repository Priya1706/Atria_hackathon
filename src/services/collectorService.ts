import { fetchCollector } from './apiConfig';
import { isDemoMode } from './dataMode';
import { CollectorHealth } from '../types/security';
import { MOCK_COLLECTORS } from './mockData';
import { ServiceResponse } from './egressProofService';

const unavailable = 'Not reported by collector API';

async function loadLocalCollector(): Promise<CollectorHealth> {
  const [status, health] = await Promise.all([
    fetchCollector<any>('/status'),
    fetchCollector<any>('/health'),
  ]);
  return {
    collector_id: status.collector_id,
    hostname: undefined,
    status: 'online',
    version: unavailable,
    last_heartbeat: health.timestamp_utc,
    heartbeat_age_seconds: 0,
    cpu_percent: Number.NaN,
    memory_percent: Number.NaN,
    enclave_active: false,
    config_version: unavailable,
    active_rules_count: Number.NaN,
    events_per_second: Number.NaN,
  };
}

export const collectorService = {
  async getCollectors(): Promise<ServiceResponse<CollectorHealth[]>> {
    if (isDemoMode()) return { data: MOCK_COLLECTORS, isLive: false, source: 'offline_demo_fixture' };
    const collector = await loadLocalCollector();
    return { data: [collector], isLive: true, source: 'live_local_collector' };
  },

  async getCollectorHealth(collectorId: string): Promise<ServiceResponse<CollectorHealth | null>> {
    if (isDemoMode()) {
      const record = MOCK_COLLECTORS.find((item) => item.collector_id === collectorId) || null;
      return { data: record, isLive: false, source: 'offline_demo_fixture' };
    }
    const collector = await loadLocalCollector();
    if (collector.collector_id !== collectorId) return { data: null, isLive: true, source: 'live_local_collector' };
    return { data: collector, isLive: true, source: 'live_local_collector' };
  },
};
