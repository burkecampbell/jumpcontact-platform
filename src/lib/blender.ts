import type { PeriodData, RepAgent } from './types';
import type { YticaAgent, YticaRepActivity } from './sheets';
import { type Brand, MSC_ONLY_AGENTS, BLENDED_AGENTS } from './brand';

// ── Brand Filtering ─────────────────────────────────────────────────────────

/** Filter period data by brand. The main entry point. */
export function filterByBrand(period: PeriodData, brand: Brand): PeriodData {
  switch (brand) {
    case 'jc':
      return filterOutMSCAgents(period);
    case 'msc':
      return filterToMSCAgents(period);
    case 'mixed':
      return stripConversions(period); // keep ALL agents, remove conversion data
  }
}

/** JC view: remove MSC-only agents */
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

/** MSC view: keep only MSC-only + blended agents */
export function filterToMSCAgents(period: PeriodData): PeriodData {
  return {
    ...period,
    repActivity: {
      ...period.repActivity,
      agents: period.repActivity.agents.filter(a => {
        const lower = a.agent.toLowerCase();
        return MSC_ONLY_AGENTS.has(lower) || BLENDED_AGENTS.has(lower);
      }),
      outbound: period.repActivity.outbound.filter(a => {
        const lower = a.agent.toLowerCase();
        return MSC_ONLY_AGENTS.has(lower) || BLENDED_AGENTS.has(lower);
      }),
    },
  };
}

/** Mixed view: keep ALL agents but zero out conversion metrics.
 *  JC conversions = Google Sheets, MSC conversions = GHL — they don't mix.
 *  This view answers: "How is our total phone operation performing?" */
export function stripConversions(period: PeriodData): PeriodData {
  return {
    ...period,
    conversions: {
      total: 0,
      byAgent: [],
      byAccount: [],
      hourly: new Array(24).fill(0),
    },
    conversionRate: null,
    repActivity: {
      ...period.repActivity,
      agents: period.repActivity.agents.map(a => ({
        ...a,
        conversions: 0,
        convsPerHour: undefined,
        trueYield: undefined,
      })),
    },
  };
}

// ── Ytica Blending ──────────────────────────────────────────────────────────

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
