'use client';

import { useState } from 'react';
import { C, GOAL, fmtSpeed, computePace, isMonday } from '@/lib/constants';
import type { DashboardData } from '@/lib/types';
import Card from '../Card';

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

/** Step 6: Slack Post — generates a formatted Slack morning report with copy button */
export default function StepSlack({ data }: { data: DashboardData }) {
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

  // Week-to-date: sum last 7 days from mtdDaily
  const mtdDaily = data.mtd.mtdDaily ?? [];
  let wtdTotal = 0;
  if (mtdDaily.length > 0) {
    const last7 = mtdDaily.slice(-7);
    wtdTotal = last7.reduce((s, d) => s + d.total, 0);
  }
  const wtdLine = wtdTotal > 0 ? `\n${dotLeader('Week-to-Date', `*${wtdTotal}*`)}` : '';

  const message = `🌅 *JUMP CONTACT — MORNING REPORT*
📅 ${data.date}

━━━━━━━━━━━━━━━━━━━━━
📊 *CONVERSIONS*
━━━━━━━━━━━━━━━━━━━━━
${dotLeader(periodLbl, `*${period.conversions.total}*`)}${wtdLine}
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
