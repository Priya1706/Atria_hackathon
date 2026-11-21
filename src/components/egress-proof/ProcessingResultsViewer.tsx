import React, { useState } from 'react';
import { ProcessingResult } from '../../types/security';
import { ValidationBadge } from '../common/Badge';
import { ShieldCheck, Trash2, Lock, CheckCircle2, SlidersHorizontal, BadgeCheck } from 'lucide-react';

interface ProcessingResultsViewerProps {
  processing: ProcessingResult;
}

export const ProcessingResultsViewer: React.FC<ProcessingResultsViewerProps> = ({ processing }) => {
  const [filterAction, setFilterAction] = useState<'all' | 'removed' | 'redacted' | 'retained' | 'approved'>('all');

  const filteredTransformations = processing.transformations.filter((t) => {
    if (filterAction === 'all') return true;
    return t.action === filterAction;
  });

  return (
    <section className="egress-processing panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-100 uppercase tracking-wider">
              2. Processing & Redaction Results
            </h4>
            <span className="text-[11px] text-gray-400 font-mono">
              Policy: {processing.redaction_policy_version}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {processing.enclave_validated && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="w-3.5 h-3.5" /> Enclave Attested
            </span>
          )}
          <ValidationBadge status={processing.validation_status} />
        </div>
      </div>

      {/* Field Counts Summary Banner */}
      <div className="egress-processing-stats">
        <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-gray-800">
          <span className="text-[10px] text-gray-400 block font-mono">Received</span>
          <span className="text-base font-bold text-gray-200 font-mono">{processing.received_fields ?? 'Not reported'}</span>
        </div>
        <div className="bg-rose-950/20 p-2.5 rounded-lg border border-rose-900/40">
          <span className="text-[10px] text-rose-400 block font-mono">Removed</span>
          <span className="text-base font-bold text-rose-400 font-mono">{processing.removed_fields}</span>
        </div>
        <div className="bg-amber-950/20 p-2.5 rounded-lg border border-amber-900/40">
          <span className="text-[10px] text-amber-400 block font-mono">Redacted</span>
          <span className="text-base font-bold text-amber-400 font-mono">{processing.redacted_fields}</span>
        </div>
        <div className="bg-blue-950/20 p-2.5 rounded-lg border border-blue-900/40">
          <span className="text-[10px] text-blue-400 block font-mono">Retained</span>
          <span className="text-base font-bold text-blue-400 font-mono">{processing.retained_fields}</span>
        </div>
        <div className="bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-900/40">
          <span className="text-[10px] text-emerald-400 block font-mono">Approved</span>
          <span className="text-base font-bold text-emerald-400 font-mono">{processing.approved_fields}</span>
        </div>
      </div>

      {/* Transformation Filter Buttons */}
      <div className="flex items-center justify-between text-xs pt-1">
        <span className="text-gray-400 font-medium">Field-Level Security Actions</span>
        <div className="flex gap-1 bg-[#0B0F19] p-0.5 rounded-lg border border-gray-800 font-mono text-[11px]">
          <button
            onClick={() => setFilterAction('all')}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterAction === 'all' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            All ({processing.transformations.length})
          </button>
          <button
            onClick={() => setFilterAction('removed')}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterAction === 'removed' ? 'bg-rose-900/40 text-rose-300' : 'text-gray-400 hover:text-rose-400'
            }`}
          >
            Removed ({processing.removed_fields})
          </button>
          <button
            onClick={() => setFilterAction('redacted')}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterAction === 'redacted' ? 'bg-amber-900/40 text-amber-300' : 'text-gray-400 hover:text-amber-400'
            }`}
          >
            Redacted ({processing.redacted_fields})
          </button>
          <button
            onClick={() => setFilterAction('retained')}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterAction === 'retained' ? 'bg-blue-900/40 text-blue-300' : 'text-gray-400 hover:text-blue-400'
            }`}
          >
            Retained ({processing.retained_fields})
          </button>
          <button
            onClick={() => setFilterAction('approved')}
            className={`px-2.5 py-1 rounded transition-colors ${filterAction === 'approved' ? 'bg-emerald-900/40 text-emerald-300' : 'text-gray-400 hover:text-emerald-400'}`}
          >
            Approved ({processing.approved_fields})
          </button>
        </div>
      </div>

      {/* Field Actions List */}
      <div className="egress-field-list">
        {filteredTransformations.map((t, idx) => {
          const isRemoved = t.action === 'removed';
          const isRedacted = t.action === 'redacted';
          const isRetained = t.action === 'retained';
          const isApproved = t.action === 'approved';

          return (
            <div
              key={idx}
              className={`p-3 rounded-lg border text-xs transition-all ${
                isRemoved
                  ? 'bg-rose-950/10 border-rose-900/30'
                  : isRedacted
                  ? 'bg-amber-950/10 border-amber-900/30'
                  : isApproved
                  ? 'bg-emerald-950/10 border-emerald-900/30'
                  : 'bg-[#0B0F19] border-gray-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  {isRemoved && <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  {isRedacted && <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  {isRetained && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                  {isApproved && <BadgeCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  <span className="font-mono font-semibold text-gray-200">{t.field_name}</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  {t.rule_id && (
                    <span className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-700">
                      {t.rule_id}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded uppercase font-semibold ${
                      isRemoved
                        ? 'bg-rose-500/20 text-rose-300'
                        : isRedacted
                        ? 'bg-amber-500/20 text-amber-300'
                        : isApproved
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    {t.action}
                  </span>
                </div>
              </div>

              {/* Redaction comparison if available */}
              {isRedacted && (
                <div className="my-1.5 text-[11px] font-mono bg-black/40 p-2 rounded border border-amber-900/40 space-y-1">
                  {t.original_value && (
                    <div className="text-gray-400">
                      <span className="text-rose-400 select-none">- Raw (Local): </span>
                      <span className="line-through">{t.original_value}</span>
                    </div>
                  )}
                  <div className="text-emerald-400">
                    <span className="text-emerald-500 select-none">+ Masked (Outgoing): </span>
                    <span>{t.redacted_value}</span>
                  </div>
                </div>
              )}

              {/* Reason */}
              <p className="text-[11px] text-gray-400 leading-relaxed">{t.reason}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
};
