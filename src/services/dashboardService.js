import { fetchSaas, liveSource } from './apiConfig.ts';
import { isDemoMode } from './dataMode.js';
import { mockDashboardData, mockCollectors, mockIncidents, mockTenants } from '../data/mockData.js';

const metricLabels = {
  cpu_usage: ['CPU usage', 'teal'],
  memory_usage: ['Memory usage', 'blue'],
  disk_usage: ['Disk utilization', 'purple'],
  network_latency: ['Network latency', 'orange'],
};

function demoResult() {
  const onlineCount = mockCollectors.filter((collector) => collector.status === 'Online').length;
  const activeIncidentCount = mockIncidents.filter((incident) => incident.status !== 'Resolved').length;
  const stats = mockDashboardData.stats.map((item) => {
    if (item.id === 'tenants') return { ...item, value: String(mockTenants.length).padStart(2, '0') };
    if (item.id === 'registered_collectors') return { ...item, value: String(mockCollectors.length).padStart(2, '0') };
    if (item.id === 'online_collectors') return { ...item, value: String(onlineCount).padStart(2, '0') };
    if (item.id === 'active_incidents') return { ...item, value: String(activeIncidentCount).padStart(2, '0') };
    return item;
  });
  return { success: true, data: { ...mockDashboardData, stats }, ...{ source: 'demo', isLive: false } };
}

export async function getDashboardData() {
  if (isDemoMode()) return demoResult();
  const [overview, health, telemetry] = await Promise.all([
    fetchSaas('/dashboard/overview'),
    fetchSaas('/health'),
    fetchSaas('/telemetry?limit=500'),
  ]);
  const sources = health.sources || [];
  const statusCounts = ['Excellent', 'Good', 'Fair', 'Poor'].map((label) => ({
    label,
    description: `${label} source health`,
    count: sources.filter((source) => source.health_status === label).length,
    color: label.toLowerCase(),
  }));
  const totalSources = Math.max(1, sources.length);
  const rows = telemetry.records || [];
  const byMetric = new Map();
  for (const row of rows) {
    const values = byMetric.get(row.metric_name) || [];
    values.push(row);
    byMetric.set(row.metric_name, values);
  }
  const performanceMetrics = Object.entries(metricLabels).flatMap(([name, [label, color]]) => {
    const values = byMetric.get(name) || [];
    if (!values.length) return [];
    const latest = values[0];
    const sourceHealth = sources.find((source) => source.source === latest.source);
    const metricHealth = sourceHealth?.contributing_metrics?.find((item) => item.metric_name === name);
    const status = metricHealth?.status || 'Unknown';
    return [{
      label,
      value: `${latest.value}${latest.unit ? ` ${latest.unit}` : ''}`,
      width: Math.max(0, Math.min(100, Number(latest.value))),
      color,
      status,
      detail: `Latest persisted sample from ${latest.source}`,
    }];
  });
  const getTrend = (name) => (byMetric.get(name) || []).slice(0, 8).reverse();
  const cpu = getTrend('cpu_usage');
  const memory = getTrend('memory_usage');
  const labels = cpu.map((row) => new Date(row.timestamp).toLocaleTimeString());
  const stat = (id, label, value, change) => ({ id, label, value: String(value), change });
  const stats = [
    stat('tenants', 'Monitored sources', overview.total_monitored_sources, 'Current tenant only'),
    stat('registered_collectors', 'Telemetry records', telemetry.total, 'Persisted SaaS records'),
    stat('online_collectors', 'Unhealthy sources', overview.unhealthy_sources, `${overview.healthy_sources} healthy`),
    stat('active_incidents', 'Active incidents', overview.active_incidents, 'Open incidents'),
  ];
  return {
    success: true,
    source: 'live',
    isLive: true,
    data: {
      stats,
      healthOverview: {
        score: overview.overall_health_score,
        overallState: overview.overall_health_status,
        distribution: statusCounts.map((item) => ({
          ...item,
          percent: Math.round((item.count / totalSources) * 100),
        })),
      },
      performanceMetrics,
      resourceTrend12h: {
        labels,
        cpuPoints: cpu.map((row) => Number(row.value)),
        memoryPoints: memory.map((row) => Number(row.value)),
      },
      lastUpdated: overview.summary,
    },
    observedAt: liveSource().observedAt,
  };
}
