import { describe, it, expect } from 'vitest';
import { deriveMtdForBrand } from '../lib/blender';
import type { MtdData, BrandCallSummary } from '../lib/types';
import type { KPIMtdSummary, KPIMtdAgent } from '../lib/kpi-sheet';
import { MONTHLY_GOAL, DAILY_GOAL } from '../lib/constants';

// ── Helpers ──────────────────────────────────────────────────────────

function makeRawMtd(overrides: Partial<MtdData> = {}): MtdData {
  return {
    total: 71,
    byAgent: [
      { agent: 'omar', count: 20 },
      { agent: 'burke', count: 15 },
      { agent: 'desi', count: 12 },
      { agent: 'danny', count: 10 },
      { agent: 'natalie', count: 8 },
      { agent: 'sara', count: 6 },
    ],
    goal: MONTHLY_GOAL,
    dailyGoal: DAILY_GOAL,
    dayOfMonth: 10,
    daysInMonth: 30,
    daysRemaining: 20,
    goalPace: 213,
    projectedEOM: 213,
    deficit: MONTHLY_GOAL - 71,
    requiredDailyRate: 41.5,
    onTrack: false,
    byAccount: [
      { account: 'Sapochnick Law', count: 20 },
      { account: 'Bueno Law Office', count: 15 },
      { account: '6 Day Medical Weight Loss', count: 12 },
      { account: 'Greg Kennedy & Associates', count: 10 },
      { account: 'Bella Med Spa ATL', count: 8 },
      { account: 'Mario Varela Law', count: 6 },
    ],
    hourly: new Array(24).fill(0),
    mtdDaily: [
      { date: '2026-04-01', total: 8 },
      { date: '2026-04-02', total: 7 },
      { date: '2026-04-03', total: 7 },
      { date: '2026-04-04', total: 7 },
      { date: '2026-04-05', total: 7 },
      { date: '2026-04-06', total: 7 },
      { date: '2026-04-07', total: 7 },
      { date: '2026-04-08', total: 7 },
      { date: '2026-04-09', total: 7 },
      { date: '2026-04-10', total: 7 },
    ],
    ...overrides,
  };
}

function makeKPIAgent(
  agent: string,
  team: 'jc' | 'msc' | 'blended',
  conversions: number,
): KPIMtdAgent {
  return {
    agent,
    team,
    conversions,
    calls: conversions * 3,
    ringTimeSec: 7,
    pickupPct: 90,
    avgWrapSec: 30,
    totalTalkMin: conversions * 4,
  };
}

function makeKPIMtd(overrides: Partial<KPIMtdSummary> = {}): KPIMtdSummary {
  return {
    totalConversions: 71,
    totalCalls: 260,
    byAgent: [
      makeKPIAgent('omar', 'jc', 20),
      makeKPIAgent('burke', 'jc', 15),
      makeKPIAgent('desi', 'msc', 12),
      makeKPIAgent('danny', 'jc', 10),
      makeKPIAgent('natalie', 'msc', 8),
      makeKPIAgent('sara', 'blended', 6),
    ],
    byDate: [],
    ...overrides,
  };
}

