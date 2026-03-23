'use client';

import { useEffect, useState, useCallback } from 'react';
import NavBar from './NavBar';
import Card from './Card';
import ErrorBoundary from './ErrorBoundary';
import { C, GOAL, capitalize, computePace, agentColor, AGENT_SCHEDULE, fmtSpeed, fmtTalkTime } from '@/lib/constants';
import type { DashboardData, AcctStat, RepAgent } from '@/lib/getDashboard';
import { Target, BarChart3, Trophy, Zap, Phone, Clock, Timer } from 'lucide-react';

// ── Shared Table Cells ─────────────────────────────────────────────────────
function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-xs font-medium whitespace-nowrap ${right ? 'text-right' : 'text-left'}`} style={{ color: C.sub }}>
      {children}
    </th>
  );
}

function TD({ children, mono, right, color }: { children: React.ReactNode; mono?: boolean; right?: boolean; color?: string }) {
  return (
    <td className={`px-3 py-2.5 text-[13px] ${mono ? 'font-mono' : ''} ${right ? 'text-right' : ''}`} style={{ color: color || C.text }}>
      {children}
    </td>
  );
}

// ── SVG Ring Chart ──────────────────────────────────────────────────────────

function RingChart({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(value / Math.max(max, 1), 1);
  const r = 72, stroke = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const over = value >= max;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 180 180" className="w-44 h-44">
        <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(139,146,168,0.12)" strokeWidth={stroke} />
        <circle
          cx="90" cy="90" r={r} fill="none"
          stroke={over ? C.lime : C.cyan}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 90 90)"
          className="transition-all duration-1000 ease-out"
        />
        <text x="90" y="82" textAnchor="middle" fill={C.text} fontSize="32" fontWeight="700">
          {value.toLocaleString()}
        </text>
        <text x="90" y="104" textAnchor="middle" fill={C.sub} fontSize="13">
          / {max.toLocaleString()} goal
        </text>
      </svg>
      <span className="text-xs font-medium mt-1" style={{ color: C.sub }}>{label}</span>
    </div>
  );
}

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

export default function RacePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/data');
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
  const scheduleSource = data.schedule ?? AGENT_SCHEDULE;
  const mtdHoursMap: Record<string, number> = {};
  for (const [agent, agentSched] of Object.entries(scheduleSource)) {
    let total = 0;
    for (let d = 1; d <= pace.dayOfMonth; d++) {
      const dt = new Date(year, month, d);
      total += agentSched[dt.getDay()] ?? 0;
    }
    mtdHoursMap[agent] = total;
  }

  // Agent stats with projections
  const agentStats = mtd.byAgent.map(a => {
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
    return { ...a, dailyAvg, projected, bestDay, mtdHours, convPerHr };
  });

  // Build daily grid: days of month × agents
  const mtdDaily = mtd.mtdDaily ?? [];
  const dayNumbers = Array.from({ length: pace.dayOfMonth }, (_, i) => i + 1);
  const agentNames = mtd.byAgent.map(a => a.agent.toLowerCase());

  const topAccounts = (mtd.byAccount || []).slice(0, 12);

  // ── Today's Competitive Metrics ──────────────────────────────────────────
  const todayAgents = data.today.repActivity.agents;
  const todayConvsByAgent: Record<string, number> = {};
  for (const a of data.today.conversions.byAgent) {
    todayConvsByAgent[a.agent.toLowerCase()] = a.count;
  }

  // Combined today stats per agent (only agents who took calls today)
  const todayStats = todayAgents
    .filter(a => a.calls > 0)
    .map(a => {
      const todayConvs = todayConvsByAgent[a.agent.toLowerCase()] || 0;
      const convRate = a.calls > 0 ? +((todayConvs / a.calls) * 100).toFixed(1) : 0;
      return { ...a, todayConvs, convRate };
    });

  // Build lookup for leaderboard (today's call data by agent)
  const todayByAgent: Record<string, RepAgent> = {};
  for (const a of todayAgents) todayByAgent[a.agent.toLowerCase()] = a;

  // Category leaders (sorted best first)
  const fastest = [...todayStats].filter(a => a.speedSec !== null).sort((a, b) => a.speedSec! - b.speedSec!);
  const mostCalls = [...todayStats].sort((a, b) => b.calls - a.calls);
  const mostTalk = [...todayStats].sort((a, b) => b.talkMin - a.talkMin);
  const bestWrap = [...todayStats].filter(a => a.wrapUpSec !== null).sort((a, b) => a.wrapUpSec! - b.wrapUpSec!);
  const bestConv = [...todayStats].filter(a => a.todayConvs > 0).sort((a, b) => b.convRate - a.convRate);

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
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

        {/* Today's Competition Awards */}
        {todayStats.length > 0 && (
        <ErrorBoundary section="Today's Competition">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={16} style={{ color: '#fbbf24' }} />
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>Today&apos;s Competition</h2>
            <span className="text-xs ml-auto" style={{ color: C.sub }}>
              {new Date(data.pulledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Edmonton' })}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {fastest.length > 0 && (
              <AwardCard
                icon={<Zap size={14} style={{ color: '#4ade80' }} />}
                title="Fastest Pickup"
                winner={fastest[0].agent}
                value={fmtSpeed(fastest[0].speedSec!)}
                runnerUp={fastest[1]?.agent}
                runnerValue={fastest[1] ? fmtSpeed(fastest[1].speedSec!) : undefined}
              />
            )}
            {mostCalls.length > 0 && (
              <AwardCard
                icon={<Phone size={14} style={{ color: C.cyan }} />}
                title="Most Calls"
                winner={mostCalls[0].agent}
                value={String(mostCalls[0].calls)}
                runnerUp={mostCalls[1]?.agent}
                runnerValue={mostCalls[1] ? String(mostCalls[1].calls) : undefined}
              />
            )}
            {mostTalk.length > 0 && (
              <AwardCard
                icon={<Clock size={14} style={{ color: '#a78bfa' }} />}
                title="Most Talk Time"
                winner={mostTalk[0].agent}
                value={fmtTalkTime(mostTalk[0].talkMin)}
                runnerUp={mostTalk[1]?.agent}
                runnerValue={mostTalk[1] ? fmtTalkTime(mostTalk[1].talkMin) : undefined}
              />
            )}
            {bestWrap.length > 0 && (
              <AwardCard
                icon={<Timer size={14} style={{ color: '#f472b6' }} />}
                title="Best Wrap-Up"
                winner={bestWrap[0].agent}
                value={fmtSpeed(bestWrap[0].wrapUpSec!)}
                runnerUp={bestWrap[1]?.agent}
                runnerValue={bestWrap[1] ? fmtSpeed(bestWrap[1].wrapUpSec!) : undefined}
              />
            )}
            {bestConv.length > 0 && (
              <AwardCard
                icon={<Target size={14} style={{ color: C.lime }} />}
                title="Best Conv Rate"
                winner={bestConv[0].agent}
                value={`${bestConv[0].convRate}%`}
                runnerUp={bestConv[1]?.agent}
                runnerValue={bestConv[1] ? `${bestConv[1].convRate}%` : undefined}
              />
            )}
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
                  <TH right>Talk</TH>
                  <TH right>Wrap</TH>
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
                    <TD mono right color={C.sub}>
                      {fmtTalkTime(today?.talkMin ?? 0)}
                    </TD>
                    <td className="px-3 py-2.5 text-right">
                      {today?.wrapUpSec !== null && today?.wrapUpSec !== undefined
                        ? <span className="font-mono text-xs" style={{ color: today.wrapUpSec < 30 ? '#4ade80' : today.wrapUpSec < 60 ? '#fbbf24' : '#f87171' }}>
                            {fmtSpeed(today.wrapUpSec)}
                          </span>
                        : <span className="text-xs" style={{ color: C.sub }}>—</span>
                      }
                    </td>
                  </tr>
                  );
                })}
                {mtd.byAgent.length === 0 && (
                  <tr><td colSpan={11} className="text-center text-sm py-5" style={{ color: C.sub }}>No conversion data yet</td></tr>
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

        {/* Account Leaderboard with MTD % */}
        <ErrorBoundary section="Top Accounts">
        <Card padding={false}>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <Target size={16} style={{ color: C.cyan }} />
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>Top Accounts</h2>
            <span className="text-xs ml-auto" style={{ color: C.sub }}>MTD conversions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <TH>#</TH>
                  <TH>Account</TH>
                  <TH right>Count</TH>
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
                        <span className="font-medium truncate block max-w-[220px]">{a.account}</span>
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
            <p className="text-sm py-4 text-center" style={{ color: C.sub }}>No account data yet</p>
          )}
        </Card>
        </ErrorBoundary>
      </div>
    </>
  );
}
