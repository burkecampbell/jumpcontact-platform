import type { PeriodData, RepAgent } from './types';
import type { YticaAgent, YticaRepActivity } from './sheets';

const MSC_ONLY_AGENTS = new Set([
  'sue', 'francis', 'natalie', 'desi', 'rebecca', 'sofia', 'richard', 'anthony',
]);

export function blendYticaIntoPerioData(period: PeriodData, ytica: YticaRepActivity | null): PeriodData {
  if (!ytica || ytica.agents.length === 0) return period;

  const yticaMap = new Map<string, YticaAgent>();
  for (const a of ytica.agents) yticaMap.set(a.agent.toLowerCase(), a);

  const blendedAgents: RepAgent[] = period.repActivity.agents.map(agent => {
    const y = yticaMap.get(agent.agent.toLowerCase());
    if (!y) return agent;

    return {
      ...agent,
      wrapUpSec: y.wrapUpSec ?? agent.wrapUpSec,
      speedSec: y.speedSec ?? agent.speedSec,
      calls: Math.max(agent.calls, y.calls),
    };
  });

  for (const [name, y] of yticaMap) {
    if (!blendedAgents.some(a => a.agent.toLowerCase() === name)) {
      blendedAgents.push({
        agent: y.agent,
        calls: y.calls,
        talkMin: y.talkMin,
        speedSec: y.speedSec,
        wrapUpSec: y.wrapUpSec,
        hoursScheduled: 0,
        convsPerHour: undefined,
        conversions: 0,
      });
    }
  }

  const avgSpeedSec = ytica.avgSpeedSec ?? period.repActivity.avgSpeedSec;

  return {
    ...period,
    repActivity: {
      ...period.repActivity,
      agents: blendedAgents,
      avgSpeedSec,
    },
    teamStats: period.teamStats,
  };
}

export function filterOutMSCAgents(period: PeriodData): PeriodData {
  return {
    ...period,
    repActivity: {
      ...period.repActivity,
      agents: period.repActivity.agents.filter(a => !MSC_ONLY_AGENTS.has(a.agent.toLowerCase())),
      outbound: period.repActivity.outbound.filter(a => !MSC_ONLY_AGENTS.has(a.agent.toLowerCase())),
    },
  };
}
