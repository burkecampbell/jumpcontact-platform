'use client';

import { useEffect, useState, useCallback, Suspense, useMemo } from 'react';
import NavBar from './NavBar';
import HealthBanner from './HealthBanner';
import Card from './Card';
import ErrorBoundary from './ErrorBoundary';
import OvrBadge from './OvrBadge';
import TopAgents, { type CategoryTop3 } from './TopAgents';
import { C, capitalize, agentColor, fmtSpeed, fmtTalkTime, rankBadge, speedGrade } from '@/lib/constants';
import { computeOVRFromInput, computeBaselineOVR, computeElapsedHours, ratingTier, ratingDelta, SUB_RATING_LABELS, type OvrInput } from '@/lib/ratings';
import type { DashboardData, RepAgent, AgentBaseline, AgentSubRatings } from '@/lib/types';
import { useBrand } from '@/hooks/useBrand';
import { isAgentForBrand } from '@/lib/brand';
import { Trophy, ChevronUp, ChevronDown, FileText } from 'lucide-react';
import agentHistoryData from '@/data/agent-history.json';

// ── Types ────────────────────────────────────────────────────────────

type TimeHorizon = 'today' | 'monthly' | 'yearly' | 'alltime';

interface LeagueRow {
  agent: string;
  ovr: number;
  baselineOvr: number;
  trend: 'up' | 'down' | 'same';
  trendDelta: number;
  subRatings: AgentSubRatings;
  // Raw metrics for display
  calls: number;
  conversions: number;
  speedSec: number | null;
  convsPerHour: number | null;
  pickupRate: number | null;
  talkMin: number;
  wrapUpSec: number | null;
  declineRate: number | null;
  convPct: number | null;
}

type SortKey = 'ovr' | keyof AgentSubRatings | 'agent';

// ── Helpers ──────────────────────────────────────────────────────────

interface HistoryEntry {
  calls: number;
  conversions: number;
  avgSpeedSec: number;
  talkMin: number;
  avgWrapUpSec: number;
  avgPickupRate: number | null;
  avgDeclineRate: number | null;
  workingDays: number;
}

function getBaselines(): Record<string, AgentBaseline> {
  const map: Record<string, AgentBaseline> = {};
  const history = agentHistoryData as { months: Record<string, Record<string, HistoryEntry>> };

  for (const [, agents] of Object.entries(history.months)) {
    for (const [agent, d] of Object.entries(agents)) {
      if (!map[agent]) {
        map[agent] = {
          agent,
          totalCalls: d.calls,
          totalConversions: d.conversions,
          avgSpeedSec: d.avgSpeedSec,
          talkMin: d.talkMin,
          avgWrapUpSec: d.avgWrapUpSec,
          avgPickupRate: d.avgPickupRate,
          avgDeclineRate: d.avgDeclineRate,
          workingDays: d.workingDays,
        };
      } else {
        const prev = map[agent];
        const prevCalls = prev.totalCalls;
        prev.totalCalls += d.calls;
        prev.totalConversions += d.conversions;
        prev.talkMin += d.talkMin;
        prev.workingDays += d.workingDays;
        if (d.avgSpeedSec > 0 && d.calls > 0 && prev.totalCalls > 0) {
          prev.avgSpeedSec = (prev.avgSpeedSec * prevCalls + d.avgSpeedSec * d.calls) / prev.totalCalls;
        }
        if (d.avgWrapUpSec > 0 && d.calls > 0 && prev.totalCalls > 0) {
          prev.avgWrapUpSec = (prev.avgWrapUpSec * prevCalls + d.avgWrapUpSec * d.calls) / prev.totalCalls;
        }
      }
    }
  }
  return map;
}

