// CICADA 2026 — Secure AIOps Observability Platform
// Dashboard Service Interface
// This module defines the expected contract for the Central SaaS Dashboard API.
// Once teammates deploy the backend, replace the mock resolver with `fetch('/api/v1/dashboard')`.

import { mockDashboardData, mockCollectors, mockTenants } from "../data/mockData";

export async function getDashboardData() {
  // Simulate network latency (100ms) for realistic async lifecycle
  return new Promise((resolve) => {
    setTimeout(() => {
      const onlineCount = mockCollectors.filter((collector) => collector.status === "Online").length;
      const stats = mockDashboardData.stats.map((item) => {
        if (item.id === "tenants") {
          return { ...item, value: String(mockTenants.length).padStart(2, "0"), change: "Sample tenant records", detail: "Count from the shared tenant dataset" };
        }
        if (item.id === "registered_collectors") {
          return { ...item, value: String(mockCollectors.length).padStart(2, "0"), change: "Sample collector records", detail: "Count from the shared collector dataset" };
        }
        if (item.id === "online_collectors") {
          return { ...item, value: String(onlineCount).padStart(2, "0"), change: `${((onlineCount / mockCollectors.length) * 100).toFixed(1)}% marked online`, detail: "Count from the shared collector dataset" };
        }
        return item;
      });
      resolve({
        success: true,
        data: { ...mockDashboardData, stats },
        timestamp: new Date().toISOString(),
      });
    }, 120);
  });
}
