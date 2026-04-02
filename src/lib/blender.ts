import type { PeriodData, RepAgent } from './types';
import type { YticaAgent, YticaRepActivity } from './sheets';
import { type Brand, MSC_ONLY_AGENTS, BLENDED_AGENTS } from './brand';

// ── Brand Split Ratios ──────────────────────────────────────────────────────
// For blended agents (Wendy, Sara), the fraction of their calls belonging
// to each brand. Derived from CDR brand resolution (client name / trunk phone).

export interface BrandSplitRatios {
  [agent: string]: { jc: number; msc: number };
}

// ── Brand Filtering ─────────────────────────────────────────────────────────

/** Filter period data by brand. Blended agents are SPLIT, not duplicated.
 *  @param splits — CDR-derived fractions for blended agents */
export function filterByBrand(period: PeriodData, brand: Brand, splits?: BrandSplitRatios): PeriodData {
  switch (brand) {
    case 'mixed':
      return stripConversions(period); // keep ALL agents, remove conversion data
    case 'jc':
    case 'msc':
      return filterAndSplitByBrand(period, brand, splits);
  }
}

/** JC/MSC view: keep the right agents, SPLIT blended agent call counts */
function filterAndSplitByBrand(
  period: PeriodData,
  brand: 'jc' | 'msc',
  splits?: BrandSplitRatios,
): PeriodData {
  const isJC = brand === 'jc';
  return {
    ...period,
    repActivity: {
      ...period.repActivity,
      agents: period.repActivity.agents
        .filter(a => {
          const lower = a.agent.toLowerCase();
          if (isJC) return !MSC_ONLY_AGENTS.has(lower); // JC + blended
          return MSC_ONLY_AGENTS.has(lower) || BLENDED_AGENTS.has(lower); // MSC + blended
        })
        .map(a => {
          const lower = a.agent.toLowerCase();
          if (!BLENDED_AGENTS.has(lower)) return a; // Pure agent — no split needed
          // Split blended agent's calls by brand ratio
          const ratio = splits?.[lower];
          if (!ratio) return { ...a, calls: 0, talkMin: 0 }; // No CDR data — safe zero
          const fraction = isJC ? ratio.jc : ratio.msc;
          return {
            ...a,
            calls: Math.round(a.calls * fraction),
            talkMin: +(a.talkMin * fraction).toFixed(1),
          };
        }),
      outbound: period.repActivity.outbound.filter(a => {
        const lower = a.agent.toLowerCase();
        if (isJC) return !MSC_ONLY_AGENTS.has(lower);
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

    // Prefer CDR speed (fractional precision) over Ytica (whole seconds)
    // Only use Ytica speed if CDR has no data for this agent
    const speedSec = agent.speedSec != null && agent.speedSec > 0
      ? agent.speedSec
      : y.speedSec ?? agent.speedSec;

    return {
      ...agent,
      wrapUpSec: y.wrapUpSec ?? agent.wrapUpSec,
      speedSec,
      // Prefer Ytica calls (source of truth) when available; fall back to CDR
      calls: y.calls > 0 ? y.calls : agent.calls,
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
