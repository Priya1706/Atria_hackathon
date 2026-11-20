import React, { useState, useEffect } from 'react';
import { CollectorHealth } from '../../types/security';
import { collectorService } from '../../services/collectorService.ts';
import { CollectorStatusCard } from './CollectorStatusCard';
import { Server, Activity, RotateCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface CollectorStatusGridProps {
  selectedCollectorId?: string;
  onSelectCollector?: (collectorId: string) => void;
}

export const CollectorStatusGrid: React.FC<CollectorStatusGridProps> = ({
  selectedCollectorId,
  onSelectCollector,
}) => {
  const [collectors, setCollectors] = useState<CollectorHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const loadCollectors = async () => {
    setIsRefreshing(true);
    try {
      const res = await collectorService.getCollectors();
      setCollectors(res.data);
      setErrorNotice(res.error || null);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to fetch collectors');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadCollectors();
    const interval = setInterval(loadCollectors, 15000);
    return () => clearInterval(interval);
  }, []);

  const totalCollectors = collectors.length;
  const onlineCount = collectors.filter((c) => c.status === 'online' && c.heartbeat_age_seconds < 60).length;
  const degradedCount = collectors.filter((c) => c.status === 'degraded').length;
  const offlineCount = totalCollectors - onlineCount - degradedCount;
  const totalEps = collectors.reduce((acc, c) => acc + c.events_per_second, 0);

  return (
    <div className="space-y-4">
      {/* Top Header & Summary Stats */}
      <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Server className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-gray-100 uppercase tracking-wider">
                Local Collector Fleet Status
              </h3>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Live heartbeat, resource telemetry, and enclave operational state derived from collector agents
            </p>
          </div>

          <button
            onClick={loadCollectors}
            disabled={isRefreshing}
            className="self-start md:self-auto flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700 font-mono transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Poll Heartbeats</span>
          </button>
        </div>

        {/* Global Collector KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#0B0F19] p-3 rounded-lg border border-gray-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-mono">Total Agents</span>
              <span className="text-lg font-bold text-gray-100 font-mono">{totalCollectors}</span>
            </div>
            <Server className="w-5 h-5 text-gray-500" />
          </div>

          <div className="bg-emerald-950/20 p-3 rounded-lg border border-emerald-900/40 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-emerald-400 uppercase tracking-wider block font-mono">Healthy Online</span>
              <span className="text-lg font-bold text-emerald-400 font-mono">{onlineCount}</span>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>

          <div className="bg-amber-950/20 p-3 rounded-lg border border-amber-900/40 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-amber-400 uppercase tracking-wider block font-mono">Degraded / Slow</span>
              <span className="text-lg font-bold text-amber-400 font-mono">{degradedCount}</span>
            </div>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>

          <div className="bg-blue-950/20 p-3 rounded-lg border border-blue-900/40 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-blue-400 uppercase tracking-wider block font-mono">Aggregate Throughput</span>
              <span className="text-lg font-bold text-blue-400 font-mono">{totalEps} eps</span>
            </div>
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
        </div>

        {errorNotice && (
          <p className="mt-3 text-xs text-cyan-400 font-mono">
            Notice: {errorNotice}
          </p>
        )}
      </div>

      {/* Collector Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {collectors.map((col) => (
          <CollectorStatusCard
            key={col.collector_id}
            collector={col}
            isSelected={selectedCollectorId === col.collector_id}
            onSelect={onSelectCollector}
          />
        ))}
      </div>
    </div>
  );
};
