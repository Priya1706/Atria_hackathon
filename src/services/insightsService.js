// CICADA 2026 — Secure AIOps Observability Platform
// AI Insights & Anomaly Detection Service Interface
// Expected API endpoints:
// GET /api/v1/ai/insights
// POST /api/v1/ai/insights/{id}/acknowledge
// POST /api/v1/ai/insights/{id}/feedback

import { mockAIInsights } from "../data/mockData";

let currentInsights = [...mockAIInsights];

export async function getAIInsights() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        data: [...currentInsights],
        modelEngine: "CICADA Privacy-Preserving AIOps Engine v3.2",
        evaluationTimestamp: new Date().toISOString(),
      });
    }, 150);
  });
}

export async function updateInsightStatus(id, newStatus) {
  return new Promise((resolve) => {
    setTimeout(() => {
      currentInsights = currentInsights.map((ins) =>
        ins.id === id ? { ...ins, status: newStatus } : ins
      );
      resolve({
        success: true,
        id,
        newStatus,
        message: `Insight ${id} marked as ${newStatus} (Local Demo State)`,
      });
    }, 90);
  });
}
