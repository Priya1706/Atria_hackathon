// CICADA 2026 — Secure AIOps Observability Platform
// Egress Proof & Privacy Audit Service Interface
// Expected API endpoints:
// GET /api/v1/egress/proof/overview
// GET /api/v1/egress/proof/sample?batchId={batchId}
// GET /api/v1/egress/transmissions

import { mockEgressProofData } from "../data/mockData";

export async function getEgressProofData() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        data: mockEgressProofData,
        timestamp: new Date().toISOString(),
      });
    }, 130);
  });
}

export async function getEgressTransmissionLogs() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        data: mockEgressProofData.transmissionLogs,
      });
    }, 100);
  });
}
