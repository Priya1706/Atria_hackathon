import React from 'react';
import { ApprovedPayload, TransmissionRecord } from '../../types/security';
import { ValidationBadge, DeliveryBadge } from '../common/Badge';
import { JsonViewer } from '../common/JsonViewer';
import { Send, Hash, CheckCircle2, Globe, Clock, Layers } from 'lucide-react';

interface ApprovedPayloadViewerProps {
  payload: ApprovedPayload;
  transmission?: TransmissionRecord;
}

export const ApprovedPayloadViewer: React.FC<ApprovedPayloadViewerProps> = ({
  payload,
  transmission,
}) => {
  return (
    <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
            <Send className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-100 uppercase tracking-wider">
              3. Approved Outgoing Egress Payload
            </h4>
            <span className="text-[11px] text-gray-400 font-mono">
              Schema: {payload.schema_version} ({payload.size_bytes} bytes)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ValidationBadge status={payload.validation_status} />
          {transmission && <DeliveryBadge status={transmission.status} />}
        </div>
      </div>

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-gray-800">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 block font-mono">Payload ID</span>
          <span className="font-mono text-gray-200 font-medium select-all">{payload.payload_id}</span>
        </div>
        <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-gray-800">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 block font-mono">Original Event ID</span>
          <span className="font-mono text-gray-200 font-medium truncate block">{payload.original_event_id}</span>
        </div>
        <div className="col-span-2 bg-[#0B0F19] p-2.5 rounded-lg border border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 block font-mono">Destination SaaS Endpoint</span>
              <span className="font-mono text-emerald-400 text-xs font-medium truncate block">
                {payload.destination_endpoint}
              </span>
            </div>
          </div>
          <span className="text-[10px] text-gray-400 font-mono shrink-0">mTLS Enforced</span>
        </div>
        <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-gray-800">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 block font-mono">Payload Created At</span>
          <span className="font-mono text-gray-300 text-[11px] block">
            {new Date(payload.created_at).toLocaleString()}
          </span>
        </div>
        <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-gray-800">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 block font-mono">Collector Origin</span>
          <span className="font-mono text-gray-300 text-[11px] block">{payload.collector_id}</span>
        </div>
      </div>

      {/* Cryptographic Attestation Digest */}
      {payload.validation_digest && (
        <div className="bg-[#090D14] p-2.5 rounded-lg border border-emerald-900/30 flex items-center gap-2 text-xs">
          <Hash className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-gray-400">Cryptographic Integrity Digest</span>
              <span className="text-[10px] text-emerald-400 font-mono">Tamper-Proof</span>
            </div>
            <p className="font-mono text-[11px] text-emerald-300 truncate select-all">
              {payload.validation_digest}
            </p>
          </div>
        </div>
      )}

      {/* JSON Viewer with Search and Copy */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-gray-300 font-medium flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-400" /> Exact Transmitted JSON Body
          </span>
          <span className="text-[11px] text-gray-500 font-mono">
            Zero Customer Secrets Included
          </span>
        </div>
        <JsonViewer
          data={payload.payload_json}
          title={`APPROVED PAYLOAD — ${payload.payload_id}`}
        />
      </div>

      {/* Actual Transmission Record Summary */}
      {transmission && (
        <div className="bg-[#0B0F19] p-3.5 rounded-lg border border-gray-800 text-xs space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 border-b border-gray-800 pb-2">
            <span className="flex items-center gap-1.5 text-gray-200 font-semibold">
              <Clock className="w-3.5 h-3.5 text-blue-400" /> Actual Transmission Record
            </span>
            <span className="text-gray-500">ID: {transmission.transmission_id}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
            <div>
              <span className="text-gray-500 block text-[10px]">STATUS</span>
              <span className="font-semibold text-gray-200 uppercase">{transmission.status}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-[10px]">RETRIES</span>
              <span className="text-gray-200">{transmission.retry_count} of {transmission.max_retries}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-[10px]">ROUNDTRIP</span>
              <span className="text-cyan-400">{transmission.latency_ms ? `${transmission.latency_ms}ms` : 'N/A'}</span>
            </div>
          </div>
          {transmission.saas_ack_token && (
            <div className="pt-1 flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">SaaS Delivery Ack: {transmission.saas_ack_token}</span>
            </div>
          )}
          {transmission.error_message && (
            <div className="pt-1 text-[11px] font-mono text-rose-400">
              Error: {transmission.error_message}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
