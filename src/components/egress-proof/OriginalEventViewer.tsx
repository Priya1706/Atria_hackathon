import React from 'react';
import { OriginalEvent } from '../../types/security';
import { SeverityBadge } from '../common/Badge';
import { Shield, Lock } from 'lucide-react';

export const OriginalEventViewer: React.FC<{ event: OriginalEvent }> = ({ event }) => (
  <section className="egress-original panel">
    <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400"><Shield className="w-4 h-4" /></div>
        <div><h4 className="text-sm font-semibold text-gray-100 uppercase tracking-wider">Local event metadata</h4>
          <span className="text-[11px] text-gray-400 font-mono">Only normalized, non-raw metadata is displayed</span></div>
      </div>
      <SeverityBadge severity={event.severity} />
    </div>
    <div className="egress-original-meta">
      {[['Event ID', event.event_id], ['Metric', event.source_id], ['Timestamp (UTC)', event.timestamp], ['Category', event.category], ['Collector ID', event.collector_id]].map(([label, value]) =>
        <div key={label} className="bg-[#0B0F19] p-2.5 rounded-lg border border-gray-800">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 block font-mono">{label}</span>
          <span className="font-mono text-gray-200 break-all">{value}</span>
        </div>)}
    </div>
    <div className="bg-[#0B0F19] p-3 rounded-lg border border-gray-800 text-xs text-gray-400 flex gap-2">
      <Lock className="w-4 h-4 text-amber-400 shrink-0" />
      <div><strong className="text-gray-200">Raw event inspection is unavailable here.</strong>
        <p className="mt-1">The collector API exposes normalized metadata only. This frontend does not request or display raw logs, and it has no local credential or passkey flow.</p>
        {event.raw_unavailability_reason && <p className="mt-1">{event.raw_unavailability_reason}</p>}
      </div>
    </div>
  </section>
);
