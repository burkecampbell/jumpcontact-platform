/**
 * Brand pipeline integration test.
 *
 * Exercises deriveMtdForBrand + deriveMtdRepActivityForBrand +
 * deriveYtdForBrand + deriveWeeklyTotalsForBrand end-to-end on realistic
 * data shaped like what /api/data actually returns. Asserts the
 * additivity invariant: JC + MSC ≈ Mixed across every brand-aware field.
 *
 * This is the regression test that would have caught the bug Burke
 * reported on 2026-04-10 where MTD=342 and YTD=2671 showed identical
 * values across all three brand toggles.
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
} from '../lib/types';
import type { KPIMtdSummary, KPIMtdAgent } from '../lib/kpi-sheet';
import { MONTHLY_GOAL, DAILY_GOAL } from '../lib/constants';

// ── Realistic fixtures ──────────────────────────────────────────────

function buildKpiMtdAgents(): KPIMtdAgent[] {
  // April 1-10, 2026 MTD totals per KPI sheet
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

function makeKPIMtd(): KPIMtdSummary {
  return {
    totalConversions: KPI_MTD_TOTAL,
    totalCalls: 1255,
    byAgent: buildKpiMtdAgents(),
    byDate: [],
  };
}

function makeRawMtd(): MtdData {
  // Raw MTD is what you'd see on the Mixed view today
  return {
    total: 342,
    byAgent: buildKpiMtdAgents().map(a => ({ agent: a.agent, count: a.conversions })),
    goal: MONTHLY_GOAL,
    dailyGoal: DAILY_GOAL,
    dayOfMonth: 10,
    daysInMonth: 30,
    daysRemaining: 20,
    goalPace: 1026,
    projectedEOM: 1026,
    deficit: MONTHLY_GOAL - 342,
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
    mtdDaily: Array.from({ length: 10 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      total: Math.round(342 / 10),
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
    agentRatios: {
      sara: { jc: 0.55, msc: 0.45 },
      wendy: { jc: 0.4, msc: 0.6 },
    },
    missedByBrand: {
      jc: { total: 0, byAccount: [] },
      msc: { total: 0, byAccount: [] },
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('brand pipeline integration — MTD', () => {
  it('MTD totals differ across JC / MSC / Mixed (the bug Burke reported)', () => {
    const raw = makeRawMtd();
    const kpiMtd = makeKPIMtd();
    const summary = makeSummary();

    const jc = deriveMtdForBrand(raw, kpiMtd, summary, 'jc');
    const msc = deriveMtdForBrand(raw, kpiMtd, summary, 'msc');
    const mixed = deriveMtdForBrand(raw, kpiMtd, summary, 'mixed');

    // This is THE assertion — the bug was these three being identical
    expect(jc.total).not.toBe(msc.total);
    expect(jc.total).not.toBe(mixed.total);
    expect(msc.total).not.toBe(mixed.total);
  });

  it('MTD additivity: JC.total + MSC.total = Mixed.total', () => {
    const raw = makeRawMtd();
    const kpiMtd = makeKPIMtd();
    const summary = makeSummary();

    const jc = deriveMtdForBrand(raw, kpiMtd, summary, 'jc');
    const msc = deriveMtdForBrand(raw, kpiMtd, summary, 'msc');
    const mixed = deriveMtdForBrand(raw, kpiMtd, summary, 'mixed');

    expect(jc.total + msc.total).toBe(mixed.total);
  });

  it('JC.byAgent has only JC + blended agents; MSC.byAgent has only MSC + blended', () => {
    const raw = makeRawMtd();
    const kpiMtd = makeKPIMtd();
    const summary = makeSummary();

    const jc = deriveMtdForBrand(raw, kpiMtd, summary, 'jc');
    const msc = deriveMtdForBrand(raw, kpiMtd, summary, 'msc');

    const jcAgents = jc.byAgent.map(a => a.agent.toLowerCase());
    const mscAgents = msc.byAgent.map(a => a.agent.toLowerCase());

    // JC includes: omar, burke, danny, ian (jc), + sara, wendy (blended with jc share > 0)
    expect(jcAgents).toContain('omar');
    expect(jcAgents).toContain('ian');
    expect(jcAgents).not.toContain('desi');
    expect(jcAgents).not.toContain('natalie');
    expect(jcAgents).not.toContain('francis');

    // MSC includes: desi, natalie, francis (msc), + sara, wendy (blended)
    expect(mscAgents).toContain('desi');
    expect(mscAgents).toContain('natalie');
    expect(mscAgents).toContain('francis');
    expect(mscAgents).not.toContain('omar');
    expect(mscAgents).not.toContain('burke');
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
    expect(jc.find(a => a.agent === 'natalie')).toBeUndefined();
    expect(msc.find(a => a.agent === 'omar')).toBeUndefined();
    expect(msc.find(a => a.agent === 'burke')).toBeUndefined();
  });

  it('blended agent totalCalls additivity holds (sara, wendy)', () => {
    const summary = makeSummary();
    const rawMtdRA = makeRawMtdRA();
    const kpiMtd = makeKPIMtd();

    const jc = deriveMtdRepActivityForBrand(rawMtdRA, kpiMtd, summary, 'jc');
    const msc = deriveMtdRepActivityForBrand(rawMtdRA, kpiMtd, summary, 'msc');

    for (const agent of ['sara', 'wendy']) {
      const jcCalls = jc.find(a => a.agent === agent)?.totalCalls ?? 0;
      const mscCalls = msc.find(a => a.agent === agent)?.totalCalls ?? 0;
      const rawCalls = rawMtdRA.find(a => a.agent === agent)!.totalCalls;
      expect(jcCalls + mscCalls).toBe(rawCalls);
    }
  });
});

describe('brand pipeline integration — YTD', () => {
  it('YTD scales proportionally to MTD brand ratio', () => {
    const rawYtd = makeRawYtd();
    const raw = makeRawMtd();
    const kpiMtd = makeKPIMtd();
    const summary = makeSummary();

    // Compute brand ratios from MTD totals (the approximation we use)
    const jc = deriveMtdForBrand(raw, kpiMtd, summary, 'jc');
    const msc = deriveMtdForBrand(raw, kpiMtd, summary, 'msc');
    const jcRatio = jc.total / raw.total;
    const mscRatio = msc.total / raw.total;

    const jcYtd = deriveYtdForBrand(rawYtd, jcRatio);
    const mscYtd = deriveYtdForBrand(rawYtd, mscRatio);
    const mixedYtd = deriveYtdForBrand(rawYtd, 1);

    expect(mixedYtd.total).toBe(rawYtd.total);
    // JC + MSC ≈ Mixed (off by at most rounding)
    expect(Math.abs((jcYtd.total + mscYtd.total) - mixedYtd.total)).toBeLessThanOrEqual(1);
    // They must differ from each other
    expect(jcYtd.total).not.toBe(mscYtd.total);
    expect(jcYtd.total).not.toBe(mixedYtd.total);
  });
});

describe('brand pipeline integration — weekly totals', () => {
  it('thisWeek/lastWeek/trend7d all scale by brand ratio and differ per view', () => {
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
    expect(jcWeekly.thisWeek + mscWeekly.thisWeek).toBeGreaterThanOrEqual(rawThisWeek - 2);
    expect(jcWeekly.thisWeek + mscWeekly.thisWeek).toBeLessThanOrEqual(rawThisWeek + 2);

    // trend7d array lengths preserved
    expect(jcWeekly.trend7d.conversions.length).toBe(rawTrend.conversions.length);
    expect(jcWeekly.trend7d.dates).toEqual(rawTrend.dates);
  });
});
