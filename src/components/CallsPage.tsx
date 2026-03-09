'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import NavBar from './NavBar';
import Card from './Card';
import { C, capitalize, fmtTalkTime, ACTIVE_AGENTS, agentColor } from '@/lib/constants';
import type { RawCall } from '@/lib/getDashboard';
import { ArrowDown, ArrowUp, Filter, Download, Play, Pause, Square, Volume2, CheckSquare } from 'lucide-react';

// ── Formatters ──────────────────────────────────────────────────────────────

function formatPhone(num: string): string {
  if (!num) return '—';
  const d = num.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return num;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Edmonton',
    });
  } catch { return '—'; }
}

// ── Types ───────────────────────────────────────────────────────────────────

interface AgentSummary { agent: string; calls: number; talkMin: number }
interface CallsResponse { calls: RawCall[]; agents: AgentSummary[]; pulledAt: string }

// ── CSV Export ──────────────────────────────────────────────────────────────

function downloadCSV(calls: RawCall[], filename: string) {
  const header = 'Time,Agent,Client,Phone,Duration (sec),Direction\n';
  const rows = calls.map(c =>
    `"${new Date(c.time).toLocaleString('en-US', { timeZone: 'America/Edmonton' })}","${c.agent}","${c.account || ''}","${formatPhone(c.phone)}",${c.duration},"${c.direction}"`
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Audio Player ────────────────────────────────────────────────────────────

function InlinePlayer({ callSid, recordingUrl }: { callSid: string; recordingUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [progress, setProgress] = useState(0);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state === 'idle' || state === 'error') {
      setState('loading');
      audio.src = recordingUrl;
      audio.load();
      audio.play().then(() => setState('playing')).catch(() => setState('error'));
    } else if (state === 'playing') {
      audio.pause();
      setState('paused');
    } else if (state === 'paused') {
      audio.play().then(() => setState('playing')).catch(() => setState('error'));
    }
  };

  const stop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setState('idle');
    setProgress(0);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    };
    const onEnd = () => { setState('idle'); setProgress(0); };
    const onErr = () => setState('error');

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onErr);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('error', onErr);
    };
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <audio ref={audioRef} preload="none" />
      <button
        onClick={toggle}
        className="p-1 rounded-md transition-colors hover:bg-white/5"
        title={state === 'playing' ? 'Pause' : 'Play recording'}
      >
        {state === 'loading' ? (
          <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.cyan, borderTopColor: 'transparent' }} />
        ) : state === 'playing' ? (
          <Pause size={14} style={{ color: C.cyan }} />
        ) : state === 'error' ? (
          <Volume2 size={14} style={{ color: '#f87171' }} />
        ) : (
          <Play size={14} style={{ color: C.cyan }} />
        )}
      </button>
      {(state === 'playing' || state === 'paused') && (
        <>
          <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: C.border }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: C.cyan }} />
          </div>
          <button onClick={stop} className="p-0.5 rounded hover:bg-white/5">
            <Square size={10} style={{ color: C.sub }} />
          </button>
        </>
      )}
    </div>
  );
}

// ── Filter Pill ─────────────────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
      style={{
        background: active ? C.cyan + '22' : 'transparent',
        color: active ? C.cyan : C.sub,
        border: `1px solid ${active ? C.cyan + '44' : C.border}`,
      }}
    >
      {label}
    </button>
  );
}

// ── Agent Mini Card ─────────────────────────────────────────────────────────

function AgentMiniCard({ agent, calls, talkMin }: AgentSummary) {
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

export default function CallsPage() {
  const [data, setData] = useState<CallsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState('all');
  const [dirFilter, setDirFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [selectedSids, setSelectedSids] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
      const res = await fetch(`/api/calls?date=${today}`);
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
    fetchData();
    const interval = setInterval(fetchData, 120_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.calls.filter(c => {
      if (agentFilter !== 'all' && c.agent.toLowerCase() !== agentFilter) return false;
      if (dirFilter !== 'all' && c.direction !== dirFilter) return false;
      return true;
    });
  }, [data, agentFilter, dirFilter]);

  const handleDownload = () => {
    if (!filtered.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const suffix = agentFilter !== 'all' ? `-${agentFilter}` : '';
    downloadCSV(filtered, `calls-${today}${suffix}.csv`);
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

  const handleBulkDownload = async () => {
    for (const sid of selectedSids) {
      const call = filtered.find(c => c.callSid === sid);
      if (!call?.recordingUrl) continue;
      const url = call.recordingUrl + (call.recordingUrl.includes('?') ? '&' : '?') + 'download=1';
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${sid}.mp3`;
      a.click();
      await new Promise(r => setTimeout(r, 500)); // stagger downloads
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
          <button onClick={fetchData} className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ background: C.cyan, color: '#000' }}>
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
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* Agent Summary Strip */}
        <div className="flex gap-3 overflow-x-auto pb-1">
          {data.agents.map(a => (
            <AgentMiniCard key={a.agent} {...a} />
          ))}
        </div>

        {/* Filter Bar + Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={14} style={{ color: C.sub }} />
          {agents.map(a => (
            <Pill key={a} label={a === 'all' ? 'All Agents' : capitalize(a)} active={agentFilter === a} onClick={() => setAgentFilter(a)} />
          ))}
          <span className="mx-2 h-4 w-px" style={{ background: C.border }} />
          {(['all', 'inbound', 'outbound'] as const).map(d => (
            <Pill key={d} label={capitalize(d)} active={dirFilter === d} onClick={() => setDirFilter(d)} />
          ))}

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
              Export CSV
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
                              <a
                                href={call.recordingUrl! + (call.recordingUrl!.includes('?') ? '&' : '?') + 'download=1'}
                                download={`recording-${call.callSid}.mp3`}
                                className="p-1 rounded-md transition-colors hover:bg-white/5"
                                title="Download recording"
                              >
                                <Download size={13} style={{ color: C.sub }} />
                              </a>
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
    </>
  );
}
