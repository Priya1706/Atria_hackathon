// CICADA 2026 — Secure AIOps Observability Platform
// Collector Service Interface
// Expected API endpoints:
// GET /api/v1/collectors
// GET /api/v1/collectors/{id}
// POST /api/v1/collectors/{id}/restart (Admin action)

import { mockCollectors } from "../data/mockData";

export async function getCollectors() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        data: [...mockCollectors],
        total: mockCollectors.length,
        timestamp: new Date().toISOString(),
      });
    }, 140);
  });
}

export async function getCollectorDetails(id) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const found = mockCollectors.find((c) => c.id === id || c.name === id);
      if (found) {
        resolve({
          success: true,
          data: { ...found },
        });
      } else {
        reject(new Error(`Collector ${id} not found`));
      }
    }, 100);
  });
}
