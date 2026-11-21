import React from 'react';
import { CollectorHealth } from '../../types/security';
import { Server, Cpu, HardDrive, ShieldCheck, Activity, Wifi, WifiOff, AlertTriangle } from 'lucide-react';

interface CollectorStatusCardProps {
  collector: CollectorHealth;
  isSelected?: boolean;
  onSelect?: (collectorId: string) => void;
}

export const CollectorStatusCard: React.FC<CollectorStatusCardProps> = ({
  collector,
  isSelected = false,
  onSelect,
}) => {
  // Derive live status based on heartbeat age
  // If heartbeat > 60 seconds, mark as degraded or offline
  const isOnline = collector.status === 'online' && collector.heartbeat_age_seconds < 60;
  const isDegraded = collector.status === 'degraded' || (collector.heartbeat_age_seconds >= 30 && collector.heartbeat_age_seconds < 90);
  const isOffline = !isOnline && !isDegraded;

  const getStatusColor = () => {
    if (isOnline) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (isDegraded) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  };

  const getStatusIcon = () => {
    if (isOnline) return <Wifi className="w-3.5 h-3.5 text-emerald-400" />;
    if (isDegraded) return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
    return <WifiOff className="w-3.5 h-3.5 text-rose-400" />;
  };

  return (
    <div
      onClick={() => onSelect && onSelect(collector.collector_id)}
      className={`bg-[#111827] border rounded-xl p-5 transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-lg bg-[#141E2F]'
          : 'border-gray-800 hover:border-gray-700 hover:bg-[#141B2B]'
      }`}
    >
      {/* Top: Collector ID, Hostname & Live Badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-lg bg-gray-800 text-gray-300 shrink-0">
            <Server className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-gray-100 font-mono truncate">
              {collector.collector_id}
            </h4>
            {collector.hostname ? (
              <span className="text-xs text-gray-400 truncate block font-mono">
                {collector.hostname}
              </span>
            ) : (
              <span className="text-xs text-gray-500 italic block font-mono">
                Hostname not reported
              </span>
            )}
          </div>
        </div>

        {/* Live Health Badge */}
        <div className={`px-2.5 py-1 rounded-md border text-[11px] font-mono font-semibold flex items-center gap-1.5 shrink-0 ${getStatusColor()}`}>
          {getStatusIcon()}
          <span>{isOnline ? 'ONLINE' : isDegraded ? 'DEGRADED' : 'OFFLINE'}</span>
        </div>
      </div>

      {/* Heartbeat & Version Row */}
      <div className="bg-[#0B0F19] p-3 rounded-lg border border-gray-800 text-xs font-mono space-y-2 mb-4">
        <div className="flex items-center justify-between text-gray-400">
          <span className="flex items-center gap-1.5 text-gray-500">
            <Activity className="w-3.5 h-3.5 text-blue-400" /> API liveness:
          </span>
          <span className="text-gray-200">
            {collector.heartbeat_age_seconds}s ago ({new Date(collector.last_heartbeat).toLocaleTimeString()})
          </span>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span className="text-gray-500">Version:</span>
          <span className="text-gray-300">{collector.version}</span>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span className="text-gray-500">Event Throughput:</span>
          <span className="text-emerald-400 font-semibold">{Number.isFinite(collector.events_per_second) ? `${collector.events_per_second} eps` : 'Not reported'}</span>
        </div>
      </div>

      {/* Resource Utilization Metrics */}
      <div className="space-y-3 text-xs">
        {/* CPU */}
        <div>
          <div className="flex items-center justify-between text-gray-400 mb-1 font-mono">
            <span className="flex items-center gap-1 text-[11px]">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" /> CPU Usage
            </span>
            <span className="font-semibold text-gray-200">{Number.isFinite(collector.cpu_percent) ? `${collector.cpu_percent}%` : 'Not reported'}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${
                collector.cpu_percent > 80
                  ? 'bg-rose-500'
                  : collector.cpu_percent > 60
                  ? 'bg-amber-500'
                  : 'bg-indigo-500'
              }`}
              style={{ width: `${Number.isFinite(collector.cpu_percent) ? Math.min(collector.cpu_percent, 100) : 0}%` }}
            />
          </div>
        </div>

        {/* Memory */}
        <div>
          <div className="flex items-center justify-between text-gray-400 mb-1 font-mono">
            <span className="flex items-center gap-1 text-[11px]">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" /> Memory Usage
            </span>
            <span className="font-semibold text-gray-200">{Number.isFinite(collector.memory_percent) ? `${collector.memory_percent}%` : 'Not reported'}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${
                collector.memory_percent > 85
                  ? 'bg-rose-500'
                  : collector.memory_percent > 65
                  ? 'bg-amber-500'
                  : 'bg-cyan-500'
              }`}
              style={{ width: `${Number.isFinite(collector.memory_percent) ? Math.min(collector.memory_percent, 100) : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer: Config & Enclave Badge */}
      <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between text-[11px] font-mono">
        <span className="text-gray-500 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          {Number.isFinite(collector.active_rules_count) && collector.active_rules_count > 0 ? `${collector.active_rules_count} reported rules` : 'Rule count not reported'}
        </span>
        <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          Local collector API
        </span>
      </div>
    </div>
  );
};
