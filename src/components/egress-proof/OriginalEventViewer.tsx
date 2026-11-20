import React, { useState } from 'react';
import { OriginalEvent } from '../../types/security';
import { SeverityBadge } from '../common/Badge';
import { Shield, Lock, Eye, EyeOff, KeyRound, AlertOctagon } from 'lucide-react';
import { egressProofService } from '../../services/egressProofService';

interface OriginalEventViewerProps {
  event: OriginalEvent;
}

export const OriginalEventViewer: React.FC<OriginalEventViewerProps> = ({ event }) => {
  const [authToken, setAuthToken] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(event.local_access_authorized || false);
  const [unlockedPayload, setUnlockedPayload] = useState<Record<string, unknown> | string | null>(
    event.local_access_authorized ? event.raw_payload || null : null
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  const handleAuthorizeLocalAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCheckingAuth(true);
    setAuthError(null);

    try {
      const res = await egressProofService.inspectLocalRawEvent(event.event_id, authToken);
      if (res.authorized && res.raw) {
        setIsAuthorized(true);
        setUnlockedPayload(res.raw);
        setShowAuthDialog(false);
      } else {
        setAuthError(res.reason || 'Authorization failed. Token rejected by Local Enclave.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Error communicating with Local Enclave');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleRevoke = () => {
    setIsAuthorized(false);
    setUnlockedPayload(null);
    setAuthToken('');
  };

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-100 uppercase tracking-wider">
              1. Original Local Event
            </h4>
            <span className="text-[11px] text-gray-400 font-mono">Enclave Boundary: Local Customer Perimeter</span>
          </div>
        </div>
        <SeverityBadge severity={event.severity} />
      </div>

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-gray-800">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 block font-mono">Event ID</span>
          <span className="font-mono text-gray-200 font-medium select-all">{event.event_id}</span>
        </div>
        <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-gray-800">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 block font-mono">Source ID</span>
          <span className="font-mono text-gray-200 font-medium truncate block">{event.source_id}</span>
        </div>
        <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-gray-800">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 block font-mono">Timestamp</span>
          <span className="font-mono text-gray-300 text-[11px] block">{new Date(event.timestamp).toLocaleString()}</span>
        </div>
        <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-gray-800">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 block font-mono">Category</span>
          <span className="font-mono text-indigo-300 font-medium capitalize">{event.category.replace('_', ' ')}</span>
        </div>
        <div className="col-span-2 bg-[#0B0F19] p-2.5 rounded-lg border border-gray-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 block font-mono">Origin Collector</span>
            <span className="font-mono text-emerald-400 text-xs font-semibold">{event.collector_id}</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            On-Premises Enclave
          </span>
        </div>
      </div>

      {/* Raw Payload Section (Local Enclave Only) */}
      <div className="mt-4 pt-3 border-t border-gray-800/80">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-gray-300">Raw Customer Log Inspection</span>
          </div>
          {isAuthorized ? (
            <button
              onClick={handleRevoke}
              className="text-[10px] text-gray-400 hover:text-rose-400 flex items-center gap-1 bg-gray-800 px-2 py-0.5 rounded border border-gray-700"
            >
              <EyeOff className="w-3 h-3" /> Lock Local View
            </button>
          ) : (
            <button
              onClick={() => setShowAuthDialog(!showAuthDialog)}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-950/40 hover:bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-500/30 transition-colors"
            >
              <KeyRound className="w-3 h-3" /> Authorize Local Enclave View
            </button>
          )}
        </div>

        {/* Auth prompt if triggered */}
        {showAuthDialog && !isAuthorized && (
          <form onSubmit={handleAuthorizeLocalAccess} className="bg-[#0B0F19] p-3 rounded-lg border border-amber-500/30 mb-3 space-y-2">
            <p className="text-[11px] text-amber-300 leading-snug">
              <strong>Local Enclave Security Gate:</strong> Raw customer logs contain unsanitized secrets and credentials. They are NEVER sent to Central SaaS. To inspect locally on the collector node, authenticate:
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Enclave Token (Use: ENCLAVE_LOCAL_ADMIN)"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                className="bg-[#111827] text-gray-200 text-xs px-2.5 py-1.5 rounded border border-gray-700 focus:outline-none focus:border-amber-500 flex-1 font-mono"
              />
              <button
                type="submit"
                disabled={isCheckingAuth}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3 py-1.5 rounded font-medium disabled:opacity-50"
              >
                {isCheckingAuth ? 'Verifying...' : 'Unlock'}
              </button>
            </div>
            {authError && <p className="text-[11px] text-rose-400 font-mono">{authError}</p>}
          </form>
        )}

        {/* Raw View State */}
        {isAuthorized && unlockedPayload ? (
          <div className="bg-[#0B0F19] p-3 rounded-lg border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-emerald-400 font-mono">
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" /> LOCAL ONLY — NEVER EXPORTED TO SAAS
              </span>
              <span className="text-[10px] text-gray-500">Node Memory Map</span>
            </div>
            <pre className="text-[11px] font-mono text-gray-300 max-h-56 overflow-y-auto whitespace-pre-wrap break-all bg-[#090D14] p-2.5 rounded border border-gray-800">
              {typeof unlockedPayload === 'string' ? unlockedPayload : JSON.stringify(unlockedPayload, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="bg-[#0B0F19] p-3 rounded-lg border border-gray-800 text-xs text-gray-400 space-y-2">
            <div className="flex items-start gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-gray-300 font-medium">Raw Payload Isolated Locally</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                  {event.raw_unavailability_reason ||
                    'Under CICADA Zero-Trust architecture, original plaintext logs containing credentials remain securely on the collector machine and are inaccessible from the Central SaaS console.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
