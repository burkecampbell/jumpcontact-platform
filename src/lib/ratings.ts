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

/** Conv/Hr (higher = better). 99 = 4+/hr sustained. */
function rateConvPerHr(cph: number | null): number {
  if (cph === null || cph <= 0) return 15;
  if (cph >= 4) return 97;
  if (cph >= 3) return clamp(Math.round(85 + (cph - 3) * 12), 85, 97);
  if (cph >= 2) return clamp(Math.round(70 + (cph - 2) * 15), 70, 85);
  if (cph >= 1) return clamp(Math.round(50 + (cph - 1) * 20), 50, 70);
  return clamp(Math.round(15 + cph * 35), 15, 50);
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
  hoursScheduled: number;  // Required for per-hour normalization
}

/** Compute all 9 sub-ratings from raw metrics. Volume and talk time normalize by hours. */
export function computeSubRatings(input: OvrInput): AgentSubRatings {
  const hrs = Math.max(input.hoursScheduled, 1); // prevent division by zero
  return {
    conversions: rateConversions(input.conversions),
    convPct:     rateConvPct(input.conversions, input.calls),
    volume:      rateVolume(input.calls / hrs),          // calls per scheduled hour
    speed:       rateSpeed(input.speedSec),
    convPerHr:   rateConvPerHr(input.convsPerHour),
    pickupRate:  ratePickupRate(input.pickupRate),
    talkTime:    rateTalkTime(input.talkMin / hrs),       // talk minutes per scheduled hour
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
