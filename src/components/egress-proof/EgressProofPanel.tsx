import React, { useState, useEffect } from 'react';
import { EgressProofRecord } from '../../types/security';
import { egressProofService } from '../../services/egressProofService';
import { OriginalEventViewer } from './OriginalEventViewer';
import { ProcessingResultsViewer } from './ProcessingResultsViewer';
import { ApprovedPayloadViewer } from './ApprovedPayloadViewer';
import { TransmissionHistoryTable } from './TransmissionHistoryTable';
import {
  ShieldCheck,
  Server,
  Activity,
  Trash2,
  Lock,
  Send,
  CheckCircle2,
  XCircle,
  RotateCw,
  AlertTriangle,
} from 'lucide-react';

interface EgressProofPanelProps {
  initialCollectorId?: string;
  onCollectorChange?: (collectorId: string) => void;
}

export const EgressProofPanel: React.FC<EgressProofPanelProps> = ({
  initialCollectorId,
  onCollectorChange,
}) => {
  const [records, setRecords] = useState<EgressProofRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<EgressProofRecord | null>(null);
  const [selectedCollector, setSelectedCollector] = useState<string>(initialCollectorId || 'all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isLiveApi, setIsLiveApi] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const loadData = async (collector?: string) => {
    setIsRefreshing(true);
    try {
      const targetCol = collector && collector !== 'all' ? collector : undefined;
      const res = await egressProofService.getEvents(targetCol);
      setRecords(res.data);
      setIsLiveApi(res.isLive);
      setErrorNotice(res.error || null);

      // Select first record by default or retain current selection
      if (res.data.length > 0) {
        if (!selectedRecord || !res.data.some((r) => r.event.event_id === selectedRecord.event.event_id)) {
          setSelectedRecord(res.data[0]);
        }
      }
      setLastUpdated(new Date());
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to communicate with egress service');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(selectedCollector);
  }, [selectedCollector]);

  const handleCollectorSelect = (colId: string) => {
    setSelectedCollector(colId);
    if (onCollectorChange) onCollectorChange(colId);
  };

  // Compute live summary statistics across current records
  const totalEvents = records.length;
  const totalRemoved = records.reduce((acc, r) => acc + r.processing.removed_fields, 0);
  const totalRedacted = records.reduce((acc, r) => acc + r.processing.redacted_fields, 0);
  const totalApproved = records.filter((r) => r.payload.validation_status === 'passed').length;
  const totalDelivered = records.filter((r) => r.transmission.status === 'delivered').length;
  const totalFailed = records.filter((r) => r.transmission.status === 'failed' || r.transmission.status === 'rejected').length;

  return (
    <div className="space-y-6">
      {/* TOP SECTION: Header, Collector Selector, Connectivity, Timestamp */}
      <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-3">
                  <span>Egress Proof Panel</span>
                  <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    NIST SP 800-53 Zero-Trust
                  </span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Interactive cryptographic audit proving that customer raw secrets never leave the local enclave
                </p>
              </div>
            </div>
          </div>

          {/* Controls: Collector Selector & Live Status */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Collector Picker */}
            <div className="flex items-center gap-2 bg-[#0B0F19] px-3 py-1.5 rounded-lg border border-gray-700">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-gray-400 font-mono text-[11px]">Collector:</span>
              <select
                value={selectedCollector}
                onChange={(e) => handleCollectorSelect(e.target.value)}
                aria-label="Select target collector"
                className="bg-transparent text-gray-200 font-mono focus:outline-none cursor-pointer text-xs"
              >
                <option value="all" className="bg-[#111827]">All Enclaves (Global)</option>
                <option value="col-prod-us-east-01" className="bg-[#111827]">col-prod-us-east-01 (US East)</option>
                <option value="col-prod-eu-west-02" className="bg-[#111827]">col-prod-eu-west-02 (EU West)</option>
                <option value="col-edge-ap-south-01" className="bg-[#111827]">col-edge-ap-south-01 (AP South Edge)</option>
              </select>
            </div>

            {/* Connection Status Pill */}
            <div className="flex items-center gap-2 bg-[#0B0F19] px-3 py-1.5 rounded-lg border border-gray-700 font-mono text-[11px]">
              <span
                className={`w-2 h-2 rounded-full ${
                  isLiveApi ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'
                }`}
              />
              <span className="text-gray-300">
                {isLiveApi ? 'Live SaaS API' : 'Enclave Verified Mode'}
              </span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => loadData(selectedCollector)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors"
              title="Refresh Egress Records"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="text-[11px] font-mono">
                {lastUpdated.toLocaleTimeString()}
              </span>
            </button>
          </div>
        </div>

        {/* Notice Banner if offline fallback active */}
        {errorNotice && (
          <div className="mt-4 p-2.5 bg-cyan-950/20 border border-cyan-800/40 rounded-lg flex items-center justify-between text-xs text-cyan-300">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{errorNotice}</span>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
              Self-Contained Mode Active
            </span>
          </div>
        )}
      </div>

      {/* SUMMARY SECTION: Key Egress Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider">Events Processed</span>
            <Activity className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-gray-100 font-mono">{totalEvents}</div>
          <div className="text-[10px] text-gray-500 font-mono mt-0.5">Local Log Sources</div>
        </div>

        <div className="bg-[#111827] border border-rose-900/30 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider">Fields Removed</span>
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-rose-400 font-mono">{totalRemoved}</div>
          <div className="text-[10px] text-rose-400/70 font-mono mt-0.5">Secrets Dropped</div>
        </div>

        <div className="bg-[#111827] border border-amber-900/30 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-amber-400 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider">Fields Redacted</span>
            <Lock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-400 font-mono">{totalRedacted}</div>
          <div className="text-[10px] text-amber-400/70 font-mono mt-0.5">PII & IP Obfuscated</div>
        </div>

        <div className="bg-[#111827] border border-emerald-900/30 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider">Approved Payloads</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 font-mono">{totalApproved}</div>
          <div className="text-[10px] text-emerald-400/70 font-mono mt-0.5">Passed Privacy Schema</div>
        </div>

        <div className="bg-[#111827] border border-emerald-900/30 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider">Delivered SaaS</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 font-mono">{totalDelivered}</div>
          <div className="text-[10px] text-emerald-400/70 font-mono mt-0.5">Ack Tokens Confirmed</div>
        </div>

        <div className="bg-[#111827] border border-gray-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider">Failed / Rejected</span>
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-gray-200 font-mono">{totalFailed}</div>
          <div className="text-[10px] text-gray-500 font-mono mt-0.5">Egress Failures</div>
        </div>
      </div>

      {/* MAIN SECTION: Side-by-Side Comparison of Selected Record */}
      {selectedRecord ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Column: Original Event View + Processing Results */}
          <div className="space-y-6">
            <OriginalEventViewer event={selectedRecord.event} />
            <ProcessingResultsViewer processing={selectedRecord.processing} />
          </div>

          {/* Right Column: Approved Outgoing Payload + Transmission Metadata */}
          <div className="space-y-6">
            <ApprovedPayloadViewer
              payload={selectedRecord.payload}
              transmission={selectedRecord.transmission}
            />
          </div>
        </div>
      ) : (
        <div className="p-12 text-center bg-[#111827] border border-gray-800 rounded-xl text-gray-400">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="font-semibold text-gray-200">No Egress Records Available</p>
          <p className="text-xs text-gray-500 mt-1">Select a different collector or send a test event from the local collector.</p>
        </div>
      )}

      {/* AUDIT HISTORY TABLE SECTION */}
      <TransmissionHistoryTable
        records={records}
        selectedEventId={selectedRecord?.event.event_id}
        onSelectRecord={(rec) => setSelectedRecord(rec)}
        onRefresh={() => loadData(selectedCollector)}
        isRefreshing={isRefreshing}
      />
    </div>
  );
};
