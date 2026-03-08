'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import NavBar from './NavBar';
import Card from './Card';
import AgentRankingRow from './AgentRankingRow';
import {
  C, GOAL, capitalize, fmtTalkTime, fmtSpeed, speedGrade,
  computePace, isMonday, isIbrahim, agentColor,
} from '@/lib/constants';
import type { DashboardData, PeriodData, ConvPeriod, RepAgent } from '@/lib/getDashboard';

// ── Count-Up Hook ──────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0);
  const startTs = useRef<number | null>(null);
  const rafId = useRef<number>(0);

  useEffect(() => {
    setValue(0);
    startTs.current = null;
    function tick(ts: number) {
      if (!startTs.current) startTs.current = ts;
      const elapsed = ts - startTs.current;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(ease * target));
      if (progress < 1) rafId.current = requestAnimationFrame(tick);
    }
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [target, duration]);
  return value;
}

// ── Hero Number ────────────────────────────────────────────────────────────
function Hero({ value, sub, color }: { value: number; sub?: string; color?: string }) {
  const displayed = useCountUp(value);
  return (
    <div className="text-center py-7 pb-5">
      <div
        className="font-mono font-extralight text-[88px] leading-none tracking-[-4px]"
        style={{ color: color || C.cyan, textShadow: '0 0 40px rgba(62,165,195,0.35)' }}
      >
        {displayed}
      </div>
      {sub && <div className="mt-2 text-[13px] font-medium" style={{ color: C.sub }}>{sub}</div>}
    </div>
  );
}

// ── Pace Bar ──────────────────────────────────────────────────────────────
function PaceBar({ pct, color }: { pct: number; color: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { setW(0); const t = setTimeout(() => setW(pct), 100); return () => clearTimeout(t); }, [pct]);
  return (
    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: C.border }}>
      <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

// ── Callout System ────────────────────────────────────────────────────────
interface Callout { emoji: string; message: string }

function generateCallouts(period: PeriodData): Callout[] {
  const callouts: Callout[] = [];
  const convAgents = period.conversions.byAgent;
  const repAgents = period.repActivity.agents;

  // DAILY_LEADER
  if (convAgents.length > 0 && convAgents[0].count > 0) {
    callouts.push({ emoji: '👑', message: `${convAgents[0].agent} led with ${convAgents[0].count} conversions` });
  }

  // ZERO_CONV — agent with calls but 0 conversions
  for (const rep of repAgents) {
    if (rep.calls < 3) continue;
    const conv = convAgents.find(a => a.agent.toLowerCase() === rep.agent.toLowerCase());
    if (!conv || conv.count === 0) {
      callouts.push({ emoji: '⚠️', message: `${rep.agent} had 0 conversions despite ${rep.calls} calls answered` });
    }
  }

  // EVENING_CARRY — conversions after 5 PM
  const hourly = period.conversions.hourly;
  if (hourly) {
    const eveningTotal = hourly.slice(17).reduce((s, n) => s + n, 0);
    if (eveningTotal >= 3) {
      callouts.push({ emoji: '🌙', message: `${eveningTotal} conversions closed after 5 PM` });
    }
  }

  // ODD_HOUR — before 7 AM or after 9 PM
  if (hourly) {
    const earlyTotal = hourly.slice(0, 7).reduce((s, n) => s + n, 0);
    const lateTotal = hourly.slice(21).reduce((s, n) => s + n, 0);
    const oddTotal = earlyTotal + lateTotal;
    if (oddTotal > 0) {
      callouts.push({ emoji: '🕐', message: `${oddTotal} conversion${oddTotal > 1 ? 's' : ''} logged at unusual hours` });
    }
  }

  return callouts;
}

