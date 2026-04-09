// ── EA Sports Agent Rating System ────────────────────────────────────
// Pure functions — no API calls, no UI. Import from any page.

import type { AgentBaseline, AgentSubRatings } from './types';

// ── Weights (must sum to 1.0) ────────────────────────────────────────

export const RATING_WEIGHTS = {
  conversions: 0.18,
  convPct:     0.15,
  volume:      0.12,
  speed:       0.12,
  convPerHr:   0.12,
  pickupRate:  0.10,
  talkTime:    0.08,
  wrapUp:      0.07,
  declineRate: 0.06,
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

/** Pickup rate % (higher = better). Slightly compressed — 95%+ → 90+. */
function ratePickupRate(rate: number | null): number {
  if (rate === null) return 50; // neutral when missing
  // 50%→40, 70%→58, 80%→70, 90%→82, 95%→90, 100%→97
  if (rate >= 95) return clamp(Math.round(90 + (rate - 95) / 5 * 7), 90, 97);
  if (rate >= 80) return clamp(Math.round(70 + (rate - 80) / 15 * 20), 70, 90);
  if (rate >= 60) return clamp(Math.round(48 + (rate - 60) / 20 * 22), 48, 70);
  return clamp(Math.round(rate * 0.8), 0, 48);
}

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

/** Decline rate % (lower = better). */
function rateDeclineRate(rate: number | null): number {
  if (rate === null) return 65; // benefit of doubt, but not maxed
  if (rate <= 0) return 97;
  if (rate < 5) return clamp(Math.round(78 + (5 - rate) / 5 * 19), 78, 97);
  if (rate < 10) return clamp(Math.round(55 + (10 - rate) / 5 * 23), 55, 78);
  if (rate < 20) return clamp(Math.round(20 + (20 - rate) / 10 * 35), 20, 55);
  return 20;
}

// ── Composite OVR ────────────────────────────────────────────────────

export interface OvrInput {
  calls: number;
  conversions: number;
  speedSec: number | null;
  convsPerHour: number | null;
  pickupRate: number | null;
  talkMin: number;
  wrapUpSec: number | null;
  declineRate: number | null;
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
    pickupRate:  ratePickupRate(input.pickupRate),
    talkTime:    rateTalkTime(input.talkMin / effectiveHrs),
    wrapUp:      rateWrapUp(input.wrapUpSec),
    declineRate: rateDeclineRate(input.declineRate),
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
    subs.pickupRate  * w.pickupRate +
    subs.talkTime    * w.talkTime +
    subs.wrapUp      * w.wrapUp +
    subs.declineRate * w.declineRate;
  return Math.round(raw);
}

/** Compute OVR from raw metrics (convenience). */
export function computeOVRFromInput(input: OvrInput): { ovr: number; subRatings: AgentSubRatings } {
  const subRatings = computeSubRatings(input);
  return { ovr: computeOVR(subRatings), subRatings };
}

/** Compute baseline OVR from monthly totals (daily averages). */
export function computeBaselineOVR(b: AgentBaseline): number {
  const dailyCalls = b.totalCalls / Math.max(b.workingDays, 1);
  const dailyConvs = b.totalConversions / Math.max(b.workingDays, 1);
  const dailyTalkMin = b.talkMin / Math.max(b.workingDays, 1);
  const avgHoursPerDay = 8; // baseline assumption for monthly averages
  const convsPerHour = dailyConvs > 0 ? dailyConvs / avgHoursPerDay : null;

  const subs = computeSubRatings({
    calls: dailyCalls,
    conversions: dailyConvs,
    speedSec: b.avgSpeedSec,
    convsPerHour: convsPerHour,
    pickupRate: b.avgPickupRate,
    talkMin: dailyTalkMin,
    wrapUpSec: b.avgWrapUpSec,
    declineRate: b.avgDeclineRate,
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
  conversions: { label: 'Conversions', abbr: 'CNV', tooltip: 'Booked appointments today. Log curve — first few matter most.' },
  convPct:     { label: 'Conv %',      abbr: 'C%',  tooltip: 'Conversion rate (conversions / calls). Requires 5+ calls.' },
  volume:      { label: 'Volume',      abbr: 'VOL', tooltip: 'Calls per scheduled hour. Normalized by shift length.' },
  speed:       { label: 'Speed',       abbr: 'SPD', tooltip: 'Average pickup speed (seconds). Lower is better.' },
  convPerHr:   { label: 'Conv/Hr',     abbr: 'CPH', tooltip: 'Conversions per scheduled hour. Productivity metric.' },
  pickupRate:  { label: 'Pickup Rate', abbr: 'PKP', tooltip: 'Percentage of offered calls accepted. From TaskRouter.' },
  talkTime:    { label: 'Talk Time',   abbr: 'TLK', tooltip: 'Talk minutes per scheduled hour. Engagement quality.' },
  wrapUp:      { label: 'Wrap-Up',     abbr: 'WRP', tooltip: 'Average post-call wrap-up time (seconds). Lower is better.' },
  declineRate: { label: 'Decline Rate', abbr: 'DCL', tooltip: 'Percentage of offered calls declined. Lower is better.' },
};
