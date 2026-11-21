import React, { useCallback, useEffect, useState } from 'react';
import { transmissionService, LocalTransmissionStats } from '../../services/transmissionService';
import { RotateCw, Send, Wifi, WifiOff } from 'lucide-react';

export const TransmissionMonitoringView: React.FC = () => {
  const [stats, setStats] = useState<LocalTransmissionStats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    try { setStats(await transmissionService.getMonitoringStats()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Local collector request failed'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const retry = async () => {
    setBusy(true); setNotice('');
    try { const result = await transmissionService.retryPending(); setNotice(`Attempted ${result.attempted}; delivered ${result.delivered}; still pending ${result.pending}.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Retry request failed'); }
    finally { setBusy(false); }
  };
  if (!stats && !error) return <p className="p-8 text-center text-gray-400">Loading local collector queue…</p>;
  const queue = stats?.status.queue || {};
  return <section className="space-y-5 text-gray-100">
    <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 flex justify-between gap-4 items-center"><div><h3 className="font-bold uppercase tracking-wider">Transmission and retry queue</h3><p className="text-xs text-gray-400 mt-1">Live data comes from the local collector API. SaaS acknowledgements and duplicate-rejection totals are not exposed.</p></div><button onClick={() => void load()} disabled={busy} className="text-xs px-3 py-2 border border-gray-700 rounded"><RotateCw className="inline w-3 h-3 mr-1"/>Refresh</button></div>
    {error && <div role="alert" className="p-3 border border-rose-800 bg-rose-950/30 rounded text-sm">{error}</div>}
    {notice && <div role="status" className="p-3 border border-emerald-800 bg-emerald-950/30 rounded text-sm">{notice}</div>}
    {stats && <><p className="text-xs uppercase tracking-wide text-cyan-300">{stats.source === 'live' ? 'Live local collector API' : 'Demo fixtures'}</p><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['Pending', queue.pending || 0], ['In flight', queue.inflight || 0], ['Sent', queue.sent || 0], ['Failed', queue.failed || 0]].map(([name, value]) => <div key={name} className="bg-[#111827] border border-gray-800 rounded p-4"><span className="text-xs text-gray-400">{name}</span><div className="text-2xl font-mono mt-1">{value}</div></div>)}</div>
      <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4"><div className="text-sm flex items-center gap-2">{stats.status.saas_configured ? <Wifi className="text-emerald-400"/> : <WifiOff className="text-amber-400"/>}<span>{stats.status.saas_configured ? 'SaaS destination configured on collector' : 'SaaS destination is not configured'}</span><span className="text-xs text-gray-500">Collector {stats.status.collector_id}</span></div><button onClick={() => void retry()} disabled={busy || stats.source === 'demo'} className="text-xs px-3 py-2 rounded bg-emerald-700 disabled:opacity-50"><Send className="inline w-3 h-3 mr-1"/>Retry due payloads</button></div>
      {stats.queue.length ? <div className="overflow-auto bg-[#111827] border border-gray-800 rounded-xl"><table className="w-full text-left text-xs"><thead><tr className="text-gray-400"><th className="p-3">Payload</th><th>Status</th><th>Attempts</th><th>Last attempt</th><th>Next attempt</th><th>Last error</th></tr></thead><tbody>{stats.queue.map((item) => <tr key={item.payload_id} className="border-t border-gray-800"><td className="p-3 font-mono">{item.payload_id}</td><td>{item.status}</td><td>{item.retry_attempts}</td><td>{item.last_attempt_at || 'Not attempted'}</td><td>{item.next_attempt_at || 'Not scheduled'}</td><td>{item.last_error || '—'}</td></tr>)}</tbody></table></div> : <p className="text-sm text-gray-400">{stats.source === 'demo' ? 'Demo fixtures do not expose individual queued payload records.' : 'No pending or failed transmissions are currently exposed in the queue.'}</p>}</>}
  </section>;
};
