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
  CheckCircle2,
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isLiveApi, setIsLiveApi] = useState(false);
  const [apiStatus, setApiStatus] = useState('Connecting to collector API');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const loadData = async (collector?: string) => {
    setIsRefreshing(true);
    try {
      const targetCol = collector && collector !== 'all' ? collector : undefined;
      const res = await egressProofService.getEvents(targetCol);
      setRecords(res.data);
      setIsLiveApi(res.isLive);
      setApiStatus(res.isLive ? 'Live collector API' : 'Demo fixture data');
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
      setApiStatus('Collector API unavailable');
    } finally {
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
  const totalTransmitted = records.filter((r) => r.transmission.status === 'sent' || r.transmission.status === 'delivered').length;
  const totalRemoved = records.reduce((acc, r) => acc + r.processing.removed_fields, 0);
  const totalRedacted = records.reduce((acc, r) => acc + r.processing.redacted_fields, 0);
  const totalApproved = records.reduce((acc, r) => acc + r.processing.approved_fields, 0);
  const totalRetained = records.reduce((acc, r) => acc + r.processing.retained_fields, 0);

  return (
    <div className="egress-proof-page">
      {/* TOP SECTION: Header, Collector Selector, Connectivity, Timestamp */}
      <header className="egress-header">
        <div className="egress-header-copy">
          <div className="egress-heading-line">
              <div className="egress-shield">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2>Egress Proof</h2>
                <p>Verify what the local collector filtered, approved and transmitted. Raw logs are never displayed here.</p>
              </div>
          </div>

          {/* Controls: Collector Selector & Live Status */}
          <div className="egress-controls">
            {/* Collector Picker */}
            <div className="egress-control">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-gray-400 font-mono text-[11px]">Collector:</span>
              <select
                value={selectedCollector}
                onChange={(e) => handleCollectorSelect(e.target.value)}
                aria-label="Select target collector"
                className="egress-select"
              >
                <option value="all" className="bg-[#111827]">All returned collectors</option>
                {[...new Set(records.map((record) => record.transmission.collector_id))].map((collectorId) => <option key={collectorId} value={collectorId} className="bg-[#111827]">{collectorId}</option>)}
              </select>
            </div>

            {/* Connection Status Pill */}
            <div className="egress-api-status">
              <span
                className={`w-2 h-2 rounded-full ${
                  isLiveApi ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'
                }`}
              />
              <span className="text-gray-300">
                {apiStatus}
              </span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => loadData(selectedCollector)}
              disabled={isRefreshing}
              className="egress-refresh"
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
        {errorNotice && <p className="egress-error" role="alert"><Activity size={15}/>{errorNotice}</p>}
      </header>

      {/* SUMMARY SECTION: Key Egress Metrics */}
      <div className="egress-stats">
        <div className="egress-stat">
          <div className="egress-stat-label">
            <span>Total transmitted batches</span>
            <Activity className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="egress-stat-value">{totalTransmitted}</div>
          <div className="egress-stat-detail">Accepted by collector transport</div>
        </div>

        <div className="egress-stat removed">
          <div className="egress-stat-label">
            <span>Removed fields</span>
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="egress-stat-value">{totalRemoved}</div>
          <div className="egress-stat-detail">Recorded as removed</div>
        </div>

        <div className="egress-stat redacted">
          <div className="egress-stat-label">
            <span>Redacted fields</span>
            <Lock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="egress-stat-value">{totalRedacted}</div>
          <div className="egress-stat-detail">Recorded as redacted</div>
        </div>

        <div className="egress-stat approved">
          <div className="egress-stat-label">
            <span>Approved fields</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="egress-stat-value">{totalApproved}</div>
          <div className="egress-stat-detail">Recorded by local collector</div>
        </div>

        <div className="egress-stat retained">
          <div className="egress-stat-label">
            <span>Retained fields</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="egress-stat-value">{totalRetained}</div>
          <div className="egress-stat-detail">Included in outgoing payloads</div>
        </div>
      </div>

      {/* MAIN SECTION: Side-by-Side Comparison of Selected Record */}
      {selectedRecord ? (
        <div className="egress-detail-grid">
          <OriginalEventViewer event={selectedRecord.event} />
          <ProcessingResultsViewer processing={selectedRecord.processing} />
          <div className="egress-payload-column"><ApprovedPayloadViewer payload={selectedRecord.payload} transmission={selectedRecord.transmission} /></div>
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
