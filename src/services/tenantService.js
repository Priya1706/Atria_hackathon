import { fetchSaas } from './apiConfig.ts';
import { isDemoMode } from './dataMode.js';
import { mockCollectors, mockIncidents, mockTenants } from '../data/mockData.js';
import { buildDemoTenantDirectory } from './demoDirectory.js';

const demoTenants = () => buildDemoTenantDirectory(mockTenants, mockCollectors, mockIncidents);

export async function getTenants() {
  if (isDemoMode()) return { success: true, data: demoTenants(), source: 'demo' };
  const overview = await fetchSaas('/dashboard/overview');
  const health = await fetchSaas('/health');
  const sources = health.sources || [];
  const tenant = {
    id: overview.tenant_id,
    tenantId: overview.tenant_id,
    name: overview.tenant_name,
    registeredAt: 'Not exposed by backend',
    collectors: overview.total_monitored_sources,
    onlineCollectors: null,
    health: overview.overall_health_status,
    status: 'Active (tenant header accepted)',
    sourceCount: sources.length,
  };
  return { success: true, data: [tenant], source: 'live', directoryAvailable: false };
}

export async function getTenantDetails(id) {
  const result = await getTenants();
  const tenant = result.data.find((item) => item.id === id || item.tenantId === id);
  if (!tenant) throw new Error(`Tenant ${id} is not available in the current tenant context.`);
  return { success: true, data: tenant, source: result.source };
}