function buildLeagueRow(
  a: RepAgent,
  convs: number,
  speedSec: number | null,
  wrapUpSec: number | null,
  baselineOvr: number,
  hoursElapsed?: number,
): LeagueRow {
  const convPct = a.calls > 0 ? +((convs / a.calls) * 100).toFixed(1) : null;
  const input: OvrInput = {
    calls: a.calls,
    conversions: convs,
    speedSec,
    convsPerHour: a.convsPerHour ?? null,
    pickupRate: a.pickupRate ?? null,
    talkMin: a.talkMin,
    wrapUpSec,
    declineRate: a.declineRate ?? null,
    hoursScheduled: a.hoursScheduled || 8,
    hoursElapsed,
  };
  const { ovr, subRatings } = computeOVRFromInput(input);
  const delta = ratingDelta(ovr, baselineOvr);

  return {
    agent: a.agent,
    ovr,
    baselineOvr,
    trend: delta.direction,
    trendDelta: delta.diff,
    subRatings,
    calls: a.calls,
    conversions: convs,
    speedSec,
    convsPerHour: a.convsPerHour ?? null,
    pickupRate: a.pickupRate ?? null,
    talkMin: a.talkMin,
    wrapUpSec,
    declineRate: a.declineRate ?? null,
    convPct,
  };
}

// ── Player Card ──────────────────────────────────────────────────────

