'use client';

import { useEffect, useState, useCallback } from 'react';
import NavBar from './NavBar';
import Card from './Card';
import { C, GOAL, capitalize, computePace, agentColor, AGENT_SCHEDULE } from '@/lib/constants';
import { TH, TD } from './TableHelpers';
import type { DashboardData, AcctStat } from '@/lib/getDashboard';
import { Target, BarChart3 } from 'lucide-react';

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
          <p style={{ color: C.bad }}>Failed to load: {error}</p>
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
  const paceColor = pace.pacePercent >= 100 ? C.good : pace.pacePercent >= 85 ? C.warn : C.bad;

  // Build date lookup for daily grid
  const now = new Date(data.pulledAt);
  const year = now.getFullYear();
  const month = now.getMonth();

  // Compute MTD scheduled hours per agent (sum day 1 through dayOfMonth)
  const mtdHoursMap: Record<string, number> = {};
  for (const [agent, schedule] of Object.entries(AGENT_SCHEDULE)) {
    let total = 0;
    for (let d = 1; d <= pace.dayOfMonth; d++) {
      const dt = new Date(year, month, d);
      total += schedule[dt.getDay()] ?? 0;
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

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* Hero: Ring + Pace Strip */}
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

        {/* Agent Leaderboard Table */}
        <Card padding={false}>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <BarChart3 size={16} style={{ color: C.cyan }} />
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>Agent Leaderboard</h2>
            <span className="text-xs ml-auto" style={{ color: C.sub }}>MTD conversions</span>
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
                </tr>
              </thead>
              <tbody>
                {agentStats.map((a, i) => (
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
                    <TD mono right color={a.projected >= Math.round(GOAL / agentStats.length) ? C.good : C.sub}>
                      {a.projected}
                    </TD>
                    <TD mono right color={C.sub}>{a.bestDay || '—'}</TD>
                  </tr>
                ))}
                {mtd.byAgent.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-sm py-5" style={{ color: C.sub }}>No conversion data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Daily Grid Matrix */}
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
                          color: total >= 30 ? C.good : total > 0 ? C.text : C.sub,
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

        {/* Account Leaderboard with MTD % */}
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
      </div>
    </>
  );
}
