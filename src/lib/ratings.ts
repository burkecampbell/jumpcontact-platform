// ── EA Sports Agent Rating System ────────────────────────────────────
// Pure functions — no API calls, no UI. Import from any page.

import type { AgentBaseline, AgentSubRatings } from './types';

// ── Weights (must sum to 1.0) ────────────────────────────────────────

// 7 attributes. Pickup Rate and Decline Rate removed entirely — TaskRouter
// reservation data measures how often an agent grabs a call that was ALSO offered
// to every other agent simultaneously. A 35% rate doesn't mean 65% missed — it
// means teammates answered first. The metric penalizes agents for having a team.
// Minutes = dollars. Talk time is the #1 revenue driver — more minutes on calls
// means more billable time. Conversions are the outcome, but minutes are the work.
export const RATING_WEIGHTS = {
  conversions: 0.20,
  talkTime:    0.18,   // ↑ minutes = dollars, most important after conversions
  convPct:     0.16,
  volume:      0.12,
  speed:       0.12,
  convPerHr:   0.12,
  wrapUp:      0.10,
} as const;

// ── Sub-rating curves (each returns 0-99) ────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * CURVE DESIGN PHILOSOPHY:
 * - 99 is truly elite — only one agent at a time should ever touch it
 * - 90+ is the "star player" zone — requires exceptional performance
 * - The curves are logarithmic/diminishing-return at the top: going from
 *   85 → 90 is much harder than going from 50 → 55
 * - Volume metrics are normalized by scheduled hours to prevent rewarding
 *   longer shifts over efficiency
 */

/** Conversions (higher = better). Diminishing returns — 99 requires 12+ per day. */
function rateConversions(convs: number): number {
  if (convs <= 0) return 0;
  // 1→30, 2→42, 3→50, 5→60, 8→72, 10→78, 12→83, 15→88, 20→93, 25+→97
  // 99 is unreachable by formula — reserved for truly exceptional days
  return clamp(Math.round(20 + 28 * Math.log(convs + 1)), 0, 97);
}

/** Conv % (higher = better). Requires minCalls to avoid inflation. 99 = 30%+. */
function rateConvPct(convs: number, calls: number, minCalls = 5): number {
  if (calls < minCalls) return 50; // neutral until enough data
  const rate = (convs / calls) * 100;
  // 5%→35, 10%→55, 15%→70, 20%→82, 25%→90, 30%→97
  return clamp(Math.round(15 + (rate / 30) * 82), 15, 97);
}

/** Volume — calls per scheduled hour (normalizes for shift length). */
function rateVolume(callsPerHour: number): number {
  if (callsPerHour <= 0) return 0;
  // 1/hr→25, 2/hr→40, 3/hr→52, 4/hr→62, 5/hr→72, 6/hr→80, 7/hr→87, 8+/hr→93
  return clamp(Math.round(10 + 30 * Math.log(callsPerHour + 0.5)), 0, 95);
}

/** Pickup speed in seconds (lower = better). 99 = sub-5s (nearly instant). */
function rateSpeed(sec: number | null): number {
  if (sec === null || sec <= 0) return 50; // neutral when missing
  if (sec < 5)  return 97;
  if (sec < 7)  return clamp(Math.round(88 + (7 - sec) / 2 * 9), 88, 97);
  if (sec < 10) return clamp(Math.round(76 + (10 - sec) / 3 * 12), 76, 88);
  if (sec < 15) return clamp(Math.round(62 + (15 - sec) / 5 * 14), 62, 76);
  if (sec < 25) return clamp(Math.round(40 + (25 - sec) / 10 * 22), 40, 62);
  if (sec < 40) return clamp(Math.round(20 + (40 - sec) / 15 * 20), 20, 40);
  return 15;
}

/** Conv/Hr (higher = better). Calibrated to team avg ~0.77/hr.
 *  0.5→35, 0.77→50 (avg), 1.2→70, 2.0→85, 3.0+→95. */
