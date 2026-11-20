import React from 'react';
import { ShieldCheck, ShieldAlert, Lock, Trash2, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { ValidationStatus, DeliveryStatus } from '../../types/security';

interface RedactionIndicatorProps {
  redactedCount: number;
  policyVersion?: string;
}

export const RedactionIndicator: React.FC<RedactionIndicatorProps> = ({
  redactedCount,
  policyVersion = 'NIST SP 800-53',
}) => {
  return (
    <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg text-xs">
      <div className="p-1.5 rounded-md bg-amber-500/20 text-amber-400">
        <Lock className="w-4 h-4" />
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-amber-300">{redactedCount} Fields Masked</span>
          <span className="text-[10px] text-amber-500/90 font-mono">({policyVersion})</span>
        </div>
        <p className="text-[11px] text-amber-400/70">
          Reversible or irreversible obfuscation applied inside enclave
        </p>
      </div>
    </div>
  );
};

interface DataRemovalIndicatorProps {
  removedCount: number;
}

export const DataRemovalIndicator: React.FC<DataRemovalIndicatorProps> = ({
  removedCount,
}) => {
  return (
    <div className="flex items-center gap-2.5 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg text-xs">
      <div className="p-1.5 rounded-md bg-rose-500/20 text-rose-400">
        <Trash2 className="w-4 h-4" />
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-rose-300">{removedCount} Fields Purged</span>
          <span className="text-[10px] bg-rose-900/50 text-rose-300 px-1 rounded font-mono">ZERO-LEAK</span>
        </div>
        <p className="text-[11px] text-rose-400/70">
          Plaintext credentials permanently dropped before memory boundary
        </p>
      </div>
    </div>
  );
};

interface ValidationIndicatorProps {
  status: ValidationStatus;
  enclaveDigest?: string;
}

export const ValidationIndicator: React.FC<ValidationIndicatorProps> = ({
  status,
  enclaveDigest,
}) => {
  const isPassed = status === 'passed';

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs border ${
        isPassed
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
      }`}
    >
      <div
        className={`p-1.5 rounded-md ${
          isPassed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
        }`}
      >
        {isPassed ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="font-semibold text-gray-200">
            {isPassed ? 'Enclave Privacy Attestation: APPROVED' : 'Validation: FAILED'}
          </span>
        </div>
        {enclaveDigest ? (
          <p className="text-[10px] font-mono text-gray-400 truncate max-w-xs">
            Digest: {enclaveDigest}
          </p>
        ) : (
          <p className="text-[11px] text-gray-400">Schema and egress rules verified</p>
        )}
      </div>
    </div>
  );
};

interface DeliveryIndicatorProps {
  status: DeliveryStatus;
  latencyMs?: number;
  ackToken?: string;
}

export const DeliveryIndicator: React.FC<DeliveryIndicatorProps> = ({
  status,
  latencyMs,
  ackToken,
}) => {
  const isDelivered = status === 'delivered';

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs border ${
        isDelivered
          ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
          : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
      }`}
    >
      <div
        className={`p-1.5 rounded-md ${
          isDelivered ? 'bg-cyan-500/20 text-cyan-400' : 'bg-amber-500/20 text-amber-400'
        }`}
      >
        {isDelivered ? <CheckCircle2 className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-medium">
          <span className="font-semibold text-gray-200">
            {isDelivered ? 'SaaS Ingest Confirmed' : `Delivery Status: ${status.toUpperCase()}`}
          </span>
          {latencyMs !== undefined && (
            <span className="text-[10px] text-cyan-400 font-mono">({latencyMs}ms)</span>
          )}
        </div>
        {ackToken && (
          <p className="text-[10px] font-mono text-gray-400 truncate max-w-xs">
            Ack Token: {ackToken}
          </p>
        )}
      </div>
    </div>
  );
};