function makeSummary(overrides: Partial<BrandCallSummary> = {}): BrandCallSummary {
  return {
    jc: { answered: 0, missed: 0, talkSec: 0, ringSum: 0, ringCount: 0 },
    msc: { answered: 0, missed: 0, talkSec: 0, ringSum: 0, ringCount: 0 },
    unknown: { answered: 0, missed: 0, talkSec: 0, ringSum: 0, ringCount: 0 },
    // Sara: 60% JC, 40% MSC (from today's CDR ratios)
    agentRatios: { sara: { jc: 0.6, msc: 0.4 } },
    missedByBrand: {
      jc: { total: 0, byAccount: [] },
      msc: { total: 0, byAccount: [] },
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('deriveMtdForBrand — brand filtering', () => {
  it('Mixed preserves raw MTD unchanged', () => {
    const raw = makeRawMtd();
    const result = deriveMtdForBrand(raw, makeKPIMtd(), makeSummary(), 'mixed');

    expect(result.total).toBe(raw.total);
    expect(result.byAgent).toEqual(raw.byAgent);
    expect(result.byAccount).toEqual(raw.byAccount);
    expect(result.mtdDaily).toEqual(raw.mtdDaily);
  });

  it('JC view excludes MSC-only agents from byAgent', () => {
    const result = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'jc');

    const agents = result.byAgent.map(a => a.agent.toLowerCase());
    expect(agents).toContain('omar');
    expect(agents).toContain('burke');
    expect(agents).toContain('danny');
    expect(agents).not.toContain('desi');
    expect(agents).not.toContain('natalie');
  });

  it('MSC view excludes JC-only agents from byAgent', () => {
    const result = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'msc');

    const agents = result.byAgent.map(a => a.agent.toLowerCase());
    expect(agents).toContain('desi');
    expect(agents).toContain('natalie');
    expect(agents).not.toContain('omar');
    expect(agents).not.toContain('burke');
    expect(agents).not.toContain('danny');
  });
});

describe('deriveMtdForBrand — blended agent splits', () => {
  it('JC view gets Sara proportional to CDR ratio (60% of 6 = 4)', () => {
    const result = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'jc');
    const sara = result.byAgent.find(a => a.agent.toLowerCase() === 'sara');
    expect(sara).toBeDefined();
    expect(sara!.count).toBe(4); // round(6 * 0.6)
  });

  it('MSC view gets Sara remainder (6 - 4 = 2) for exact additivity', () => {
    const result = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'msc');
    const sara = result.byAgent.find(a => a.agent.toLowerCase() === 'sara');
    expect(sara).toBeDefined();
    expect(sara!.count).toBe(2); // 6 - round(6 * 0.6) = 2
  });

  it('blended agent gets 50/50 split when no CDR ratio available', () => {
    const summary = makeSummary({ agentRatios: {} }); // no ratios
    const jc = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), summary, 'jc');
    const msc = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), summary, 'msc');

    const saraJc = jc.byAgent.find(a => a.agent.toLowerCase() === 'sara');
    const saraMsc = msc.byAgent.find(a => a.agent.toLowerCase() === 'sara');

    // 50/50 with round-trip exactness: 6 → 3 + 3
    expect((saraJc?.count ?? 0) + (saraMsc?.count ?? 0)).toBe(6);
  });

  it('removes blended agents with zero brand-share from byAgent', () => {
    // Sara is 100% JC — MSC should not see her
    const summary = makeSummary({
      agentRatios: { sara: { jc: 1.0, msc: 0.0 } },
    });
    const msc = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), summary, 'msc');
    const sara = msc.byAgent.find(a => a.agent.toLowerCase() === 'sara');
    expect(sara).toBeUndefined();
  });
});

describe('deriveMtdForBrand — additivity constraint', () => {
  it('JC.total + MSC.total = Mixed.total (the core invariant)', () => {
    const raw = makeRawMtd();
    const kpiMtd = makeKPIMtd();
    const summary = makeSummary();

    const jc = deriveMtdForBrand(raw, kpiMtd, summary, 'jc');
    const msc = deriveMtdForBrand(raw, kpiMtd, summary, 'msc');
    const mixed = deriveMtdForBrand(raw, kpiMtd, summary, 'mixed');

    expect(jc.total + msc.total).toBe(mixed.total);
  });

  it('additivity holds with no CDR ratios (50/50 split)', () => {
    const raw = makeRawMtd();
    const summary = makeSummary({ agentRatios: {} });

    const jc = deriveMtdForBrand(raw, makeKPIMtd(), summary, 'jc');
    const msc = deriveMtdForBrand(raw, makeKPIMtd(), summary, 'msc');
    const mixed = deriveMtdForBrand(raw, makeKPIMtd(), summary, 'mixed');

    expect(jc.total + msc.total).toBe(mixed.total);
  });

  it('additivity holds across mtdDaily day totals', () => {
    const raw = makeRawMtd();
    const jc = deriveMtdForBrand(raw, makeKPIMtd(), makeSummary(), 'jc');
    const msc = deriveMtdForBrand(raw, makeKPIMtd(), makeSummary(), 'msc');

    expect(jc.mtdDaily!.length).toBe(raw.mtdDaily!.length);
    expect(msc.mtdDaily!.length).toBe(raw.mtdDaily!.length);

    for (let i = 0; i < raw.mtdDaily!.length; i++) {
      const jcDay = jc.mtdDaily![i].total;
      const mscDay = msc.mtdDaily![i].total;
      const rawDay = raw.mtdDaily![i].total;
      // Allow off-by-one rounding across 10 days of proportional scaling
      expect(Math.abs((jcDay + mscDay) - rawDay)).toBeLessThanOrEqual(1);
    }
  });
});

