import { fetchSaas } from './apiConfig.ts';
import { isDemoMode } from './dataMode.js';
import { mockAlerts, mockIncidents } from '../data/mockData.js';
import { uniqueByStableId } from './uniqueRecords.js';

let demoAlerts = uniqueByStableId(mockAlerts, 'Alert');
let demoIncidents = uniqueByStableId(mockIncidents, 'Incident');
let alertsRequest;
let incidentsRequest;
const statusLabel = (status) => ({ OPEN: 'Open', ACKNOWLEDGED: 'Acknowledged', RESOLVED: 'Resolved' }[status] || status);

export async function getAlerts() {
  if (isDemoMode()) {
    const data = uniqueByStableId(demoAlerts, 'Alert');
    return { success: true, data, total: data.length, source: 'demo' };
  }
  if (!alertsRequest) {
    alertsRequest = (async () => {
      const rows = await fetchSaas('/anomalies?limit=200');
      const data = uniqueByStableId(rows.map((item) => ({
        id: item.anomaly_id,
        tenantId: item.tenant_id,
        collectorId: item.collector_id,
        title: `${item.metric_name} anomaly on ${item.source}`,
        severity: item.severity,
        category: item.metric_name,
        source: item.source,
        timestamp: item.detected_at,
        status: 'Detected',
        description: item.explanation,
        observedValue: item.observed_value,
        baselineValue: item.baseline_value,
      })), 'Alert');
      return { success: true, data, total: data.length, source: 'live' };
    })();
  }
  try {
    return await alertsRequest;
  } finally {
    alertsRequest = undefined;
  }
}

export async function getIncidents() {
  if (isDemoMode()) {
    const data = uniqueByStableId(demoIncidents, 'Incident');
    return { success: true, data, total: data.length, source: 'demo' };
  }
  if (!incidentsRequest) {
    incidentsRequest = (async () => {
      const [rows, recommendations] = await Promise.all([
        fetchSaas('/incidents?limit=200'),
        fetchSaas('/recommendations?limit=200'),
      ]);
      const data = uniqueByStableId(rows.map((incident) => {
        const associated = recommendations.filter((item) => item.incident_id === incident.incident_id);
        return {
          id: incident.incident_id,
          tenantId: incident.tenant_id,
          collectorId: incident.collector_id,
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
      }), 'Incident');
      return { success: true, data, total: data.length, source: 'live' };
    })();
  }
  try {
    return await incidentsRequest;
  } finally {
    incidentsRequest = undefined;
  }
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
