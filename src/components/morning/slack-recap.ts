/**
 * Pure function — builds the Slack recap text from dashboard data.
 * No React, no DOM, just string building.
 */
import { capitalize, fmtTalkTime, EXCLUDED_AGENTS } from '@/lib/constants';
import type { DashboardData } from '@/lib/types';

function fmtMin(m: number) {
  return m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`;
}

function dayName(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
}

export function buildSlackRecap(data: DashboardData, baseUrl?: string): string {
  const yd = data.yesterday;
  const agents = yd.repActivity.agents.filter(a => !EXCLUDED_AGENTS.includes(a.agent));
  const convByAgent: Record<string, number> = {};
  for (const a of yd.conversions.byAgent) convByAgent[a.agent.toLowerCase()] = a.count;

  const dn = dayName(data.yesterdayDate || '').toUpperCase();
  const ds = new Date((data.yesterdayDate || '') + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const dot = (n: string) => '\u00b7'.repeat(Math.max(12 - n.length, 1));

  const callsR = [...agents].sort((a, b) => b.calls - a.calls)
    .map(a => `${capitalize(a.agent)} ${dot(a.agent)} ${a.calls}`).join('\n');
  const talkR = [...agents].sort((a, b) => b.talkMin - a.talkMin)
    .map(a => `${capitalize(a.agent)} ${dot(a.agent)} ${fmtMin(a.talkMin)}`).join('\n');
  const speedR = [...agents].filter(a => a.speedSec != null && a.speedSec > 0)
    .sort((a, b) => a.speedSec! - b.speedSec!)
    .map(a => `${capitalize(a.agent)} ${dot(a.agent)} ${a.speedSec!.toFixed(1)}s`).join('\n');
  const convR = [...agents]
    .map(a => ({ ...a, c: convByAgent[a.agent.toLowerCase()] || 0 }))
    .sort((a, b) => b.c - a.c)
    .map(a => {
      const r = a.calls > 0 ? Math.round((a.c / a.calls) * 100) + '%' : '\u2014';
      return `${capitalize(a.agent)} ${dot(a.agent)} ${a.c}  (${r})`;
    }).join('\n');
  const accts = yd.conversions.byAccount.slice(0, 5)
    .map(a => `${a.account} \u2014 ${a.count}`).join('\n');
  const mtdR = data.mtd.byAgent
    .filter(a => !EXCLUDED_AGENTS.includes(a.agent))
    .sort((a, b) => b.count - a.count)
    .map((a, i) => `${i + 1}. ${capitalize(a.agent)} ${dot(a.agent)} ${a.count}`).join('\n');

  const champ = data.prevMonthChampions;
  const champBlock = champ
    ? `\uD83C\uDFC6  ${champ.month.toUpperCase()} CHAMPIONS\nMost Conversions: ${capitalize(champ.mostConversions.agent)} (${champ.mostConversions.value})\nFastest Speed: ${capitalize(champ.fastestSpeed.agent)} (${champ.fastestSpeed.value}s)\nMost Calls: ${capitalize(champ.mostCalls.agent)} (${champ.mostCalls.value})\nBest Conv/Day: ${capitalize(champ.bestConvRate.agent)} (${champ.bestConvRate.value})\n\n`
    : '';

  const url = baseUrl ? `${baseUrl}/morning` : '';

  return `${dn} RECAP  \u00b7  ${ds}\n${'\u2501'.repeat(27)}\n\n${champBlock}\uD83D\uDCDE  CALLS \u2014 ${agents.reduce((s, a) => s + a.calls, 0)}\n${callsR}\n\n\u23F1  TALK TIME \u2014 ${fmtMin(agents.reduce((s, a) => s + a.talkMin, 0))}\n${talkR}\n\n\u26A1  SPEED\n${speedR}\n\n\uD83C\uDFAF  CONVERSIONS \u2014 ${yd.conversions.total}\n${convR}\n\n\uD83C\uDFE2  TOP ACCOUNTS\n${accts}\n\n\uD83D\uDCDE  MISSED \u2014 ${yd.missedCalls.total}\n\n\uD83C\uDFC6  MTD (day ${data.mtd.dayOfMonth})\n${mtdR}${url ? `\n\n\uD83D\uDCCA ${url}` : ''}`;
}
