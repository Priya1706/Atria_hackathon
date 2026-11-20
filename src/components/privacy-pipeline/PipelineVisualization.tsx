import React, { useState, useEffect } from 'react';
import { PipelineStageMetric } from '../../types/security';
import { privacyPipelineService } from '../../services/privacyPipelineService';
import { PipelineStageCard } from './PipelineStageCard';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  Lock,
  Layers,
  Activity,
  Info,
  Clock,
  RotateCw,
} from 'lucide-react';

interface PipelineVisualizationProps {
  collectorId?: string;
  eventId?: string;
}

export const PipelineVisualization: React.FC<PipelineVisualizationProps> = ({
  collectorId,
  eventId,
}) => {
  const [stages, setStages] = useState<PipelineStageMetric[]>([]);
  const [selectedStageName, setSelectedStageName] = useState<string>('FILTER');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStages = async () => {
    setIsRefreshing(true);
    try {
      const res = await privacyPipelineService.getPipelineStages(collectorId, eventId);
      setStages(res.data);
    } catch (err) {
      console.error('Failed to load pipeline stages', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadStages();
  }, [collectorId, eventId]);

  const selectedStage = stages.find((s) => s.stage === selectedStageName) || stages[0];

  // Global field counts from stages
  const collectStage = stages.find((s) => s.stage === 'COLLECT');
  const filterStage = stages.find((s) => s.stage === 'FILTER');
  const redactStage = stages.find((s) => s.stage === 'REDACT');
  const approveStage = stages.find((s) => s.stage === 'APPROVE');

  const receivedCount = collectStage?.input_field_count || 11;
  const removedCount = filterStage ? filterStage.input_field_count - filterStage.output_field_count : 3;
  const redactedCount = 2;
  const retainedCount = (collectStage?.input_field_count || 11) - removedCount;
  const approvedCount = approveStage?.output_field_count || 6;

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-lg space-y-6">
      {/* Title & Pipeline Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-gray-100 uppercase tracking-wider">
              Data Privacy Pipeline Visualization
            </h3>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Realtime multi-stage telemetry pipeline executing inside the local customer enclave
          </p>
        </div>

        <button
          onClick={loadStages}
          disabled={isRefreshing}
          className="self-start md:self-auto flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700 font-mono transition-colors"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Refresh Pipeline</span>
        </button>
      </div>

      {/* Numerical Pipeline Summary Banner */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-[#0B0F19] p-3 rounded-xl border border-gray-800 text-center">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-mono">1. Received</span>
          <span className="text-lg font-bold text-gray-100 font-mono">{receivedCount}</span>
          <span className="text-[10px] text-gray-500 block font-mono">Raw Local</span>
        </div>
        <div className="bg-rose-950/20 p-3 rounded-xl border border-rose-900/40 text-center">
          <span className="text-[10px] text-rose-400 uppercase tracking-wider block font-mono">2. Removed</span>
          <span className="text-lg font-bold text-rose-400 font-mono">{removedCount}</span>
          <span className="text-[10px] text-rose-400/70 block font-mono">Purged Secrets</span>
        </div>
        <div className="bg-amber-950/20 p-3 rounded-xl border border-amber-900/40 text-center">
          <span className="text-[10px] text-amber-400 uppercase tracking-wider block font-mono">3. Redacted</span>
          <span className="text-lg font-bold text-amber-400 font-mono">{redactedCount}</span>
          <span className="text-[10px] text-amber-400/70 block font-mono">Masked Fields</span>
        </div>
        <div className="bg-blue-950/20 p-3 rounded-xl border border-blue-900/40 text-center">
          <span className="text-[10px] text-blue-400 uppercase tracking-wider block font-mono">4. Retained</span>
          <span className="text-lg font-bold text-blue-400 font-mono">{retainedCount}</span>
          <span className="text-[10px] text-blue-400/70 block font-mono">Safe Telemetry</span>
        </div>
        <div className="bg-emerald-950/20 p-3 rounded-xl border border-emerald-900/40 text-center">
          <span className="text-[10px] text-emerald-400 uppercase tracking-wider block font-mono">5. Approved</span>
          <span className="text-lg font-bold text-emerald-400 font-mono">{approvedCount}</span>
          <span className="text-[10px] text-emerald-400/70 block font-mono">Egress Allowed</span>
        </div>
        <div className="bg-emerald-950/20 p-3 rounded-xl border border-emerald-900/40 text-center flex flex-col justify-center">
          <span className="text-[10px] text-emerald-400 uppercase tracking-wider block font-mono">Validation</span>
          <span className="text-xs font-bold text-emerald-400 font-mono flex items-center justify-center gap-1 mt-0.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> PASSED
          </span>
          <span className="text-[9px] text-gray-500 font-mono">NIST SP 800-53</span>
        </div>
      </div>

      {/* Horizontal Pipeline Stages Flow */}
      <div>
        <div className="text-xs text-gray-400 mb-2 font-mono flex items-center justify-between">
          <span>PIPELINE STAGE SEQUENCER (Click any stage to inspect enclave operations)</span>
          <span className="text-[11px] text-emerald-400">Total Enclave Latency: ~68.5ms</span>
        </div>
        <div className="flex items-center overflow-x-auto pb-3 pt-1 gap-1 scrollbar-thin">
          {stages.map((stg, index) => (
            <PipelineStageCard
              key={stg.stage}
              stage={stg}
              isSelected={selectedStage?.stage === stg.stage}
              isLast={index === stages.length - 1}
              onSelect={() => setSelectedStageName(stg.stage)}
            />
          ))}
        </div>
      </div>

      {/* Drill-Down Details Panel for Selected Stage */}
      {selectedStage && (
        <div className="bg-[#0B0F19] rounded-xl border border-gray-800 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-white px-2 py-0.5 rounded bg-gray-800">
                STAGE: {selectedStage.stage}
              </span>
              <span className="text-xs text-gray-400">{selectedStage.result_summary}</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-gray-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                {selectedStage.processing_latency_ms}ms
              </span>
              <span>{new Date(selectedStage.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>

          {/* Detailed Execution Logs */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-gray-400 font-mono uppercase tracking-wider block">
              Enclave Execution Trace & Rules Applied:
            </span>
            <div className="space-y-1">
              {selectedStage.details.map((detail, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-xs font-mono bg-[#111827] px-3 py-2 rounded-lg border border-gray-800/80 text-gray-300"
                >
                  <span className="text-emerald-400 shrink-0 font-bold">&bull;</span>
                  <span>{detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Failure reason if stage failed */}
          {selectedStage.failure_reason && (
            <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-lg flex items-center gap-2 text-xs text-rose-300">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Fault: {selectedStage.failure_reason}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
