'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import NavBar from './NavBar';
import HealthBanner from './HealthBanner';
import Card from './Card';
import ErrorBoundary from './ErrorBoundary';
import { C, GOAL, capitalize, computePace, agentColor, AGENT_SCHEDULE, fmtSpeed, fmtTalkTime, EXCLUDED_AGENTS } from '@/lib/constants';
import type { DashboardData, AcctStat, RepAgent } from '@/lib/getDashboard';
import { Target, BarChart3, Trophy, Zap, Phone, Clock, Timer, Download, TrendingUp, Award, Star, ShieldCheck, Crosshair } from 'lucide-react';
import { useBrand } from '@/hooks/useBrand';
import { isAgentForBrand } from '@/lib/brand';

// ── XLSX Export (branded Jump Contact report) ──────────────────────────────

async function downloadClientReport(
  accounts: AcctStat[],
  agents: { agent: string; count: number; dailyAvg: number; convPerHr: number | null; projected: number; bestDay: number; pickupRate?: number; trueYield?: number }[],
  totalConversions: number,
  pulledAt: string,
) {
  const XLSX = await import('xlsx');
  const monthLabel = new Date(pulledAt).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'America/Edmonton',
  });

  const rows: (string | number)[][] = [];

  // Header
  rows.push(['JUMP CONTACT']);
  rows.push(['Conversions Report']);
  rows.push([monthLabel]);
  rows.push([]);
  rows.push(['Total Conversions', totalConversions, '', 'Total Clients', accounts.length]);
  rows.push([]);

  // Agent summary
  rows.push(['AGENT LEADERBOARD']);
  rows.push(['#', 'Agent', 'Conversions', 'Avg/Day', 'Conv/Hr', 'Projected', 'Best Day', 'Pickup %', 'True Yield %']);
  agents.forEach((a, i) => {
    rows.push([
      i + 1,
      capitalize(a.agent),
      a.count,
      a.dailyAvg,
      a.convPerHr !== null ? a.convPerHr : '',
      a.projected,
      a.bestDay,
      a.pickupRate != null ? `${a.pickupRate}%` : '',
      a.trueYield != null ? `${a.trueYield}%` : '',
    ]);
  });

  rows.push([]);
  rows.push([]);

  // Client breakdown
  rows.push(['CONVERSIONS PER CLIENT']);
  rows.push(['#', 'Client', 'Conversions', '% of Total']);
  accounts.forEach((a, i) => {
    const pct = totalConversions > 0 ? +((a.count / totalConversions) * 100).toFixed(1) : 0;
    rows.push([i + 1, a.account, a.count, `${pct}%`]);
  });

  // Create workbook
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },   // #
    { wch: 34 },  // Name/Client
    { wch: 14 },  // Conversions
    { wch: 12 },  // Avg/Day or %
    { wch: 12 },  // Conv/Hr
    { wch: 12 },  // Projected
    { wch: 12 },  // Best Day
    { wch: 12 },  // Pickup %
    { wch: 14 },  // True Yield %
  ];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Conversions');
  const dateStr = new Date(pulledAt).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
  XLSX.writeFile(wb, `JC_Conversions-Report_${dateStr}.xlsx`);
}

import { TH, TD } from './TableCells';
import RingChart from './RingChart';

// ── Pace Stat Pill ──────────────────────────────────────────────────────────

function PacePill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-2">
      <span className="text-lg font-bold font-mono" style={{ color: color || C.text }}>{value}</span>
      <span className="text-xs" style={{ color: C.sub }}>{label}</span>
    </div>
  );
}

// ── Daily Grid Cell Color ───────────────────────────────────────────────────

function cellColor(count: number): string {
  if (count === 0) return 'rgba(139,146,168,0.08)';
  if (count <= 2) return C.cyan + '30';
  if (count <= 4) return C.cyan + '60';
  return C.cyan + '99';
}

function cellText(count: number): string {
  if (count === 0) return C.sub;
  return C.text;
}

// ── Award Card ──────────────────────────────────────────────────────────────

