import { fetchCollector } from './apiConfig.ts';
import { isDemoMode } from './dataMode.js';
import { mockCollectors } from '../data/mockData.js';

const notReported = 'Not reported by collector API';

export async function getCollectors() {
  if (isDemoMode()) return { success: true, data: [...mockCollectors], total: mockCollectors.length, source: 'demo' };
  const [status, health, metrics] = await Promise.all([
    fetchCollector('/status'),
    fetchCollector('/health'),
    fetchCollector('/metrics'),
  ]);
  const values = Object.fromEntries((metrics || []).map((item) => [item.metric_name, item.metric_value]));
  const state = status.health?.state || 'Unknown';
  const row = {
    id: status.collector_id,
    name: 'Configured local collector',
    tenant: status.tenant_id,
    region: 'Local machine',
    status: 'Online',
    version: notReported,
    health: state,
    lastSeen: health.timestamp_utc,
    cpuUsage: values.cpu_utilization === undefined ? notReported : `${values.cpu_utilization}%`,
    memoryUsage: values.memory_utilization === undefined ? notReported : `${values.memory_utilization}%`,
    diskUsage: values.disk_utilization === undefined ? notReported : `${values.disk_utilization}%`,
    uptime: notReported,
    os: notReported,
    recentLogs: [],
    queue: status.queue,
    simulatorEnabled: status.simulator_enabled,
    saasConfigured: status.saas_configured,
  };
  return { success: true, data: [row], total: 1, source: 'live_local_collector', observedAt: health.timestamp_utc };
}

export async function getCollectorDetails(id) {
  const result = await getCollectors();
  const found = result.data.find((collector) => collector.id === id || collector.name === id);
  if (!found) throw new Error(`Collector ${id} is not available from the configured local collector API.`);
  return { success: true, data: found, source: result.source };
}
