// CICADA 2026 — Secure AIOps Observability Platform
// Infrastructure Service Interface
// Expected API endpoints:
// GET /api/v1/infrastructure/metrics?range={timeRange}&node={nodeId}
// GET /api/v1/infrastructure/nodes

import { mockInfrastructureData } from "../data/mockData";

export async function getInfrastructureMetrics(timeRange = "24h", nodeId = "all") {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulate slight variation based on selected time range
      const base = { ...mockInfrastructureData, selectedTimeRange: timeRange };
      resolve({
        success: true,
        data: base,
        nodeId,
        timestamp: new Date().toISOString(),
      });
    }, 150);
  });
}

export async function getInfrastructureNodes() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        data: mockInfrastructureData.nodes,
      });
    }, 80);
  });
}
