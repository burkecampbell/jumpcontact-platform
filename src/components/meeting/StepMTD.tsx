'use client';

import { C, GOAL, computePace, agentColor } from '@/lib/constants';
import type { DashboardData } from '@/lib/types';
import Card from '../Card';
import Hero from './Hero';
import PaceBar from './PaceBar';
import { TH, TD } from './TableCells';

/** Step 5: MTD Race — month-to-date pace, leaderboard, accounts, hourly, daily trend */
export default function StepMTD({ data }: { data: DashboardData }) {
  const { dayOfMonth, daysInMonth, projected, pacePercent } = computePace(data.mtd.total, data.pulledAt);
  const agents = data.mtd.byAgent;
  const accounts = data.mtd.byAccount;
  const hourly = data.mtd.hourly ?? [];
  const paceColor = pacePercent >= 100 ? '#4ade80' : pacePercent >= 80 ? C.cyan : '#f87171';
  const mtdDaily = data.mtd.mtdDaily ?? [];

  // Compute per-agent stats
  const agentStats = agents.map(a => {
    const dailyAvg = dayOfMonth > 0 ? +(a.count / dayOfMonth).toFixed(1) : 0;
    const agentProjected = Math.round(dailyAvg * daysInMonth);
    let bestDay = 0;
    let zeroDays = 0;
    if (a.daily) {
      for (const v of Object.values(a.daily)) {
        if (v > bestDay) bestDay = v;
        if (v === 0) zeroDays++;
      }
    }
    const sharePercent = data.mtd.total > 0 ? Math.round((a.count / data.mtd.total) * 100) : 0;
    return { ...a, dailyAvg, projected: agentProjected, bestDay, zeroDays, sharePercent };
  });

  // Hourly stats
  const maxHourly = Math.max(...hourly, 1);
  const peakHour = hourly.indexOf(Math.max(...hourly));
  const totalHourly = hourly.reduce((s, v) => s + v, 0);

  // Gap to goal
  const remaining = Math.max(0, GOAL - data.mtd.total);
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const needPerDay = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : 0;

  // Top 5 accounts
  const topAccounts = [...accounts].sort((a, b) => b.count - a.count).slice(0, 8);
  const accountTotal = accounts.reduce((s, a) => s + a.count, 0);

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>Month-to-Date</div>
      <Hero value={data.mtd.total} sub={`conversions · day ${dayOfMonth} of ${daysInMonth}`} />

      {/* Pace Bar */}
      <Card className="mb-3">
        <div className="flex justify-between items-center mb-2.5">
          <span className="text-[13px] font-semibold" style={{ color: C.sub }}>Monthly Pace</span>
          <span className="text-[13px] font-bold" style={{ color: paceColor }}>{pacePercent}% of goal</span>
        </div>
        <PaceBar pct={Math.min(pacePercent, 100)} color={paceColor} />
        <div className="flex justify-between text-xs mt-2" style={{ color: C.sub }}>
          <span>Projected: <strong style={{ color: C.text }}>{projected}</strong></span>
          <span>Goal: <strong style={{ color: C.text }}>{GOAL}</strong></span>
        </div>
      </Card>

      {/* Expanded KPI Strip — 2 rows of 3 */}
      <div className="grid grid-cols-3 gap-2 mb-1.5">
        {[
          { label: 'Daily Avg', value: dayOfMonth > 0 ? (data.mtd.total / dayOfMonth).toFixed(1) : '—', color: C.text },
          { label: 'Projected', value: String(projected), color: projected >= GOAL ? '#4ade80' : C.text },
          { label: 'Need/Day', value: daysLeft > 0 ? String(needPerDay) : '✓', color: needPerDay > 40 ? '#f87171' : needPerDay > 30 ? '#fbbf24' : '#4ade80' },
        ].map(s => (
          <Card key={s.label}>
            <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>{s.label}</div>
            <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Remaining', value: String(remaining), color: C.text },
          { label: 'Days Left', value: String(daysLeft), color: daysLeft <= 5 ? '#f87171' : C.text },
          { label: 'Accounts', value: String(accounts.length), color: C.sub },
        ].map(s => (
          <Card key={s.label}>
            <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>{s.label}</div>
            <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Agent Leaderboard Table — expanded */}
      <Card padding={false} className="mb-3">
        <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider" style={{ color: C.sub }}>Agent Leaderboard</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <TH>#</TH>
                <TH>Agent</TH>
                <TH right>MTD</TH>
                <TH right>Share</TH>
                <TH right>Avg/Day</TH>
                <TH right>Proj.</TH>
                <TH right>Best</TH>
              </tr>
            </thead>
            <tbody>
              {agentStats.map((a, i) => (
                <tr key={a.agent} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                  <TD color={i < 3 ? C.cyan : C.sub}><span className="font-bold">{i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span></TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: agentColor(a.agent) }} />
                      <span className="font-semibold capitalize">{a.agent}</span>
                    </div>
                  </TD>
                  <TD mono right>{a.count}</TD>
                  <TD mono right color={C.sub}>{a.sharePercent}%</TD>
                  <TD mono right color={C.sub}>{a.dailyAvg}</TD>
                  <TD mono right color={a.projected >= Math.round(GOAL / agents.length) ? '#4ade80' : C.sub}>{a.projected}</TD>
                  <TD mono right color={C.sub}>{a.bestDay || '—'}</TD>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr><td colSpan={7} className="text-center text-sm py-5" style={{ color: C.sub }}>No MTD data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Agent Share Bar — visual distribution */}
      {agentStats.length > 0 && (
        <Card className="mb-3">
          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: C.sub }}>Agent Share</div>
          <div className="flex rounded-lg overflow-hidden h-5">
            {agentStats.filter(a => a.sharePercent > 0).map(a => (
              <div
                key={a.agent}
                style={{ width: `${a.sharePercent}%`, background: agentColor(a.agent), minWidth: a.sharePercent > 3 ? undefined : '2px' }}
                title={`${a.agent}: ${a.sharePercent}%`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {agentStats.filter(a => a.sharePercent > 0).map(a => (
              <div key={a.agent} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-full" style={{ background: agentColor(a.agent) }} />
                <span style={{ color: C.text }} className="capitalize">{a.agent}</span>
                <span style={{ color: C.sub }}>{a.sharePercent}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Top Accounts */}
      {topAccounts.length > 0 && (
        <Card padding={false} className="mb-3">
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: C.sub }}>Top Accounts</span>
            <span className="text-[10px] font-mono" style={{ color: C.sub }}>{accounts.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <TH>#</TH>
                  <TH>Account</TH>
                  <TH right>Convs</TH>
                  <TH right>Share</TH>
                </tr>
              </thead>
              <tbody>
                {topAccounts.map((a, i) => {
                  const share = accountTotal > 0 ? Math.round((a.count / accountTotal) * 100) : 0;
                  return (
                    <tr key={a.account} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                      <TD color={i < 3 ? C.cyan : C.sub}><span className="font-bold">{i + 1}</span></TD>
                      <TD>{a.account}</TD>
                      <TD mono right>{a.count}</TD>
                      <TD mono right color={C.sub}>{share}%</TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Hourly Distribution — bar chart */}
      {hourly.length > 0 && totalHourly > 0 && (
        <Card className="mb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: C.sub }}>Hourly Distribution (MST)</span>
            <span className="text-[10px] font-mono" style={{ color: C.sub }}>
              Peak: {peakHour > 12 ? peakHour - 12 : peakHour}{peakHour >= 12 ? 'pm' : 'am'} ({hourly[peakHour]})
            </span>
          </div>
          <div className="flex items-end gap-px h-20">
            {hourly.map((val, hr) => {
              if (hr < 6 || hr > 22) return null; // skip overnight hours
              const pct = (val / maxHourly) * 100;
              const isActive = val > 0;
              return (
                <div key={hr} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full rounded-t-sm transition-all"
                    style={{
                      height: `${Math.max(pct, isActive ? 4 : 1)}%`,
                      background: hr === peakHour ? '#4ade80' : isActive ? C.cyan : C.border,
                      opacity: isActive ? 1 : 0.3,
                    }}
                    title={`${hr > 12 ? hr - 12 : hr}${hr >= 12 ? 'pm' : 'am'}: ${val}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-px mt-1">
            {hourly.map((_, hr) => {
              if (hr < 6 || hr > 22) return null;
              return (
                <div key={hr} className="flex-1 text-center text-[8px]" style={{ color: C.sub }}>
                  {hr % 2 === 0 ? (hr > 12 ? `${hr - 12}p` : hr === 12 ? '12p' : `${hr}a`) : ''}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Cumulative MTD Chart — SVG */}
      {mtdDaily.length > 1 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: C.sub }}>Daily Trend</span>
            <span className="text-[10px] font-mono" style={{ color: C.sub }}>
              {mtdDaily.length > 0 ? `Best: ${Math.max(...mtdDaily.map(d => d.total))}` : ''}
            </span>
          </div>
          <div className="h-24">
            <svg viewBox={`0 0 ${mtdDaily.length * 20} 100`} className="w-full h-full" preserveAspectRatio="none">
              {(() => {
                const cumulative: number[] = [];
                let sum = 0;
                for (const d of mtdDaily) { sum += d.total; cumulative.push(sum); }
                const maxVal = Math.max(...cumulative, 1);
                const goalLine = (GOAL / maxVal) * 100;

                const points = cumulative.map((v, i) => {
                  const x = i * 20 + 10;
                  const y = 100 - (v / maxVal) * 90;
                  return `${x},${y}`;
                });
                const linePath = `M${points.join(' L')}`;
                const areaPath = `${linePath} L${(cumulative.length - 1) * 20 + 10},100 L10,100 Z`;

                return (
                  <>
                    <line x1="0" y1={100 - (goalLine * 0.9)} x2={mtdDaily.length * 20} y2={100 - (goalLine * 0.9)}
                      stroke={C.sub} strokeDasharray="4,4" strokeWidth="0.5" opacity="0.5" />
                    <path d={areaPath} fill={C.cyan} opacity="0.1" />
                    <path d={linePath} fill="none" stroke={C.cyan} strokeWidth="2" />
                    {cumulative.map((v, i) => (
                      <circle key={i} cx={i * 20 + 10} cy={100 - (v / maxVal) * 90} r="2.5" fill={C.cyan} />
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px]" style={{ color: C.sub }}>Day 1</span>
            <span className="text-[10px]" style={{ color: C.sub }}>Day {dayOfMonth}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
