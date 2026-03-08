'use client';

import { useEffect, useState, useCallback } from 'react';
import NavBar from './NavBar';
import Card from './Card';
import AgentRankingRow from './AgentRankingRow';
import { C, GOAL, capitalize, computePace, agentColor } from '@/lib/constants';
import type { DashboardData, AcctStat } from '@/lib/getDashboard';
import { Target, TrendingUp, CalendarDays, BarChart3 } from 'lucide-react';

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
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="skeleton h-56 rounded-2xl mb-6" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <NavBar />
        <div className="max-w-5xl mx-auto px-4 py-20 text-center">
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

  const topAgent = mtd.byAgent[0]?.count ?? 1;
  const topAccounts = (mtd.byAccount || []).slice(0, 10);
  const topAcct = topAccounts[0]?.count ?? 1;

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
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

        {/* Agent Leaderboard */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} style={{ color: C.cyan }} />
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>Agent Leaderboard</h2>
            <span className="text-xs ml-auto" style={{ color: C.sub }}>MTD conversions</span>
          </div>
          {mtd.byAgent.map((a, i) => (
            <AgentRankingRow
              key={a.agent}
              rank={i + 1}
              agent={capitalize(a.agent)}
              value={a.count}
              maxValue={topAgent}
            />
          ))}
          {mtd.byAgent.length === 0 && (
            <p className="text-sm py-4 text-center" style={{ color: C.sub }}>No conversion data yet</p>
          )}
        </Card>

        {/* Account Leaderboard */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Target size={16} style={{ color: C.cyan }} />
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>Top Accounts</h2>
            <span className="text-xs ml-auto" style={{ color: C.sub }}>MTD conversions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th className="text-left text-xs font-medium px-3 py-2" style={{ color: C.sub }}>#</th>
                  <th className="text-left text-xs font-medium px-3 py-2" style={{ color: C.sub }}>Account</th>
                  <th className="text-right text-xs font-medium px-3 py-2" style={{ color: C.sub }}>Count</th>
                  <th className="text-left text-xs font-medium px-3 py-2 w-1/3" style={{ color: C.sub }}></th>
                </tr>
              </thead>
              <tbody>
                {topAccounts.map((a: AcctStat, i: number) => (
                  <tr key={a.account} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="px-3 py-2 text-xs font-bold" style={{ color: i < 3 ? C.cyan : C.sub }}>{i + 1}</td>
                    <td className="px-3 py-2 text-sm font-medium truncate max-w-[200px]" style={{ color: C.text }}>{a.account}</td>
                    <td className="px-3 py-2 text-sm font-mono text-right" style={{ color: C.text }}>{a.count}</td>
                    <td className="px-3 py-2">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(139,146,168,0.12)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max((a.count / topAcct) * 100, 3)}%`, background: C.cyan }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
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
