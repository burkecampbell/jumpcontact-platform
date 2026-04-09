'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import NavBar from './NavBar';
import Card from './Card';
import { C, capitalize, fmtSpeed, fmtTalkTime, speedGrade, agentColor } from '@/lib/constants';
import { formatPhone, formatDuration, formatTime } from '@/lib/formatters';
import type { DashboardData, RawCall, RepAgent } from '@/lib/getDashboard';
import { Phone, PhoneMissed, TrendingUp, Zap, Users, ArrowDown, ArrowUp, Percent, Timer, Clock, ChevronUp, ChevronDown, Download, Share2 } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';
import HealthBanner from './HealthBanner';
import InlinePlayer from './InlinePlayer';
import { useBrand } from '@/hooks/useBrand';
import MixedInsights from './MixedInsights';

import KPICard from './KPICard';
import OvrBadge from './OvrBadge';
import { shareRecording } from '@/lib/recording-utils';
import { computeOVRFromInput, computeBaselineOVR, computeOpportunityWeight, parseShiftHours } from '@/lib/ratings';
import type { AgentBaseline } from '@/lib/types';
import agentHistoryData from '@/data/agent-history.json';

type SortKey = 'calls' | 'talkMin' | 'pickup' | 'wrapUp' | 'hoursScheduled' | 'convs' | 'convPct' | 'pickupRate' | 'ovr';

