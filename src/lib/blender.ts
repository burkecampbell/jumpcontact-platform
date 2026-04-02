/**
 * Brand Data Pipeline — Mixed-First Architecture
 *
 * Mixed is the canonical total (Ytica teamStats). JC and MSC are fully
 * derived views where every additive metric satisfies JC + MSC = Mixed.
 *
 * Flow:
 *   Ytica + CDR → buildPeriodData() → Mixed PeriodData (canonical)
 *                                           │
 *                   ┌───────────────────────┼──────────────────────┐
 *                   │                       │                      │
 *           deriveBrandView('jc')     return as-is      deriveBrandView('msc')
 */

import type {
  PeriodData, RepAgent, AcctStat,
  BrandCallSummary, BrandBucket,
} from './types';
import type { YticaAgent, YticaRepActivity } from './sheets';
import { type Brand, MSC_ONLY_AGENTS, JC_ONLY_AGENTS, BLENDED_AGENTS } from './brand';
import type { PairedCall } from './types';
import { normalizeAgent } from './constants';

// ── Build Brand Summary from CDR ───────────────────────────────────
// Single pass over tagged CDR calls → buckets everything by brand.

function emptyBucket(): BrandBucket {
  return { answered: 0, missed: 0, talkSec: 0, ringSum: 0, ringCount: 0 };
}

export function buildBrandSummary(calls: PairedCall[]): BrandCallSummary {
  const jc = emptyBucket();
  const msc = emptyBucket();
  const unknown = emptyBucket();

  // Per-agent brand counts (for blended agent ratios)
  const agentCounts: Record<string, { jc: number; msc: number }> = {};

  // Missed calls by brand → by account
  const missedJC: Record<string, number> = {};
  const missedMSC: Record<string, number> = {};

  for (const call of calls) {
    const brand = call.resolvedBrand;
    const bucket = brand === 'jc' ? jc : brand === 'msc' ? msc : unknown;
    const isMissed = call.direction === 'inbound' && call.duration === 0;

    if (isMissed) {
      bucket.missed++;
      const acct = call.client || 'Unknown';
      if (brand === 'jc') missedJC[acct] = (missedJC[acct] || 0) + 1;
      else if (brand === 'msc') missedMSC[acct] = (missedMSC[acct] || 0) + 1;
    } else if (call.direction === 'inbound') {
      bucket.answered++;
      bucket.talkSec += call.duration;
      if (call.ringTime > 0 && call.ringTime < 120 && call.status === 'completed') {
        bucket.ringSum += call.ringTime;
        bucket.ringCount++;
      }
    }

    // Track blended agent brand distribution
    const agent = normalizeAgent(call.agent || '')?.toLowerCase();
    if (agent && BLENDED_AGENTS.has(agent) && brand) {
      if (!agentCounts[agent]) agentCounts[agent] = { jc: 0, msc: 0 };
      if (brand === 'jc') agentCounts[agent].jc++;
      else if (brand === 'msc') agentCounts[agent].msc++;
    }
  }

  // Convert counts to ratios
  const agentRatios: Record<string, { jc: number; msc: number }> = {};
  for (const [agent, counts] of Object.entries(agentCounts)) {
    const total = counts.jc + counts.msc;
    if (total === 0) {
      agentRatios[agent] = { jc: 0.5, msc: 0.5 };
    } else {
      agentRatios[agent] = { jc: counts.jc / total, msc: counts.msc / total };
    }
  }

  const toAcctStats = (map: Record<string, number>): AcctStat[] =>
    Object.entries(map)
      .map(([account, count]) => ({ account, count }))
      .sort((a, b) => b.count - a.count);

  return {
    jc, msc, unknown,
    agentRatios,
    missedByBrand: {
      jc: { total: jc.missed, byAccount: toAcctStats(missedJC) },
      msc: { total: msc.missed, byAccount: toAcctStats(missedMSC) },
    },
  };
}

// ── Derive Brand View ──────────────────────────────────────────────
// Takes the canonical Mixed PeriodData + CDR brand summary → returns
// a complete PeriodData for JC, MSC, or Mixed. Every additive metric
// satisfies JC + MSC = Mixed.

export function deriveBrandView(
  period: PeriodData,
  brand: Brand,
  summary: BrandCallSummary,
): PeriodData {
  if (brand === 'mixed') return deriveMixedView(period, summary);
  return deriveSingleBrandView(period, brand, summary);
}

/** Mixed: keep all agents, strip conversions (incompatible sources), use Ytica totals */
function deriveMixedView(period: PeriodData, summary: BrandCallSummary): PeriodData {
  const teamTotal = period.teamStats?.totalCalls;
  const totalMissed = summary.jc.missed + summary.msc.missed + summary.unknown.missed;
  const answeredCalls = teamTotal || period.repActivity.agents.reduce((s, a) => s + a.calls, 0);
  const totalCalls = answeredCalls + totalMissed;

  return {
    ...period,
    // Strip conversions — JC=Sheets, MSC=GHL, can't mix
    conversions: { total: 0, byAgent: [], byAccount: [], hourly: new Array(24).fill(0) },
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
    // Headline metrics
    answeredCalls,
    totalCalls,
    missedCalls: {
      total: totalMissed,
      byAccount: [
        ...summary.missedByBrand.jc.byAccount,
        ...summary.missedByBrand.msc.byAccount,
      ].sort((a, b) => b.count - a.count),
    },
    answerRate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0,
    missedCallRate: totalCalls > 0 ? Math.round((totalMissed / totalCalls) * 1000) / 10 : 0,
  };
}

