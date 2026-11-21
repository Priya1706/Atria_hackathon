import { fetchSaas } from './apiConfig.ts';
import { isDemoMode } from './dataMode.js';
import { mockCollectors, mockInfrastructureData } from '../data/mockData.js';
import { buildDemoInfrastructureData, getDemoInfrastructureNodes } from './demoInfrastructure.js';

function demoResult(range, nodeId) {
  return { success: true, data: buildDemoInfrastructureData({
    infrastructure: mockInfrastructureData,
    collectors: mockCollectors,
    timeRange: range,
    nodeId,
  }), source: 'demo' };
}

export async function getInfrastructureMetrics(timeRange = '24h', nodeId = 'all') {
  if (isDemoMode()) return demoResult(timeRange, nodeId);
  const duration = ({ '1h': 1, '6h': 6, '24h': 24, '7d': 168 }[timeRange] || 24);
  const fromTime = new Date(Date.now() - duration * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({ limit: '500', from_time: fromTime });
  if (nodeId !== 'all') params.set('source', nodeId);
  const [telemetry, health] = await Promise.all([
    fetchSaas(`/telemetry?${params}`),
    fetchSaas(nodeId === 'all' ? '/health' : `/health?source=${encodeURIComponent(nodeId)}`),
  ]);
  const rows = telemetry.records || [];
  const sources = [...new Set(rows.map((row) => row.source))];
  const latest = new Map();
  for (const row of rows) {
    const key = `${row.source}:${row.metric_name}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  const latestFor = (name) => [...latest.values()].filter((row) => row.metric_name === name);
  const average = (items) => items.length ? items.reduce((sum, row) => sum + Number(row.value), 0) / items.length : null;
  const history = (name) => rows
    .filter((row) => row.metric_name === name)
    .slice(0, 8).reverse()
    .map((row) => ({ time: new Date(row.timestamp).toLocaleTimeString(), value: Number(row.value) }));
  const statusFor = (name) => {
    const rowsForMetric = latestFor(name);
    const source = health.sources?.find((item) => item.source === rowsForMetric[0]?.source);
    return source?.contributing_metrics?.find((metric) => metric.metric_name === name)?.status || 'Unknown';
  };
  const card = (name, field, suffix = '') => {
    const values = latestFor(name);
    const current = average(values);
    const latestRow = values[0];
    return {
      current: current === null ? null : Number(current.toFixed(2)),
      currentPercent: current === null ? null : Number(current.toFixed(2)),
      status: statusFor(name),
      history: history(name),
      detail: current === null
        ? 'No samples returned by the SaaS API'
        : `${values.length} source sample(s); latest ${latestRow?.timestamp}${suffix ? ` ${suffix}` : ''}`,
      usedGb: null,
      totalGb: null,
      usedTb: null,
      totalTb: null,
      [field]: current,
    };
  };
  const latencyValues = latestFor('network_latency');
  const lossValues = latestFor('packet_loss');
  const latency = average(latencyValues);
  const loss = average(lossValues);
  const data = {
    selectedTimeRange: timeRange,
    lastUpdated: new Date().toISOString(),
    nodes: [{ id: 'all', name: 'All monitored sources' }, ...sources.map((source) => ({ id: source, name: source }))],
    cpu: card('cpu_usage', 'value'),
    memory: card('memory_usage', 'value'),
    disk: card('disk_usage', 'value'),
    network: {
      avgLatencyMs: latency === null ? null : Number(latency.toFixed(2)),
      packetLossPct: loss === null ? null : Number(loss.toFixed(2)),
      incomingMbps: null,
      outgoingMbps: null,
      history: history('network_latency').map((item) => ({ ...item, in: item.value })),
    },
    sourceCount: sources.length,
    recordCount: rows.length,
    source: 'live',
  };
  return { success: true, data, source: 'live', total: telemetry.total };
}

export async function getInfrastructureNodes() {
  if (isDemoMode()) return { success: true, data: getDemoInfrastructureNodes(mockCollectors), source: 'demo' };
  const telemetry = await fetchSaas('/telemetry?limit=500');
  const sources = [...new Set((telemetry.records || []).map((row) => row.source))];
  return { success: true, data: [{ id: 'all', name: 'All monitored sources' }, ...sources.map((source) => ({ id: source, name: source }))], source: 'live' };
}
