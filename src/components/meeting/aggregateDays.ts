/**
 * Aggregate multiple PeriodData objects (e.g., weekend days) into one.
 */
import type { PeriodData, RepAgent } from '@/lib/types';

export function aggregateDays(days: PeriodData[]): PeriodData {
  // Aggregate rep activity
  const agentMap: Record<string, { calls: number; talkMin: number; speedSec: number[]; wrapUpSec: number[]; conversions: number }> = {};
  for (const day of days) {
    for (const a of day.repActivity.agents) {
      if (!agentMap[a.agent]) agentMap[a.agent] = { calls: 0, talkMin: 0, speedSec: [], wrapUpSec: [], conversions: 0 };
      agentMap[a.agent].calls += a.calls;
      agentMap[a.agent].talkMin += a.talkMin;
      agentMap[a.agent].conversions += (a.conversions ?? 0);
      if (a.speedSec !== null) agentMap[a.agent].speedSec.push(a.speedSec);
      if (a.wrapUpSec !== null) agentMap[a.agent].wrapUpSec.push(a.wrapUpSec);
    }
  }

  const agentHoursMap: Record<string, number> = {};
  for (const day of days) {
    for (const a of day.repActivity.agents) {
      agentHoursMap[a.agent] = (agentHoursMap[a.agent] || 0) + (a.hoursScheduled || 0);
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
      hoursScheduled: agentHoursMap[agent] || 0,
      conversions: s.conversions,
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
  let missedTotal = 0;
  const missedAcctMap: Record<string, number> = {};
  for (const day of days) {
    missedTotal += day.missedCalls.total;
    for (const a of day.missedCalls.byAccount) {
      missedAcctMap[a.account] = (missedAcctMap[a.account] || 0) + a.count;
    }
  }

  const avgSpeeds = days.map(d => d.repActivity.avgSpeedSec).filter((s): s is number => s !== null);

  return {
    date: days[0]?.date ?? '',
    conversions: {
      total: convTotal,
      byAgent: Object.entries(convMap).sort((a, b) => b[1] - a[1]).map(([agent, count]) => ({ agent, count })),
      byAccount: Object.entries(acctMap).sort((a, b) => b[1] - a[1]).map(([account, count]) => ({ account, count })),
      hourly,
    },
    missedCalls: {
      total: missedTotal,
      byAccount: Object.entries(missedAcctMap).sort((a, b) => b[1] - a[1]).map(([account, count]) => ({ account, count })),
    },
    repActivity: {
      agents,
      outbound: [],
      avgSpeedSec: avgSpeeds.length > 0 ? +(avgSpeeds.reduce((a, b) => a + b, 0) / avgSpeeds.length).toFixed(1) : null,
    },
    conversionRate: null,
  };
}