function PlayerCard({ row }: { row: LeagueRow }) {
  const tier = ratingTier(row.ovr);

  return (
    <Card className="!p-0 overflow-hidden">
      {/* Header bar with tier color */}
      <div className="h-1" style={{ background: tier.color }} />
      <div className="p-4">
        {/* Name + OVR */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: agentColor(row.agent) }} />
            <span className="font-semibold text-sm" style={{ color: C.text }}>{capitalize(row.agent)}</span>
          </div>
          <OvrBadge ovr={row.ovr} baselineOvr={row.baselineOvr} size="lg" />
        </div>

        {/* Baseline comparison */}
        {row.baselineOvr > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px]" style={{ color: C.sub }}>Last Season</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: C.sub }}>{row.baselineOvr}</span>
            {row.trend !== 'same' && (
              <span className="text-[10px] font-bold" style={{ color: row.trend === 'up' ? '#4ade80' : '#f87171' }}>
                {row.trend === 'up' ? '+' : '-'}{row.trendDelta}
              </span>
            )}
          </div>
        )}

        {/* Sub-ratings grid */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
          {(Object.entries(row.subRatings) as [keyof AgentSubRatings, number][]).map(([key, val]) => {
            const meta = SUB_RATING_LABELS[key];
            const subTier = ratingTier(val);
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-[10px] font-medium cursor-help" style={{ color: C.sub }} title={meta.tooltip}>{meta.abbr}</span>
                <span className="text-[10px] font-mono font-bold" style={{ color: subTier.color }}>{val}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

function LeaguePageInner() {
  const { brand } = useBrand();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<TimeHorizon>('today');
  const [sortKey, setSortKey] = useState<SortKey>('ovr');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/data?brand=${brand}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
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

  // Build baselines from accumulator
  const baselines = useMemo(() => getBaselines(), []);

  // Build Ytica MTD lookup
  const yticaMtd = useMemo(() => {
    const map: Record<string, { avgSpeedSec?: number; avgWrapUpSec?: number }> = {};
    for (const y of (data?.mtdRepActivity || [])) {
      map[y.agent.toLowerCase()] = { avgSpeedSec: y.avgSpeedSec ?? undefined, avgWrapUpSec: y.avgWrapUpSec ?? undefined };
    }
    return map;
  }, [data?.mtdRepActivity]);

  // Build league rows — different data per time horizon
  const leagueRows = useMemo(() => {
    if (!data) return [];

    if (horizon === 'today') {
      // TODAY: live data from repActivity + today's conversions
      // Use elapsed shift hours (not full scheduled) for per-hour normalization
      const agents = data.today.repActivity.agents;
      const convByAgent: Record<string, number> = {};
      for (const a of data.today.conversions.byAgent) convByAgent[a.agent.toLowerCase()] = a.count;

      // Build schedule lookup for elapsed hours
      const schedMap: Record<string, string> = {};
      if (data.schedule?.agents) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
        const dayKey = days[now.getDay()];
        for (const sa of data.schedule.agents) {
          schedMap[sa.name.toLowerCase()] = sa.schedule[dayKey] || sa.schedule[dayKey.toLowerCase()] || '';
        }
      }
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));

      return agents
        .filter(a => a.calls > 0)
        .map(a => {
          const yt = yticaMtd[a.agent.toLowerCase()];
          const speedSec = (a.speedSec != null && a.speedSec > 0 && a.speedSec <= 10)
            ? a.speedSec
            : (yt?.avgSpeedSec ?? a.speedSec ?? null);
          const wrapUpSec = (a.wrapUpSec != null && a.wrapUpSec > 0)
            ? a.wrapUpSec
            : (yt?.avgWrapUpSec ?? null);
          const convs = convByAgent[a.agent.toLowerCase()] || 0;
          const bl = baselines[a.agent.toLowerCase()];
          const baselineOvr = bl ? computeBaselineOVR(bl) : 0;
          const shiftStr = schedMap[a.agent.toLowerCase()] || null;
          const elapsed = shiftStr ? computeElapsedHours(shiftStr, now) : undefined;

          return buildLeagueRow(a, convs, speedSec, wrapUpSec, baselineOvr, elapsed);
        });
    }

    // MONTHLY / YEARLY / ALL-TIME: use Ytica MTD data + MTD conversions
    // Monthly = this month's Ytica MTD (daily averages)
    // Yearly/All-Time = accumulator baselines (we only have March + current April MTD)
    const mtdAgents = data.mtdRepActivity || [];
    const mtdConvByAgent: Record<string, number> = {};
    for (const a of (data.mtd?.byAgent || [])) mtdConvByAgent[a.agent.toLowerCase()] = a.count;
    const dayOfMonth = data.mtd?.dayOfMonth || 1;

    if (horizon === 'monthly') {
      // Monthly: Ytica MTD totals, convert to daily averages for rating
      return mtdAgents
        .filter(a => a.totalCalls > 0 && isAgentForBrand(a.agent, brand))
        .map(a => {
          const name = a.agent.toLowerCase();
          const dailyCalls = a.totalCalls / dayOfMonth;
          const dailyConvs = (mtdConvByAgent[name] || 0) / dayOfMonth;
          const dailyTalkMin = a.totalTalkMin / dayOfMonth;
          const convRate = a.totalCalls > 0 ? ((mtdConvByAgent[name] || 0) / a.totalCalls) * 100 : 0;
          const convsPerHour = dailyConvs > 0 ? dailyConvs / 8 : null; // rough 8hr day

          const bl = baselines[name];
          const baselineOvr = bl ? computeBaselineOVR(bl) : 0;

          const mockAgent: RepAgent = {
            agent: a.agent,
            calls: Math.round(dailyCalls),
            talkMin: Math.round(dailyTalkMin),
            speedSec: a.avgSpeedSec,
            wrapUpSec: a.avgWrapUpSec,
            hoursScheduled: 8,
            conversions: Math.round(dailyConvs),
            convsPerHour: convsPerHour ?? undefined,
            pickupRate: undefined,
            declineRate: undefined,
          };

          return buildLeagueRow(
            mockAgent,
            Math.round(dailyConvs),
            a.avgSpeedSec,
            a.avgWrapUpSec,
            baselineOvr,
          );
        });
    }

    // YEARLY / ALL-TIME: combine accumulator baselines with current MTD
    // Each agent's all-time = baseline months + current MTD
    const combined: Record<string, { calls: number; convs: number; talkMin: number; speedSec: number | null; wrapUpSec: number | null; days: number }> = {};

    // Add baseline months
    for (const [name, bl] of Object.entries(baselines)) {
      combined[name] = {
        calls: bl.totalCalls,
        convs: bl.totalConversions,
        talkMin: bl.talkMin,
        speedSec: bl.avgSpeedSec,
        wrapUpSec: bl.avgWrapUpSec,
        days: bl.workingDays,
      };
    }

    // Add current month MTD
    for (const a of mtdAgents) {
      const name = a.agent.toLowerCase();
      const convs = mtdConvByAgent[name] || 0;
      if (!combined[name]) {
        combined[name] = { calls: a.totalCalls, convs, talkMin: a.totalTalkMin, speedSec: a.avgSpeedSec, wrapUpSec: a.avgWrapUpSec, days: dayOfMonth };
      } else {
        const prev = combined[name];
        const prevCalls = prev.calls;
        prev.calls += a.totalCalls;
        prev.convs += convs;
        prev.talkMin += a.totalTalkMin;
        prev.days += dayOfMonth;
        // Weighted average for speed
        if (a.avgSpeedSec != null && a.totalCalls > 0 && prev.calls > 0) {
          prev.speedSec = prev.speedSec != null
            ? (prev.speedSec * prevCalls + a.avgSpeedSec * a.totalCalls) / prev.calls
            : a.avgSpeedSec;
        }
        if (a.avgWrapUpSec != null && a.totalCalls > 0 && prev.calls > 0) {
          prev.wrapUpSec = prev.wrapUpSec != null
            ? (prev.wrapUpSec * prevCalls + a.avgWrapUpSec * a.totalCalls) / prev.calls
            : a.avgWrapUpSec;
        }
      }
    }

    return Object.entries(combined)
      .filter(([name, d]) => d.calls > 0 && isAgentForBrand(name, brand))
      .map(([name, d]) => {
        const dailyCalls = d.calls / Math.max(d.days, 1);
        const dailyConvs = d.convs / Math.max(d.days, 1);
        const dailyTalkMin = d.talkMin / Math.max(d.days, 1);
        const convsPerHour = dailyConvs > 0 ? dailyConvs / 8 : null;

        const mockAgent: RepAgent = {
          agent: name,
          calls: Math.round(dailyCalls),
          talkMin: Math.round(dailyTalkMin),
          speedSec: d.speedSec,
          wrapUpSec: d.wrapUpSec,
          hoursScheduled: 8,
          conversions: Math.round(dailyConvs),
          convsPerHour: convsPerHour ?? undefined,
        };

        // For all-time, baseline IS the data — no trend
        return buildLeagueRow(mockAgent, Math.round(dailyConvs), d.speedSec, d.wrapUpSec, 0);
      });
  }, [data, horizon, yticaMtd, baselines, brand]);

  // Sort
  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sorted = useMemo(() => {
    return [...leagueRows].sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === 'ovr') { va = a.ovr; vb = b.ovr; }
      else if (sortKey === 'agent') { return sortAsc ? a.agent.localeCompare(b.agent) : b.agent.localeCompare(a.agent); }
      else { va = a.subRatings[sortKey]; vb = b.subRatings[sortKey]; }
      return sortAsc ? va - vb : vb - va;
    });
  }, [leagueRows, sortKey, sortAsc]);

  // Top 3 categories
  const categories = useMemo((): CategoryTop3[] => {
    if (leagueRows.length === 0) return [];

    const top3 = (arr: LeagueRow[], label: string, fmtVal: (r: LeagueRow) => string, icon: string, id: string) => ({
      id, label, icon,
      topAgents: arr.slice(0, 3).map(r => ({
        agent: r.agent,
        value: fmtVal(r),
        ovr: r.ovr,
        baselineOvr: r.baselineOvr,
      })),
    });

    return [
      top3([...leagueRows].sort((a, b) => b.conversions - a.conversions), 'Conversions', r => `${r.conversions}`, '🏆', 'conv'),
      top3([...leagueRows].sort((a, b) => b.calls - a.calls), 'Calls', r => `${r.calls}`, '📞', 'calls'),
      top3(
        [...leagueRows].filter(r => r.speedSec != null && r.speedSec > 0).sort((a, b) => (a.speedSec ?? 99) - (b.speedSec ?? 99)),
        'Speed', r => fmtSpeed(r.speedSec), '⚡', 'speed',
      ),
      top3(
        [...leagueRows].filter(r => r.calls >= 5).sort((a, b) => (b.convPct ?? 0) - (a.convPct ?? 0)),
        'Conv %', r => `${r.convPct ?? 0}%`, '🎯', 'convPct',
      ),
      top3(
        [...leagueRows].filter(r => r.pickupRate != null).sort((a, b) => (b.pickupRate ?? 0) - (a.pickupRate ?? 0)),
        'Pickup Rate', r => `${r.pickupRate ?? 0}%`, '🛡', 'pickup',
      ),
      top3(
        [...leagueRows].filter(r => r.baselineOvr > 0).sort((a, b) => (b.ovr - b.baselineOvr) - (a.ovr - a.baselineOvr)),
        'vs Career', r => {
          const d = r.ovr - r.baselineOvr;
          return d > 0 ? `+${d}` : `${d}`;
        }, '📈', 'delta',
      ),
    ];
  }, [leagueRows]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return null;
    return sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
  };

  if (loading) {
    return (
      <>
        <NavBar />
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="skeleton h-12 rounded-xl mb-4 w-64" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}
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
          <button onClick={fetchData} className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ background: C.cyan, color: '#000' }}>Retry</button>
        </div>
      </>
    );
  }

  const horizons: { key: TimeHorizon; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly', label: 'Yearly' },
    { key: 'alltime', label: 'All-Time' },
  ];

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <HealthBanner />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Title + Horizon Tabs */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Trophy size={20} style={{ color: C.lime }} />
            <h1 className="text-lg font-bold" style={{ color: C.text }}>Agent League</h1>
            <a
              href="/agent-league-methodology.html"
              target="_blank"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors hover:bg-white/5"
              style={{ color: C.sub, border: `1px solid ${C.border}` }}
              title="View OVR Methodology"
            >
              <FileText size={12} />
              Methodology
            </a>
          </div>
          <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {horizons.map(h => (
              <button
                key={h.key}
                onClick={() => setHorizon(h.key)}
                className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: horizon === h.key ? 'rgba(62,165,195,0.15)' : 'transparent',
                  color: horizon === h.key ? C.cyan : C.sub,
                }}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>

        {horizon !== 'today' && (
          <div className="mb-4 px-1">
            <span className="text-xs" style={{ color: C.sub }}>
              {horizon === 'monthly' ? 'Month-to-date ratings' : horizon === 'yearly' ? 'Year-to-date ratings' : 'All-time ratings'}
              {' — '}showing today&apos;s live data (historical views coming as data accumulates)
            </span>
          </div>
        )}

        {/* Top 3 Categories */}
        <ErrorBoundary section="Top Categories">
          <div className="mb-6">
            <TopAgents categories={categories} />
          </div>
        </ErrorBoundary>

        {/* Player Cards Grid */}
        <ErrorBoundary section="Player Cards">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {sorted.map(row => (
              <PlayerCard key={row.agent} row={row} />
            ))}
          </div>
        </ErrorBoundary>

        {/* Full Leaderboard Table */}
        <ErrorBoundary section="Leaderboard">
          <Card padding={false}>
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-sm font-semibold" style={{ color: C.text }}>Leaderboard</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th className="px-4 py-2 text-left text-[11px] font-medium w-8" style={{ color: C.sub }}>#</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium cursor-pointer select-none" style={{ color: sortKey === 'agent' ? C.cyan : C.sub }} onClick={() => handleSort('agent')}>
                      Agent <SortIcon col="agent" />
                    </th>
                    <th className="px-3 py-2 text-center text-[11px] font-medium cursor-pointer select-none" style={{ color: sortKey === 'ovr' ? C.cyan : C.sub }} onClick={() => handleSort('ovr')}>
                      <span className="inline-flex items-center gap-0.5">OVR <SortIcon col="ovr" /></span>
                    </th>
                    {(Object.keys(SUB_RATING_LABELS) as (keyof AgentSubRatings)[]).map(key => (
                      <th
                        key={key}
                        className="px-2 py-2 text-center text-[10px] font-medium cursor-pointer select-none"
                        style={{ color: sortKey === key ? C.cyan : C.sub }}
                        onClick={() => handleSort(key)}
                        title={SUB_RATING_LABELS[key].tooltip}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {SUB_RATING_LABELS[key].abbr} <SortIcon col={key} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => {
                    const tier = ratingTier(row.ovr);
                    return (
                      <tr key={row.agent} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{rankBadge(i)}</td>
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: agentColor(row.agent) }} />
                            <span className="font-medium text-sm" style={{ color: C.text }}>{capitalize(row.agent)}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <OvrBadge ovr={row.ovr} baselineOvr={row.baselineOvr} size="md" />
                        </td>
                        {(Object.keys(SUB_RATING_LABELS) as (keyof AgentSubRatings)[]).map(key => {
                          const val = row.subRatings[key];
                          const subTier = ratingTier(val);
                          return (
                            <td key={key} className="px-2 py-2.5 text-center font-mono text-[11px] font-bold" style={{ color: subTier.color }}>
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </ErrorBoundary>
      </div>
    </>
  );
}

export default function LeaguePage() {
  return (
    <Suspense fallback={<><NavBar /><div className="max-w-7xl mx-auto px-4 py-6"><div className="skeleton h-96 rounded-2xl" /></div></>}>
      <LeaguePageInner />
    </Suspense>
  );
}