function AwardCard({ icon, title, winner, value, runnerUp, runnerValue }: {
  icon: React.ReactNode;
  title: string;
  winner: string;
  value: string;
  runnerUp?: string;
  runnerValue?: string;
}) {
  return (
    <div className="flex-1 min-w-[150px] rounded-xl p-3 border" style={{ background: C.card, borderColor: C.border }}>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-xs font-medium" style={{ color: C.sub }}>{title}</span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: agentColor(winner) }} />
        <span className="text-sm font-bold" style={{ color: C.text }}>{capitalize(winner)}</span>
        <span className="text-sm font-mono font-bold ml-auto" style={{ color: C.cyan }}>{value}</span>
      </div>
      {runnerUp && (
        <div className="flex items-center gap-2 opacity-60">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: agentColor(runnerUp) }} />
          <span className="text-xs" style={{ color: C.sub }}>{capitalize(runnerUp)}</span>
          <span className="text-xs font-mono ml-auto" style={{ color: C.sub }}>{runnerValue}</span>
        </div>
      )}
    </div>
  );
}

// ── Speed Grade Badge ───────────────────────────────────────────────────────

function SpeedBadge({ sec }: { sec: number | null }) {
  if (sec === null) return <span style={{ color: C.sub }}>—</span>;
  let color: string;
  if (sec < 8)  color = '#4ade80';
  else if (sec < 12) color = '#38bdf8';
  else if (sec < 17) color = '#fbbf24';
  else color = '#f87171';
  return (
    <span className="font-mono text-xs font-bold" style={{ color }}>
      {fmtSpeed(sec)}
    </span>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

function RacePageInner() {
  const { brand } = useBrand();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const interval = setInterval(fetchData, 120_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <>
        <NavBar />
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="skeleton h-56 rounded-2xl mb-6" />
          <div className="skeleton h-64 rounded-2xl mb-6" />
          <div className="skeleton h-48 rounded-2xl" />
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

  const mtd = data.mtd;
  const pace = computePace(mtd.total, data.pulledAt);
  const daysLeft = pace.daysInMonth - pace.dayOfMonth;
  const remaining = Math.max(GOAL - mtd.total, 0);
  const dailyNeeded = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining;
  const paceColor = pace.pacePercent >= 100 ? '#4ade80' : pace.pacePercent >= 85 ? '#fbbf24' : '#f87171';

  // Build date lookup for daily grid
  const now = new Date(data.pulledAt);
  const year = now.getFullYear();
  const month = now.getMonth();

  // Compute MTD scheduled hours per agent (sum day 1 through dayOfMonth)
  // data.schedule is ScheduleData { agents: [{ name, schedule, hrsPerWeek }] }
  // AGENT_SCHEDULE is Record<string, number[]> (agent -> [Sun..Sat] hours)
  // Normalize both to Record<string, number[]> for iteration
  const scheduleSource: Record<string, number[]> = (() => {
    if (data.schedule && Array.isArray(data.schedule.agents)) {
      const DOW_MAP: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
      const result: Record<string, number[]> = {};
      for (const ag of data.schedule.agents) {
        const hours = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
        for (const [day, shift] of Object.entries(ag.schedule)) {
          const idx = DOW_MAP[day.toLowerCase()];
          if (idx === undefined) continue;
          if (!shift || shift.toLowerCase() === 'off') { hours[idx] = 0; continue; }
          // Parse "8a-5p" or "10a-6p" style shifts
          const m = shift.match(/(\d+)([ap]?)\s*-\s*(\d+)([ap]?)/i);
          if (m) {
            let start = parseInt(m[1]);
            let end = parseInt(m[3]);
            if (m[2]?.toLowerCase() === 'p' && start < 12) start += 12;
            if (m[4]?.toLowerCase() === 'p' && end < 12) end += 12;
            if (m[2]?.toLowerCase() === 'a' && start === 12) start = 0;
            if (m[4]?.toLowerCase() === 'a' && end === 12) end = 0;
            hours[idx] = end > start ? end - start : (24 - start + end);
          } else {
            hours[idx] = ag.hrsPerWeek / 7; // fallback
          }
        }
        result[ag.name.toLowerCase()] = hours;
      }
      return result;
    }
    return AGENT_SCHEDULE;
  })();
  const mtdHoursMap: Record<string, number> = {};
  for (const [agent, agentSched] of Object.entries(scheduleSource)) {
    let total = 0;
    for (let d = 1; d <= pace.dayOfMonth; d++) {
      const dt = new Date(year, month, d);
      total += agentSched[dt.getDay()] ?? 0;
    }
    mtdHoursMap[agent] = total;
  }

  // ── Today's Competitive Metrics ──────────────────────────────────────────
  const todayAgents = data.today.repActivity.agents.filter(a => !EXCLUDED_AGENTS.includes(a.agent));
  // Build lookup for leaderboard (today's call data by agent)
  const todayByAgent: Record<string, RepAgent> = {};
  for (const a of todayAgents) todayByAgent[a.agent.toLowerCase()] = a;

  // Agent stats with projections — start from MTD conversions
  const mtdAgentStats = mtd.byAgent.filter(a => !EXCLUDED_AGENTS.includes(a.agent) && isAgentForBrand(a.agent, brand)).map(a => {
    const dailyAvg = pace.dayOfMonth > 0 ? +(a.count / pace.dayOfMonth).toFixed(1) : 0;
    const projected = Math.round(dailyAvg * pace.daysInMonth);
    let bestDay = 0;
    if (a.daily) {
      for (const v of Object.values(a.daily)) {
        if (v > bestDay) bestDay = v;
      }
    }
    const mtdHours = mtdHoursMap[a.agent.toLowerCase()] ?? 0;
    const convPerHr = mtdHours > 0 ? +(a.count / mtdHours).toFixed(2) : null;
    const todayRep = todayAgents.find(r => r.agent.toLowerCase() === a.agent.toLowerCase());
    const pickupRate = todayRep?.pickupRate;
    const trueYield = todayRep?.trueYield;
    return { ...a, dailyAvg, projected, bestDay, mtdHours, convPerHr, pickupRate, trueYield };
  });

  // Add agents who have calls today but 0 MTD conversions (e.g., MSC agents
  // whose GHL conversions aren't flowing yet, or new agents)
  const mtdAgentNames = new Set(mtdAgentStats.map(a => a.agent.toLowerCase()));
  for (const rep of todayAgents) {
    if (mtdAgentNames.has(rep.agent.toLowerCase())) continue;
    if (!isAgentForBrand(rep.agent, brand)) continue;
    mtdAgentStats.push({
      agent: rep.agent, count: 0, dailyAvg: 0, projected: 0, bestDay: 0,
      mtdHours: mtdHoursMap[rep.agent.toLowerCase()] ?? 0, convPerHr: null,
      pickupRate: rep.pickupRate, trueYield: rep.trueYield,
    });
  }
  const agentStats = mtdAgentStats;

  // Build daily grid: days of month × agents
  const mtdDaily = mtd.mtdDaily ?? [];
  const dayNumbers = Array.from({ length: pace.dayOfMonth }, (_, i) => i + 1);
  const agentNames = mtd.byAgent.filter(a => !EXCLUDED_AGENTS.includes(a.agent) && isAgentForBrand(a.agent, brand)).map(a => a.agent.toLowerCase());

  const topAccounts = mtd.byAccount || [];

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <HealthBanner />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* Hero: Ring + Pace Strip */}
        <ErrorBoundary section="MTD Pace">
        <Card>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <RingChart value={mtd.total} max={GOAL} label="MTD Conversions" />
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2">
              <PacePill label="Projected EOM" value={pace.projected.toLocaleString()} color={paceColor} />
              <PacePill label="Pace" value={`${pace.pacePercent}%`} color={paceColor} />
              <PacePill label="Daily Needed" value={String(dailyNeeded)} />
              <PacePill label="Days Left" value={String(daysLeft)} />
            </div>
          </div>
        </Card>
        </ErrorBoundary>

        {/* Monthly Race Awards */}
        {agentStats.length > 0 && (
        <ErrorBoundary section="Monthly Race">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={16} style={{ color: '#fbbf24' }} />
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>Monthly Race</h2>
            <span className="text-xs ml-auto" style={{ color: C.sub }}>
              {new Date(data.pulledAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Edmonton' })}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {agentStats.length > 0 && (
              <AwardCard
                icon={<Star size={14} style={{ color: '#fbbf24' }} />}
                title="Most Conversions"
                winner={agentStats[0].agent}
                value={String(agentStats[0].count)}
                runnerUp={agentStats[1]?.agent}
                runnerValue={agentStats[1] ? String(agentStats[1].count) : undefined}
              />
            )}
            {(() => {
              const byConvHr = [...agentStats].filter(a => a.convPerHr !== null && a.convPerHr! > 0).sort((a, b) => b.convPerHr! - a.convPerHr!);
              return byConvHr.length > 0 ? (
                <AwardCard
                  icon={<TrendingUp size={14} style={{ color: C.lime }} />}
                  title="Best Conv/Hr"
                  winner={byConvHr[0].agent}
                  value={byConvHr[0].convPerHr!.toFixed(1)}
                  runnerUp={byConvHr[1]?.agent}
                  runnerValue={byConvHr[1] ? byConvHr[1].convPerHr!.toFixed(1) : undefined}
                />
              ) : null;
            })()}
            {(() => {
              const byAvg = [...agentStats].filter(a => a.dailyAvg > 0).sort((a, b) => b.dailyAvg - a.dailyAvg);
              return byAvg.length > 0 ? (
                <AwardCard
                  icon={<BarChart3 size={14} style={{ color: C.cyan }} />}
                  title="Best Daily Avg"
                  winner={byAvg[0].agent}
                  value={String(byAvg[0].dailyAvg)}
                  runnerUp={byAvg[1]?.agent}
                  runnerValue={byAvg[1] ? String(byAvg[1].dailyAvg) : undefined}
                />
              ) : null;
            })()}
            {(() => {
              const byBest = [...agentStats].filter(a => a.bestDay > 0).sort((a, b) => b.bestDay - a.bestDay);
              return byBest.length > 0 ? (
                <AwardCard
                  icon={<Award size={14} style={{ color: '#a78bfa' }} />}
                  title="Best Single Day"
                  winner={byBest[0].agent}
                  value={String(byBest[0].bestDay)}
                  runnerUp={byBest[1]?.agent}
                  runnerValue={byBest[1] ? String(byBest[1].bestDay) : undefined}
                />
              ) : null;
            })()}
            {(() => {
              const byProjected = [...agentStats].filter(a => a.projected > 0).sort((a, b) => b.projected - a.projected);
              return byProjected.length > 0 ? (
                <AwardCard
                  icon={<Target size={14} style={{ color: '#f472b6' }} />}
                  title="Highest Projected"
                  winner={byProjected[0].agent}
                  value={String(byProjected[0].projected)}
                  runnerUp={byProjected[1]?.agent}
                  runnerValue={byProjected[1] ? String(byProjected[1].projected) : undefined}
                />
              ) : null;
            })()}
            {(() => {
              const byPickup = todayAgents.filter(a => a.pickupRate != null && a.pickupRate! > 0).sort((a, b) => b.pickupRate! - a.pickupRate!);
              return byPickup.length > 0 ? (
                <AwardCard
                  icon={<ShieldCheck size={14} style={{ color: '#4ade80' }} />}
                  title="Best Pickup Rate"
                  winner={byPickup[0].agent}
                  value={`${byPickup[0].pickupRate}%`}
                  runnerUp={byPickup[1]?.agent}
                  runnerValue={byPickup[1] ? `${byPickup[1].pickupRate}%` : undefined}
                />
              ) : null;
            })()}
            {(() => {
              const byYield = todayAgents.filter(a => a.trueYield != null && a.trueYield! > 0).sort((a, b) => b.trueYield! - a.trueYield!);
              return byYield.length > 0 ? (
                <AwardCard
                  icon={<Crosshair size={14} style={{ color: '#a78bfa' }} />}
                  title="Best True Yield"
                  winner={byYield[0].agent}
                  value={`${byYield[0].trueYield}%`}
                  runnerUp={byYield[1]?.agent}
                  runnerValue={byYield[1] ? `${byYield[1].trueYield}%` : undefined}
                />
              ) : null;
            })()}
          </div>
        </div>
        </ErrorBoundary>
        )}

        {/* Agent Leaderboard Table */}
        <ErrorBoundary section="Agent Leaderboard">
        <Card padding={false}>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <BarChart3 size={16} style={{ color: C.cyan }} />
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>Agent Leaderboard</h2>
            <span className="text-xs ml-auto" style={{ color: C.sub }}>MTD + Today&apos;s performance</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <TH>#</TH>
                  <TH>Agent</TH>
                  <TH right>MTD</TH>
                  <TH right>Avg/Day</TH>
                  <TH right>Conv/Hr</TH>
                  <TH right>Projected</TH>
                  <TH right>Best Day</TH>
                  <th className="px-1 py-2" style={{ borderLeft: `1px solid ${C.border}` }} />
                  <TH right>Calls</TH>
                  <TH right>Speed</TH>
                  <TH right>Pickup</TH>
                  <TH right>Yield</TH>
                </tr>
              </thead>
              <tbody>
                {agentStats.map((a, i) => {
                  const today = todayByAgent[a.agent.toLowerCase()];
                  return (
                  <tr key={a.agent} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <TD color={i < 3 ? C.cyan : C.sub}>
                      <span className="font-bold">{i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: agentColor(a.agent) }} />
                        <span className="font-semibold">{capitalize(a.agent)}</span>
                      </div>
                    </TD>
                    <TD mono right>{a.count}</TD>
                    <TD mono right color={C.sub}>{a.dailyAvg}</TD>
                    <TD mono right color={a.convPerHr !== null && a.convPerHr >= 1 ? C.lime : C.sub}>
                      {a.convPerHr !== null ? a.convPerHr.toFixed(1) : '—'}
                    </TD>
                    <TD mono right color={a.projected >= Math.round(GOAL / agentStats.length) ? '#4ade80' : C.sub}>
                      {a.projected}
                    </TD>
                    <TD mono right color={C.sub}>{a.bestDay || '—'}</TD>
                    <td style={{ borderLeft: `1px solid ${C.border}` }} />
                    <TD mono right color={today?.calls ? C.text : C.sub}>
                      {today?.calls ?? 0}
                    </TD>
                    <td className="px-3 py-2.5 text-right">
                      <SpeedBadge sec={today?.speedSec ?? null} />
                    </td>
                    <TD mono right color={today?.pickupRate != null && today.pickupRate >= 80 ? '#4ade80' : today?.pickupRate != null && today.pickupRate >= 60 ? '#fbbf24' : C.sub}>
                      {today?.pickupRate != null ? `${today.pickupRate}%` : '—'}
                    </TD>
                    <TD mono right color={today?.trueYield != null && today.trueYield > 0 ? C.lime : C.sub}>
                      {today?.trueYield != null ? `${today.trueYield}%` : '—'}
                    </TD>
                  </tr>
                  );
                })}
                {mtd.byAgent.length === 0 && (
                  <tr><td colSpan={12} className="text-center text-sm py-5" style={{ color: C.sub }}>No conversion data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        </ErrorBoundary>

        {/* Daily Grid Matrix */}
        <ErrorBoundary section="Daily Grid">
        {dayNumbers.length > 0 && agentNames.length > 0 && (
          <Card padding={false}>
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold" style={{ color: C.text }}>Daily Grid</h2>
              <p className="text-xs mt-0.5" style={{ color: C.sub }}>Conversions per agent per day this month</p>
            </div>
            <div className="overflow-x-auto px-4 pb-4">
              <table className="text-[11px]" style={{ borderCollapse: 'separate', borderSpacing: '2px' }}>
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left font-medium sticky left-0" style={{ color: C.sub, background: C.card, minWidth: '70px' }}>
                      Agent
                    </th>
                    {dayNumbers.map(d => (
                      <th key={d} className="px-1 py-1 text-center font-medium" style={{ color: d === pace.dayOfMonth ? C.cyan : C.sub, minWidth: '24px' }}>
                        {d}
                      </th>
                    ))}
                    <th className="px-2 py-1 text-right font-bold" style={{ color: C.text }}>Σ</th>
                  </tr>
                </thead>
                <tbody>
                  {agentNames.map(name => {
                    const agentData = mtd.byAgent.find(a => a.agent.toLowerCase() === name);
                    const daily = agentData?.daily || {};
                    const total = agentData?.count ?? 0;
                    return (
                      <tr key={name}>
                        <td className="px-2 py-1 font-medium sticky left-0 whitespace-nowrap" style={{ color: agentColor(name), background: C.card }}>
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: agentColor(name) }} />
                            {capitalize(name)}
                          </div>
                        </td>
                        {dayNumbers.map(d => {
                          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                          const count = daily[dateKey] || 0;
                          return (
                            <td key={d} className="text-center rounded-sm font-mono font-bold" style={{
                              background: cellColor(count),
                              color: cellText(count),
                              padding: '3px 2px',
                            }}>
                              {count > 0 ? count : '·'}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 text-right font-bold font-mono" style={{ color: C.text }}>
                          {total}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Daily totals row */}
                  <tr style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="px-2 py-1 font-medium sticky left-0 text-xs" style={{ color: C.sub, background: C.card }}>Total</td>
                    {dayNumbers.map(d => {
                      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      const dayEntry = mtdDaily.find(e => e.date === dateKey);
                      const total = dayEntry?.total ?? 0;
                      return (
                        <td key={d} className="text-center font-mono font-bold text-[10px]" style={{
                          color: total >= 30 ? '#4ade80' : total > 0 ? C.text : C.sub,
                          padding: '3px 2px',
                        }}>
                          {total > 0 ? total : '·'}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right font-bold font-mono" style={{ color: C.cyan }}>
                      {mtd.total}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}
        </ErrorBoundary>

        {/* Conversions per Client */}
        <ErrorBoundary section="Conversions per Client">
        <Card padding={false}>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <Target size={16} style={{ color: C.cyan }} />
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>Conversions per Client</h2>
            <span className="text-xs ml-auto mr-3" style={{ color: C.sub }}>MTD — {topAccounts.length} clients</span>
            <button
              onClick={() => downloadClientReport(topAccounts, agentStats, mtd.total, data.pulledAt)}
              disabled={!topAccounts.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: topAccounts.length ? C.lime + '18' : 'transparent',
                color: topAccounts.length ? C.lime : C.sub,
                border: `1px solid ${topAccounts.length ? C.lime + '44' : C.border}`,
              }}
            >
              <Download size={13} />
              Export Report
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <TH>#</TH>
                  <TH>Client</TH>
                  <TH right>Conversions</TH>
                  <TH right>% of Total</TH>
                  <TH>Bar</TH>
                </tr>
              </thead>
              <tbody>
                {topAccounts.map((a: AcctStat, i: number) => {
                  const pctOfTotal = mtd.total > 0 ? ((a.count / mtd.total) * 100).toFixed(1) : '0';
                  const topAcct = topAccounts[0]?.count ?? 1;
                  return (
                    <tr key={a.account} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                      <TD color={i < 3 ? C.cyan : C.sub}>
                        <span className="font-bold">{i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span>
                      </TD>
                      <TD>
                        <span className="font-medium truncate block max-w-[280px]">{a.account}</span>
                      </TD>
                      <TD mono right>{a.count}</TD>
                      <TD mono right color={C.sub}>{pctOfTotal}%</TD>
                      <td className="px-3 py-2">
                        <div className="h-1.5 rounded-full overflow-hidden w-24" style={{ background: 'rgba(139,146,168,0.12)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.max((a.count / topAcct) * 100, 3)}%`, background: C.cyan }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {topAccounts.length === 0 && (
            <p className="text-sm py-4 text-center" style={{ color: C.sub }}>No client data yet</p>
          )}
        </Card>
        </ErrorBoundary>
      </div>
    </>
  );
}

export default function RacePage() {
  return (
    <Suspense fallback={<><NavBar /><div className="max-w-6xl mx-auto px-4 py-6"><div className="skeleton h-96 rounded-2xl" /></div></>}>
      <RacePageInner />
    </Suspense>
  );
}
