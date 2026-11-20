import React from 'react';
import { PipelineStageMetric } from '../../types/security';
import {
  Download,
  Filter,
  Lock,
  Layers,
  ShieldCheck,
  Send,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';

interface PipelineStageCardProps {
  stage: PipelineStageMetric;
  isSelected: boolean;
  isLast: boolean;
  onSelect: () => void;
}

export const PipelineStageCard: React.FC<PipelineStageCardProps> = ({
  stage,
  isSelected,
  isLast,
  onSelect,
}) => {
  const getStageIcon = () => {
    switch (stage.stage) {
      case 'COLLECT':
        return <Download className="w-4 h-4" />;
      case 'FILTER':
        return <Filter className="w-4 h-4" />;
      case 'REDACT':
        return <Lock className="w-4 h-4" />;
      case 'AGGREGATE':
        return <Layers className="w-4 h-4" />;
      case 'APPROVE':
        return <ShieldCheck className="w-4 h-4" />;
      case 'TRANSMIT':
        return <Send className="w-4 h-4" />;
    }
  };

  const getStatusBadge = () => {
    switch (stage.status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
            <CheckCircle2 className="w-3 h-3" /> VERIFIED
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-mono">
            <Clock className="w-3 h-3 animate-spin" /> IN PROGRESS
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-mono">
            <AlertTriangle className="w-3 h-3" /> WARNING
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-mono">
            <XCircle className="w-3 h-3" /> FAILED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 font-mono">
            UNKNOWN
          </span>
        );
    }
  };

  const getBorderColor = () => {
    if (isSelected) return 'border-emerald-500 ring-2 ring-emerald-500/20 bg-[#162032]';
    if (stage.status === 'completed') return 'border-emerald-900/40 hover:border-emerald-700/60 bg-[#111827]';
    if (stage.status === 'warning') return 'border-amber-900/40 hover:border-amber-700/60 bg-[#111827]';
    if (stage.status === 'failed') return 'border-rose-900/40 hover:border-rose-700/60 bg-[#111827]';
    return 'border-gray-800 bg-[#111827]';
  };

  return (
    <div className="flex items-center shrink-0">
      <div
        onClick={onSelect}
        className={`w-44 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 select-none ${getBorderColor()}`}
      >
        {/* Top: Icon + Stage Name */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${
              stage.status === 'completed'
                ? 'bg-emerald-500/10 text-emerald-400'
                : stage.status === 'failed'
                ? 'bg-rose-500/10 text-rose-400'
                : 'bg-amber-500/10 text-amber-400'
            }`}>
              {getStageIcon()}
            </div>
            <span className="font-bold text-xs font-mono text-gray-100 tracking-wider">
              {stage.stage}
            </span>
          </div>
          {getStatusBadge()}
        </div>

        {/* Latency & Fields Flow */}
        <div className="bg-[#0B0F19] p-2 rounded-lg border border-gray-800 text-[11px] font-mono space-y-1 mb-2">
          <div className="flex items-center justify-between text-gray-400">
            <span>Fields:</span>
            <span className="text-gray-200 font-semibold">
              {stage.input_field_count} &rarr; {stage.output_field_count}
            </span>
          </div>
          <div className="flex items-center justify-between text-gray-500 text-[10px]">
            <span>Latency:</span>
            <span className="text-cyan-400">{stage.processing_latency_ms}ms</span>
          </div>
        </div>

        {/* Truncated Summary */}
        <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed font-sans">
          {stage.result_summary}
        </p>
      </div>

      {/* Arrow between stages */}
      {!isLast && (
        <div className="px-2 text-gray-600 shrink-0">
          <ArrowRight className="w-4 h-4" />
        </div>
      )}
    </div>
  );
};