// ── Monday Aggregation ────────────────────────────────────────────────────
function aggregateWeekend(weekend: { friday: PeriodData; saturday: PeriodData; sunday: PeriodData }): PeriodData {
  const days = [weekend.friday, weekend.saturday, weekend.sunday];

  // Aggregate rep activity
  const agentMap: Record<string, { calls: number; talkMin: number; speedSec: number[]; wrapUpSec: number[] }> = {};
  for (const day of days) {
    for (const a of day.repActivity.agents) {
      if (!agentMap[a.agent]) agentMap[a.agent] = { calls: 0, talkMin: 0, speedSec: [], wrapUpSec: [] };
      agentMap[a.agent].calls += a.calls;
      agentMap[a.agent].talkMin += a.talkMin;
      if (a.speedSec !== null) agentMap[a.agent].speedSec.push(a.speedSec);
      if (a.wrapUpSec !== null) agentMap[a.agent].wrapUpSec.push(a.wrapUpSec);
    }
  }

  const agents: RepAgent[] = Object.entries(agentMap)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([agent, s]) => ({
      agent,
      calls: s.calls,
      talkMin: +(s.talkMin).toFixed(1),
      speedSec: s.speedSec.length > 0 ? +(s.speedSec.reduce((a, b) => a + b, 0) / s.speedSec.length).toFixed(1) : null,
      wrapUpSec: s.wrapUpSec.length > 0 ? +(s.wrapUpSec.reduce((a, b) => a + b, 0) / s.wrapUpSec.length).toFixed(1) : null,
    }));

  // Aggregate conversions
  const convMap: Record<string, number> = {};
  const acctMap: Record<string, number> = {};
  const hourly = new Array(24).fill(0);
  let convTotal = 0;
  for (const day of days) {
    convTotal += day.conversions.total;
    for (const a of day.conversions.byAgent) {
      convMap[a.agent] = (convMap[a.agent] || 0) + a.count;
    }
    for (const a of day.conversions.byAccount) {
      acctMap[a.account] = (acctMap[a.account] || 0) + a.count;
    }
    if (day.conversions.hourly) {
      day.conversions.hourly.forEach((v, i) => { hourly[i] += v; });
    }
  }

  // Aggregate missed
  let missedTotal = 0, missedJC = 0, missedIbrahim = 0;
  const missedAcctMap: Record<string, number> = {};
  for (const day of days) {
    missedTotal += day.missedCalls.total;
    missedJC += day.missedCalls.jcTotal;
    missedIbrahim += day.missedCalls.ibrahimCount;
    for (const a of day.missedCalls.byAccount) {
      missedAcctMap[a.account] = (missedAcctMap[a.account] || 0) + a.count;
    }
  }

  const avgSpeeds = days.map(d => d.repActivity.avgSpeedSec).filter((s): s is number => s !== null);

  return {
    conversions: {
      total: convTotal,
      byAgent: Object.entries(convMap).sort((a, b) => b[1] - a[1]).map(([agent, count]) => ({ agent, count })),
      byAccount: Object.entries(acctMap).sort((a, b) => b[1] - a[1]).map(([account, count]) => ({ account, count })),
      hourly,
    },
    missedCalls: {
      total: missedTotal,
      jcTotal: missedJC,
      ibrahimCount: missedIbrahim,
      byAccount: Object.entries(missedAcctMap).sort((a, b) => b[1] - a[1]).map(([account, count]) => ({ account, count })),
    },
    repActivity: {
      agents,
      outbound: [],
      avgSpeedSec: avgSpeeds.length > 0 ? +(avgSpeeds.reduce((a, b) => a + b, 0) / avgSpeeds.length).toFixed(1) : null,
    },
  };
}

// ── STEP 1: Calls Answered ─────────────────────────────────────────────
function StepCalls({ period, label }: { period: PeriodData; label: string }) {
  const agents = period.repActivity.agents;
  const total = agents.reduce((s, a) => s + a.calls, 0);
  const max = agents[0]?.calls ?? 1;

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>{label}</div>
      <Hero value={total} sub="calls answered" />
      <Card>
        {agents.map((a, i) => (
          <AgentRankingRow key={a.agent} rank={i + 1} agent={a.agent} value={a.calls} maxValue={max} suffix=" calls" />
        ))}
        {agents.length === 0 && <p className="text-center text-sm py-5" style={{ color: C.sub }}>No call data yet</p>}
      </Card>
    </div>
  );
}

// ── STEP 2: Talk Time ──────────────────────────────────────────────────
function StepTalkTime({ period, label }: { period: PeriodData; label: string }) {
  const agents = [...period.repActivity.agents].sort((a, b) => b.talkMin - a.talkMin);
  const totalMin = agents.reduce((s, a) => s + a.talkMin, 0);
  const max = agents[0]?.talkMin ?? 1;

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>{label}</div>
      <Hero value={Math.round(totalMin / 60)} sub="hours total talk time" color={C.text} />
      <Card>
        {agents.map((a, i) => (
          <AgentRankingRow key={a.agent} rank={i + 1} agent={a.agent} value={a.talkMin} maxValue={max} formatValue={fmtTalkTime} />
        ))}
        {agents.length === 0 && <p className="text-center text-sm py-5" style={{ color: C.sub }}>No talk time data yet</p>}
      </Card>
    </div>
  );
}

