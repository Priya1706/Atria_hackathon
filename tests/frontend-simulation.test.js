import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mockCollectors,
  mockDashboardData,
  mockAlerts,
  mockIncidents,
  mockInfrastructureData,
  mockTenants,
} from '../src/data/mockData.js';
import { buildDemoDashboardData } from '../src/services/dashboardDemo.js';
import { buildDemoInfrastructureData } from '../src/services/demoInfrastructure.js';
import { buildDemoTenantDirectory } from '../src/services/demoDirectory.js';
import { uniqueByStableId } from '../src/services/uniqueRecords.js';

const dashboard = () => buildDemoDashboardData({
  base: mockDashboardData,
  collectors: mockCollectors,
  incidents: mockIncidents,
  tenants: mockTenants,
  infrastructure: mockInfrastructureData,
});

test('simulated tenant and collector inventory is complete and referentially consistent', () => {
  assert.equal(mockTenants.length, 12);
  assert.equal(mockCollectors.length, 24);
  assert.equal(new Set(mockTenants.map((tenant) => tenant.id)).size, mockTenants.length);
  assert.equal(new Set(mockCollectors.map((collector) => collector.id)).size, mockCollectors.length);
  assert.equal(mockCollectors.filter((collector) => collector.status === 'Online').length, 21);
  assert.equal(mockCollectors.filter((collector) => collector.status === 'Offline').length, 3);
  assert.ok(mockCollectors.every((collector) => mockTenants.some((tenant) => tenant.name === collector.tenant)));
  assert.ok(mockCollectors.every((collector) => mockTenants.some((tenant) => tenant.tenantId === collector.tenantId)));
  assert.equal(mockAlerts.length, 8);
  assert.equal(mockIncidents.filter((incident) => incident.status !== 'Resolved').length, 3);
  for (const record of [...mockAlerts, ...mockIncidents]) {
    const tenant = mockTenants.find((item) => item.tenantId === record.tenantId);
    const collector = mockCollectors.find((item) => item.id === record.collectorId);
    assert.ok(tenant, `${record.id} has a known simulated tenant`);
    assert.ok(collector, `${record.id} has a known simulated collector`);
    assert.equal(collector.tenant, tenant.name, `${record.id} collector belongs to its tenant`);
  }
});

test('dashboard counts, health distribution, and trends derive from shared fixtures', () => {
  const data = dashboard();
  const byId = Object.fromEntries(data.stats.map((stat) => [stat.id, stat]));
  assert.equal(Number(byId.tenants.value), mockTenants.length);
  assert.equal(Number(byId.registered_collectors.value), mockCollectors.length);
  assert.equal(Number(byId.online_collectors.value), 21);
  assert.equal(Number(byId.active_incidents.value), mockIncidents.filter((incident) => incident.status !== 'Resolved').length);
  assert.equal(data.healthOverview.distribution.reduce((total, row) => total + row.count, 0), mockCollectors.length);
  assert.ok(Math.abs(data.healthOverview.distribution.reduce((total, row) => total + row.percent, 0) - 100) < 1e-9);
  assert.equal(data.healthOverview.score, 85.2);

  const infrastructureMetrics = [
    ['CPU usage', `${mockInfrastructureData.cpu.current}%`, mockInfrastructureData.cpu.status],
    ['Memory usage', `${mockInfrastructureData.memory.currentPercent}%`, mockInfrastructureData.memory.status],
    ['Disk utilization', `${mockInfrastructureData.disk.currentPercent}%`, mockInfrastructureData.disk.status],
    ['Network latency', `${mockInfrastructureData.network.avgLatencyMs} ms`, mockInfrastructureData.network.status],
  ];
  for (const [label, value, status] of infrastructureMetrics) {
    const metric = data.performanceMetrics.find((item) => item.label === label);
    assert.equal(metric.value, value);
    assert.equal(metric.status, status);
  }
  assert.deepEqual(data.resourceTrend12h.labels, mockInfrastructureData.cpu.history.map((point) => point.time));
  assert.deepEqual(data.resourceTrend12h.cpuPoints, mockInfrastructureData.cpu.history.map((point) => point.value));
  assert.deepEqual(data.resourceTrend12h.memoryPoints, mockInfrastructureData.memory.history.map((point) => point.value));
});

test('collector health rollup is derived from the collector dataset', () => {
  const health = mockInfrastructureData.fleetSummary;
  assert.equal(health.totalHosts, mockCollectors.length);
  assert.equal(health.healthyHosts, mockCollectors.filter((collector) => ['Excellent', 'Good'].includes(collector.health)).length);
  assert.equal(health.degradedHosts, mockCollectors.filter((collector) => collector.health === 'Fair').length);
  assert.equal(health.criticalHosts, mockCollectors.filter((collector) => collector.health === 'Poor').length);
});

test('infrastructure telemetry record count matches the populated sample histories', () => {
  const expectedRecords = [
    mockInfrastructureData.cpu.history,
    mockInfrastructureData.memory.history,
    mockInfrastructureData.disk.history,
    mockInfrastructureData.network.history,
  ].reduce((total, history) => total + history.length, 0);
  assert.equal(mockInfrastructureData.sourceCount, mockCollectors.length);
  assert.equal(mockInfrastructureData.recordCount, expectedRecords);
  assert.ok(expectedRecords > 0);
});

