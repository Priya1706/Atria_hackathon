import React, { useState, useEffect } from 'react';
import { TransmissionMonitoringStats } from '../../types/security';
import { transmissionService } from '../../services/transmissionService';
import {
  Wifi,
  WifiOff,
  RotateCcw,
  Database,
  CopyCheck,
  AlertOctagon,
  CheckCircle2,
  Clock,
  RotateCw,
  HardDrive,
  ShieldAlert,
} from 'lucide-react';

export const TransmissionMonitoringView: React.FC = () => {
  const [stats, setStats] = useState<TransmissionMonitoringStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStats = async () => {
    setIsRefreshing(true);
    try {
      const res = await transmissionService.getMonitoringStats();
      setStats(res.data);
    } catch (err) {
      console.error('Failed to load transmission stats', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadStats();
    const timer = setInterval(loadStats, 10000);
    return () => clearInterval(timer);
  }, []);

  if (!stats) {
    return (
      <div className="p-8 text-center text-gray-500 font-mono">
        Loading transmission telemetry...
      </div>
    );
  }

  const bufferPercentage = Math.round((stats.buffered_count / stats.buffer_capacity) * 100);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Wifi className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-gray-100 uppercase tracking-wider">
              Transmission & Delivery Failure Monitoring
            </h3>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Realtime telemetry on outbound mTLS transport, local ring-buffers, retry backoffs, and replay defense
          </p>
        </div>

        <button
          onClick={loadStats}
          disabled={isRefreshing}
          className="self-start md:self-auto flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700 font-mono transition-colors"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Grid: 4 Pillars of Outbound Telemetry */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pillar 1: SaaS Connectivity */}
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <span className="text-xs font-bold text-gray-200 uppercase tracking-wider font-mono">
              SaaS Connectivity
            </span>
            {stats.saas_connected ? (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                <Wifi className="w-3.5 h-3.5" /> ESTABLISHED
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-rose-400 font-mono">
                <WifiOff className="w-3.5 h-3.5" /> DISCONNECTED
              </span>
            )}
          </div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-gray-500">Last Handshake:</span>
              <span className="text-gray-200">
                {new Date(stats.last_successful_connection).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-gray-500">Last Delivery:</span>
              <span className="text-gray-200">
                {new Date(stats.last_successful_delivery).toLocaleTimeString()}
              </span>
            </div>
            {stats.connection_error && (
              <p className="text-[11px] text-rose-400 bg-rose-950/20 p-2 rounded border border-rose-900/40">
                {stats.connection_error}
              </p>
            )}
          </div>
        </div>

        {/* Pillar 2: Delivery KPI Counters */}
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <span className="text-xs font-bold text-gray-200 uppercase tracking-wider font-mono">
              Delivery Counters
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-[#0B0F19] p-2 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Delivered</span>
              <span className="text-emerald-400 font-bold text-sm">
                {stats.total_delivered.toLocaleString()}
              </span>
            </div>
            <div className="bg-[#0B0F19] p-2 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Pending</span>
              <span className="text-amber-400 font-bold text-sm">
                {stats.total_pending.toLocaleString()}
              </span>
            </div>
            <div className="bg-[#0B0F19] p-2 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Failed</span>
              <span className="text-rose-400 font-bold text-sm">
                {stats.total_failed.toLocaleString()}
              </span>
            </div>
            <div className="bg-[#0B0F19] p-2 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Rejected</span>
              <span className="text-purple-400 font-bold text-sm">
                {stats.total_rejected.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Pillar 3: Retry & Backoff */}
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <span className="text-xs font-bold text-gray-200 uppercase tracking-wider font-mono">
              Retry Management
            </span>
            <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-gray-500">Active Retries:</span>
              <span className="text-purple-400 font-bold">{stats.active_retries} queued</span>
            </div>
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-gray-500">Last Retry:</span>
              <span className="text-gray-200">
                {stats.last_retry_at ? new Date(stats.last_retry_at).toLocaleTimeString() : 'None'}
              </span>
            </div>
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-gray-500">Next Backoff:</span>
              <span className="text-amber-300">
                {stats.next_retry_at ? new Date(stats.next_retry_at).toLocaleTimeString() : 'Idle'}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-gray-500 font-mono leading-tight">
            Policy: {stats.retry_policy}
          </p>
        </div>

        {/* Pillar 4: Buffer Capacity */}
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <span className="text-xs font-bold text-gray-200 uppercase tracking-wider font-mono">
              Local Buffer
            </span>
            <Database className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-gray-500">Occupancy:</span>
              <span className="text-gray-200 font-bold">
                {stats.buffered_count} / {stats.buffer_capacity} ({bufferPercentage}%)
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full ${
                  bufferPercentage > 80
                    ? 'bg-rose-500'
                    : bufferPercentage > 50
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${bufferPercentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-gray-500 text-[10px] pt-1">
              <span>Oldest in queue:</span>
              <span className="text-gray-400">
                {stats.oldest_pending_timestamp
                  ? new Date(stats.oldest_pending_timestamp).toLocaleTimeString()
                  : 'Buffer Empty'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Duplicate Rejection Protection History */}
      <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <CopyCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-100 uppercase tracking-wider">
                Duplicate Protection & Idempotency Audit
              </h4>
              <span className="text-xs text-gray-400">
                Guarantees at-most-once processing by rejecting duplicate payloads at SaaS ingress
              </span>
            </div>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            {stats.duplicate_payload_count} Duplicates Blocked
          </span>
        </div>

        <div className="space-y-2">
          {stats.duplicate_rejections.map((dup, idx) => (
            <div
              key={idx}
              className="p-3 bg-[#0B0F19] rounded-lg border border-gray-800 text-xs font-mono space-y-1.5"
            >
              <div className="flex items-center justify-between text-gray-300">
                <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                  <AlertOctagon className="w-3.5 h-3.5 text-amber-400" />
                  REJECTED DUPLICATE: {dup.payload_id}
                </span>
                <span className="text-gray-500 text-[11px]">
                  Detected at: {new Date(dup.detected_at).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-gray-400 text-[11px]">{dup.reason}</p>
              <div className="text-[10px] text-gray-500">
                Original Transaction ID: {dup.original_transmission_id}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
