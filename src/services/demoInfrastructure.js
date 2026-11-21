const parsePercent = (value) => {
  const number = Number.parseFloat(String(value ?? '').replace('%', ''));
  return Number.isFinite(number) ? number : null;
};

const rangeLimit = (range, length) => {
  if (range === '1h') return Math.min(1, length);
  if (range === '6h') return Math.min(3, length);
  return length;
};

function rangeHistory(history, range) {
  return (history || []).slice(-rangeLimit(range, history?.length || 0));
}

function offsetHistory(history, currentValue, latestValue) {
  if (currentValue === null || !history?.length) return [];
  const offset = currentValue - latestValue;
  return history.map((point, index) => ({
    ...point,
    value: index === history.length - 1
      ? currentValue
      : Number(Math.max(0, Math.min(100, point.value + offset)).toFixed(1)),
  }));
}

export function getDemoInfrastructureNodes(collectors) {
  return [
    { id: 'all', name: `Fleet average (${collectors.length} simulated collectors)` },
    ...collectors.map((collector) => ({
      id: collector.id,
      name: `${collector.name} · ${collector.tenant}${collector.status === 'Offline' ? ' · Offline' : ''}`,
    })),
  ];
}

export function buildDemoInfrastructureData({ infrastructure, collectors, timeRange = '24h', nodeId = 'all' }) {
  const nodes = getDemoInfrastructureNodes(collectors);
  const collector = nodeId === 'all' ? null : collectors.find((item) => item.id === nodeId);
  if (nodeId !== 'all' && !collector) throw new Error(`Simulated collector ${nodeId} was not found.`);

  const data = {
    ...infrastructure,
    nodes,
    selectedTimeRange: timeRange,
    source: 'demo',
  };
  if (!collector) {
    data.cpu = { ...infrastructure.cpu, history: rangeHistory(infrastructure.cpu.history, timeRange) };
    data.memory = { ...infrastructure.memory, history: rangeHistory(infrastructure.memory.history, timeRange) };
    data.disk = { ...infrastructure.disk, history: rangeHistory(infrastructure.disk.history, timeRange) };
    data.network = {
      ...infrastructure.network,
      history: rangeHistory(infrastructure.network.history, timeRange),
    };
    data.recordCount = [data.cpu.history, data.memory.history, data.disk.history, data.network.history]
      .reduce((count, history) => count + history.length, 0);
    data.sourceCount = collectors.length;
    return data;
  }

  const cpuCurrent = collector.status === 'Online' ? parsePercent(collector.cpuUsage) : null;
  const memoryCurrent = collector.status === 'Online' ? parsePercent(collector.memoryUsage) : null;
  const diskCurrent = collector.status === 'Online' ? parsePercent(collector.diskUsage) : null;
  const cpuHistory = offsetHistory(infrastructure.cpu.history, cpuCurrent, infrastructure.cpu.current);
  const memoryHistory = offsetHistory(infrastructure.memory.history, memoryCurrent, infrastructure.memory.currentPercent);
  const diskHistory = offsetHistory(infrastructure.disk.history, diskCurrent, infrastructure.disk.currentPercent);
  const latency = collector.status === 'Online' ? collector.networkLatencyMs : null;
  const latencyHistory = latency === null ? [] : infrastructure.network.history.map((point, index, allPoints) => ({
    time: point.time,
    value: index === allPoints.length - 1 ? latency : Number(Math.max(1, point.latency + latency - infrastructure.network.avgLatencyMs).toFixed(1)),
    latency: index === allPoints.length - 1 ? latency : Number(Math.max(1, point.latency + latency - infrastructure.network.avgLatencyMs).toFixed(1)),
  }));
  data.selectedCollector = { id: collector.id, name: collector.name, tenant: collector.tenant, status: collector.status };
  data.cpu = {
    ...infrastructure.cpu,
    current: cpuCurrent,
    value: cpuCurrent,
    status: cpuCurrent === null ? 'Unknown' : collector.health,
    detail: cpuCurrent === null ? `${collector.name} is offline; CPU is not reported` : `${collector.name} · ${collector.tenant} · simulated collector sample`,
    history: rangeHistory(cpuHistory, timeRange),
  };
  data.memory = {
    ...infrastructure.memory,
    currentPercent: memoryCurrent,
    value: memoryCurrent,
    usedGb: memoryCurrent === null ? null : Number((infrastructure.memory.totalGb * memoryCurrent / 100).toFixed(2)),
    status: memoryCurrent === null ? 'Unknown' : collector.health,
    detail: memoryCurrent === null ? `${collector.name} is offline; memory is not reported` : `${collector.name} · ${collector.tenant} · simulated collector sample`,
    history: rangeHistory(memoryHistory, timeRange),
  };
  data.disk = {
    ...infrastructure.disk,
    currentPercent: diskCurrent,
    value: diskCurrent,
    usedTb: diskCurrent === null ? null : Number((infrastructure.disk.totalTb * diskCurrent / 100).toFixed(2)),
    status: diskCurrent === null ? 'Unknown' : collector.health,
    detail: diskCurrent === null ? `${collector.name} is offline; disk is not reported` : `${collector.name} · ${collector.tenant} · simulated collector sample`,
    history: rangeHistory(diskHistory, timeRange),
  };
  data.network = {
    ...infrastructure.network,
    avgLatencyMs: latency,
    packetLossPct: collector.status === 'Online' ? collector.packetLossPct : null,
    status: collector.status === 'Online' ? collector.health : 'Unknown',
    detail: collector.status === 'Online' ? `${collector.name} · ${collector.tenant} · simulated collector sample` : `${collector.name} is offline; network telemetry is not reported`,
    history: rangeHistory(latencyHistory, timeRange),
  };
  data.sourceCount = collector.status === 'Online' ? 1 : 0;
  data.recordCount = [data.cpu.history, data.memory.history, data.disk.history, data.network.history]
    .reduce((count, history) => count + history.length, 0);
  data.lastUpdated = collector.status === 'Online'
    ? `Simulated sample window · ${data.cpu.history[0]?.time || 'no samples'}–${data.cpu.history[data.cpu.history.length - 1]?.time || 'no samples'}`
    : `${collector.name} is offline; latest sample was ${collector.lastSeen}`;
  return data;
}
