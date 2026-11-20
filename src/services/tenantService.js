// Mock provider for tenant list/detail APIs. Replace with agreed backend contract.
import { mockCollectors, mockTenants } from "../data/mockData";

function withCollectorCounts(tenant) {
  const collectors = mockCollectors.filter((collector) => collector.tenant === tenant.name);
  return {
    ...tenant,
    collectors: collectors.length,
    onlineCollectors: collectors.filter((collector) => collector.status === "Online").length,
  };
}

export async function getTenants() {
  return { success: true, data: mockTenants.map(withCollectorCounts), source: "demo" };
}

export async function getTenantDetails(id) {
  const tenant = mockTenants.find((item) => item.id === id || item.tenantId === id);
  if (!tenant) throw new Error(`Tenant ${id} not found`);
  return { success: true, data: withCollectorCounts(tenant), source: "demo" };
}