/** JC or MSC: filter agents, split blended, derive all metrics from brand data */
function deriveSingleBrandView(
  period: PeriodData,
  brand: 'jc' | 'msc',
  summary: BrandCallSummary,
): PeriodData {
  const isJC = brand === 'jc';
  const brandBucket = isJC ? summary.jc : summary.msc;
  const otherBucket = isJC ? summary.msc : summary.jc;

  // ── 1. Filter + split agents ──────────────────────────────────
  const filteredAgents = period.repActivity.agents
    .filter(a => {
      const lower = a.agent.toLowerCase();
      if (isJC) return !MSC_ONLY_AGENTS.has(lower);
      return MSC_ONLY_AGENTS.has(lower) || BLENDED_AGENTS.has(lower);
    })
    .map(a => {
      const lower = a.agent.toLowerCase();
      if (!BLENDED_AGENTS.has(lower)) return a;
      const ratio = summary.agentRatios[lower];
      if (!ratio) return { ...a, calls: 0, talkMin: 0 };
      const fraction = isJC ? ratio.jc : ratio.msc;
      return {
        ...a,
        calls: Math.round(a.calls * fraction),
        talkMin: +(a.talkMin * fraction).toFixed(1),
      };
    });

  const filteredOutbound = period.repActivity.outbound.filter(a => {
    const lower = a.agent.toLowerCase();
    if (isJC) return !MSC_ONLY_AGENTS.has(lower);
    return MSC_ONLY_AGENTS.has(lower) || BLENDED_AGENTS.has(lower);
  });

  // ── 2. Brand-specific speed average ───────────────────────────
  const speedVals = filteredAgents
    .filter(a => a.speedSec != null && a.speedSec! > 0)
    .map(a => a.speedSec!);
  const avgSpeedSec = speedVals.length > 0
    ? +(speedVals.reduce((s, v) => s + v, 0) / speedVals.length).toFixed(1)
    : null;

  // ── 3. Headline totals — proportional split of Ytica total ────
  const teamTotal = period.teamStats?.totalCalls;
  const cdrTotal = summary.jc.answered + summary.msc.answered;
  let answeredCalls: number;
  if (teamTotal && cdrTotal > 0) {
    const jcShare = Math.round(teamTotal * summary.jc.answered / cdrTotal);
    answeredCalls = isJC ? jcShare : teamTotal - jcShare;
  } else {
    answeredCalls = filteredAgents.reduce((s, a) => s + a.calls, 0);
  }

  // ── 4. Missed calls from CDR brand tags ───────────────────────
  const brandMissed = summary.missedByBrand[brand];

  // ── 5. Derived metrics ────────────────────────────────────────
  const totalCalls = answeredCalls + brandMissed.total;
  const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
  const missedCallRate = totalCalls > 0
    ? Math.round((brandMissed.total / totalCalls) * 1000) / 10
    : 0;
  const fastestPickup = speedVals.length > 0 ? Math.min(...speedVals) : 0;

  // ── 6. Brand-specific teamStats ───────────────────────────────
  let brandTeamStats = period.teamStats;
  if (period.teamStats && cdrTotal > 0) {
    const fraction = isJC
      ? summary.jc.answered / cdrTotal
      : summary.msc.answered / cdrTotal;
    const otherFraction = 1 - fraction;
    const jcFrac = isJC ? fraction : otherFraction;
    const brandTotal = isJC
      ? Math.round(period.teamStats.totalCalls * jcFrac)
      : period.teamStats.totalCalls - Math.round(period.teamStats.totalCalls * (summary.jc.answered / cdrTotal));
    brandTeamStats = {
      ...period.teamStats,
      totalCalls: brandTotal,
      missed: brandMissed.total,
    };
  }

  return {
    ...period,
    repActivity: {
      agents: filteredAgents,
      outbound: filteredOutbound,
      avgSpeedSec,
    },
    missedCalls: brandMissed,
    teamStats: brandTeamStats,
    // Headline metrics
    answeredCalls,
    totalCalls,
    answerRate,
    missedCallRate,
    teamAvgSpeed: avgSpeedSec ?? 0,
    fastestPickup,
  };
}

// ── Ytica Blending (unchanged) ─────────────────────────────────────
// Blends Ytica agent data into CDR-built period. This builds the
// canonical Mixed view before any brand derivation.

export function blendYticaIntoPerioData(period: PeriodData, ytica: YticaRepActivity | null): PeriodData {
  if (!ytica || ytica.agents.length === 0) return period;

  const yticaMap = new Map<string, YticaAgent>();
  for (const a of ytica.agents) yticaMap.set(a.agent.toLowerCase(), a);

  const blendedAgents: RepAgent[] = period.repActivity.agents.map(agent => {
    const y = yticaMap.get(agent.agent.toLowerCase());
    if (!y) return agent;

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

  // Add agents that exist in Ytica but not CDR
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