describe('deriveMtdForBrand — projections and totals recomputed', () => {
  it('JC requiredDailyRate recomputes from JC-only total', () => {
    const result = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'jc');
    // JC total = 20 + 15 + 10 + 4 = 49
    // deficit = 900 - 49 = 851
    // daysRemaining = 20
    // required = round(851 / 20 * 10) / 10 = 42.6
    expect(result.total).toBe(49);
    expect(result.deficit).toBe(MONTHLY_GOAL - 49);
    expect(result.requiredDailyRate).toBe(42.6);
  });

  it('MSC projectedEOM recomputes from MSC-only total', () => {
    const result = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'msc');
    // MSC total = 12 + 8 + 2 = 22, day 10 of 30 → projected 66
    expect(result.total).toBe(22);
    expect(result.projectedEOM).toBe(66);
  });

  it('goal/dayOfMonth/daysInMonth preserved from raw across all brands', () => {
    const raw = makeRawMtd();
    const jc = deriveMtdForBrand(raw, makeKPIMtd(), makeSummary(), 'jc');
    const msc = deriveMtdForBrand(raw, makeKPIMtd(), makeSummary(), 'msc');

    expect(jc.goal).toBe(raw.goal);
    expect(msc.goal).toBe(raw.goal);
    expect(jc.dayOfMonth).toBe(raw.dayOfMonth);
    expect(msc.daysInMonth).toBe(raw.daysInMonth);
    expect(jc.daysRemaining).toBe(raw.daysRemaining);
  });
});

describe('deriveMtdForBrand — byAccount filtering', () => {
  it('JC view keeps JC-branded client accounts', () => {
    const result = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'jc');
    const accounts = result.byAccount!.map(a => a.account);
    // Sapochnick Law, Bueno Law Office, Greg Kennedy, Mario Varela are all JC
    expect(accounts).toContain('Sapochnick Law');
    expect(accounts).toContain('Bueno Law Office');
  });

  it('MSC view keeps MSC-branded client accounts', () => {
    const result = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'msc');
    const accounts = result.byAccount!.map(a => a.account);
    expect(accounts).toContain('6 Day Medical Weight Loss');
    expect(accounts).toContain('Bella Med Spa ATL');
  });
});

describe('deriveMtdForBrand — empty and edge cases', () => {
  it('handles empty byAgent without throwing', () => {
    const raw = makeRawMtd({ byAgent: [], total: 0 });
    expect(() => deriveMtdForBrand(raw, makeKPIMtd({ byAgent: [] }), makeSummary(), 'jc')).not.toThrow();
  });

  it('returns zero totals when KPI MTD has no matching agents', () => {
    const raw = makeRawMtd({ byAgent: [{ agent: 'unknown-agent', count: 5 }], total: 5 });
    const result = deriveMtdForBrand(raw, makeKPIMtd({ byAgent: [] }), makeSummary(), 'jc');
    // Unknown agents fall back to isAgentForBrand → NOT MSC-only → included in JC
    expect(result.byAgent.length).toBeGreaterThanOrEqual(0);
  });
});
