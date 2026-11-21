const healthLevels = ["Excellent", "Good", "Fair", "Poor"];
const healthWeights = { Excellent: 100, Good: 85, Fair: 65, Poor: 35 };

const percentage = (value, total) => total ? (value / total) * 100 : 0;
const padded = (value) => String(value).padStart(2, "0");

export function buildDemoDashboardData({ base, collectors, incidents, tenants, infrastructure }) {
  const onlineCount = collectors.filter((collector) => collector.status === "Online").length;
  const offlineCount = collectors.filter((collector) => collector.status === "Offline").length;
  const activeIncidents = incidents.filter((incident) => incident.status !== "Resolved");
  const openIncidents = activeIncidents.filter((incident) => incident.status === "Open").length;
  const acknowledgedIncidents = activeIncidents.filter((incident) => incident.status === "Acknowledged").length;
  const activeSeverities = ["Critical", "High", "Medium", "Low"].filter((severity) =>
    activeIncidents.some((incident) => incident.severity === severity)
  );
  const healthCounts = Object.fromEntries([
    ...healthLevels,
    "Unknown",
  ].map((level) => [level, collectors.filter((collector) => (healthWeights[collector.health] ? collector.health : "Unknown") === level).length]));
  const knownHealthTotal = healthLevels.reduce((sum, level) => sum + healthCounts[level], 0);
  const healthScore = knownHealthTotal
    ? Number((healthLevels.reduce((sum, level) => sum + healthCounts[level] * healthWeights[level], 0) / knownHealthTotal).toFixed(1))
    : null;
  const overallState = healthScore === null ? "Unknown"
    : healthScore >= 90 ? "Excellent"
      : healthScore >= 75 ? "Good"
        : healthScore >= 55 ? "Fair" : "Poor";
  const distribution = [...healthLevels, "Unknown"].map((label) => ({
    label,
    description: label === "Unknown" ? "Collector health is not reported" : `${label} simulated collector health`,
    count: healthCounts[label],
    color: label.toLowerCase(),
    percent: percentage(healthCounts[label], collectors.length),
  }));
  const metric = (label, value, color, status, detail) => ({
    label,
    value: value == null ? "No sample" : `${value}%`,
    width: value == null ? 0 : Math.max(0, Math.min(100, Number(value))),
    color,
    status: status || "Unknown",
    detail,
  });
  const cpuHistory = infrastructure.cpu.history || [];
  const memoryHistory = infrastructure.memory.history || [];
  const trendLabels = cpuHistory.map((point) => point.time);

  return {
    ...base,
    source: "demo",
    stats: [
      { id: "tenants", label: "Total tenants", value: padded(tenants.length), change: `${tenants.length} simulated organisations`, route: "/tenants" },
      { id: "registered_collectors", label: "Registered collectors", value: padded(collectors.length), change: `${onlineCount} online · ${offlineCount} offline`, route: "/collectors" },
      { id: "online_collectors", label: "Online collectors", value: padded(onlineCount), change: `${percentage(onlineCount, collectors.length)}% of registered collectors`, route: "/collectors?status=online" },
      { id: "active_incidents", label: "Active incidents", value: padded(activeIncidents.length), change: `${openIncidents} open · ${acknowledgedIncidents} acknowledged${activeSeverities.length ? ` · ${activeSeverities.join(", ")} severity` : ""}`, route: "/incidents?status=active" },
    ],
    healthOverview: {
      ...base.healthOverview,
      score: healthScore,
      overallState,
      description: "Calculated from simulated collector health records.",
      lastEvaluated: "Simulated dataset snapshot",
      distribution,
    },
    performanceMetrics: [
      metric("CPU usage", infrastructure.cpu.current, "teal", infrastructure.cpu.status, infrastructure.cpu.current == null ? "No CPU sample available" : `${infrastructure.cpu.cores} · sample from infrastructure page`),
      metric("Memory usage", infrastructure.memory.currentPercent, "blue", infrastructure.memory.status, infrastructure.memory.currentPercent == null ? "No memory sample available" : `${infrastructure.memory.usedGb} / ${infrastructure.memory.totalGb} GB used`),
      metric("Disk utilization", infrastructure.disk.currentPercent, "purple", infrastructure.disk.status, infrastructure.disk.currentPercent == null ? "No disk sample available" : `${infrastructure.disk.usedTb} / ${infrastructure.disk.totalTb} TB used`),
      { label: "Network latency", value: infrastructure.network.avgLatencyMs == null ? "No sample" : `${infrastructure.network.avgLatencyMs} ms`, width: infrastructure.network.avgLatencyMs == null ? 0 : Math.max(0, Math.min(100, infrastructure.network.avgLatencyMs)), color: "orange", status: infrastructure.network.status || "Unknown", detail: infrastructure.network.avgLatencyMs == null ? "No network latency sample available" : `${infrastructure.network.packetLossPct}% packet loss · simulated` },
    ],
    resourceTrend12h: {
      labels: trendLabels,
      cpuPoints: cpuHistory.map((point) => point.value),
      memoryPoints: memoryHistory.map((point) => point.value),
    },
    lastUpdated: `Simulated sample window · ${trendLabels[0] || "no samples"}–${trendLabels[trendLabels.length - 1] || "no samples"}`,
  };
}
