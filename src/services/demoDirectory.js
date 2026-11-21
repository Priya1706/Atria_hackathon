const healthWeight = { Excellent: 100, Good: 85, Fair: 65, Poor: 35 };

function averageResource(collectors, field) {
  const values = collectors
    .filter((collector) => collector.status === 'Online')
    .map((collector) => Number.parseFloat(String(collector[field] || '').replace('%', '')))
    .filter(Number.isFinite);
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null;
}

function tenantHealth(collectors, fallback) {
  const reported = collectors.filter((collector) => healthWeight[collector.health] !== undefined);
  if (!reported.length) return fallback;
  const score = reported.reduce((sum, collector) => sum + healthWeight[collector.health], 0) / reported.length;
  return score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 55 ? 'Fair' : 'Poor';
}

export function buildDemoTenantDirectory(tenants, collectors, incidents) {
  return tenants.map((tenant) => {
    const tenantCollectors = collectors.filter((collector) => collector.tenantId === tenant.tenantId);
    const tenantIncidents = incidents.filter((incident) => incident.tenantId === tenant.tenantId);
    const activeIncidents = tenantIncidents.filter((incident) => incident.status !== 'Resolved');
    return {
      ...tenant,
      health: tenantHealth(tenantCollectors, tenant.health),
      collectors: tenantCollectors.length,
      onlineCollectors: tenantCollectors.filter((collector) => collector.status === 'Online').length,
      activeIncidents: activeIncidents.length,
      collectorRecords: tenantCollectors,
      incidentRecords: tenantIncidents,
      monitoring: {
        cpuPercent: averageResource(tenantCollectors, 'cpuUsage'),
        memoryPercent: averageResource(tenantCollectors, 'memoryUsage'),
        diskPercent: averageResource(tenantCollectors, 'diskUsage'),
      },
      source: 'demo',
    };
  });
}