function rateConvPerHr(cph: number | null): number {
  if (cph === null || cph <= 0) return 15;
  if (cph >= 3.0) return 95;
  if (cph >= 2.0) return clamp(Math.round(85 + (cph - 2.0) * 10), 85, 95);
  if (cph >= 1.2) return clamp(Math.round(70 + (cph - 1.2) / 0.8 * 15), 70, 85);
  if (cph >= 0.77) return clamp(Math.round(50 + (cph - 0.77) / 0.43 * 20), 50, 70);
  if (cph >= 0.3) return clamp(Math.round(25 + (cph - 0.3) / 0.47 * 25), 25, 50);
  return clamp(Math.round(15 + cph / 0.3 * 10), 15, 25);
}

// Pickup Rate and Decline Rate curves removed — TaskRouter reservation data
// penalizes agents for having teammates. See RATING_WEIGHTS comment.

/** Talk time per scheduled hour (normalizes for shift length). */
function rateTalkTime(talkMinPerHour: number): number {
  if (talkMinPerHour <= 0) return 0;
  // 5 min/hr→25, 10→45, 15→60, 20→72, 25→82, 30→88, 35+→93
  return clamp(Math.round(5 + 32 * Math.log(talkMinPerHour + 0.5)), 0, 95);
}

/** Wrap-up in seconds (lower = better). 99 = sub-25s. */
function rateWrapUp(sec: number | null): number {
  if (sec === null) return 50; // neutral when missing
  if (sec < 25) return 97;
  if (sec < 35) return clamp(Math.round(85 + (35 - sec) / 10 * 12), 85, 97);
  if (sec < 50) return clamp(Math.round(68 + (50 - sec) / 15 * 17), 68, 85);
  if (sec < 70) return clamp(Math.round(50 + (70 - sec) / 20 * 18), 50, 68);
  if (sec < 100) return clamp(Math.round(30 + (100 - sec) / 30 * 20), 30, 50);
  if (sec < 140) return clamp(Math.round(15 + (140 - sec) / 40 * 15), 15, 30);
  return 10;
}

// rateDeclineRate removed — see above.

// ── Composite OVR ────────────────────────────────────────────────────

export interface OvrInput {
  calls: number;
  conversions: number;
  speedSec: number | null;
  talkMin: number;
  wrapUpSec: number | null;
  hoursScheduled: number;
  opportunityWeight?: number;  // 0-1: fraction of daily call volume during this agent's shift
}

// ── Call Opportunity ──────────────────────────────────────────────────

/**
 * Compute an agent's call opportunity weight based on when they work.
 *
 * If 60% of daily calls land 8am-2pm and Chris works 3pm-12am (15% of calls),
 * his opportunity weight is 0.15. Burke working 7am-6pm (80% of calls) gets 0.80.
 * This means Chris's 15 calls = Burke's 40 calls in terms of "capturing your window."
 *
 * @param hourlyCallDist - 24-element array of call counts per hour (index 0 = midnight)
 * @param shiftStart - Hour the agent's shift starts (e.g. 7 for 7am, 15 for 3pm)
 * @param shiftEnd - Hour the shift ends (e.g. 17 for 5pm, 24 for midnight)
 * @returns Weight between 0 and 1
 */
export function computeOpportunityWeight(
  hourlyCallDist: number[],
  shiftStart: number,
  shiftEnd: number,
): number {
  if (!hourlyCallDist || hourlyCallDist.length < 24) return 1; // no data → neutral
  const total = hourlyCallDist.reduce((s, v) => s + v, 0);
  if (total <= 0) return 1;

  let shiftCalls = 0;
  // Handle overnight shifts (e.g. 3pm-12am = 15-24, or 10pm-6am = 22-30)
  const end = shiftEnd <= shiftStart ? shiftEnd + 24 : shiftEnd;
  for (let h = shiftStart; h < end; h++) {
    shiftCalls += hourlyCallDist[h % 24] || 0;
  }
  return Math.max(shiftCalls / total, 0.05); // floor at 5% to prevent division explosion
}

/**
 * Parse a shift range string into start/end hours.
 * "8a-5p" → { start: 8, end: 17 }
 * "3p-12a" → { start: 15, end: 24 }
 * For split shifts like "7a-4p /6-9p", uses the full span (7-21).
 */
