'use client';

import { useEffect, useState, useCallback } from 'react';
import NavBar from './NavBar';
import Card from './Card';
import { C, capitalize, fmtSpeed, fmtTalkTime, speedGrade, agentColor } from '@/lib/constants';
import type { DashboardData, RawCall, RepAgent } from '@/lib/getDashboard';
import { Phone, PhoneMissed, TrendingUp, Zap, Users, ArrowDown, ArrowUp, Percent, Timer, Clock, ChevronUp, ChevronDown } from 'lucide-react';

function formatPhone(num: string): string {
  if (!num) return '—';
  const digits = num.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
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

interface KPIProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  delta?: number | null;
  suffix?: string;
  badge?: { label: string; color: string };
}

function KPICard({ label, value, icon, delta, suffix, badge }: KPIProps) {
  return (
    <Card className="flex-1 min-w-[160px]">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: C.sub }}>{label}</span>
        <span style={{ color: C.cyan }}>{icon}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold count-up" style={{ color: C.text }}>
          {value}{suffix || ''}
        </span>
        {badge && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded mb-0.5"
                style={{ background: badge.color + '22', color: badge.color }}>
            {badge.label}
          </span>
        )}
      </div>
      {delta !== undefined && delta !== null && (
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs" style={{ color: delta >= 0 ? '#4ade80' : '#f87171' }}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs yesterday
          </span>
        </div>
      )}
    </Card>
  );
}

type SortKey = 'calls' | 'talkMin' | 'speedSec' | 'wrapUpSec' | 'hoursScheduled' | 'convs' | 'convsPerHour';

