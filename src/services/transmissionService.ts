import { fetchCollector } from './apiConfig';
import { isDemoMode } from './dataMode';
import { MOCK_TRANSMISSION_STATS } from './mockData';

export interface LocalTransmissionStats {
  status: { saas_configured: boolean; queue: Record<string, number>; collector_id: string };
  queue: Array<{ payload_id: string; status: string; retry_attempts: number; last_error?: string | null; last_attempt_at?: string | null; next_attempt_at?: string | null; processing_timestamp: string }>;
  source: 'live' | 'demo';
}

export const transmissionService = {
  async getMonitoringStats(): Promise<LocalTransmissionStats> {
    if (isDemoMode()) return {
      status: { saas_configured: MOCK_TRANSMISSION_STATS.saas_connected, collector_id: 'demo collector', queue: { pending: MOCK_TRANSMISSION_STATS.total_pending, inflight: 0, sent: MOCK_TRANSMISSION_STATS.total_delivered, failed: MOCK_TRANSMISSION_STATS.total_failed } },
      queue: [],
      source: 'demo',
    };
    const [status, queue] = await Promise.all([
      fetchCollector<LocalTransmissionStats['status']>('/status'),
      fetchCollector<LocalTransmissionStats['queue']>('/queue'),
    ]);
    return { status, queue, source: 'live' };
  },
  async retryPending(): Promise<{ attempted: number; delivered: number; pending: number }> {
    if (isDemoMode()) throw new Error('Transmission is disabled in demo mode. Switch to live mode to contact the local collector.');
    const response = await fetchCollector<{ attempted: number; delivered: number; pending: number }>('/transmit', { method: 'POST' });
    return response;
  },
};
