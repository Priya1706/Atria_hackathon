import React, { useState } from 'react';
import { EgressProofPanel } from '../egress-proof/EgressProofPanel';
import { PipelineVisualization } from '../privacy-pipeline/PipelineVisualization';
import { CollectorStatusGrid } from '../collector-status/CollectorStatusGrid';
import { TransmissionMonitoringView } from '../transmission-monitoring/TransmissionMonitoringView';
import {
  ShieldCheck,
  Cpu,
  Layers,
  Send,
  Lock,
  Server,
  FileCode,
  ExternalLink,
} from 'lucide-react';

export type ActiveTab = 'egress-proof' | 'privacy-pipeline' | 'collectors' | 'transmissions' | 'all';

interface SecurityIntegrationHubProps {
  defaultTab?: ActiveTab;
  embeddedMode?: boolean; // When true, hides top branding so it fits inside Deeksha's global navigation seamlessly
}

export const SecurityIntegrationHub: React.FC<SecurityIntegrationHubProps> = ({
  defaultTab = 'egress-proof',
  embeddedMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>(defaultTab);
  const [selectedCollectorId, setSelectedCollectorId] = useState<string>('all');

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col font-sans">
      {/* Top Navbar Header (Shown unless embedded in Deeksha's shell) */}
      {!embeddedMode && (
        <header className="bg-[#111827]/90 backdrop-blur border-b border-gray-800 sticky top-0 z-50 px-6 py-3.5">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold text-white tracking-wide">
                    CICADA 2026
                  </h1>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                    Local Collector Egress Audit
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Local telemetry filtering, egress audit, and queued SaaS delivery
                </p>
              </div>
            </div>

            {/* Quick Architecture Indicators */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B0F19] border border-gray-800 text-gray-300">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Tier 1: On-Prem Enclave</span>
              </div>
              <span className="text-gray-600">&rarr;</span>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B0F19] border border-gray-800 text-gray-300">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                <span>Tier 2: Central SaaS</span>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Module Navigation Tabs */}
      <div className="bg-[#0F172A]/80 border-b border-gray-800 px-6 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 overflow-x-auto">
          <nav className="flex space-x-2 text-xs font-mono">
            <button
              onClick={() => setActiveTab('egress-proof')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition-all ${
                activeTab === 'egress-proof'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Egress Proof Panel (Priority)</span>
            </button>

            <button
              onClick={() => setActiveTab('privacy-pipeline')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition-all ${
                activeTab === 'privacy-pipeline'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Privacy Audit Evidence</span>
            </button>

            <button
              onClick={() => setActiveTab('collectors')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition-all ${
                activeTab === 'collectors'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Collector Status</span>
            </button>

            <button
              onClick={() => setActiveTab('transmissions')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition-all ${
                activeTab === 'transmissions'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>Transmission & Failures</span>
            </button>

            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition-all ${
                activeTab === 'all'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              <span>Unified Overview</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-8">
        {(activeTab === 'egress-proof' || activeTab === 'all') && (
          <section id="egress-proof-section">
            <EgressProofPanel
              initialCollectorId={selectedCollectorId}
              onCollectorChange={(colId) => setSelectedCollectorId(colId)}
            />
          </section>
        )}

        {(activeTab === 'privacy-pipeline' || activeTab === 'all') && (
          <section id="privacy-pipeline-section" className={activeTab === 'all' ? 'pt-6 border-t border-gray-800/80' : ''}>
            <PipelineVisualization collectorId={selectedCollectorId !== 'all' ? selectedCollectorId : undefined} />
          </section>
        )}

        {(activeTab === 'collectors' || activeTab === 'all') && (
          <section id="collectors-section" className={activeTab === 'all' ? 'pt-6 border-t border-gray-800/80' : ''}>
            <CollectorStatusGrid
              selectedCollectorId={selectedCollectorId}
              onSelectCollector={(colId) => setSelectedCollectorId(colId)}
            />
          </section>
        )}

        {(activeTab === 'transmissions' || activeTab === 'all') && (
          <section id="transmissions-section" className={activeTab === 'all' ? 'pt-6 border-t border-gray-800/80' : ''}>
            <TransmissionMonitoringView />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#111827] border-t border-gray-800 px-6 py-4 text-xs text-gray-500 text-center font-mono">
        <p>
          CICADA 2026 observability &bull; Local collector and SaaS API integration
        </p>
      </footer>
    </div>
  );
};
