import React, { useEffect, useState } from 'react';
import { PipelineStageMetric } from '../../types/security';
import { privacyPipelineService } from '../../services/privacyPipelineService';
import { PipelineStageCard } from './PipelineStageCard';
import { RotateCw, ShieldCheck } from 'lucide-react';

export const PipelineVisualization: React.FC<{ collectorId?: string; eventId?: string }> = ({ collectorId, eventId }) => {
  const [stages, setStages] = useState<PipelineStageMetric[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = async () => {
    setRefreshing(true);
    try { const response = await privacyPipelineService.getPipelineStages(collectorId, eventId); setStages(response.data); setError(response.error || ''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Collector API request failed'); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { void load(); }, [collectorId, eventId]);
  return <section className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-lg space-y-4">
    <div className="flex justify-between items-center"><div className="flex gap-2 items-center"><ShieldCheck className="text-emerald-400"/><div><h3 className="font-bold text-gray-100">Privacy pipeline evidence</h3><p className="text-xs text-gray-400">Local collector egress audit</p></div></div><button onClick={() => void load()} disabled={refreshing} className="text-xs px-3 py-2 rounded border border-gray-700"><RotateCw className="inline w-3 h-3 mr-1"/>Refresh</button></div>
    {loading ? <p className="text-sm text-gray-400">Loading local collector status…</p> : stages.length ? <div className="flex gap-2 overflow-x-auto">{stages.map((stage, index) => <PipelineStageCard key={stage.stage} stage={stage} isSelected={false} isLast={index === stages.length - 1} onSelect={() => undefined}/>)}</div> : <div className="p-4 rounded border border-gray-800 bg-[#0B0F19] text-sm text-gray-300"><strong>{error || 'No stage trace is available.'}</strong><p className="mt-1 text-xs text-gray-400">The current collector API records removed/redacted/approved field names, payload hash, destination and delivery status in its egress endpoint. It does not provide per-stage execution traces, raw field counts, or processing latency. Those values are not estimated here.</p></div>}
  </section>;
};
