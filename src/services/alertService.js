// CICADA 2026 — Secure AIOps Observability Platform
// Alert & Incident Service Interface
// Expected API endpoints:
// GET /api/v1/alerts
// GET /api/v1/incidents
// PATCH /api/v1/alerts/{id}/status
// PATCH /api/v1/incidents/{id}/status

import { mockAlerts, mockIncidents } from "../data/mockData";

// Keep in-memory copy for interactive demo status updates
let currentAlerts = [...mockAlerts];
let currentIncidents = [...mockIncidents];

export async function getAlerts() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        data: [...currentAlerts],
        total: currentAlerts.length,
      });
    }, 120);
  });
}

export async function getIncidents() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        data: [...currentIncidents],
        total: currentIncidents.length,
      });
    }, 120);
  });
}

export async function updateAlertStatus(alertId, newStatus) {
  return new Promise((resolve) => {
    setTimeout(() => {
      currentAlerts = currentAlerts.map((a) =>
        a.id === alertId ? { ...a, status: newStatus } : a
      );
      resolve({
        success: true,
        alertId,
        newStatus,
        message: `Alert ${alertId} status updated to ${newStatus} (Local Demo State)`,
      });
    }, 90);
  });
}

export async function updateIncidentStatus(incidentId, newStatus) {
  return new Promise((resolve) => {
    setTimeout(() => {
      currentIncidents = currentIncidents.map((inc) =>
        inc.id === incidentId ? { ...inc, status: newStatus } : inc
      );
      resolve({
        success: true,
        incidentId,
        newStatus,
        message: `Incident ${incidentId} marked as ${newStatus} (Local Demo State)`,
      });
    }, 90);
  });
}
