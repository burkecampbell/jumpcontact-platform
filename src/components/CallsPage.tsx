'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import NavBar from './NavBar';
import Card from './Card';
import { C, capitalize, fmtTalkTime, ACTIVE_AGENTS, agentColor } from '@/lib/constants';
import type { RawCall } from '@/lib/getDashboard';
import { ArrowDown, ArrowUp, Phone, Filter } from 'lucide-react';

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

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/calls');
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

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={14} style={{ color: C.sub }} />
          {agents.map(a => (
            <Pill key={a} label={a === 'all' ? 'All Agents' : capitalize(a)} active={agentFilter === a} onClick={() => setAgentFilter(a)} />
          ))}
          <span className="mx-2 h-4 w-px" style={{ background: C.border }} />
          {(['all', 'inbound', 'outbound'] as const).map(d => (
            <Pill key={d} label={capitalize(d)} active={dirFilter === d} onClick={() => setDirFilter(d)} />
          ))}
          <span className="text-xs ml-auto font-mono" style={{ color: C.sub }}>
            {filtered.length} / {totalCalls} calls
          </span>
        </div>

        {/* Call Table */}
        <Card padding={false}>
          <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: '#141824' }}>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Time', 'Agent', 'Phone', 'Duration', ''].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs font-medium" style={{ color: C.sub }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((call, i) => (
                  <tr key={i} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.sub }}>{formatTime(call.time)}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: agentColor(call.agent) }} />
                        <span className="font-medium" style={{ color: C.text }}>{capitalize(call.agent)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.sub }}>{formatPhone(call.phone)}</td>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.text }}>{formatDuration(call.duration)}</td>
                    <td className="px-5 py-2.5">
                      {call.direction === 'inbound'
                        ? <ArrowDown size={14} style={{ color: '#4ade80' }} />
                        : <ArrowUp size={14} style={{ color: '#38bdf8' }} />}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm" style={{ color: C.sub }}>
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
