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
 * CURVE DESIGN PHILOSOPHY (v1.3 — Competent Employee Model):
 *
 * Rule 1: If you work here, you're competent. Baseline = 70+.
 * Rule 2: Cap at 90. Nobody goes past 90 via the formula. (100 = CEO override only.)
 * Rule 3: The best of us live in the 80s. Ian/Burke/Omar on good days = 85-88.
 * Rule 4: Anyone in the 50s-60s "shouldn't even work here" — if they're employed,
 *         the curve should not drag them there. 65 = bad day, 60 = very rough.
 * Rule 5: Curves are compressed in the 70-88 "competent to great" band so daily
 *         performance nudges feel real but never crash the rating.
 *
 * Bands:
 *   90     — Ceiling, rarely reached (elite day across multiple attributes)
 *   85-89  — Star performer having a great day
 *   80-84  — Solid regular performer
 *   75-79  — Average day for the agent (most common landing)
 *   70-74  — Below-average day, needs a talk
 *   65-69  — Bad day (not a bad employee)
 *   <65    — Genuinely concerning (rare, should trigger coaching)
 */

const BASELINE_FLOOR = 68;  // Everyone who shows up starts here at minimum
const CEILING = 90;         // Maximum reachable by formula

/** Conversions (higher = better). Competent floor + compressed top. */
function rateConversions(convs: number): number {
  if (convs <= 0) return BASELINE_FLOOR;
  // 1→73, 2→77, 3→80, 5→83, 8→86, 12→88, 20+→90
  return clamp(Math.round(BASELINE_FLOOR + 12 * Math.log(convs + 1)), BASELINE_FLOOR, CEILING);
}

/** Conv % (higher = better). Requires minCalls. */
function rateConvPct(convs: number, calls: number, minCalls = 5): number {
  if (calls < minCalls) return 75; // neutral — we don't know yet
  const rate = (convs / calls) * 100;
  // 0%→68, 5%→73, 10%→78, 15%→82, 20%→86, 25%→88, 30%+→90
  return clamp(Math.round(BASELINE_FLOOR + (rate / 30) * 22), BASELINE_FLOOR, CEILING);
}

/** Volume — calls per opportunity-adjusted hour. */
function rateVolume(callsPerHour: number): number {
  if (callsPerHour <= 0) return BASELINE_FLOOR;
  // 0.5/hr→71, 1→74, 2→78, 3→81, 4→84, 5→86, 6+→88, 8+→90
  return clamp(Math.round(BASELINE_FLOOR + 11 * Math.log(callsPerHour + 0.7)), BASELINE_FLOOR, CEILING);
}

/** Pickup speed in seconds (lower = better). */
function rateSpeed(sec: number | null): number {
  if (sec === null || sec <= 0) return 78; // neutral — slightly above floor when unknown
  if (sec < 5)  return CEILING;
  if (sec < 8)  return clamp(Math.round(85 + (8 - sec) / 3 * 5), 85, CEILING);
  if (sec < 12) return clamp(Math.round(80 + (12 - sec) / 4 * 5), 80, 85);
  if (sec < 18) return clamp(Math.round(75 + (18 - sec) / 6 * 5), 75, 80);
  if (sec < 30) return clamp(Math.round(70 + (30 - sec) / 12 * 5), 70, 75);
  if (sec < 50) return clamp(Math.round(BASELINE_FLOOR + (50 - sec) / 20 * 2), BASELINE_FLOOR, 70);
  return 66; // very slow but still competent — coaching, not firing
}

/** Conv/Hr (higher = better). Team avg ~0.77/hr. */
function rateConvPerHr(cph: number | null): number {
  if (cph === null || cph <= 0) return BASELINE_FLOOR;
  if (cph >= 3.0) return CEILING;
  if (cph >= 2.0) return clamp(Math.round(86 + (cph - 2.0) * 4), 86, CEILING);
  if (cph >= 1.2) return clamp(Math.round(82 + (cph - 1.2) / 0.8 * 4), 82, 86);
  if (cph >= 0.77) return clamp(Math.round(78 + (cph - 0.77) / 0.43 * 4), 78, 82);
  if (cph >= 0.4) return clamp(Math.round(73 + (cph - 0.4) / 0.37 * 5), 73, 78);
  return clamp(Math.round(BASELINE_FLOOR + cph / 0.4 * 5), BASELINE_FLOOR, 73);
}

