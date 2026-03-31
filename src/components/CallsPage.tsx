'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import NavBar from './NavBar';
import Card from './Card';
import { C, capitalize, fmtTalkTime, ACTIVE_AGENTS, agentColor } from '@/lib/constants';
import { formatPhone, formatDuration, formatTime } from '@/lib/formatters';
import type { RawCall } from '@/lib/getDashboard';
import type { CallsResponse, AgentCallSummary } from '@/lib/api-types';
import { ArrowDown, ArrowUp, Filter, Download, Volume2, Square, CheckSquare } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';
import InlinePlayer from './InlinePlayer';

// ── XLSX Export (branded Jump Contact report) ──────────────────────────────

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtTimeXLS(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Edmonton',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function buildRecordingUrl(call: RawCall): string {
  if (!call.recordingUrl) return '';
  return `${window.location.origin}${call.recordingUrl}`;
}

async function downloadReport(calls: RawCall[], filename: string, date: string) {
  const XLSX = await import('xlsx');
  const reportDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const totalCalls = calls.length;
  const totalDurSec = calls.reduce((s, c) => s + c.duration, 0);
  const inbound = calls.filter(c => c.direction === 'inbound').length;
  const outbound = totalCalls - inbound;
  const withRec = calls.filter(c => c.recordingUrl).length;

  // Build rows array
  const rows: (string | number)[][] = [];

  // Header section
  rows.push(['JUMP CONTACT', '', '', '', '', '', '']);
  rows.push(['Call Detail Report', '', '', '', '', '', '']);
  rows.push([reportDate, '', '', '', '', '', '']);
  rows.push([]);
  // Summary row
  rows.push([
    'Total Calls', totalCalls,
    'Inbound', inbound,
    'Outbound', outbound,
    'Talk Time',
  ]);
  rows.push([
    'Recordings', withRec,
    '', '',
    '', '',
    fmtDur(totalDurSec),
  ]);
  rows.push([]);
  // Column headers
  const headerRow = 7; // 0-indexed
  rows.push(['Time', 'Agent', 'Client', 'Phone', 'Duration', 'Direction', 'Recording URL']);

  // Data rows
  for (const c of calls) {
    rows.push([
      fmtTimeXLS(c.time),
      capitalize(c.agent),
      c.account || '',
      formatPhone(c.phone),
      fmtDur(c.duration),
      capitalize(c.direction),
      buildRecordingUrl(c),
    ]);
  }

  // Agent summary section
  rows.push([]);
  rows.push(['Agent Summary', '', '', '', '', '', '']);
  const agentMap = new Map<string, { calls: number; durSec: number; inbound: number; outbound: number }>();
  for (const c of calls) {
    const name = capitalize(c.agent) || 'Unassigned';
    const prev = agentMap.get(name) || { calls: 0, durSec: 0, inbound: 0, outbound: 0 };
    prev.calls += 1;
    prev.durSec += c.duration;
    if (c.direction === 'inbound') prev.inbound += 1; else prev.outbound += 1;
    agentMap.set(name, prev);
  }
  rows.push(['Agent', 'Calls', 'Inbound', 'Outbound', 'Talk Time', '', '']);
  for (const [name, stats] of agentMap) {
    rows.push([name, stats.calls, stats.inbound, stats.outbound, fmtDur(stats.durSec), '', '']);
  }

  // Create workbook
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 24 }, // Time
    { wch: 14 }, // Agent
    { wch: 30 }, // Client
    { wch: 18 }, // Phone
    { wch: 12 }, // Duration
    { wch: 12 }, // Direction
    { wch: 55 }, // Recording URL
  ];

  // Merge header cells for branding
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // JUMP CONTACT
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }, // Call Detail Report
    { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } }, // Date
  ];

  // Agent summary header merge
  const summaryHeaderRow = headerRow + 1 + calls.length + 1;
  ws['!merges'].push(
    { s: { r: summaryHeaderRow, c: 0 }, e: { r: summaryHeaderRow, c: 6 } },
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Call Detail');
  XLSX.writeFile(wb, filename);
}

// ── Filter Dropdown ──────────────────────────────────────────────────────────