// ── STEP 3: Speed to Answer ────────────────────────────────────────────
function StepSpeed({ period, label }: { period: PeriodData; label: string }) {
  const sorted = [...period.repActivity.agents].sort((a, b) => {
    if (a.speedSec === null && b.speedSec === null) return 0;
    if (a.speedSec === null) return 1;
    if (b.speedSec === null) return -1;
    return a.speedSec - b.speedSec;
  });
  const avgSec = period.repActivity.avgSpeedSec;

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>{label}</div>
      {avgSec !== null ? (
        <Hero value={Math.round(avgSec)} sub="avg seconds to answer" />
      ) : (
        <div className="text-center py-7 pb-5">
          <div className="font-mono font-extralight text-[88px] leading-none" style={{ color: C.sub }}>—</div>
          <div className="mt-2 text-[13px]" style={{ color: C.sub }}>no speed data yet</div>
        </div>
      )}
      <Card>
        {sorted.map((a, i) => {
          const { grade, color } = speedGrade(a.speedSec);
          return (
            <div key={a.agent} className="flex items-center justify-between py-3" style={{ borderBottom: i < sorted.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div className="flex items-center gap-3">
                <span className="font-extrabold text-lg w-7 text-center" style={{ color: C.sub }}>
                  {i < 3 ? ['🥇','🥈','🥉'][i] : `${i + 1}`}
                </span>
                <div>
                  <div className="font-semibold text-[15px] capitalize" style={{ color: C.text }}>{a.agent}</div>
                  {a.calls > 0 && <div className="text-xs" style={{ color: C.sub }}>{a.calls} calls · {fmtTalkTime(a.talkMin)}</div>}
                </div>
              </div>
              <div className="text-right flex items-center gap-2.5">
                <span className="font-mono font-bold text-[17px]" style={{ color: agentColor(a.agent) }}>{fmtSpeed(a.speedSec)}</span>
                <span className="text-[13px] font-extrabold px-1.5 py-0.5 rounded min-w-[30px] text-center"
                  style={{ color, background: `${color}18` }}>{grade}</span>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-center text-sm py-5" style={{ color: C.sub }}>No speed data yet</p>}
      </Card>
    </div>
  );
}

// ── STEP 4: Conversions ────────────────────────────────────────────────
function StepConversions({ period, label }: { period: PeriodData; label: string }) {
  const convAgents = period.conversions.byAgent;
  const convAccounts = period.conversions.byAccount;
  const missed = period.missedCalls;
  const jcMissed = missed.jcTotal - missed.ibrahimCount;
  const maxAgent = convAgents[0]?.count ?? 1;
  const callouts = generateCallouts(period);

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>{label}</div>
      <Hero value={period.conversions.total} sub="conversions" />

      {/* Callouts */}
      {callouts.length > 0 && (
        <div className="mb-4 space-y-2">
          {callouts.map((c, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(62,165,195,0.08)' }}>
              <span>{c.emoji}</span>
              <span style={{ color: C.text }}>{c.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Agent breakdown */}
      <Card className="mb-3">
        <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.sub }}>By Agent</div>
        {convAgents.map((a, i) => (
          <AgentRankingRow key={a.agent} rank={i + 1} agent={a.agent} value={a.count} maxValue={maxAgent} />
        ))}
        {convAgents.length === 0 && <p className="text-center text-sm py-3" style={{ color: C.sub }}>No conversions yet</p>}
      </Card>

      {/* Accounts + Missed side by side */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.sub }}>Top Accounts</div>
          {convAccounts.slice(0, 6).map((a, i) => (
            <div key={a.account} className="flex justify-between items-center py-1.5" style={{ borderBottom: i < Math.min(convAccounts.length, 6) - 1 ? `1px solid ${C.border}` : 'none' }}>
              <span className="text-[13px] truncate mr-2" style={{ color: C.text }}>{a.account}</span>
              <span className="font-bold text-[13px] shrink-0" style={{ color: C.cyan }}>{a.count}</span>
            </div>
          ))}
          {convAccounts.length === 0 && <p className="text-center text-[13px] py-3" style={{ color: C.sub }}>No data</p>}
        </Card>

        <Card>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.sub }}>
            Missed Calls <span style={{ color: C.pink }}>{jcMissed}</span>
          </div>
          {missed.byAccount.filter(a => !isIbrahim(a.account)).slice(0, 6).map((a, i) => (
            <div key={a.account} className="flex justify-between items-center py-1.5" style={{ borderBottom: i < 5 ? `1px solid ${C.border}` : 'none' }}>
              <span className="text-[13px] truncate mr-2" style={{ color: C.text }}>{a.account}</span>
              <span className="font-bold text-[13px] shrink-0" style={{ color: C.pink }}>{a.count}</span>
            </div>
          ))}
          {missed.ibrahimCount > 0 && (
            <div className="text-xs mt-2 pt-2" style={{ color: C.sub, borderTop: `1px solid ${C.border}` }}>
              + {missed.ibrahimCount} Ibrahim Law (separate)
            </div>
          )}
          {missed.byAccount.length === 0 && <p className="text-center text-[13px] py-3" style={{ color: C.sub }}>None — great job!</p>}
        </Card>
      </div>

      {/* Hourly Distribution */}
      {period.conversions.hourly && (
        <Card className="mt-3">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.sub }}>Hourly Distribution</div>
          <div className="flex items-end gap-[2px] h-16">
            {period.conversions.hourly.slice(6, 22).map((v, i) => {
              const maxH = Math.max(...(period.conversions.hourly?.slice(6, 22) || [1]), 1);
              const h = v > 0 ? Math.max((v / maxH) * 100, 8) : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-sm transition-all duration-500" style={{ height: `${h}%`, background: v > 0 ? C.cyan : C.border, minHeight: v > 0 ? '4px' : '0' }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px]" style={{ color: C.sub }}>6a</span>
            <span className="text-[10px]" style={{ color: C.sub }}>12p</span>
            <span className="text-[10px]" style={{ color: C.sub }}>6p</span>
            <span className="text-[10px]" style={{ color: C.sub }}>10p</span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── STEP 5: MTD Race ───────────────────────────────────────────────────
function StepMTD({ data }: { data: DashboardData }) {
  const { dayOfMonth, daysInMonth, projected, pacePercent } = computePace(data.mtd.total, data.pulledAt);
  const agents = data.mtd.byAgent;
  const maxCount = agents[0]?.count ?? 1;
  const paceColor = pacePercent >= 100 ? '#4ade80' : pacePercent >= 80 ? C.cyan : '#f87171';

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>Month-to-Date</div>
      <Hero value={data.mtd.total} sub={`conversions · day ${dayOfMonth} of ${daysInMonth}`} />

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

      <Card>
        <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.sub }}>Agent Leaderboard</div>
        {agents.map((a, i) => (
          <AgentRankingRow key={a.agent} rank={i + 1} agent={a.agent} value={a.count} maxValue={maxCount} />
        ))}
        {agents.length === 0 && <p className="text-center text-sm py-5" style={{ color: C.sub }}>No MTD data</p>}
      </Card>
    </div>
  );
}

// ── STEP 6: Slack Post ─────────────────────────────────────────────────
const CLOSING_LINES = [
  "Let's close strong today! 💪",
  "Make today count! 🔥",
  "Every call is an opportunity! 📞",
  "Let's hit our targets! 🎯",
  "Time to lock in! 🔒",
  "Stay hungry, stay sharp! ⚡",
  "Greatness is a choice — choose it today! 🏆",
];

function dotLeader(label: string, value: string, width = 28): string {
  const dots = '.'.repeat(Math.max(width - label.length - value.length, 2));
  return `${label} ${dots} ${value}`;
}

function StepSlack({ data }: { data: DashboardData }) {
  const [copied, setCopied] = useState(false);
  const { projected, pacePercent } = computePace(data.mtd.total, data.pulledAt);
  const paceEmoji = pacePercent >= 100 ? '🟢' : pacePercent >= 80 ? '🟡' : '🔴';
  const medal = ['🥇', '🥈', '🥉'];
  const monday = isMonday();
  const periodLbl = monday ? 'Weekend' : 'Yesterday';
  const period = data.yesterday;
  const closingLine = CLOSING_LINES[new Date().getDay() % CLOSING_LINES.length];

  const jcMissed = period.missedCalls.jcTotal - period.missedCalls.ibrahimCount;

  const agentLines = period.conversions.byAgent
    .slice(0, 5)
    .map((a, i) => `${medal[i] || `${i + 1}.`} ${dotLeader(a.agent, `*${a.count}*`)}`)
    .join('\n');

  const acctLines = period.conversions.byAccount
    .slice(0, 5)
    .map((a, i) => `${i + 1}. ${dotLeader(a.account, `${a.count}`)}`)
    .join('\n');

  const speedAgents = [...period.repActivity.agents]
    .filter(a => a.speedSec !== null)
    .sort((a, b) => (a.speedSec ?? Infinity) - (b.speedSec ?? Infinity))
    .slice(0, 3);

  const speedLines = speedAgents.length
    ? speedAgents.map((a, i) => `${medal[i] || `${i + 1}.`} ${dotLeader(a.agent, `*${fmtSpeed(a.speedSec)}*`)}`).join('\n')
    : 'No speed data yet';

  const avgLine = period.repActivity.avgSpeedSec !== null
    ? `\n${dotLeader('Team Average', `*${fmtSpeed(period.repActivity.avgSpeedSec)}*`)}` : '';

  const ibrahimNote = period.missedCalls.ibrahimCount > 0
    ? `\n(+ ${period.missedCalls.ibrahimCount} Ibrahim Law — counted separately)` : '';

  const generatedAt = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Edmonton' });

  const message = `🌅 *JUMP CONTACT — MORNING REPORT*
📅 ${data.date}

━━━━━━━━━━━━━━━━━━━━━
📊 *CONVERSIONS*
━━━━━━━━━━━━━━━━━━━━━
${dotLeader(periodLbl, `*${period.conversions.total}*`)}
${dotLeader('MTD Total', `*${data.mtd.total}* / ${GOAL}`)}
${dotLeader('Projected', `*${projected}* ${paceEmoji} (${pacePercent}%)`)}

━━━━━━━━━━━━━━━━━━━━━
🏆 *AGENT RANKINGS — ${periodLbl}*
━━━━━━━━━━━━━━━━━━━━━
${agentLines || 'No data yet'}

━━━━━━━━━━━━━━━━━━━━━
📋 *TOP ACCOUNTS — ${periodLbl}*
━━━━━━━━━━━━━━━━━━━━━
${acctLines || 'No data yet'}

━━━━━━━━━━━━━━━━━━━━━
⚡ *SPEED TO LEAD — ${periodLbl}*
━━━━━━━━━━━━━━━━━━━━━
${speedLines}${avgLine}

━━━━━━━━━━━━━━━━━━━━━
📞 *MISSED CALLS*  ${jcMissed}
━━━━━━━━━━━━━━━━━━━━━${ibrahimNote}

${closingLine}
_Generated ${generatedAt} MST_`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>Slack Post</div>
      <div className="text-center py-6 pb-5">
        <div className="text-[40px] mb-2">📋</div>
        <div className="font-bold text-lg" style={{ color: C.text }}>Morning Report Ready</div>
        <div className="text-[13px] mt-1" style={{ color: C.sub }}>Generated {generatedAt} MST</div>
      </div>
      <Card className="mb-4">
        <pre className="font-mono text-xs whitespace-pre-wrap break-words leading-relaxed m-0" style={{ color: C.text }}>
          {message}
        </pre>
      </Card>
      <button
        onClick={handleCopy}
        className="w-full py-3.5 rounded-xl border-none font-bold text-[15px] cursor-pointer transition-colors duration-200"
        style={{ background: copied ? '#22c55e' : C.lime, color: '#0A0E1A' }}
      >
        {copied ? '✓ Copied to Clipboard' : '📋 Copy Slack Post'}
      </button>
    </div>
  );
}

// ── Step Labels ──────────────────────────────────────────────────────────
const STEP_LABELS = ['Calls', 'Talk Time', 'Speed', 'Conversions', 'MTD Race', 'Slack Post'];
const TOTAL = 6;

// ── Main Component ──────────────────────────────────────────────────────
export default function MeetingPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [activeDay, setActiveDay] = useState<'today' | 'yesterday'>('yesterday');

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

  useEffect(() => { fetchData(); }, [fetchData]);

  const goTo = useCallback((n: number) => { setStep(Math.max(0, Math.min(TOTAL - 1, n))); }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(step + 1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goTo(step - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, goTo]);

  if (loading) {
    return (
      <>
        <NavBar />
        <div className="max-w-[640px] mx-auto px-5 py-6">
          <div className="skeleton h-12 rounded-xl mb-4" />
          <div className="skeleton h-32 rounded-2xl mb-4" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <NavBar />
        <div className="max-w-[640px] mx-auto px-5 py-20 text-center">
          <p style={{ color: '#f87171' }}>Failed to load: {error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ background: C.cyan, color: '#000' }}>Retry</button>
        </div>
      </>
    );
  }

  const monday = isMonday();
  let period: PeriodData;
  let label: string;

  if (activeDay === 'today') {
    period = data.today;
    label = 'Today';
  } else if (monday && data.weekend) {
    period = aggregateWeekend(data.weekend);
    label = 'Weekend';
  } else {
    period = data.yesterday;
    label = 'Yesterday';
  }

  function renderStep() {
    switch (step) {
      case 0: return <StepCalls period={period} label={label} />;
      case 1: return <StepTalkTime period={period} label={label} />;
      case 2: return <StepSpeed period={period} label={label} />;
      case 3: return <StepConversions period={period} label={label} />;
      case 4: return <StepMTD data={data!} />;
      case 5: return <StepSlack data={data!} />;
      default: return null;
    }
  }

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <div className="max-w-[640px] mx-auto px-5 pb-24">
        {/* Step tab bar */}
        <div className="flex items-center gap-2 mb-4 pt-4">
          <div className="flex gap-1 overflow-x-auto pb-1 flex-1">
            {STEP_LABELS.map((lbl, i) => (
              <button key={i} onClick={() => goTo(i)} className="shrink-0 px-3 py-1.5 rounded-lg border-none text-[13px] cursor-pointer transition-all whitespace-nowrap"
                style={{
                  background: step === i ? C.cyan : 'rgba(255,255,255,0.05)',
                  color: step === i ? '#0A0E1A' : C.sub,
                  fontWeight: step === i ? 700 : 500,
                }}>
                {i + 1}. {lbl}
              </button>
            ))}
          </div>
          <div className="flex gap-1 shrink-0">
            {(['today', 'yesterday'] as const).map(d => (
              <button key={d} onClick={() => setActiveDay(d)} className="px-2.5 py-1 rounded-md border-none text-xs cursor-pointer capitalize"
                style={{
                  background: activeDay === d ? C.lime : 'rgba(255,255,255,0.06)',
                  color: activeDay === d ? '#0A0E1A' : C.sub,
                  fontWeight: 600,
                }}>
                {d === 'yesterday' && monday ? 'weekend' : d}
              </button>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div key={`${step}-${activeDay}`}>{renderStep()}</div>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t" style={{ background: 'rgba(10,14,26,0.82)', backdropFilter: 'blur(20px)', borderColor: C.border }}>
        <div className="max-w-[640px] mx-auto flex items-center justify-between px-5 py-3">
          <button onClick={() => goTo(step - 1)} disabled={step === 0}
            className="px-5 py-2 rounded-lg border text-sm font-semibold cursor-pointer"
            style={{ background: C.card, borderColor: C.border, color: step === 0 ? C.sub : C.text, opacity: step === 0 ? 0.4 : 1 }}>
            ← Back
          </button>
          <div className="flex gap-1.5 items-center">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <button key={i} onClick={() => goTo(i)} className="border-none cursor-pointer p-0 transition-all duration-200"
                style={{ width: i === step ? '20px' : '7px', height: '7px', borderRadius: '4px', background: i === step ? C.cyan : C.border }} />
            ))}
          </div>
          {step < TOTAL - 1 ? (
            <button onClick={() => goTo(step + 1)} className="px-5 py-2 rounded-lg border-none text-sm font-semibold cursor-pointer"
              style={{ background: C.cyan, color: '#0A0E1A' }}>
              Next →
            </button>
          ) : (
            <button onClick={() => goTo(0)} className="px-5 py-2 rounded-lg border-none text-sm font-bold cursor-pointer"
              style={{ background: C.lime, color: '#0A0E1A' }}>
              ↩ Restart
            </button>
          )}
        </div>
      </div>
    </>
  );
}