// Pickup Rate and Decline Rate curves removed — TaskRouter reservation data
// penalizes agents for having teammates. See RATING_WEIGHTS comment.

/** Talk time per opportunity-adjusted hour. */
function rateTalkTime(talkMinPerHour: number): number {
  if (talkMinPerHour <= 0) return BASELINE_FLOOR;
  // 5→72, 10→76, 15→79, 20→82, 25→85, 30→87, 35+→89
  return clamp(Math.round(BASELINE_FLOOR + 6 * Math.log(talkMinPerHour + 1)), BASELINE_FLOOR, CEILING);
}

/** Wrap-up in seconds (lower = better). */
function rateWrapUp(sec: number | null): number {
  if (sec === null) return 78; // neutral when unknown
  if (sec < 25) return CEILING;
  if (sec < 35) return clamp(Math.round(85 + (35 - sec) / 10 * 5), 85, CEILING);
  if (sec < 50) return clamp(Math.round(80 + (50 - sec) / 15 * 5), 80, 85);
  if (sec < 70) return clamp(Math.round(75 + (70 - sec) / 20 * 5), 75, 80);
  if (sec < 100) return clamp(Math.round(70 + (100 - sec) / 30 * 5), 70, 75);
  if (sec < 140) return clamp(Math.round(BASELINE_FLOOR + (140 - sec) / 40 * 2), BASELINE_FLOOR, 70);
  return 66;
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
const OVR_CEILING = 90; // Formula cap — only Jose override can go higher
const OVR_FLOOR = 60;   // Formula floor — if you work here, you're at least this good

/** Default team average OVR when no agents have enough data. */
const DEFAULT_TEAM_AVG = 78;

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
  const rawOvr = Math.max(OVR_FLOOR, Math.min(OVR_CEILING, computeOVR(subRatings)));
  const prior = teamAvgOvr ?? DEFAULT_TEAM_AVG;
  const n = input.calls;

  // Bayesian: blend raw OVR with team prior, weighted by sample size
  const confidence = n / (n + CONFIDENCE_PRIOR);
  const blended = prior * (1 - confidence) + rawOvr * confidence;
  // Final clamp: formula can never go above ceiling or below floor.
  const ovr = Math.max(OVR_FLOOR, Math.min(OVR_CEILING, Math.round(blended)));

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
  // v1.3 bands — competent-employee model. 100 = CEO override only.
  if (ovr >= 100) return { label: 'CEO',   color: '#fbbf24', bg: 'rgba(251,191,36,0.20)' };
  if (ovr >= 88)  return { label: 'ELITE', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' };
  if (ovr >= 83)  return { label: 'GREAT', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' };
  if (ovr >= 78)  return { label: 'GOOD',  color: '#22d3ee', bg: 'rgba(34,211,238,0.12)' };
  if (ovr >= 73)  return { label: 'SOLID', color: '#86efac', bg: 'rgba(134,239,172,0.12)' };
  if (ovr >= 68)  return { label: 'OK',    color: '#facc15', bg: 'rgba(250,204,21,0.12)' };
  return            { label: 'ROUGH', color: '#f87171', bg: 'rgba(248,113,113,0.12)' };
}

/** Trend arrow: current vs baseline. */
export function ratingDelta(current: number, baseline: number): { direction: 'up' | 'down' | 'same'; diff: number } {
  const diff = current - baseline;
  if (diff > 2) return { direction: 'up', diff };
  if (diff < -2) return { direction: 'down', diff: Math.abs(diff) };
  return { direction: 'same', diff: 0 };
}

/**
 * Hot/cold streak indicator — how today is trending vs the MTD baseline.
 * "On fire" = today's raw OVR is significantly above baseline
 * "Cold"    = significantly below
 */
export type StreakState = 'on-fire' | 'hot' | 'neutral' | 'cold' | 'freezing';
export function streakState(todayRaw: number, baseline: number): { state: StreakState; delta: number; label: string } {
  const delta = todayRaw - baseline;
  if (delta >= 8)  return { state: 'on-fire',  delta, label: '🔥 On fire' };
  if (delta >= 4)  return { state: 'hot',      delta, label: '↗ Hot' };
  if (delta <= -8) return { state: 'freezing', delta, label: '🥶 Cold streak' };
  if (delta <= -4) return { state: 'cold',     delta, label: '↘ Cooling' };
  return { state: 'neutral', delta, label: '' };
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
