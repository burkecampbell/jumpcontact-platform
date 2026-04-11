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
  PeriodData, RepAgent, AcctStat, AgentStat,
  BrandCallSummary, BrandBucket,
  MtdData, YtdData, TrendData, YticaMtdAgent,
} from './types';
import type { YticaAgent, YticaRepActivity } from './sheets';
import type { KPIMtdSummary } from './kpi-sheet';
import { type Brand, MSC_ONLY_AGENTS, JC_ONLY_AGENTS, BLENDED_AGENTS, isAgentForBrand } from './brand';
import type { PairedCall } from './types';
import { normalizeAgent, MONTHLY_GOAL } from './constants';
import { getClientBrand } from './clients';

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

/** Mixed: keep all agents, keep merged conversions (JC Sheets + MSC GHL), use Ytica totals */
function deriveMixedView(period: PeriodData, summary: BrandCallSummary): PeriodData {
  const teamTotal = period.teamStats?.totalCalls;
  const totalMissed = summary.jc.missed + summary.msc.missed + summary.unknown.missed;
  const answeredCalls = teamTotal || period.repActivity.agents.reduce((s, a) => s + a.calls, 0);
  const totalCalls = answeredCalls + totalMissed;

  return {
    ...period,
    // Conversions are already merged (JC Sheets + MSC GHL) upstream in route.ts
    // No longer stripped — Mixed shows the true combined picture
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
      // No CDR ratio → split 50/50 (NOT zero — zeroing loses calls from Mixed)
      // JC gets ceil, MSC gets floor → guarantees JC + MSC = original exactly
      if (!ratio) {
        const calls = isJC ? Math.ceil(a.calls / 2) : Math.floor(a.calls / 2);
        const talk = isJC
          ? +(Math.ceil(a.talkMin * 10 / 2) / 10).toFixed(1)
          : +(a.talkMin - Math.ceil(a.talkMin * 10 / 2) / 10).toFixed(1);
        return { ...a, calls, talkMin: +talk };
      }
      // JC gets round(), MSC gets remainder → exact additivity
      const jcCalls = Math.round(a.calls * ratio.jc);
      const jcTalk = +(a.talkMin * ratio.jc).toFixed(1);
      return {
        ...a,
        calls: isJC ? jcCalls : a.calls - jcCalls,
        talkMin: isJC ? jcTalk : +(a.talkMin - jcTalk).toFixed(1),
      };
    });

  // Remove blended agents who ended up with 0 calls for this brand
  // (e.g., Sara took 16 MSC calls and 0 JC calls — don't show her on JC view)
  const visibleAgents = filteredAgents.filter(a => {
    const lower = a.agent.toLowerCase();
    if (!BLENDED_AGENTS.has(lower)) return true;
    return a.calls > 0;
  });

  const filteredOutbound = period.repActivity.outbound.filter(a => {
    const lower = a.agent.toLowerCase();
    if (isJC) return !MSC_ONLY_AGENTS.has(lower);
    return MSC_ONLY_AGENTS.has(lower) || BLENDED_AGENTS.has(lower);
  });

  // ── 2. Brand-specific speed average ───────────────────────────
  const speedVals = visibleAgents
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
    answeredCalls = visibleAgents.reduce((s, a) => s + a.calls, 0);
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

  // ── 7. Filter conversions by brand agents ──────────────────────
  const visibleAgentNames = new Set(visibleAgents.map(a => a.agent.toLowerCase()));
  const brandConvByAgent = period.conversions.byAgent
    .filter(a => visibleAgentNames.has(a.agent.toLowerCase()))
    .map(a => {
      // For blended agents, split conversions proportionally
      const lower = a.agent.toLowerCase();
      if (BLENDED_AGENTS.has(lower)) {
        const ratio = summary.agentRatios[lower];
        if (ratio) {
          const jcConv = Math.round(a.count * ratio.jc);
          return { ...a, count: isJC ? jcConv : a.count - jcConv };
        }
        return { ...a, count: isJC ? Math.ceil(a.count / 2) : Math.floor(a.count / 2) };
      }
      return a;
    })
    .filter(a => a.count > 0);
  const brandConvTotal = brandConvByAgent.reduce((s, a) => s + a.count, 0);

  // Also update per-agent conversions on the repActivity agents
  const convLookup = new Map(brandConvByAgent.map(a => [a.agent.toLowerCase(), a.count]));
  for (const agent of visibleAgents) {
    agent.conversions = convLookup.get(agent.agent.toLowerCase()) || 0;
  }

  // ── 8. Filter conversions by account — only show brand-relevant accounts ──
  const brandConvByAccount = (period.conversions.byAccount || [])
    .map(acct => {
      if (!acct.agentBreakdown) return acct;
      // Filter agent breakdown to only visible agents
      const filteredBd: Record<string, number> = {};
      let brandCount = 0;
      for (const [agent, count] of Object.entries(acct.agentBreakdown)) {
        if (visibleAgentNames.has(agent.toLowerCase())) {
          filteredBd[agent] = count;
          brandCount += count;
        }
      }
      if (brandCount === 0) return null;
      return { ...acct, agentBreakdown: filteredBd, count: brandCount };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .sort((a, b) => b.count - a.count);

  // ── 9. Conversion rate — use agent calls sum as denominator ───
  const agentCallsSum = visibleAgents.reduce((s, a) => s + a.calls, 0);
  const convDenom = agentCallsSum > 0 ? agentCallsSum : answeredCalls;
  const conversionRate = convDenom > 0 && brandConvTotal > 0
    ? Math.round((brandConvTotal / convDenom) * 1000) / 10
    : null;

  return {
    ...period,
    conversions: {
      ...period.conversions,
      total: brandConvTotal,
      byAgent: brandConvByAgent,
      byAccount: brandConvByAccount,
    },
    repActivity: {
      agents: visibleAgents,
      outbound: filteredOutbound,
      avgSpeedSec,
    },
    missedCalls: brandMissed,
    teamStats: brandTeamStats,
    conversionRate,
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

    // Ytica speed = actual ring duration (whole seconds, authoritative for value).
    // CDR speed = ring time from call pairing (has decimal precision).
    // Strategy: use Ytica's value but add CDR's fractional precision.
    // If Ytica=6, CDR=6.3 → use 6.3. If Ytica=6, CDR=14.7 → use 6.0 (CDR inflated).
    let speedSec = agent.speedSec;
    if (y.speedSec != null && y.speedSec > 0) {
      if (agent.speedSec != null && agent.speedSec > 0) {
        // Both exist: use CDR if it's in the same ballpark as Ytica (within 5s)
        // This gives us Ytica's accuracy with CDR's decimal precision
        if (Math.abs(agent.speedSec - y.speedSec) <= 5) {
          speedSec = agent.speedSec; // CDR decimal preserved
        } else {
          // CDR is inflated (queue/IVR) — use Ytica but synthesize .0 decimal
          speedSec = y.speedSec;
        }
      } else {
        // No CDR speed — use Ytica
        speedSec = y.speedSec;
      }
    }

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

// ── Brand Derivation for MTD, YTD, Weekly ──────────────────────────
// Extends the today/yesterday pattern (deriveBrandView) to the historical
// aggregates. Every field that flows into /api/data must be brand-filtered
// at this boundary — not at the fetcher — so the raw 'dashboard-data'
// cache stays shared across all three brand views.
//
// Data sources for classification (highest-precedence first):
//   1. KPI sheet team tags (column C: "Jump" | "MSC" | "MSC/Jump")
//   2. Brand.ts agent sets (MSC_ONLY_AGENTS, JC_ONLY_AGENTS, BLENDED_AGENTS)
//   3. clients.ts getClientBrand() for account classification
// For blended agents, calls/conversions are split via today's CDR ratios
// (summary.agentRatios), with 50/50 as the fallback when no ratio exists.
// This is an approximation for historical data — noted in comments below.

/** Build agentLower → team lookup from KPI MTD summary */
function buildKpiTeamLookup(kpiMtd: KPIMtdSummary): Map<string, 'jc' | 'msc' | 'blended'> {
  const m = new Map<string, 'jc' | 'msc' | 'blended'>();
  for (const a of kpiMtd.byAgent) {
    m.set(a.agent.toLowerCase(), a.team);
  }
  return m;
}

/** Classify an agent for a brand view.
 *  - 'include': agent belongs entirely to the requested brand
 *  - 'split':   blended agent, split proportionally via CDR ratio
 *  - 'exclude': agent does not appear in the requested brand view
 */
function classifyAgentForBrand(
  agentLower: string,
  brand: 'jc' | 'msc',
  kpiTeams: Map<string, 'jc' | 'msc' | 'blended'>,
): 'include' | 'split' | 'exclude' {
  // KPI team tag is authoritative when present
  const kpiTeam = kpiTeams.get(agentLower);
  if (kpiTeam) {
    if (kpiTeam === 'blended') return 'split';
    if (kpiTeam === brand) return 'include';
    return 'exclude';
  }
  // Fallback: use brand.ts agent sets
  if (!isAgentForBrand(agentLower, brand)) return 'exclude';
  return BLENDED_AGENTS.has(agentLower) ? 'split' : 'include';
}

/** Split an integer count between brands using a CDR ratio (exact additivity).
 *  Returns the share for `brand`; jcCount + mscCount always equals total. */
function splitCount(
  total: number,
  brand: 'jc' | 'msc',
  ratio?: { jc: number; msc: number },
): number {
  if (!ratio) {
    // 50/50 fallback: JC gets ceil, MSC gets floor
    const jc = Math.ceil(total / 2);
    return brand === 'jc' ? jc : total - jc;
  }
  const jc = Math.round(total * ratio.jc);
  return brand === 'jc' ? jc : total - jc;
}

/** Split a decimal minute total between brands using a CDR ratio.
 *  Preserves 1 decimal place; jcMin + mscMin === total. */
function splitMinutes(
  total: number,
  brand: 'jc' | 'msc',
  ratio?: { jc: number; msc: number },
): number {
  if (!ratio) {
    const jc = +(total / 2).toFixed(1);
    return brand === 'jc' ? jc : +(total - jc).toFixed(1);
  }
  const jc = +(total * ratio.jc).toFixed(1);
  return brand === 'jc' ? jc : +(total - jc).toFixed(1);
}

/** Derive brand-filtered MTD data from raw (Mixed) MTD + KPI team tags.
 *
 *  For Mixed: returns raw unchanged.
 *  For JC/MSC: filters byAgent using KPI team tags; splits blended agents
 *  via today's CDR ratio (fallback 50/50). Recomputes total, projections,
 *  and scales byAccount + mtdDaily + hourly by the resulting brand ratio.
 *
 *  byAccount classification:
 *    - accounts with known JC/MSC brand (via clients.json) → direct include/exclude
 *    - unknown accounts → proportional scale by brand ratio
 */
export function deriveMtdForBrand(
  raw: MtdData,
  kpiMtd: KPIMtdSummary,
  summary: BrandCallSummary,
  brand: Brand,
): MtdData {
  if (brand === 'mixed') return raw;

  const kpiTeams = buildKpiTeamLookup(kpiMtd);
  const filteredAgents: AgentStat[] = [];

  for (const a of raw.byAgent) {
    const agentLower = a.agent.toLowerCase();
    const cls = classifyAgentForBrand(agentLower, brand, kpiTeams);
    if (cls === 'exclude') continue;
    if (cls === 'include') {
      filteredAgents.push(a);
      continue;
    }
    // 'split' — blended agent
    const brandCount = splitCount(a.count, brand, summary.agentRatios[agentLower]);
    if (brandCount > 0) {
      filteredAgents.push({ ...a, count: brandCount });
    }
  }

  filteredAgents.sort((a, b) => b.count - a.count);
  const total = filteredAgents.reduce((s, a) => s + a.count, 0);
  const brandRatio = raw.total > 0 ? total / raw.total : 0;

  // byAccount: use client brand classification; scale unknowns proportionally
  const filteredAccounts: AcctStat[] = [];
  for (const acct of (raw.byAccount || [])) {
    const clientBrand = getClientBrand(acct.account);
    if (clientBrand === brand) {
      filteredAccounts.push(acct);
    } else if (clientBrand === null) {
      // Unknown account — proportional scale
      const scaled = Math.round(acct.count * brandRatio);
      if (scaled > 0) filteredAccounts.push({ ...acct, count: scaled });
    }
    // Other brand → exclude
  }
  filteredAccounts.sort((a, b) => b.count - a.count);

  // mtdDaily: each day scaled proportionally (imperfect but best without
  // per-date brand tags from the KPI sheet)
  const mtdDaily = (raw.mtdDaily || []).map(d => ({
    date: d.date,
    total: Math.round(d.total * brandRatio),
  }));

  // hourly: same proportional scale
  const hourly = (raw.hourly || []).map(h => Math.round(h * brandRatio));

  // Recompute projections from filtered total
  const { dayOfMonth, daysInMonth, daysRemaining, goal, dailyGoal } = raw;
  const goalPace = dayOfMonth > 0 ? Math.round((total / dayOfMonth) * daysInMonth) : 0;
  const projectedEOM = goalPace;
  const deficit = MONTHLY_GOAL - total;
  const requiredDailyRate = daysRemaining > 0
    ? Math.round((deficit / daysRemaining) * 10) / 10
    : 0;

  return {
    total,
    byAgent: filteredAgents,
    goal,
    dailyGoal,
    dayOfMonth,
    daysInMonth,
    daysRemaining,
    goalPace,
    projectedEOM,
    deficit,
    requiredDailyRate,
    onTrack: projectedEOM >= MONTHLY_GOAL,
    byAccount: filteredAccounts,
    hourly,
    mtdDaily,
  };
}

/** Derive brand-filtered MTD rep activity (Ytica) from raw array + KPI tags.
 *
 *  Same classification logic as deriveMtdForBrand. Blended agents get their
 *  totalCalls and totalTalkMin split proportionally.
 */
export function deriveMtdRepActivityForBrand(
  raw: YticaMtdAgent[],
  kpiMtd: KPIMtdSummary,
  summary: BrandCallSummary,
  brand: Brand,
): YticaMtdAgent[] {
  if (brand === 'mixed') return raw;

  const kpiTeams = buildKpiTeamLookup(kpiMtd);
  const result: YticaMtdAgent[] = [];

  for (const a of raw) {
    const agentLower = a.agent.toLowerCase();
    const cls = classifyAgentForBrand(agentLower, brand, kpiTeams);
    if (cls === 'exclude') continue;
    if (cls === 'include') {
      result.push(a);
      continue;
    }
    // 'split' — blended agent
    const ratio = summary.agentRatios[agentLower];
    const brandCalls = splitCount(a.totalCalls, brand, ratio);
    const brandTalkMin = splitMinutes(a.totalTalkMin, brand, ratio);
    if (brandCalls > 0) {
      result.push({
        ...a,
        totalCalls: brandCalls,
        totalTalkMin: brandTalkMin,
      });
    }
  }

  return result;
}

/** Derive brand-filtered YTD data by scaling proportionally to MTD brand ratio.
 *
 *  NOTE: This is an approximation. True per-brand YTD would require
 *  backfilling historical CDR with brand tags — out of scope for the initial
 *  brand pipeline. The scaling is: brand_ytd = raw_ytd * (mtd_brand / mtd_raw).
 *
 *  For Mixed (brandRatio ≈ 1): returns raw unchanged.
 */
export function deriveYtdForBrand(raw: YtdData, brandRatio: number): YtdData {
  if (brandRatio >= 0.9999) return raw;

  const total = Math.round(raw.total * brandRatio);
  const byMonth = raw.byMonth.map(m => ({
    month: m.month,
    conversions: Math.round(m.conversions * brandRatio),
  }));
  const annualPace = Math.round(raw.annualPace * brandRatio);
  const projectedEOY = Math.round(raw.projectedEOY * brandRatio);

  return {
    ...raw,
    total,
    byMonth,
    annualPace,
    projectedEOY,
    onTrack: projectedEOY >= raw.goal,
  };
}

/** Derive brand-filtered weekly totals + 7d trend.
 *
 *  Like deriveYtdForBrand, this is a proportional scaling of Mixed numbers
 *  by the MTD brand ratio. conversionRate is preserved (ratios don't scale).
 *  For Mixed (brandRatio ≈ 1): returns the inputs unchanged.
 */
export function deriveWeeklyTotalsForBrand(
  thisWeek: number,
  lastWeek: number,
  trend7d: TrendData,
  brandRatio: number,
): { thisWeek: number; lastWeek: number; trend7d: TrendData } {
  if (brandRatio >= 0.9999) {
    return { thisWeek, lastWeek, trend7d };
  }

  return {
    thisWeek: Math.round(thisWeek * brandRatio),
    lastWeek: Math.round(lastWeek * brandRatio),
    trend7d: {
      dates: trend7d.dates,
      conversions: trend7d.conversions.map(c => Math.round(c * brandRatio)),
      missed: trend7d.missed.map(m => Math.round(m * brandRatio)),
      conversionRate: trend7d.conversionRate,
    },
  };
}