export function parseShiftHours(shiftStr: string): { start: number; end: number } | null {
  if (!shiftStr || /off|n\/a|^-$/i.test(shiftStr.trim())) return null;
  const segments = shiftStr.split(/[,\/]/).map(s => s.trim());
  let earliest = 24, latest = 0;
  for (const seg of segments) {
    const m = seg.match(/(\d{1,2})\s*(a|p)m?\s*[-–]\s*(\d{1,2})\s*(a|p)m?/i);
    if (!m) continue;
    let start = parseInt(m[1]);
    if (m[2].toLowerCase() === 'p' && start !== 12) start += 12;
    if (m[2].toLowerCase() === 'a' && start === 12) start = 0;
    let end = parseInt(m[3]);
    if (m[4].toLowerCase() === 'p' && end !== 12) end += 12;
    if (m[4].toLowerCase() === 'a' && end === 12) end = 0;
    if (end === 0) end = 24;
    if (start < earliest) earliest = start;
    if (end > latest) latest = end;
  }
  return earliest < latest ? { start: earliest, end: latest } : null;
}

// ── Sub-rating computation ───────────────────────────────────────────

/**
 * Volume and talk time normalize by OPPORTUNITY-ADJUSTED hours.
 * An agent working off-peak gets credit for handling what's available.
 * An agent working peak hours is held to a higher standard.
 *
 * effectiveHours = hoursScheduled × opportunityWeight
 * → Peak agent (weight 0.8): 8hrs × 0.8 = 6.4 effective hours
 * → Off-peak agent (weight 0.2): 8hrs × 0.2 = 1.6 effective hours
 * Chris's 15 calls / 1.6 = 9.4 calls/effective-hr
 * Burke's 40 calls / 6.4 = 6.25 calls/effective-hr
 * Chris is actually outperforming Burke relative to opportunity.
 */
export function computeSubRatings(input: OvrInput): AgentSubRatings {
  const w = input.opportunityWeight ?? 1;
  const effectiveHrs = Math.max(input.hoursScheduled * w, 0.5);
  return {
    conversions: rateConversions(input.conversions),
    convPct:     rateConvPct(input.conversions, input.calls),
    volume:      rateVolume(input.calls / effectiveHrs),
    speed:       rateSpeed(input.speedSec),
    convPerHr:   rateConvPerHr(input.conversions / effectiveHrs),
    talkTime:    rateTalkTime(input.talkMin / effectiveHrs),
    wrapUp:      rateWrapUp(input.wrapUpSec),
  };
}

/** Compute OVR (0-99) from sub-ratings using weights. */
export function computeOVR(subs: AgentSubRatings): number {
  const w = RATING_WEIGHTS;
  const raw =
    subs.conversions * w.conversions +
    subs.convPct     * w.convPct +
    subs.volume      * w.volume +
    subs.speed       * w.speed +
    subs.convPerHr   * w.convPerHr +
    subs.talkTime    * w.talkTime +
    subs.wrapUp      * w.wrapUp;
  return Math.round(raw);
}

/**
 * Bayesian confidence prior — how many calls of "evidence" the team average
 * is worth. With fewer calls than this, you're pulled toward the team average.
 * With more, your actual performance dominates.
 *
 * At 10 calls: 50% you, 50% team average
 * At 20 calls: 67% you, 33% team average
 * At 40 calls: 80% you, 20% team average
 */
const CONFIDENCE_PRIOR = 10;

/** Default team average OVR when no agents have enough data. */
const DEFAULT_TEAM_AVG = 65;

/**
 * Compute OVR with Bayesian confidence adjustment.
 *
 * Chris with 3 calls: rawOVR weighted 23%, team avg weighted 77% → fair rating
 * Burke with 36 calls: rawOVR weighted 78%, team avg weighted 22% → earned rating
 *
 * @param teamAvgOvr - Current team average OVR (computed from agents with 10+ calls)
 */
// Boss override — gets 100 OVR + 100 across the board. Excluded from
// leaderboard rankings via isLeaderboardAgent() so he doesn't take #1 spots.
const OVR_OVERRIDES: Record<string, number> = { jose: 100 };

export function isLeaderboardAgent(agentName: string): boolean {
  return !OVR_OVERRIDES[agentName.toLowerCase()];
}

