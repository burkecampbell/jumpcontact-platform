/**
 * Brand pipeline integration test.
 *
 * Exercises deriveMtdForBrand + deriveMtdRepActivityForBrand +
 * deriveYtdForBrand + deriveWeeklyTotalsForBrand end-to-end on realistic
 * data shaped like what /api/data actually returns.
 *
 * Ship 4 rewrite: asserts the WHOLE-COUNT rule per CLAUDE.md gotcha #5.
 * Blended agents (Sara, Wendy, Jose) appear in both JC and MSC views
 * with their FULL counts. JC + MSC totals overshoot Mixed by the
 * blended agent total. This replaces the earlier (incorrect) additivity
 * invariant that was causing Wendy's new conversions to vanish from
 * JC view as CDR ratios shifted throughout the day.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveMtdForBrand,
  deriveMtdRepActivityForBrand,
  deriveYtdForBrand,
  deriveWeeklyTotalsForBrand,
} from '../lib/blender';
import type {
  MtdData,
  YtdData,
  TrendData,
  YticaMtdAgent,
  BrandCallSummary,
  AgentStat,
} from '../lib/types';
import type { KPIMtdSummary, KPIMtdAgent } from '../lib/kpi-sheet';
import { MONTHLY_GOAL, DAILY_GOAL } from '../lib/constants';

// ── Realistic fixtures ──────────────────────────────────────────────

function buildKpiMtdAgents(): KPIMtdAgent[] {
  return [
    { agent: 'omar',    team: 'jc',      conversions: 70, calls: 210, ringTimeSec: 6.2, pickupPct: 92, avgWrapSec: 32, totalTalkMin: 620 },
    { agent: 'burke',   team: 'jc',      conversions: 55, calls: 180, ringTimeSec: 8.1, pickupPct: 89, avgWrapSec: 35, totalTalkMin: 540 },
    { agent: 'danny',   team: 'jc',      conversions: 48, calls: 160, ringTimeSec: 7.5, pickupPct: 90, avgWrapSec: 30, totalTalkMin: 480 },
    { agent: 'ian',     team: 'jc',      conversions: 30, calls: 120, ringTimeSec: 9.0, pickupPct: 85, avgWrapSec: 40, totalTalkMin: 360 },
    { agent: 'desi',    team: 'msc',     conversions: 42, calls: 155, ringTimeSec: 7.8, pickupPct: 91, avgWrapSec: 28, totalTalkMin: 465 },
    { agent: 'natalie', team: 'msc',     conversions: 35, calls: 140, ringTimeSec: 8.5, pickupPct: 88, avgWrapSec: 33, totalTalkMin: 420 },
    { agent: 'francis', team: 'msc',     conversions: 28, calls: 110, ringTimeSec: 9.2, pickupPct: 86, avgWrapSec: 38, totalTalkMin: 330 },
    { agent: 'sara',    team: 'blended', conversions: 20, calls: 95,  ringTimeSec: 7.6, pickupPct: 90, avgWrapSec: 31, totalTalkMin: 285 },
    { agent: 'wendy',   team: 'blended', conversions: 14, calls: 85,  ringTimeSec: 8.3, pickupPct: 89, avgWrapSec: 34, totalTalkMin: 255 },
  ];
}

const KPI_MTD_TOTAL = 70 + 55 + 48 + 30 + 42 + 35 + 28 + 20 + 14; // 342
const BLENDED_TOTAL = 20 + 14; // Sara 20 + Wendy 14 = 34
const JC_ONLY_TOTAL = 70 + 55 + 48 + 30; // omar + burke + danny + ian = 203
const MSC_ONLY_TOTAL = 42 + 35 + 28; // desi + natalie + francis = 105

function makeKPIMtd(): KPIMtdSummary {
  return {
    totalConversions: KPI_MTD_TOTAL,
    totalCalls: 1255,
    byAgent: buildKpiMtdAgents(),
    byDate: [],
  };
}

function makeRawMtd(): MtdData {
  // Each agent gets a 10-day flat daily breakdown so mtdDaily can be
  // recomputed from per-agent daily maps.
  const mkDaily = (total: number): Record<string, number> => {
    const perDay = Math.floor(total / 10);
    const remainder = total - perDay * 10;
    const out: Record<string, number> = {};
    for (let i = 0; i < 10; i++) {
      const date = `2026-04-${String(i + 1).padStart(2, '0')}`;
      out[date] = i === 9 ? perDay + remainder : perDay;
    }
    return out;
  };

  const byAgent: AgentStat[] = buildKpiMtdAgents().map(a => ({
    agent: a.agent,
    count: a.conversions,
    daily: mkDaily(a.conversions),
  }));

  return {
    total: KPI_MTD_TOTAL,
    byAgent,
    goal: MONTHLY_GOAL,
    dailyGoal: DAILY_GOAL,
    dayOfMonth: 10,
    daysInMonth: 30,
    daysRemaining: 20,
    goalPace: 1026,
    projectedEOM: 1026,
    deficit: MONTHLY_GOAL - KPI_MTD_TOTAL,
    requiredDailyRate: 27.9,
    onTrack: true,
    byAccount: [
      { account: 'Sapochnick Law', count: 65 },
      { account: 'Bueno Law Office', count: 50 },
      { account: '6 Day Medical Weight Loss', count: 42 },
      { account: 'Bella Med Spa ATL', count: 38 },
      { account: 'Greg Kennedy & Associates', count: 30 },
      { account: 'Mario Varela Law', count: 28 },
      { account: 'Vital Balance 10', count: 25 },
      { account: 'Med Spa Communications', count: 22 },
      { account: 'Gambhir', count: 22 },
      { account: 'Other', count: 20 },
    ],
    hourly: new Array(24).fill(0),
    // Raw mtdDaily is the sum of all agents' daily values
    mtdDaily: Array.from({ length: 10 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      total: Math.round(KPI_MTD_TOTAL / 10),
    })),
  };
}

function makeRawMtdRA(): YticaMtdAgent[] {
  return buildKpiMtdAgents().map(a => ({
    agent: a.agent,
    totalCalls: a.calls,
    totalTalkMin: a.totalTalkMin,
    avgSpeedSec: a.ringTimeSec,
    avgWrapUpSec: a.avgWrapSec,
  }));
}

function makeRawYtd(): YtdData {
  return {
    total: 2671,
    byMonth: [
      { month: '2026-01', conversions: 820 },
      { month: '2026-02', conversions: 760 },
      { month: '2026-03', conversions: 749 },
      { month: '2026-04', conversions: 342 },
    ],
    goal: 12000,
    annualPace: 8500,
    projectedEOY: 8500,
    onTrack: false,
  };
}

function makeRawTrend7d(): TrendData {
  return {
    dates: Array.from({ length: 7 }, (_, i) => `2026-04-${String(i + 3).padStart(2, '0')}`),
    conversions: [38, 34, 36, 32, 35, 30, 34],
    missed: [3, 2, 4, 2, 3, 3, 2],
    conversionRate: [16, 15, 17, 14, 16, 13, 15],
  };
}

function makeSummary(): BrandCallSummary {
  return {
    jc: { answered: 0, missed: 0, talkSec: 0, ringSum: 0, ringCount: 0 },
    msc: { answered: 0, missed: 0, talkSec: 0, ringSum: 0, ringCount: 0 },
    unknown: { answered: 0, missed: 0, talkSec: 0, ringSum: 0, ringCount: 0 },
    agentRatios: {},  // Ship 4: no longer used
    missedByBrand: {
      jc: { total: 0, byAccount: [] },
      msc: { total: 0, byAccount: [] },
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('brand pipeline integration — MTD', () => {
  it('MTD totals differ across JC / MSC / Mixed', () => {
    const raw = makeRawMtd();
    const kpiMtd = makeKPIMtd();
    const summary = makeSummary();

    const jc = deriveMtdForBrand(raw, kpiMtd, summary, 'jc');
    const msc = deriveMtdForBrand(raw, kpiMtd, summary, 'msc');
    const mixed = deriveMtdForBrand(raw, kpiMtd, summary, 'mixed');

    expect(jc.total).not.toBe(msc.total);
    expect(jc.total).not.toBe(mixed.total);
    expect(msc.total).not.toBe(mixed.total);
  });

  it('MTD whole-count invariant: JC + MSC - Mixed = blended total', () => {
    const raw = makeRawMtd();
    const kpiMtd = makeKPIMtd();
    const summary = makeSummary();

    const jc = deriveMtdForBrand(raw, kpiMtd, summary, 'jc');
    const msc = deriveMtdForBrand(raw, kpiMtd, summary, 'msc');
    const mixed = deriveMtdForBrand(raw, kpiMtd, summary, 'mixed');

    // JC total = JC_ONLY_TOTAL (203) + BLENDED_TOTAL (34) = 237
    // MSC total = MSC_ONLY_TOTAL (105) + BLENDED_TOTAL (34) = 139
    // Mixed total = KPI_MTD_TOTAL (342)
    // JC + MSC - Mixed = 237 + 139 - 342 = 34 = BLENDED_TOTAL ✓
    expect(jc.total).toBe(JC_ONLY_TOTAL + BLENDED_TOTAL);
    expect(msc.total).toBe(MSC_ONLY_TOTAL + BLENDED_TOTAL);
    expect(mixed.total).toBe(KPI_MTD_TOTAL);
    expect(jc.total + msc.total - mixed.total).toBe(BLENDED_TOTAL);
  });

  it('JC.byAgent includes JC-only + blended agents with FULL counts', () => {
    const raw = makeRawMtd();
    const jc = deriveMtdForBrand(raw, makeKPIMtd(), makeSummary(), 'jc');

    const jcAgents = jc.byAgent.map(a => a.agent.toLowerCase());

    // JC-only agents present
    expect(jcAgents).toContain('omar');
    expect(jcAgents).toContain('ian');
    // Blended agents present
    expect(jcAgents).toContain('sara');
    expect(jcAgents).toContain('wendy');
    // MSC-only agents absent
    expect(jcAgents).not.toContain('desi');
    expect(jcAgents).not.toContain('francis');

    // Blended agents keep their FULL count in JC
    expect(jc.byAgent.find(a => a.agent === 'sara')!.count).toBe(20);
    expect(jc.byAgent.find(a => a.agent === 'wendy')!.count).toBe(14);
  });

  it('MSC.byAgent includes MSC-only + blended agents with FULL counts', () => {
    const msc = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'msc');

    const mscAgents = msc.byAgent.map(a => a.agent.toLowerCase());

    expect(mscAgents).toContain('desi');
    expect(mscAgents).toContain('francis');
    expect(mscAgents).toContain('sara');
    expect(mscAgents).toContain('wendy');
    expect(mscAgents).not.toContain('omar');
    expect(mscAgents).not.toContain('ian');

    expect(msc.byAgent.find(a => a.agent === 'sara')!.count).toBe(20);
    expect(msc.byAgent.find(a => a.agent === 'wendy')!.count).toBe(14);
  });

  it('Wendy gets a new conversion — all three views increment the same day by 1', () => {
    const raw = makeRawMtd();
    const wendy = raw.byAgent.find(a => a.agent === 'wendy')!;
    wendy.count = 15;
    wendy.daily!['2026-04-10'] = (wendy.daily!['2026-04-10'] || 0) + 1;
    raw.total = KPI_MTD_TOTAL + 1;

    const jc = deriveMtdForBrand(raw, makeKPIMtd(), makeSummary(), 'jc');
    const msc = deriveMtdForBrand(raw, makeKPIMtd(), makeSummary(), 'msc');
    const mixed = deriveMtdForBrand(raw, makeKPIMtd(), makeSummary(), 'mixed');

    // Wendy's full count is now 15 in all three views
    expect(jc.byAgent.find(a => a.agent === 'wendy')!.count).toBe(15);
    expect(msc.byAgent.find(a => a.agent === 'wendy')!.count).toBe(15);
    expect(mixed.byAgent.find(a => a.agent === 'wendy')!.count).toBe(15);

    // Totals all went up by exactly 1 vs baseline
    expect(jc.total).toBe(JC_ONLY_TOTAL + BLENDED_TOTAL + 1);
    expect(msc.total).toBe(MSC_ONLY_TOTAL + BLENDED_TOTAL + 1);
    expect(mixed.total).toBe(KPI_MTD_TOTAL + 1);
  });
});

describe('brand pipeline integration — MTD rep activity', () => {
  it('MtdRepActivity excludes wrong-brand agents per view', () => {
    const summary = makeSummary();
    const rawMtdRA = makeRawMtdRA();
    const kpiMtd = makeKPIMtd();

    const jc = deriveMtdRepActivityForBrand(rawMtdRA, kpiMtd, summary, 'jc');
    const msc = deriveMtdRepActivityForBrand(rawMtdRA, kpiMtd, summary, 'msc');

    expect(jc.find(a => a.agent === 'desi')).toBeUndefined();
    expect(jc.find(a => a.agent === 'francis')).toBeUndefined();
    expect(msc.find(a => a.agent === 'omar')).toBeUndefined();
    expect(msc.find(a => a.agent === 'ian')).toBeUndefined();
  });

  it('Blended agents appear in both JC and MSC with FULL totalCalls', () => {
    const summary = makeSummary();
    const rawMtdRA = makeRawMtdRA();
    const kpiMtd = makeKPIMtd();

    const jc = deriveMtdRepActivityForBrand(rawMtdRA, kpiMtd, summary, 'jc');
    const msc = deriveMtdRepActivityForBrand(rawMtdRA, kpiMtd, summary, 'msc');

    // Sara = 95 calls, Wendy = 85 calls — full counts in both views
    expect(jc.find(a => a.agent === 'sara')!.totalCalls).toBe(95);
    expect(msc.find(a => a.agent === 'sara')!.totalCalls).toBe(95);
    expect(jc.find(a => a.agent === 'wendy')!.totalCalls).toBe(85);
    expect(msc.find(a => a.agent === 'wendy')!.totalCalls).toBe(85);
  });
});

describe('brand pipeline integration — YTD', () => {
  it('YTD scales proportionally to MTD brand ratio (whole-count rule)', () => {
    const rawYtd = makeRawYtd();
    const raw = makeRawMtd();
    const kpiMtd = makeKPIMtd();
    const summary = makeSummary();

    const jc = deriveMtdForBrand(raw, kpiMtd, summary, 'jc');
    const msc = deriveMtdForBrand(raw, kpiMtd, summary, 'msc');

    // With whole-count rule, both brand ratios are > 0.5 because blended
    // is in both. jc.total / raw.total ≈ 0.69, msc.total / raw.total ≈ 0.41
    const jcRatio = jc.total / raw.total;
    const mscRatio = msc.total / raw.total;

    const jcYtd = deriveYtdForBrand(rawYtd, jcRatio);
    const mscYtd = deriveYtdForBrand(rawYtd, mscRatio);
    const mixedYtd = deriveYtdForBrand(rawYtd, 1);

    expect(mixedYtd.total).toBe(rawYtd.total);
    expect(jcYtd.total).toBeGreaterThan(0);
    expect(mscYtd.total).toBeGreaterThan(0);
    expect(jcYtd.total).not.toBe(mscYtd.total);
    expect(jcYtd.total).not.toBe(mixedYtd.total);
  });
});

describe('brand pipeline integration — weekly totals', () => {
  it('thisWeek / lastWeek / trend7d scale by brand ratio and differ per view', () => {
    const raw = makeRawMtd();
    const summary = makeSummary();
    const kpiMtd = makeKPIMtd();

    const jc = deriveMtdForBrand(raw, kpiMtd, summary, 'jc');
    const msc = deriveMtdForBrand(raw, kpiMtd, summary, 'msc');
    const jcRatio = jc.total / raw.total;
    const mscRatio = msc.total / raw.total;

    const rawThisWeek = 250;
    const rawLastWeek = 220;
    const rawTrend = makeRawTrend7d();

    const jcWeekly = deriveWeeklyTotalsForBrand(rawThisWeek, rawLastWeek, rawTrend, jcRatio);
    const mscWeekly = deriveWeeklyTotalsForBrand(rawThisWeek, rawLastWeek, rawTrend, mscRatio);
    const mixedWeekly = deriveWeeklyTotalsForBrand(rawThisWeek, rawLastWeek, rawTrend, 1);

    expect(mixedWeekly.thisWeek).toBe(rawThisWeek);
    expect(mixedWeekly.lastWeek).toBe(rawLastWeek);
    expect(jcWeekly.thisWeek).not.toBe(mscWeekly.thisWeek);
    expect(jcWeekly.trend7d.conversions.length).toBe(rawTrend.conversions.length);
    expect(jcWeekly.trend7d.dates).toEqual(rawTrend.dates);
  });
});
