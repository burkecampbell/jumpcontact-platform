'use client';

import { useEffect, useState, useCallback, Suspense, useMemo } from 'react';
import NavBar from './NavBar';
import HealthBanner from './HealthBanner';
import Card from './Card';
import ErrorBoundary from './ErrorBoundary';
import OvrBadge from './OvrBadge';
import TopAgents, { type CategoryTop3 } from './TopAgents';
import { C, capitalize, agentColor, fmtSpeed, fmtTalkTime, rankBadge, speedGrade } from '@/lib/constants';
import { computeOVRFromInput, computeBaselineOVR, ratingTier, ratingDelta, SUB_RATING_LABELS, type OvrInput } from '@/lib/ratings';
import type { DashboardData, RepAgent, AgentBaseline, AgentSubRatings } from '@/lib/types';
import { useBrand } from '@/hooks/useBrand';
import { Trophy, ChevronUp, ChevronDown } from 'lucide-react';
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
                <span className="text-[10px] font-medium" style={{ color: C.sub }}>{meta.abbr}</span>
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

  // Build league rows from today's data
  const leagueRows = useMemo(() => {
    if (!data) return [];

    const agents = data.today.repActivity.agents;
    const convByAgent: Record<string, number> = {};
    for (const a of data.today.conversions.byAgent) convByAgent[a.agent.toLowerCase()] = a.count;

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

        return buildLeagueRow(a, convs, speedSec, wrapUpSec, baselineOvr);
      });
  }, [data, yticaMtd, baselines]);

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