export function computeOVRFromInput(
  input: OvrInput,
  teamAvgOvr?: number,
  agentName?: string,
): { ovr: number; rawOvr: number; confidence: number; subRatings: AgentSubRatings } {
  // Override agents get fixed perfect scores
  const override = agentName ? OVR_OVERRIDES[agentName.toLowerCase()] : undefined;
  if (override != null) {
    const v = override;
    return {
      ovr: v, rawOvr: v, confidence: 1,
      subRatings: { conversions: v, convPct: v, volume: v, speed: v, convPerHr: v, talkTime: v, wrapUp: v },
    };
  }

  const subRatings = computeSubRatings(input);
  const rawOvr = computeOVR(subRatings);
  const prior = teamAvgOvr ?? DEFAULT_TEAM_AVG;
  const n = input.calls;

  // Bayesian: blend raw OVR with team prior, weighted by sample size
  const confidence = n / (n + CONFIDENCE_PRIOR);
  const ovr = Math.round(prior * (1 - confidence) + rawOvr * confidence);

  return { ovr, rawOvr, confidence, subRatings };
}

/** Compute baseline OVR from monthly totals (daily averages). */
export function computeBaselineOVR(b: AgentBaseline): number {
  const dailyCalls = b.totalCalls / Math.max(b.workingDays, 1);
  const dailyConvs = b.totalConversions / Math.max(b.workingDays, 1);
  const dailyTalkMin = b.talkMin / Math.max(b.workingDays, 1);
  const avgHoursPerDay = 8;

  const subs = computeSubRatings({
    calls: dailyCalls,
    conversions: dailyConvs,
    speedSec: b.avgSpeedSec,
    talkMin: dailyTalkMin,
    wrapUpSec: b.avgWrapUpSec,
    hoursScheduled: avgHoursPerDay,
  });
  return computeOVR(subs);
}

// ── Tiers ────────────────────────────────────────────────────────────

export interface RatingTier {
  label: string;
  color: string;
  bg: string;
}

export function ratingTier(ovr: number): RatingTier {
  if (ovr >= 90) return { label: 'ELITE', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' };
  if (ovr >= 80) return { label: 'GREAT', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' };
  if (ovr >= 70) return { label: 'GOOD',  color: '#22d3ee', bg: 'rgba(34,211,238,0.12)' };
  if (ovr >= 60) return { label: 'AVG',   color: '#facc15', bg: 'rgba(250,204,21,0.12)' };
  return             { label: 'DEV',   color: '#f87171', bg: 'rgba(248,113,113,0.12)' };
}

/** Trend arrow: current vs baseline. */
export function ratingDelta(current: number, baseline: number): { direction: 'up' | 'down' | 'same'; diff: number } {
  const diff = current - baseline;
  if (diff > 2) return { direction: 'up', diff };
  if (diff < -2) return { direction: 'down', diff: Math.abs(diff) };
  return { direction: 'same', diff: 0 };
}

// ── Sub-rating labels for display ────────────────────────────────────

export const SUB_RATING_LABELS: Record<keyof AgentSubRatings, { label: string; abbr: string; tooltip: string }> = {
  conversions: { label: 'Conversions', abbr: 'CNV', tooltip: 'Booked appointments. Log curve — first few matter most.' },
  convPct:     { label: 'Conv %',      abbr: 'C%',  tooltip: 'Conversion rate (conversions / calls). Requires 5+ calls.' },
  volume:      { label: 'Volume',      abbr: 'VOL', tooltip: 'Calls per opportunity-adjusted hour. Normalized by shift and call density.' },
  speed:       { label: 'Speed',       abbr: 'SPD', tooltip: 'Average pickup speed (seconds). Lower is better.' },
  convPerHr:   { label: 'Conv/Hr',     abbr: 'CPH', tooltip: 'Conversions per opportunity-adjusted hour. Productivity metric.' },
  talkTime:    { label: 'Talk Time',   abbr: 'TLK', tooltip: 'Talk minutes per opportunity-adjusted hour. Engagement quality.' },
  wrapUp:      { label: 'Wrap-Up',     abbr: 'WRP', tooltip: 'Average post-call wrap-up time (seconds). Lower is better.' },
};