function FilterDropdown({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-1.5 rounded-lg text-xs font-medium appearance-none cursor-pointer"
      style={{
        background: C.card,
        color: value !== 'all' ? C.cyan : C.sub,
        border: `1px solid ${value !== 'all' ? C.cyan + '44' : C.border}`,
        paddingRight: '1.5rem',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B92A8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.4rem center',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: '#141824', color: C.text }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Agent Mini Card ─────────────────────────────────────────────────────────

function AgentMiniCard({ agent, calls, talkMin }: AgentCallSummary) {
  const clr = agentColor(agent);
  return (
    <div className="flex-1 min-w-[120px] rounded-xl p-3 border" style={{ background: C.card, borderColor: C.border }}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: clr }} />
        <span className="text-xs font-medium" style={{ color: C.text }}>{capitalize(agent)}</span>
      </div>
      <div className="flex items-end gap-3">
        <div>
          <span className="text-lg font-bold font-mono" style={{ color: C.text }}>{calls}</span>
          <span className="text-xs ml-1" style={{ color: C.sub }}>calls</span>
        </div>
        <span className="text-xs font-mono" style={{ color: C.sub }}>{fmtTalkTime(talkMin)}</span>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

function getTodayMST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
}

export default function CallsPage() {
  const [todayMST, setTodayMST] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  // Initialize dates on client only to avoid SSR hydration mismatch
  useEffect(() => {
    const t = getTodayMST();
    setTodayMST(t);
    setSelectedDate(t);
  }, []);
  const [data, setData] = useState<CallsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [dirFilter, setDirFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [selectedSids, setSelectedSids] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calls?date=${date}&limit=500`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedDate) return; // Wait for client-side init
    fetchData(selectedDate);
    // Only auto-refresh if viewing today
    if (selectedDate === todayMST) {
      const interval = setInterval(() => fetchData(selectedDate), 120_000);
      return () => clearInterval(interval);
    }
  }, [fetchData, selectedDate, todayMST]);

  // Build unique client list from call data
  const clientOptions = useMemo(() => {
    if (!data) return [];
    const clients = new Set<string>();
    for (const c of data.calls) {
      if (c.account) clients.add(c.account);
    }
    return [...clients].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.calls.filter(c => {
      if (agentFilter !== 'all' && c.agent.toLowerCase() !== agentFilter) return false;
      if (clientFilter !== 'all' && (c.account || '') !== clientFilter) return false;
      if (dirFilter !== 'all' && c.direction !== dirFilter) return false;
      return true;
    });
  }, [data, agentFilter, clientFilter, dirFilter]);

  const handleDownload = () => {
    if (!filtered.length) return;
    const subject = agentFilter !== 'all' ? agentFilter : 'all-agents';
    downloadReport(filtered, `JC_Call-Report_${selectedDate}_${subject}.xlsx`, selectedDate);
  };

  // Selection helpers
  const recordingsInView = useMemo(
    () => filtered.filter(c => c.recordingUrl && c.callSid),
    [filtered],
  );

  const allSelected = recordingsInView.length > 0 && recordingsInView.every(c => selectedSids.has(c.callSid!));

  const toggleSelect = (sid: string) => {
    setSelectedSids(prev => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedSids(new Set());
    } else {
      setSelectedSids(new Set(recordingsInView.map(c => c.callSid!)));
    }
  };

  const downloadRecording = async (url: string, filename: string) => {
    const res = await fetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  const handleBulkDownload = async () => {
    for (const sid of selectedSids) {
      const call = filtered.find(c => c.callSid === sid);
      if (!call?.recordingUrl) continue;
      const url = call.recordingUrl + (call.recordingUrl.includes('?') ? '&' : '?') + 'download=1';
      await downloadRecording(url, `recording-${sid}.mp3`);
      await new Promise(r => setTimeout(r, 500));
    }
  };

  if (loading) {
    return (
      <>
        <NavBar />
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="grid grid-cols-5 gap-3 mb-6">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
          <div className="skeleton h-96 rounded-2xl" />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <NavBar />
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <p style={{ color: '#f87171' }}>Failed to load: {error}</p>
          <button onClick={() => fetchData(selectedDate)} className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ background: C.cyan, color: '#000' }}>
            Retry
          </button>
        </div>
      </>
    );
  }

  const agents = ['all', ...ACTIVE_AGENTS];
  const totalCalls = data.calls.length;
  const recordingCount = data.calls.filter(c => c.recordingUrl).length;

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <ErrorBoundary section="Call Log">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* Agent Summary Strip */}
        <div className="flex gap-3 overflow-x-auto pb-1">
          {data.agents.map(a => (
            <AgentMiniCard key={a.agent} {...a} />
          ))}
        </div>

        {/* Date Picker + Filter Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 border" style={{ background: C.card, borderColor: C.cyan + '44' }}>
            <span className="text-xs font-semibold" style={{ color: C.cyan }}>📅</span>
            <input
              type="date"
              value={selectedDate}
              max={todayMST}
              onChange={e => { if (e.target.value) { setSelectedDate(e.target.value); setSelectedSids(new Set()); } }}
              className="bg-transparent border-none text-xs font-mono cursor-pointer outline-none"
              style={{ color: C.text, colorScheme: 'dark', width: '120px' }}
            />
          </div>
          {selectedDate !== todayMST && (
            <button
              onClick={() => { setSelectedDate(todayMST); setSelectedSids(new Set()); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer transition-colors"
              style={{ background: C.cyan, color: '#0A0E1A' }}
            >
              ← Today
            </button>
          )}
          <div style={{ width: 1, height: 20, background: C.border }} />
          <Filter size={14} style={{ color: C.sub }} />
          <FilterDropdown
            value={agentFilter}
            onChange={setAgentFilter}
            options={agents.map(a => ({ value: a, label: a === 'all' ? 'All Agents' : capitalize(a) }))}
          />
          <FilterDropdown
            value={clientFilter}
            onChange={setClientFilter}
            options={[
              { value: 'all', label: 'All Clients' },
              ...clientOptions.map(c => ({ value: c, label: c })),
            ]}
          />
          <FilterDropdown
            value={dirFilter}
            onChange={v => setDirFilter(v as 'all' | 'inbound' | 'outbound')}
            options={[
              { value: 'all', label: 'All Directions' },
              { value: 'inbound', label: 'Inbound' },
              { value: 'outbound', label: 'Outbound' },
            ]}
          />

          <div className="flex items-center gap-3 ml-auto">
            {recordingCount > 0 && (
              <span className="text-xs font-mono flex items-center gap-1" style={{ color: C.sub }}>
                <Volume2 size={12} /> {recordingCount} recordings
              </span>
            )}
            <span className="text-xs font-mono" style={{ color: C.sub }}>
              {filtered.length} / {totalCalls} calls
            </span>
            {selectedSids.size > 0 && (
              <button
                onClick={handleBulkDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: C.cyan + '18',
                  color: C.cyan,
                  border: `1px solid ${C.cyan}44`,
                }}
              >
                <Download size={13} />
                Download {selectedSids.size} Recording{selectedSids.size > 1 ? 's' : ''}
              </button>
            )}
            <button
              onClick={handleDownload}
              disabled={!filtered.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: filtered.length ? C.lime + '18' : 'transparent',
                color: filtered.length ? C.lime : C.sub,
                border: `1px solid ${filtered.length ? C.lime + '44' : C.border}`,
              }}
            >
              <Download size={13} />
              Export Report
            </button>
          </div>
        </div>

        {/* Call Table */}
        <Card padding={false}>
          <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: '#141824' }}>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th className="px-3 py-2.5 w-10">
                    {recordingsInView.length > 0 && (
                      <button onClick={toggleAll} className="p-0.5 rounded hover:bg-white/5" title="Select all recordings">
                        {allSelected
                          ? <CheckSquare size={14} style={{ color: C.cyan }} />
                          : <Square size={14} style={{ color: C.sub }} />}
                      </button>
                    )}
                  </th>
                  {['Time', 'Agent', 'Client', 'Phone', 'Duration', '', 'Recording'].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs font-medium" style={{ color: C.sub }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((call, i) => {
                  const hasRec = !!(call.recordingUrl && call.callSid);
                  const isSelected = hasRec && selectedSids.has(call.callSid!);
                  return (
                    <tr key={i} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="px-3 py-2.5 w-10">
                        {hasRec && (
                          <button onClick={() => toggleSelect(call.callSid!)} className="p-0.5 rounded hover:bg-white/5">
                            {isSelected
                              ? <CheckSquare size={14} style={{ color: C.cyan }} />
                              : <Square size={14} style={{ color: C.sub }} />}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.sub }}>{formatTime(call.time)}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: agentColor(call.agent) }} />
                          <span className="font-medium" style={{ color: C.text }}>{capitalize(call.agent)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-xs" style={{ color: call.account ? C.text : C.border }}>
                        {call.account || '—'}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.sub }}>{formatPhone(call.phone)}</td>
                      <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.text }}>{formatDuration(call.duration)}</td>
                      <td className="px-5 py-2.5">
                        {call.direction === 'inbound'
                          ? <ArrowDown size={14} style={{ color: '#4ade80' }} />
                          : <ArrowUp size={14} style={{ color: '#38bdf8' }} />}
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          {hasRec ? (
                            <>
                              <InlinePlayer callSid={call.callSid!} recordingUrl={call.recordingUrl!} />
                              <button
                                onClick={() => downloadRecording(
                                  call.recordingUrl! + (call.recordingUrl!.includes('?') ? '&' : '?') + 'download=1',
                                  `recording-${call.callSid}.mp3`
                                )}
                                className="p-1 rounded-md transition-colors hover:bg-white/5 border-none bg-transparent cursor-pointer"
                                title="Download recording"
                              >
                                <Download size={13} style={{ color: C.sub }} />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs" style={{ color: C.border }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm" style={{ color: C.sub }}>
                      No calls match the current filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      </ErrorBoundary>
    </>
  );
}