function LiveNowPageInner() {
  const { brand, isMixed, fullName } = useBrand();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('calls');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/data?brand=${brand}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [brand]);

  useEffect(() => {
    setLoading(true);
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
  const todayAgentSum = data.today.repActivity.agents.reduce((s, a) => s + a.calls, 0);
  const todayCalls    = Math.max(data.today.answeredCalls ?? 0, todayAgentSum);
  const yestAgentSum  = data.yesterday.repActivity.agents.reduce((s, a) => s + a.calls, 0);
  const yesterdayCalls= Math.max(data.yesterday.answeredCalls ?? 0, yestAgentSum);
  const todayMissed   = data.today.missedCalls.total;
  const yesterdayMissed= data.yesterday.missedCalls.total;

  // Yesterday's missed calls up to this hour (for "by now" context)
  const nowHourMST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' })).getHours();
  const yesterdayMissedByNow = data.yesterday.missedCalls.hourly
    ? data.yesterday.missedCalls.hourly.slice(0, nowHourMST + 1).reduce((s, v) => s + v, 0)
    : null;
  const avgSpeed      = data.today.repActivity.avgSpeedSec;
  const grade         = speedGrade(avgSpeed);
  const activeAgentNames = data.today.repActivity.agents.map(a => capitalize(a.agent));
  const convRate      = data.today.conversionRate;
  const yesterdayRate = data.yesterday.conversionRate;

  // Avg pickup rate + wrap-up across agents
  const agents = data.today.repActivity.agents;
  const agentsWithPickup = agents.filter(a => a.pickupRate != null);
  const avgPickupRate = agentsWithPickup.length > 0
    ? Math.round(agentsWithPickup.reduce((s, a) => s + (a.pickupRate ?? 0), 0) / agentsWithPickup.length)
    : null;
  const agentsWithWrap = agents.filter(a => a.wrapUpSec != null && a.wrapUpSec > 0);
  const avgWrap = agentsWithWrap.length > 0
    ? agentsWithWrap.reduce((s, a) => s + (a.wrapUpSec ?? 0), 0) / agentsWithWrap.length
    : null;

  // Build Ytica MTD lookup for accurate pickup speed + wrap-up fallback
  const yticaMtd: Record<string, { avgSpeedSec?: number; avgWrapUpSec?: number }> = {};
  for (const y of (data.mtdRepActivity || [])) {
    yticaMtd[y.agent.toLowerCase()] = { avgSpeedSec: y.avgSpeedSec ?? undefined, avgWrapUpSec: y.avgWrapUpSec ?? undefined };
  }

  // Build agent ranking rows with conversions + Ytica-corrected speeds
  const convByAgent: Record<string, number> = {};
  for (const a of data.today.conversions.byAgent) convByAgent[a.agent.toLowerCase()] = a.count;

  // Load baselines from accumulator for OVR trend arrows
  const history = agentHistoryData as { months: Record<string, Record<string, {
    calls: number; conversions: number; avgSpeedSec: number; talkMin: number;
    avgWrapUpSec: number; avgPickupRate: number | null; avgDeclineRate: number | null; workingDays: number;
  }>> };
  const baselineMap: Record<string, number> = {};
  for (const [, agentsInMonth] of Object.entries(history.months)) {
    for (const [agentName, d] of Object.entries(agentsInMonth)) {
      if (!baselineMap[agentName] && d.calls > 0) {
        baselineMap[agentName] = computeBaselineOVR({
          agent: agentName, totalCalls: d.calls, totalConversions: d.conversions,
          avgSpeedSec: d.avgSpeedSec, talkMin: d.talkMin, avgWrapUpSec: d.avgWrapUpSec,
          avgPickupRate: d.avgPickupRate, avgDeclineRate: d.avgDeclineRate, workingDays: d.workingDays,
        });
      }
    }
  }

  // Build opportunity weights from hourly call distribution + agent schedules
  const hourlyDist = data.today.repActivity.agents.length > 0
    ? (data as { today: { hourlyTotal?: number[] } }).today.hourlyTotal || []
    : [];
  const schedLookup: Record<string, { start: number; end: number }> = {};
  if (data.schedule?.agents) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const nowDay = days[new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' })).getDay()];
    for (const sa of data.schedule.agents) {
      const shift = sa.schedule[nowDay] || sa.schedule[nowDay.toLowerCase()] || '';
      const parsed = parseShiftHours(shift);
      if (parsed) schedLookup[sa.name.toLowerCase()] = parsed;
    }
  }

  type RankRow = RepAgent & { convs: number; pickup: number | null; wrapUp: number | null; ovr: number; baselineOvr: number };
  const rankRows: RankRow[] = agents.map(a => {
    const yt = yticaMtd[a.agent.toLowerCase()];
    const pickup = (a.speedSec != null && a.speedSec > 0 && a.speedSec <= 10)
      ? a.speedSec
      : (yt?.avgSpeedSec ?? a.speedSec ?? null);
    const wrapUp = (a.wrapUpSec != null && a.wrapUpSec > 0)
      ? a.wrapUpSec
      : (yt?.avgWrapUpSec ?? null);
    const convs = convByAgent[a.agent.toLowerCase()] || 0;
    // Opportunity weight: what fraction of daily calls land during this agent's shift
    const shift = schedLookup[a.agent.toLowerCase()];
    const oppWeight = shift && hourlyDist.length >= 24
      ? computeOpportunityWeight(hourlyDist, shift.start, shift.end)
      : undefined;
    const { ovr } = computeOVRFromInput({
      calls: a.calls,
      conversions: convs,
      speedSec: pickup,
      convsPerHour: a.convsPerHour ?? null,
      pickupRate: a.pickupRate ?? null,
      talkMin: a.talkMin,
      wrapUpSec: wrapUp,
      declineRate: a.declineRate ?? null,
      hoursScheduled: a.hoursScheduled || 8,
      opportunityWeight: oppWeight,
    });
    return {
      ...a,
      convs,
      pickup,
      wrapUp,
      ovr,
      baselineOvr: baselineMap[a.agent.toLowerCase()] || 0,
    };
  });

  // Sort
  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };
  const sorted = [...rankRows].sort((a, b) => {
    const get = (r: RankRow) => {
      if (sortKey === 'ovr') return r.ovr;
      if (sortKey === 'convs') return r.convs;
      if (sortKey === 'convPct') return r.calls > 0 ? r.convs / r.calls : -1;
      if (sortKey === 'pickup') return r.pickup ?? -1;
      if (sortKey === 'wrapUp') return r.wrapUp ?? -1;
      if (sortKey === 'pickupRate') return r.pickupRate ?? -1;
      return (r[sortKey] ?? -1) as number;
    };
    return sortAsc ? get(a) - get(b) : get(b) - get(a);
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return null;
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <HealthBanner />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Mixed: Cross-brand insights */}
        {isMixed && data.brandBreakdown && <MixedInsights breakdown={data.brandBreakdown} />}

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
        <ErrorBoundary section="KPI Cards">
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
            inverse
            subtitle={yesterdayMissedByNow != null ? `Yesterday by now: ${yesterdayMissedByNow}` : undefined}
          />
          <KPICard
            label="Avg Speed"
            value={fmtSpeed(avgSpeed)}
            icon={<Zap size={18} />}
            badge={avgSpeed !== null ? { label: grade.grade, color: grade.color } : undefined}
          />
          <KPICard
            label="Pickup Rate"
            value={avgPickupRate != null ? `${avgPickupRate}%` : '—'}
            icon={<Timer size={18} />}
            badge={avgPickupRate != null ? {
              label: avgPickupRate >= 80 ? 'Good' : avgPickupRate >= 60 ? 'OK' : 'Low',
              color: avgPickupRate >= 80 ? '#4ade80' : avgPickupRate >= 60 ? '#facc15' : '#f87171',
            } : undefined}
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
        </ErrorBoundary>

        {/* Agent Ranking Table */}
        <ErrorBoundary section="Agent Ranking">
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
                    <th className="px-3 py-2 text-center text-xs font-medium cursor-pointer select-none"
                        style={{ color: sortKey === 'ovr' ? C.cyan : C.sub }}
                        onClick={() => handleSort('ovr')}>
                      <span className="inline-flex items-center gap-0.5">OVR <SortIcon col={'ovr' as SortKey} /></span>
                    </th>
                    {([
                      ['convs', 'Conv'],
                      ['calls', 'Calls'],
                      ['talkMin', 'Talk Time'],
                      ['pickup', 'Pickup'],
                      ['wrapUp', 'Wrap-Up'],
                      ['pickupRate', 'Pickup %'],
                      ['hoursScheduled', 'Hrs'],
                      ['convPct', 'Conv %'],
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
                      <td className="px-3 py-2.5 text-center">
                        <OvrBadge ovr={row.ovr} baselineOvr={row.baselineOvr} size="sm" />
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs font-bold" style={{ color: C.lime }}>{row.convs}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: C.text }}>{row.calls}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: C.text }}>{fmtTalkTime(row.talkMin)}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: row.pickup != null ? speedGrade(row.pickup).color : C.sub }}>
                        {row.pickup != null ? fmtSpeed(row.pickup) : '—'}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: C.text }}>
                        {row.wrapUp != null ? fmtSpeed(row.wrapUp) : '—'}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{
                        color: row.pickupRate != null
                          ? (row.pickupRate >= 80 ? '#4ade80' : row.pickupRate >= 60 ? '#facc15' : '#f87171')
                          : C.sub
                      }}>
                        {row.pickupRate != null ? `${row.pickupRate}%` : '—'}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: C.sub }}>{row.hoursScheduled}h</td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: row.calls > 0 && row.conversions > 0 ? (row.conversions / row.calls >= 0.2 ? '#4ade80' : C.text) : C.sub }}>
                        {row.calls > 0 ? ((row.conversions / row.calls) * 100).toFixed(1) + '%' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        </ErrorBoundary>

        {/* Recent Calls Table */}
        <ErrorBoundary section="Recent Calls">
        <Card padding={false}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>Last 20 Calls</h2>
            <span className="text-xs" style={{ color: C.sub }}>Auto-refreshes every 60s</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Time', 'Agent', 'Client', 'Phone', 'Duration', 'Ring', 'Wrap', '', 'Recording'].map(h => (
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
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: agentColor(call.agent) }} />
                        <span className="font-medium" style={{ color: C.text }}>{capitalize(call.agent)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-xs" style={{ color: call.account ? C.text : C.border }}>
                      {call.account || '—'}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.sub }}>
                      {formatPhone(call.phone)}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.text }}>
                      {formatDuration(call.duration)}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: call.ringTime ? C.cyan : C.border }}>
                      {call.ringTime ? call.ringTime + 's' : '—'}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: call.wrapUpSec ? C.sub : C.border }}>
                      {call.wrapUpSec ? Math.round(call.wrapUpSec) + 's' : '—'}
                    </td>
                    <td className="px-5 py-2.5">
                      {call.direction === 'inbound'
                        ? <ArrowDown size={14} style={{ color: C.good }} />
                        : <ArrowUp size={14} style={{ color: C.info }} />}
                    </td>
                    <td className="px-5 py-2.5">
                      {call.recordingUrl ? (
                        <div className="flex items-center gap-1">
                          <InlinePlayer callSid={call.callSid!} recordingUrl={call.recordingUrl} />
                          <button
                            onClick={() => shareRecording(call)}
                            className="p-1 rounded-md transition-colors hover:bg-white/5"
                            title="Share recording"
                          >
                            <Share2 size={13} style={{ color: C.sub }} />
                          </button>
                          <a
                            href={`${call.recordingUrl}${call.recordingUrl.includes('?') ? '&' : '?'}download=1`}
                            download
                            className="p-1 rounded-md transition-colors hover:bg-white/5"
                            title="Download recording"
                          >
                            <Download size={13} style={{ color: C.sub }} />
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: C.border }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(!data.recentCalls || data.recentCalls.length === 0) && (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-sm" style={{ color: C.sub }}>
                      No calls yet today
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        </ErrorBoundary>
      </div>
    </>
  );
}

export default function LiveNowPage() {
  return (
    <Suspense fallback={<><NavBar /><div className="max-w-6xl mx-auto px-4 py-6"><div className="skeleton h-96 rounded-2xl" /></div></>}>
      <LiveNowPageInner />
    </Suspense>
  );
}
