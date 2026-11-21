import { fetchSaas } from './apiConfig.ts';
import { isDemoMode } from './dataMode.js';
import { mockAlerts, mockIncidents } from '../data/mockData.js';

let demoAlerts = [...mockAlerts];
let demoIncidents = [...mockIncidents];
const statusLabel = (status) => ({ OPEN: 'Open', ACKNOWLEDGED: 'Acknowledged', RESOLVED: 'Resolved' }[status] || status);

export async function getAlerts() {
  if (isDemoMode()) return { success: true, data: [...demoAlerts], total: demoAlerts.length, source: 'demo' };
  const rows = await fetchSaas('/anomalies?limit=200');
  const data = rows.map((item) => ({
    id: item.anomaly_id,
    title: `${item.metric_name} anomaly on ${item.source}`,
    severity: item.severity,
    category: item.metric_name,
    source: item.source,
    timestamp: item.detected_at,
    status: 'Detected',
    description: item.explanation,
    observedValue: item.observed_value,
    baselineValue: item.baseline_value,
  }));
  return { success: true, data, total: data.length, source: 'live' };
}

export async function getIncidents() {
  if (isDemoMode()) return { success: true, data: [...demoIncidents], total: demoIncidents.length, source: 'demo' };
  const [rows, recommendations] = await Promise.all([
    fetchSaas('/incidents?limit=200'),
    fetchSaas('/recommendations?limit=200'),
  ]);
  const data = rows.map((incident) => {
    const associated = recommendations.filter((item) => item.incident_id === incident.incident_id);
    return {
      id: incident.incident_id,
      title: incident.title,
      severity: incident.severity,
      category: incident.related_metrics.join(', '),
      affectedComponents: incident.related_metrics,
      source: incident.affected_source,
      time: incident.last_updated_at,
      timestamp: incident.last_updated_at,
      status: statusLabel(incident.status),
      description: incident.contextual_summary || incident.description,
      possibleCause: incident.root_cause_hypotheses?.map((item) =>
        `${item.hypothesis}: ${item.score_meaning} ${item.supporting_evidence?.join(' ')}`
      ).join('\n') || 'No rule hypothesis is available for this incident.',
      recommendedInvestigation: associated.map((item) => item.explanation).join('\n\n') || 'No recommendation is available.',
      lifecycleStage: incident.lifecycle_stage,
      lifecycleEvents: incident.lifecycle_events,
      recommendations: associated,
    };
  });
  return { success: true, data, total: data.length, source: 'live' };
}

export async function updateAlertStatus() {
  if (!isDemoMode()) throw new Error('The SaaS API does not provide an alert status endpoint. Anomalies are read-only.');
  return { success: true, message: 'Sample alert status updated in demo mode.' };
}

export async function updateIncidentStatus(incidentId, newStatus) {
  if (isDemoMode()) {
    demoIncidents = demoIncidents.map((item) => item.id === incidentId ? { ...item, status: newStatus } : item);
    return { success: true, incidentId, newStatus, source: 'demo' };
  }
  const result = await fetchSaas(`/incidents/${encodeURIComponent(incidentId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus.toUpperCase() }),
  });
  return { success: true, data: result, incidentId, newStatus, source: 'live' };
}
