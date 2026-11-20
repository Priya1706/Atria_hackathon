# CICADA 2026 — FRONTEND INTEGRATION GUIDE FOR DEEKSHA

**To:** Deeksha (Frontend Lead)  
**From:** Senior Frontend Development Engineer & Security UI Architect  
**Branch:** `frontend/integration`  
**Purpose:** Instructions for integrating the Security Visualization, Egress Proof, Privacy Pipeline, and Collector modules into the main CICADA application layout.

---

## 1. OVERVIEW OF MODULES

All security visualization components have been designed as **isolated, modular, zero-side-effect React components**. They do not modify your global theme or interfere with your navigation.

You have two integration choices:
- **Option A (One-Line Embed):** Embed the unified `SecurityIntegrationHub` directly into your router under a route like `/security` or `/egress-proof`.
- **Option B (Modular Embed):** Mount individual components (`EgressProofPanel`, `PipelineVisualization`, `CollectorStatusGrid`, `TransmissionMonitoringView`) into your own custom pages.

---

## 2. OPTION A: ONE-LINE ROUTER INTEGRATION

If you are using React Router, Next.js, or tab-based routing:

```tsx
import { SecurityIntegrationHub } from './components/dashboard/IntegrationDashboard';

// Inside your router / layout:
<Route 
  path="/security/egress-proof" 
  element={<SecurityIntegrationHub embeddedMode={true} defaultTab="egress-proof" />} 
/>
```

### Props for `SecurityIntegrationHub`:
| Prop | Type | Default | Description |
|---|---|---|---|
| `embeddedMode` | `boolean` | `false` | When `true`, hides the top standalone header bar so it blends seamlessly under your existing global navigation bar. |
| `defaultTab` | `'egress-proof' \| 'privacy-pipeline' \| 'collectors' \| 'transmissions' \| 'all'` | `'egress-proof'` | Selects the initial tab to open. |

---

## 3. OPTION B: MODULAR COMPONENT INTEGRATION

If you want to place components in different sections of your dashboard:

### 3.1 Egress Proof Panel (Priority Hackathon Feature)
The Egress Proof Panel provides judges with proof that raw customer logs stay on-prem while only approved metadata is transmitted:

```tsx
import { EgressProofPanel } from './components/egress-proof/EgressProofPanel';

export function SecurityAuditPage() {
  return (
    <div className="p-6">
      <EgressProofPanel 
        initialCollectorId="col-prod-us-east-01" // Optional filter
        onCollectorChange={(colId) => console.log('Collector changed:', colId)}
      />
    </div>
  );
}
```

### 3.2 Data Privacy Pipeline Visualization
Displays the 6-stage enclave pipeline (`COLLECT` &rarr; `FILTER` &rarr; `REDACT` &rarr; `AGGREGATE` &rarr; `APPROVE` &rarr; `TRANSMIT`):

```tsx
import { PipelineVisualization } from './components/privacy-pipeline/PipelineVisualization';

<PipelineVisualization collectorId="col-prod-us-east-01" />
```

### 3.3 Collector Fleet Status Grid
Displays real-time collector cards with heartbeat monitoring and CPU/Memory gauges:

```tsx
import { CollectorStatusGrid } from './components/collector-status/CollectorStatusGrid';

<CollectorStatusGrid 
  selectedCollectorId={selectedCollector}
  onSelectCollector={(colId) => setSelectedCollector(colId)}
/>
```

### 3.4 Transmission & Failure Monitoring
Displays mTLS transmission status, queue buffer health, exponential retry backoff, and duplicate rejection audit:

```tsx
import { TransmissionMonitoringView } from './components/transmission-monitoring/TransmissionMonitoringView';

<TransmissionMonitoringView />
```

---

## 4. DESIGN TOKENS & STYLING CONVENTIONS

All components adhere to dark-mode-first cyber-observability design:
- Background: `#0B0F19` (main background), `#111827` (card background), `#0F172A` (surface)
- Border: `#374151` / `rgba(55, 65, 81, 0.6)`
- Status Colors:
  - Validated / Success: `#10B981` (Emerald)
  - Pending / Masked: `#F59E0B` (Amber)
  - Dropped / Danger: `#EF4444` (Rose)
  - Telemetry / Informational: `#3B82F6` (Blue) / `#06B6D4` (Cyan)
- Typography: Inter for UI text, JetBrains Mono for hashes, identifiers, and JSON telemetry.

---

## 5. API CONFIGURATION & MOCK FALLBACK

Components connect via the typed service layer in `src/services/`.
- If the backend is running, it will automatically consume live endpoints configured in `.env`:
  ```bash
  VITE_SAAS_API_BASE_URL=https://saas.cicada-aiops.net/api
  VITE_LOCAL_COLLECTOR_URL=http://127.0.0.1:8080/api/local
  ```
- If the backend is offline or unreachable during early judging, `allowMockFallback: true` seamlessly displays realistic NIST-compliant demonstration records, clearly labeled so judges can test every feature without any UI crashes.
