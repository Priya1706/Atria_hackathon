import React, { useState } from 'react';
import { EgressProofRecord, DeliveryStatus } from '../../types/security';
import { DeliveryBadge } from '../common/Badge';
import { Search, Filter, ArrowRight, RotateCw } from 'lucide-react';

interface TransmissionHistoryTableProps {
  records: EgressProofRecord[];
  selectedEventId?: string;
  onSelectRecord: (record: EgressProofRecord) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const TransmissionHistoryTable: React.FC<TransmissionHistoryTableProps> = ({
  records,
  selectedEventId,
  onSelectRecord,
  onRefresh,
  isRefreshing = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DeliveryStatus>('all');
  const [collectorFilter, setCollectorFilter] = useState<string>('all');

  // Extract unique collectors
  const collectors = Array.from(new Set(records.map((r) => r.transmission.collector_id)));

  // Filter records
  const filteredRecords = records.filter((r) => {
    // Search match
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      r.event.event_id.toLowerCase().includes(q) ||
      r.payload.payload_id.toLowerCase().includes(q) ||
      r.transmission.transmission_id.toLowerCase().includes(q) ||
      r.event.source_id.toLowerCase().includes(q);

    // Status filter
    const matchesStatus = statusFilter === 'all' || r.transmission.status === statusFilter;

    // Collector filter
    const matchesCollector = collectorFilter === 'all' || r.transmission.collector_id === collectorFilter;

    return matchesSearch && matchesStatus && matchesCollector;
  });

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-gray-800/80 bg-[#0F172A]/40 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-100 uppercase tracking-wider flex items-center gap-2">
            <span>4. Transmission Audit History</span>
            <span className="text-xs font-normal text-gray-500 font-mono">
              ({filteredRecords.length} records)
            </span>
          </h4>
          <p className="text-xs text-gray-400 mt-0.5">
            Immutable log of telemetry payloads egressed from local collectors to Central SaaS
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Event, Payload, Tx ID..."
              className="bg-[#0B0F19] text-gray-200 text-xs pl-8 pr-3 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-emerald-500 w-52"
            />
          </div>

          {/* Status Select */}
          <div className="flex items-center gap-1.5 bg-[#0B0F19] px-2.5 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-300">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              aria-label="Filter by delivery status"
              className="bg-transparent text-gray-200 focus:outline-none cursor-pointer font-mono"
            >
              <option value="all" className="bg-[#111827]">All Statuses</option>
              <option value="delivered" className="bg-[#111827]">Delivered</option>
              <option value="retrying" className="bg-[#111827]">Retrying</option>
              <option value="pending" className="bg-[#111827]">Pending</option>
              <option value="failed" className="bg-[#111827]">Failed</option>
              <option value="rejected" className="bg-[#111827]">Rejected</option>
            </select>
          </div>

          {/* Collector Select */}
          {collectors.length > 1 && (
            <div className="bg-[#0B0F19] px-2.5 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-300">
              <select
                value={collectorFilter}
                onChange={(e) => setCollectorFilter(e.target.value)}
                aria-label="Filter by collector"
                className="bg-transparent text-gray-200 focus:outline-none cursor-pointer font-mono"
              >
                <option value="all" className="bg-[#111827]">All Collectors</option>
                {collectors.map((c) => (
                  <option key={c} value={c} className="bg-[#111827]">
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Refresh Button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 text-gray-400 hover:text-white bg-[#0B0F19] hover:bg-gray-800 rounded-lg border border-gray-700 transition-colors"
              title="Refresh Audit Records"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-[#0B0F19] text-gray-400 border-b border-gray-800 uppercase text-[10px] tracking-wider select-none">
            <tr>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Event ID</th>
              <th className="py-3 px-4">Payload ID</th>
              <th className="py-3 px-4">Collector</th>
              <th className="py-3 px-4">Destination</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Retries</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-500 font-sans">
                  No transmission records matching filters.
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => {
                const isSelected = selectedEventId === record.event.event_id;

                return (
                  <tr
                    key={record.transmission.transmission_id}
                    onClick={() => onSelectRecord(record)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
                        : 'hover:bg-gray-800/40'
                    }`}
                  >
                    <td className="py-3 px-4 text-gray-400 text-[11px] whitespace-nowrap">
                      {new Date(record.event.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 text-gray-200 font-semibold whitespace-nowrap">
                      {record.event.event_id}
                    </td>
                    <td className="py-3 px-4 text-gray-300 whitespace-nowrap">
                      {record.payload.payload_id}
                    </td>
                    <td className="py-3 px-4 text-emerald-400 whitespace-nowrap">
                      {record.transmission.collector_id}
                    </td>
                    <td className="py-3 px-4 text-gray-400 max-w-xs truncate text-[11px]">
                      {record.transmission.destination}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <DeliveryBadge status={record.transmission.status} />
                    </td>
                    <td className="py-3 px-4 text-gray-400 whitespace-nowrap text-center">
                      {record.transmission.retry_count}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRecord(record);
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-sans font-medium transition-colors ${
                          isSelected
                            ? 'bg-emerald-500 text-black font-semibold'
                            : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white'
                        }`}
                      >
                        <span>Inspect</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