export default function LiveNowPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('calls');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <>
        <NavBar />
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
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
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <p style={{ color: '#f87171' }}>Failed to load: {error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ background: C.cyan, color: '#000' }}>
            Retry
          </button>
        </div>
      </>
    );
  }

  const todayConv     = data.today.conversions.total;
  const yesterdayConv = data.yesterday.conversions.total;
  const todayCalls    = data.today.repActivity.agents.reduce((s, a) => s + a.calls, 0);
  const yesterdayCalls= data.yesterday.repActivity.agents.reduce((s, a) => s + a.calls, 0);
  const todayMissed   = data.today.missedCalls.jcTotal;
  const yesterdayMissed= data.yesterday.missedCalls.jcTotal;
  const avgSpeed      = data.today.repActivity.avgSpeedSec;
  const grade         = speedGrade(avgSpeed);
  const activeAgentNames = data.today.repActivity.agents.map(a => capitalize(a.agent));
  const convRate      = data.today.conversionRate;
  const yesterdayRate = data.yesterday.conversionRate;

  // Avg ring / wrap-up across agents
  const agents = data.today.repActivity.agents;
  const agentsWithSpeed = agents.filter(a => a.speedSec != null);
  const avgRing = agentsWithSpeed.length > 0
    ? agentsWithSpeed.reduce((s, a) => s + (a.speedSec ?? 0), 0) / agentsWithSpeed.length
    : null;
  const agentsWithWrap = agents.filter(a => a.wrapUpSec != null);
  const avgWrap = agentsWithWrap.length > 0
    ? agentsWithWrap.reduce((s, a) => s + (a.wrapUpSec ?? 0), 0) / agentsWithWrap.length
    : null;

  // Build agent ranking rows with conversions
  const convByAgent: Record<string, number> = {};
  for (const a of data.today.conversions.byAgent) convByAgent[a.agent.toLowerCase()] = a.count;

  type RankRow = RepAgent & { convs: number };
  const rankRows: RankRow[] = agents.map(a => ({
    ...a,
    convs: convByAgent[a.agent.toLowerCase()] || 0,
  }));

  // Sort
  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };
  const sorted = [...rankRows].sort((a, b) => {
    const av = sortKey === 'convs' ? a.convs : (a[sortKey] ?? -1);
    const bv = sortKey === 'convs' ? b.convs : (b[sortKey] ?? -1);
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return null;
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Pace Comparison Line */}
        {yesterdayConv > 0 && (
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="text-xs" style={{ color: C.sub }}>
              Yesterday at this time: <span className="font-mono font-semibold" style={{ color: C.text }}>{yesterdayConv}</span> conversions
              {todayConv !== yesterdayConv && (
                <span style={{ color: todayConv >= yesterdayConv ? '#4ade80' : '#f87171' }}>
                  {' '}— you&apos;re {todayConv >= yesterdayConv ? 'ahead' : 'behind'} at <span className="font-mono font-semibold">{todayConv}</span>
                </span>
              )}
            </span>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
          <KPICard
            label="Conversions"
            value={todayConv}
            icon={<TrendingUp size={18} />}
            delta={todayConv - yesterdayConv}
          />
          <KPICard
            label="Calls Answered"
            value={todayCalls}
            icon={<Phone size={18} />}
            delta={todayCalls - yesterdayCalls}
          />
          <KPICard
            label="Missed Calls"
            value={todayMissed}
            icon={<PhoneMissed size={18} />}
            delta={todayMissed - yesterdayMissed}
          />
          <KPICard
            label="Avg Speed"
            value={fmtSpeed(avgSpeed)}
            icon={<Zap size={18} />}
            badge={avgSpeed !== null ? { label: grade.grade, color: grade.color } : undefined}
          />
          <KPICard
            label="Avg Ring"
            value={fmtSpeed(avgRing)}
            icon={<Timer size={18} />}
          />
          <KPICard
            label="Avg Wrap-Up"
            value={fmtSpeed(avgWrap)}
            icon={<Clock size={18} />}
          />
          <KPICard
            label="Conv Rate"
            value={convRate != null ? convRate : '—'}
            suffix={convRate != null ? '%' : ''}
            icon={<Percent size={18} />}
            delta={convRate != null && yesterdayRate != null ? +(convRate - yesterdayRate).toFixed(1) : undefined}
          />
          <Card className="flex-1 min-w-[160px]">
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: C.sub }}>Active Agents</span>
              <span style={{ color: C.cyan }}><Users size={18} /></span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {activeAgentNames.length > 0 ? activeAgentNames.map(name => (
                <span key={name} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: agentColor(name) + '22', color: agentColor(name), border: `1px solid ${agentColor(name)}44` }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: agentColor(name) }} />
                  {name}
                </span>
              )) : (
                <span className="text-sm font-mono" style={{ color: C.sub }}>0 / 5</span>
              )}
            </div>
          </Card>
        </div>

        {/* Agent Ranking Table */}
        {sorted.length > 0 && (
          <Card padding={false} className="mb-6">
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-sm font-semibold" style={{ color: C.text }}>Agent Ranking</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th className="px-5 py-2 text-left text-xs font-medium" style={{ color: C.sub }}>Agent</th>
                    {([
                      ['convs', 'Conv'],
                      ['calls', 'Calls'],
                      ['talkMin', 'Talk Time'],
                      ['speedSec', 'Ring'],
                      ['wrapUpSec', 'Wrap-Up'],
                      ['hoursScheduled', 'Hrs'],
                      ['convsPerHour', 'Conv/Hr'],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <th key={key}
                          className="px-5 py-2 text-right text-xs font-medium cursor-pointer select-none"
                          style={{ color: sortKey === key ? C.cyan : C.sub }}
                          onClick={() => handleSort(key)}>
                        <span className="inline-flex items-center gap-0.5">
                          {label} <SortIcon col={key} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(row => (
                    <tr key={row.agent} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: agentColor(row.agent) }} />
                          <span className="font-medium" style={{ color: C.text }}>{capitalize(row.agent)}</span>
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs font-bold" style={{ color: C.lime }}>{row.convs}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: C.text }}>{row.calls}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: C.text }}>{fmtTalkTime(row.talkMin)}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: C.text }}>{fmtSpeed(row.speedSec)}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: C.text }}>{fmtSpeed(row.wrapUpSec)}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: C.sub }}>{row.hoursScheduled}h</td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: row.convsPerHour != null && row.convsPerHour >= 2 ? '#4ade80' : C.text }}>
                        {row.convsPerHour != null ? row.convsPerHour.toFixed(1) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Recent Calls Table */}
        <Card padding={false}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>Last 20 Calls</h2>
            <span className="text-xs" style={{ color: C.sub }}>Auto-refreshes every 60s</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Time', 'Agent', 'Phone', 'Duration', ''].map(h => (
                    <th key={h} className="px-5 py-2 text-left text-xs font-medium" style={{ color: C.sub }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.recentCalls || []).map((call: RawCall, i: number) => (
                  <tr key={i} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.sub }}>
                      {formatTime(call.time)}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="font-medium" style={{ color: C.text }}>{capitalize(call.agent)}</span>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.sub }}>
                      {formatPhone(call.phone)}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.text }}>
                      {formatDuration(call.duration)}
                    </td>
                    <td className="px-5 py-2.5">
                      {call.direction === 'inbound' ? (
                        <ArrowDown size={14} style={{ color: '#4ade80' }} />
                      ) : (
                        <ArrowUp size={14} style={{ color: '#38bdf8' }} />
                      )}
                    </td>
                  </tr>
                ))}
                {(!data.recentCalls || data.recentCalls.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm" style={{ color: C.sub }}>
                      No calls yet today
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
