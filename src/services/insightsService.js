import { fetchSaas } from './apiConfig.ts';
import { isDemoMode } from './dataMode.js';
import { mockAIInsights } from '../data/mockData.js';

let demoInsights = [...mockAIInsights];

export async function getAIInsights() {
  if (isDemoMode()) return { success: true, data: [...demoInsights], engine: 'Demo fixtures', source: 'demo' };
  const [anomalies, incidents, recommendations] = await Promise.all([
    fetchSaas('/anomalies?limit=200'),
    fetchSaas('/incidents?limit=200'),
    fetchSaas('/recommendations?limit=200'),
  ]);
  const data = anomalies.map((anomaly) => {
    const incident = incidents.find((item) =>
      item.affected_source === anomaly.source && item.related_metrics.includes(anomaly.metric_name)
    );
    const recommendation = recommendations.find((item) => item.incident_id === incident?.incident_id);
    return {
      id: anomaly.anomaly_id,
      title: `${anomaly.metric_name} anomaly on ${anomaly.source}`,
      severity: anomaly.severity,
      component: anomaly.source,
      detectedTime: anomaly.detected_at,
      confidence: 'Statistical/rule-based evidence; not an ML probability',
      status: incident?.status || 'Detected',
      signalEvidence: [{
        name: anomaly.metric_name,
        value: `${anomaly.observed_value}${anomaly.baseline_value === null ? '' : ` (baseline ${anomaly.baseline_value})`}`,
        badge: anomaly.severity,
      }],
      reason: anomaly.explanation,
      contributingSignals: incident?.contextual_summary || 'No related incident evidence is available.',
      suggestedAction: recommendation?.suggested_action || 'Review the telemetry and incident before taking action.',
    };
  });
  return { success: true, data, engine: 'Statistical and rule-based AIOps', source: 'live' };
}

export async function updateInsightStatus(id, newStatus) {
  if (!isDemoMode()) throw new Error('The SaaS API does not provide anomaly acknowledgement or feedback routes.');
  demoInsights = demoInsights.map((item) => item.id === id ? { ...item, status: newStatus } : item);
  return { success: true, id, newStatus, source: 'demo' };
}
