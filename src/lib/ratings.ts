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

/** Conversions (higher = better). Log curve rewards first few heavily. */
function rateConversions(convs: number): number {
  if (convs <= 0) return 0;
  return clamp(Math.round(20 + 35 * Math.log(convs + 1)), 0, 99);
}

/** Conv % (higher = better). Requires minCalls to avoid inflation. */
function rateConvPct(convs: number, calls: number, minCalls = 5): number {
  if (calls < minCalls) return 50; // neutral until enough data
  const rate = (convs / calls) * 100;
  return clamp(Math.round(20 + (rate / 20) * 79), 20, 99);
}

/** Call volume (higher = better). Linear with floor. */
function rateVolume(calls: number): number {
  if (calls <= 0) return 0;
  return clamp(Math.round(30 + (calls / 25) * 69), 30, 99);
}

/** Pickup speed in seconds (lower = better). Piecewise inverse. */
function rateSpeed(sec: number | null): number {
  if (sec === null || sec <= 0) return 50; // neutral when missing
  if (sec < 6)  return 99;
  if (sec < 10) return clamp(Math.round(85 + (10 - sec) / 4 * 14), 85, 99);
  if (sec < 15) return clamp(Math.round(70 + (15 - sec) / 5 * 15), 70, 85);
  if (sec < 25) return clamp(Math.round(50 + (25 - sec) / 10 * 20), 50, 70);
  if (sec < 40) return clamp(Math.round(20 + (40 - sec) / 15 * 30), 20, 50);
  return 20;
}

/** Conv/Hr (higher = better). */
function rateConvPerHr(cph: number | null): number {
  if (cph === null || cph <= 0) return 20;
  if (cph >= 3) return 95;
  if (cph >= 2) return clamp(Math.round(75 + (cph - 2) * 20), 75, 95);
  if (cph >= 1) return clamp(Math.round(55 + (cph - 1) * 20), 55, 75);
  return clamp(Math.round(20 + cph * 35), 20, 55);
}

/** Pickup rate % (higher = better). Direct scale. */
function ratePickupRate(rate: number | null): number {
  if (rate === null) return 50; // neutral when missing
  return clamp(Math.round((rate / 100) * 99), 0, 99);
}

/** Talk time in minutes (higher = better). */
function rateTalkTime(min: number): number {
  if (min <= 0) return 0;
  if (min >= 120) return 99;
  if (min >= 60) return clamp(Math.round(75 + (min - 60) / 60 * 24), 75, 99);
  if (min >= 30) return clamp(Math.round(50 + (min - 30) / 30 * 25), 50, 75);
  return clamp(Math.round((min / 30) * 50), 0, 50);
}

/** Wrap-up in seconds (lower = better). */
function rateWrapUp(sec: number | null): number {
  if (sec === null) return 50; // neutral when missing
  if (sec < 30) return 99;
  if (sec < 45) return clamp(Math.round(80 + (45 - sec) / 15 * 19), 80, 99);
  if (sec < 60) return clamp(Math.round(65 + (60 - sec) / 15 * 15), 65, 80);
  if (sec < 90) return clamp(Math.round(45 + (90 - sec) / 30 * 20), 45, 65);
  if (sec < 120) return clamp(Math.round(20 + (120 - sec) / 30 * 25), 20, 45);
  return 20;
}

/** Decline rate % (lower = better). */
function rateDeclineRate(rate: number | null): number {
  if (rate === null) return 70; // benefit of doubt
  if (rate <= 0) return 99;
  if (rate < 5) return clamp(Math.round(75 + (5 - rate) / 5 * 24), 75, 99);
  if (rate < 10) return clamp(Math.round(55 + (10 - rate) / 5 * 20), 55, 75);
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
}

/** Compute all 9 sub-ratings from raw metrics. */
export function computeSubRatings(input: OvrInput): AgentSubRatings {
  return {
    conversions: rateConversions(input.conversions),
    convPct:     rateConvPct(input.conversions, input.calls),
    volume:      rateVolume(input.calls),
    speed:       rateSpeed(input.speedSec),
    convPerHr:   rateConvPerHr(input.convsPerHour),
    pickupRate:  ratePickupRate(input.pickupRate),
    talkTime:    rateTalkTime(input.talkMin),
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
  const convRate = b.totalCalls > 0 ? (b.totalConversions / b.totalCalls) : 0;
  const dailyTalkMin = b.talkMin / Math.max(b.workingDays, 1);
  const convsPerHour = dailyConvs > 0 && dailyCalls > 0 ? dailyConvs / (dailyCalls * 3 / 60) : null; // rough: assume 3min avg call

  const subs = computeSubRatings({
    calls: dailyCalls,
    conversions: dailyConvs,
    speedSec: b.avgSpeedSec,
    convsPerHour: convsPerHour,
    pickupRate: b.avgPickupRate,
    talkMin: dailyTalkMin,
    wrapUpSec: b.avgWrapUpSec,
    declineRate: b.avgDeclineRate,
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

export const SUB_RATING_LABELS: Record<keyof AgentSubRatings, { label: string; abbr: string }> = {
  conversions: { label: 'Conversions', abbr: 'CNV' },
  convPct:     { label: 'Conv %',      abbr: 'C%' },
  volume:      { label: 'Volume',      abbr: 'VOL' },
  speed:       { label: 'Speed',       abbr: 'SPD' },
  convPerHr:   { label: 'Conv/Hr',     abbr: 'CPH' },
  pickupRate:  { label: 'Pickup Rate', abbr: 'PKP' },
  talkTime:    { label: 'Talk Time',   abbr: 'TLK' },
  wrapUp:      { label: 'Wrap-Up',     abbr: 'WRP' },
  declineRate: { label: 'Decline Rate', abbr: 'DCL' },
};