test('demo Infrastructure returns populated aggregate and collector-specific histories', () => {
  const aggregate = buildDemoInfrastructureData({ infrastructure: mockInfrastructureData, collectors: mockCollectors });
  assert.equal(aggregate.source, 'demo');
  assert.equal(aggregate.sourceCount, mockCollectors.length);
  assert.equal(aggregate.cpu.current, 42.4);
  assert.equal(aggregate.memory.currentPercent, 68);
  assert.equal(aggregate.disk.currentPercent, 54);
  assert.equal(aggregate.network.avgLatencyMs, 24.2);
  assert.equal(aggregate.cpu.history.at(-1).value, aggregate.cpu.current);
  assert.equal(aggregate.memory.history.at(-1).value, aggregate.memory.currentPercent);
  assert.equal(aggregate.disk.history.at(-1).value, aggregate.disk.currentPercent);
  assert.equal(aggregate.network.history.at(-1).latency, aggregate.network.avgLatencyMs);
  assert.ok(aggregate.cpu.history.length >= 5 && aggregate.memory.history.length >= 5);
  assert.ok(aggregate.disk.history.length >= 5 && aggregate.network.history.length >= 5);

  const collector = mockCollectors.find((item) => item.status === 'Online');
  const selected = buildDemoInfrastructureData({ infrastructure: mockInfrastructureData, collectors: mockCollectors, nodeId: collector.id });
  assert.equal(selected.selectedCollector.id, collector.id);
  assert.equal(selected.selectedCollector.tenant, collector.tenant);
  assert.equal(selected.cpu.current, Number.parseFloat(collector.cpuUsage));
  assert.equal(selected.cpu.history.at(-1).value, selected.cpu.current);
  assert.equal(selected.network.avgLatencyMs, collector.networkLatencyMs);
  assert.equal(selected.network.history.at(-1).latency, selected.network.avgLatencyMs);
  assert.equal(selected.sourceCount, 1);

  const offline = mockCollectors.find((item) => item.status === 'Offline');
  const offlineResult = buildDemoInfrastructureData({ infrastructure: mockInfrastructureData, collectors: mockCollectors, nodeId: offline.id });
  assert.equal(offlineResult.selectedCollector.status, 'Offline');
  assert.equal(offlineResult.cpu.current, null);
  assert.deepEqual(offlineResult.cpu.history, []);
  assert.deepEqual(buildDemoInfrastructureData({ infrastructure: mockInfrastructureData, collectors: mockCollectors, timeRange: '1h' }).cpu.history.length, 1);
});

test('demo tenant directory and detail projections include matching collectors and active incidents', () => {
  const tenants = buildDemoTenantDirectory(mockTenants, mockCollectors, mockIncidents);
  assert.equal(tenants.length, 12);
  assert.equal(tenants.reduce((count, tenant) => count + tenant.collectors, 0), 24);
  assert.equal(tenants.reduce((count, tenant) => count + tenant.onlineCollectors, 0), 21);
  assert.equal(tenants.reduce((count, tenant) => count + tenant.activeIncidents, 0), 3);
  for (const tenant of tenants) {
    assert.ok(tenant.collectorRecords.every((collector) => collector.tenantId === tenant.tenantId));
    assert.ok(tenant.incidentRecords.every((incident) => incident.tenantId === tenant.tenantId));
  }
});

test('stable ID deduplication removes repeated API rows without collapsing similar alerts', () => {
  const rows = [
    { id: 'ALT-1', title: 'Memory high' },
    { id: 'ALT-1', title: 'Memory high, updated' },
    { id: 'ALT-2', title: 'Memory high' },
  ];
  const unique = uniqueByStableId(rows, 'Alert');
  assert.deepEqual(unique.map((row) => row.id), ['ALT-1', 'ALT-2']);
  assert.equal(unique[0].title, 'Memory high');
  assert.throws(() => uniqueByStableId([{ title: 'missing ID' }], 'Alert'), /stable ID/);
});

test('empty simulation inputs produce zero counts and explicit missing metric values', () => {
  const infrastructure = {
    cpu: { current: null, status: 'Unknown', history: [] },
    memory: { currentPercent: null, status: 'Unknown', history: [] },
    disk: { currentPercent: null, status: 'Unknown', history: [] },
    network: { avgLatencyMs: null, packetLossPct: null, status: 'Unknown', history: [] },
  };
  const data = buildDemoDashboardData({
    base: mockDashboardData,
    collectors: [],
    incidents: [],
    tenants: [],
    infrastructure,
  });
  assert.ok(data.stats.every((stat) => Number(stat.value) === 0));
  assert.equal(data.healthOverview.score, null);
  assert.equal(data.healthOverview.overallState, 'Unknown');
  assert.ok(data.performanceMetrics.every((metric) => metric.value === 'No sample'));
  assert.deepEqual(data.resourceTrend12h.labels, []);
  assert.deepEqual(data.resourceTrend12h.cpuPoints, []);
  assert.deepEqual(data.resourceTrend12h.memoryPoints, []);
});
