/**
 * Pure function — builds the Slack recap text from dashboard data.
 * On Monday, includes Friday + Weekend sections. Otherwise just yesterday.
 */
import { capitalize, EXCLUDED_AGENTS, isMonday } from '@/lib/constants';
import type { DashboardData, PeriodData } from '@/lib/types';
import { aggregateDays } from '@/components/meeting/aggregateDays';

function fmtMin(m: number) {
  return m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`;
}

function dayName(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
}

/** Build a recap section from any PeriodData */
function buildPeriodSection(period: PeriodData, heading: string): string {
  const agents = period.repActivity.agents.filter(a => !EXCLUDED_AGENTS.includes(a.agent));
  const convByAgent: Record<string, number> = {};
  for (const a of period.conversions.byAgent) convByAgent[a.agent.toLowerCase()] = a.count;
  const dot = (n: string) => '\u00b7'.repeat(Math.max(12 - n.length, 1));

  const callsR = [...agents].sort((a, b) => b.calls - a.calls)
    .map(a => `${capitalize(a.agent)} ${dot(a.agent)} ${a.calls}`).join('\n');
  const convR = [...agents]
    .map(a => ({ ...a, c: convByAgent[a.agent.toLowerCase()] || 0 }))
    .sort((a, b) => b.c - a.c)
    .map(a => {
      const r = a.calls > 0 ? Math.round((a.c / a.calls) * 100) + '%' : '\u2014';
      return `${capitalize(a.agent)} ${dot(a.agent)} ${a.c}  (${r})`;
    }).join('\n');
  const accts = period.conversions.byAccount.slice(0, 5)
    .map(a => `${a.account} \u2014 ${a.count}`).join('\n');

  return `${heading}\n${'─'.repeat(heading.length)}\n\n\uD83D\uDCDE  CALLS \u2014 ${agents.reduce((s, a) => s + a.calls, 0)}\n${callsR}\n\n\uD83C\uDFAF  CONVERSIONS \u2014 ${period.conversions.total}\n${convR}\n\n\uD83C\uDFE2  TOP ACCOUNTS\n${accts}\n\n\uD83D\uDCDE  MISSED \u2014 ${period.missedCalls.total}`;
}

export function buildSlackRecap(data: DashboardData, baseUrl?: string): string {
  const monday = isMonday();
  const dot = (n: string) => '\u00b7'.repeat(Math.max(12 - n.length, 1));
  const url = baseUrl ? `${baseUrl}/morning` : '';

  // Champions block (days 1-3)
  const champ = data.prevMonthChampions;
  const champBlock = champ
    ? `\uD83C\uDFC6  ${champ.month.toUpperCase()} CHAMPIONS\nMost Conversions: ${capitalize(champ.mostConversions.agent)} (${champ.mostConversions.value})\nFastest Speed: ${capitalize(champ.fastestSpeed.agent)} (${champ.fastestSpeed.value}s)\nMost Calls: ${capitalize(champ.mostCalls.agent)} (${champ.mostCalls.value})\nBest Conv/Day: ${capitalize(champ.bestConvRate.agent)} (${champ.bestConvRate.value})\n\n`
    : '';

  // MTD section
  const mtdR = data.mtd.byAgent
    .filter(a => !EXCLUDED_AGENTS.includes(a.agent))
    .sort((a, b) => b.count - a.count)
    .map((a, i) => `${i + 1}. ${capitalize(a.agent)} ${dot(a.agent)} ${a.count}`).join('\n');
  const mtdBlock = `\uD83C\uDFC6  MTD (day ${data.mtd.dayOfMonth})\n${mtdR}`;

  if (monday && data.weekend) {
    const friday = data.weekend.friday;
    const weekend = aggregateDays([data.weekend.saturday, data.weekend.sunday]);

    const fridaySection = buildPeriodSection(friday, `\uD83D\uDCC5  FRIDAY \u00b7 ${new Date(friday.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
    const weekendSection = buildPeriodSection(weekend, `\uD83D\uDCC5  WEEKEND (Sat+Sun)`);

    return `WEEKEND RECAP\n${'\u2501'.repeat(27)}\n\n${champBlock}${fridaySection}\n\n${weekendSection}\n\n${mtdBlock}${url ? `\n\n\uD83D\uDCCA ${url}` : ''}`;
  }

  // Normal day (Tue-Sun) — single period recap
  const dn = dayName(data.yesterdayDate || '').toUpperCase();
  const ds = new Date((data.yesterdayDate || '') + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const section = buildPeriodSection(data.yesterday, `${dn} RECAP  \u00b7  ${ds}`);

  return `${section.split('\n').slice(0, 2).join('\n')}\n\n${champBlock}${section.split('\n').slice(3).join('\n')}\n\n${mtdBlock}${url ? `\n\n\uD83D\uDCCA ${url}` : ''}`;
}
