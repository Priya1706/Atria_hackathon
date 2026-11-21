import { egressProofService } from './egressProofService.ts';

// Compatibility adapter for the legacy JS service surface. Data remains local to
// the collector; no SaaS egress proof endpoint exists in the backend API.
export async function getEgressProofData() {
  const response = await egressProofService.getEvents();
  return { success: true, data: response.data, source: response.source };
}

export async function getEgressTransmissionLogs() {
  const response = await egressProofService.getEvents();
  return { success: true, data: response.data.map((record) => record.transmission), source: response.source };
}
