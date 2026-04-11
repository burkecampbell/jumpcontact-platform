'use client';

import { C, GOAL, computePace, agentColor } from '@/lib/constants';
import type { DashboardData } from '@/lib/types';
import Card from '../Card';
import Hero from './Hero';
import PaceBar from './PaceBar';
import { TH, TD } from './TableCells';
import StepEmptyState from './StepEmptyState';

/** Step 4: MTD + YTD — monthly pace, avg/hr, agent leaderboard, year to date */
export default function StepMTD({ data }: { data: DashboardData }) {
  const { dayOfMonth, daysInMonth, projected, pacePercent } = computePace(data.mtd.total, data.pulledAt);
  const agents = data.mtd.byAgent;
  const accounts = data.mtd.byAccount ?? [];
  const hourly = data.mtd.hourly ?? [];
  const paceColor = pacePercent >= 100 ? '#4ade80' : pacePercent >= 80 ? C.cyan : '#f87171';
  const mtdDaily = data.mtd.mtdDaily ?? [];

  // Compute per-agent stats
  const agentStats = agents.map(a => {
    const dailyAvg = dayOfMonth > 0 ? +(a.count / dayOfMonth).toFixed(1) : 0;
    const agentProjected = Math.round(dailyAvg * daysInMonth);
    let bestDay = 0;
    if (a.daily) {
      for (const v of Object.values(a.daily)) {
        if (v > bestDay) bestDay = v;
      }
    }
    const sharePercent = data.mtd.total > 0 ? Math.round((a.count / data.mtd.total) * 100) : 0;
    return { ...a, dailyAvg, projected: agentProjected, bestDay, sharePercent };
  });

  // Avg per hour based on schedules
  const todayAgents = data.today?.repActivity?.agents ?? [];
  const todayScheduledHrs = todayAgents.reduce((s, a) => s + (a.hoursScheduled || 0), 0);
  const estTotalScheduledHrs = todayScheduledHrs * dayOfMonth;
  const avgPerHour = estTotalScheduledHrs > 0 ? (data.mtd.total / estTotalScheduledHrs).toFixed(2) : '—';

  // Gap to goal
  const remaining = Math.max(0, GOAL - data.mtd.total);
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const needPerDay = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : 0;

  // YTD data
  const ytd = data.ytd;
  const ytdTotal = ytd?.total ?? 0;
  const ytdByMonth = ytd?.byMonth ?? [];
  const ytdMaxMonth = ytdByMonth.length > 0 ? Math.max(...ytdByMonth.map(m => m.conversions), 1) : 1;

  // Defensive empty state — fires when KPI sheet has no MTD rows for this brand
  if (data.mtd.total === 0 && agents.length === 0) {
    return <StepEmptyState label="Month-to-Date" brand={data.brand} />;
  }

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>Month-to-Date</div>
      <Hero value={data.mtd.total} sub={`conversions \u00B7 day ${dayOfMonth} of ${daysInMonth}`} />

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

      {/* KPI Strip — 2 rows of 3 */}
      <div className="grid grid-cols-3 gap-2 mb-1.5">
        {[
          { label: 'Daily Avg', value: dayOfMonth > 0 ? (data.mtd.total / dayOfMonth).toFixed(1) : '—', color: C.text },
          { label: 'Projected', value: String(projected), color: projected >= GOAL ? '#4ade80' : C.text },
          { label: 'Need/Day', value: daysLeft > 0 ? String(needPerDay) : '\u2713', color: needPerDay > 40 ? '#f87171' : needPerDay > 30 ? '#fbbf24' : '#4ade80' },
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
          { label: 'Avg/Hr', value: avgPerHour, color: avgPerHour !== '—' && parseFloat(avgPerHour) >= 1 ? '#4ade80' : C.sub },
        ].map(s => (
          <Card key={s.label}>
            <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>{s.label}</div>
            <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Agent Leaderboard */}
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
                  <TD color={i < 3 ? C.cyan : C.sub}><span className="font-bold">{i < 3 ? ['\u{1F947}','\u{1F948}','\u{1F949}'][i] : i + 1}</span></TD>
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

      {/* Agent Share Bar */}
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

      {/* Top Accounts with top converter */}
      {accounts.length > 0 && (
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
                  <TH>Top Converter</TH>
                  <TH right>Convs</TH>
                </tr>
              </thead>
              <tbody>
                {[...accounts].sort((a, b) => b.count - a.count).slice(0, 8).map((a, i) => (
                  <tr key={a.account} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <TD color={i < 3 ? C.cyan : C.sub}><span className="font-bold">{i + 1}</span></TD>
                    <TD>{a.account}</TD>
                    <TD>
                      {a.topAgent ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: agentColor(a.topAgent) }} />
                          <span className="capitalize text-[13px]" style={{ color: C.text }}>{a.topAgent}</span>
                        </div>
                      ) : (
                        <span style={{ color: C.sub }}>—</span>
                      )}
                    </TD>
                    <TD mono right>{a.count}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Cumulative MTD Chart */}
      {mtdDaily.length > 1 && (
        <Card className="mb-3">
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

      {/* ═══════════ YEAR TO DATE ═══════════ */}
      {ytd && (
        <>
          <div className="mt-6 mb-3 text-center">
            <div className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>Year to Date</div>
            <div className="text-[64px] font-mono font-extralight leading-none mt-2" style={{ color: C.lime }}>{ytdTotal.toLocaleString()}</div>
            <div className="text-[13px] mt-1" style={{ color: C.sub }}>conversions in {new Date().getFullYear()}</div>
          </div>

          {/* YTD KPI strip */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Card>
              <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>Annual Pace</div>
              <div className="text-lg font-bold font-mono" style={{ color: C.text }}>{ytd.annualPace?.toLocaleString() ?? '—'}</div>
            </Card>
            <Card>
              <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>Projected EOY</div>
              <div className="text-lg font-bold font-mono" style={{ color: ytd.projectedEOY >= (ytd.goal || 10800) ? '#4ade80' : C.text }}>
                {ytd.projectedEOY?.toLocaleString() ?? '—'}
              </div>
            </Card>
            <Card>
              <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>On Track</div>
              <div className="text-lg font-bold" style={{ color: ytd.onTrack ? '#4ade80' : '#f87171' }}>
                {ytd.onTrack ? '\u2713 Yes' : '\u2717 No'}
              </div>
            </Card>
          </div>

          {/* Monthly bar chart */}
          {ytdByMonth.length > 0 && (
            <Card>
              <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.sub }}>Monthly Breakdown</div>
              <div className="flex items-end gap-2 h-28">
                {ytdByMonth.map((m) => {
                  const pct = (m.conversions / ytdMaxMonth) * 100;
                  const isCurrent = ytdByMonth.indexOf(m) === ytdByMonth.length - 1;
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center group">
                      <span className="text-[10px] font-mono mb-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: C.text }}>
                        {m.conversions}
                      </span>
                      <div
                        className="w-full rounded-t-md transition-all"
                        style={{
                          height: `${Math.max(pct, m.conversions > 0 ? 6 : 2)}%`,
                          background: isCurrent ? C.lime : C.cyan,
                          opacity: m.conversions > 0 ? 1 : 0.2,
                        }}
                      />
                      <span className="text-[10px] mt-1 font-medium" style={{ color: isCurrent ? C.lime : C.sub }}>{m.month}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
