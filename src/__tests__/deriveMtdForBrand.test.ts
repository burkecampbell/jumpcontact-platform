import { describe, it, expect } from 'vitest';
import { deriveMtdForBrand } from '../lib/blender';
import type { MtdData, BrandCallSummary } from '../lib/types';
import type { KPIMtdSummary, KPIMtdAgent } from '../lib/kpi-sheet';
import { MONTHLY_GOAL, DAILY_GOAL } from '../lib/constants';

// ── Helpers ──────────────────────────────────────────────────────────
// Fixtures include a per-agent daily breakdown so mtdDaily can be
// recomputed by summing visible agents' daily maps — which is how
// Ship 4 guarantees that a new conversion for Wendy on day D shows up
// immediately on both JC and MSC views.

function makeRawMtd(overrides: Partial<MtdData> = {}): MtdData {
  return {
    total: 71,
    byAgent: [
      { agent: 'omar', count: 20, daily: { '2026-04-08': 8, '2026-04-09': 6, '2026-04-10': 6 } },
      { agent: 'burke', count: 15, daily: { '2026-04-08': 5, '2026-04-09': 5, '2026-04-10': 5 } },
      { agent: 'desi', count: 12, daily: { '2026-04-08': 4, '2026-04-09': 4, '2026-04-10': 4 } },
      { agent: 'danny', count: 10, daily: { '2026-04-08': 3, '2026-04-09': 4, '2026-04-10': 3 } },
      { agent: 'natalie', count: 8, daily: { '2026-04-08': 3, '2026-04-09': 3, '2026-04-10': 2 } },
      { agent: 'sara', count: 6, daily: { '2026-04-08': 2, '2026-04-09': 2, '2026-04-10': 2 } },
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
      { date: '2026-04-08', total: 25 },
      { date: '2026-04-09', total: 24 },
      { date: '2026-04-10', total: 22 },
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
    agentRatios: {},  // Ship 4: no longer used for splitting
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

describe('deriveMtdForBrand — whole-count rule for blended agents', () => {
  // CLAUDE.md gotcha #5: "Blended agents appear in both JC and MSC —
  // JC + MSC totals > Mixed total by the blended count. This is correct,
  // not a bug."
  //
  // This is the test that would have caught Burke's 2026-04-10 bug where
  // Wendy's new conversions weren't being added on the JC view because
  // the CDR-ratio split was shifting her count down as the day progressed.

  it('Sara (blended) appears with full count in JC view', () => {
    const result = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'jc');
    const sara = result.byAgent.find(a => a.agent.toLowerCase() === 'sara');
    expect(sara).toBeDefined();
    expect(sara!.count).toBe(6); // full count, no split
  });

  it('Sara (blended) appears with full count in MSC view', () => {
    const result = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'msc');
    const sara = result.byAgent.find(a => a.agent.toLowerCase() === 'sara');
    expect(sara).toBeDefined();
    expect(sara!.count).toBe(6); // full count, no split
  });

  it('Sara full count is identical across JC / MSC / Mixed (whole-count rule)', () => {
    const jc = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'jc');
    const msc = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'msc');
    const mixed = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'mixed');

    const saraJc = jc.byAgent.find(a => a.agent.toLowerCase() === 'sara');
    const saraMsc = msc.byAgent.find(a => a.agent.toLowerCase() === 'sara');
    const saraMixed = mixed.byAgent.find(a => a.agent.toLowerCase() === 'sara');

    expect(saraJc!.count).toBe(saraMixed!.count);
    expect(saraMsc!.count).toBe(saraMixed!.count);
  });

  it('blended daily breakdown is not scaled — Sara same daily in all views', () => {
    const jc = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'jc');
    const msc = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'msc');

    const saraJc = jc.byAgent.find(a => a.agent.toLowerCase() === 'sara');
    const saraMsc = msc.byAgent.find(a => a.agent.toLowerCase() === 'sara');

    // Burke's explicit complaint: if Wendy logs a new conversion, both
    // views should show +1 on that day. Ensured by not scaling daily.
    expect(saraJc!.daily).toEqual(saraMsc!.daily);
    expect(saraJc!.daily).toEqual({ '2026-04-08': 2, '2026-04-09': 2, '2026-04-10': 2 });
  });

  it('CDR ratio is ignored for blended agents (no split)', () => {
    // Even with an extreme ratio, the blended agent keeps full count
    const summary = makeSummary({
      agentRatios: { sara: { jc: 0.99, msc: 0.01 } },
    });
    const jc = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), summary, 'jc');
    const msc = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), summary, 'msc');

    expect(jc.byAgent.find(a => a.agent === 'sara')!.count).toBe(6);
    expect(msc.byAgent.find(a => a.agent === 'sara')!.count).toBe(6);
  });
});

describe('deriveMtdForBrand — whole-count invariant (replaces old additivity)', () => {
  // Blended agents double-count — JC + MSC overshoots Mixed by the
  // blended total. This is the documented correct behavior.
  it('(JC.total) + (MSC.total) - (Mixed.total) == sum(blended_byAgent)', () => {
    const raw = makeRawMtd();
    const kpiMtd = makeKPIMtd();
    const summary = makeSummary();

    const jc = deriveMtdForBrand(raw, kpiMtd, summary, 'jc');
    const msc = deriveMtdForBrand(raw, kpiMtd, summary, 'msc');
    const mixed = deriveMtdForBrand(raw, kpiMtd, summary, 'mixed');

    // JC = omar(20) + burke(15) + danny(10) + sara(6) = 51
    // MSC = desi(12) + natalie(8) + sara(6) = 26
    // Mixed (raw) = 71 (sum of all byAgent entries)
    // JC + MSC - Mixed = 51 + 26 - 71 = 6 = Sara (the only blended agent)
    expect(jc.total).toBe(51);
    expect(msc.total).toBe(26);
    expect(mixed.total).toBe(71);
    expect(jc.total + msc.total - mixed.total).toBe(6);
  });

  it('mtdDaily sum matches the filtered total for each brand', () => {
    const jc = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'jc');
    const msc = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'msc');

    const jcDailySum = jc.mtdDaily!.reduce((s, d) => s + d.total, 0);
    const mscDailySum = msc.mtdDaily!.reduce((s, d) => s + d.total, 0);

    expect(jcDailySum).toBe(jc.total);
    expect(mscDailySum).toBe(msc.total);
  });

  it('burke logs a new conversion for Sara today — all three views increment by 1', () => {
    // Simulate Burke adding a conversion on 2026-04-10
    const raw = makeRawMtd();
    const sara = raw.byAgent.find(a => a.agent === 'sara')!;
    sara.count = 7;
    sara.daily!['2026-04-10'] = 3;
    raw.total = 72;
    raw.mtdDaily![2].total = 23;

    const jc = deriveMtdForBrand(raw, makeKPIMtd(), makeSummary(), 'jc');
    const msc = deriveMtdForBrand(raw, makeKPIMtd(), makeSummary(), 'msc');
    const mixed = deriveMtdForBrand(raw, makeKPIMtd(), makeSummary(), 'mixed');

    // Sara's full count is now 7 in all three views
    expect(jc.byAgent.find(a => a.agent === 'sara')!.count).toBe(7);
    expect(msc.byAgent.find(a => a.agent === 'sara')!.count).toBe(7);
    expect(mixed.byAgent.find(a => a.agent === 'sara')!.count).toBe(7);

    // Totals all went up by exactly 1 vs the baseline test above
    expect(jc.total).toBe(52);  // was 51
    expect(msc.total).toBe(27); // was 26
    expect(mixed.total).toBe(72); // was 71
  });
});

describe('deriveMtdForBrand — projections and totals recomputed', () => {
  it('JC requiredDailyRate recomputes from JC-only total (with full sara)', () => {
    const result = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'jc');
    // JC total = 20 + 15 + 10 + 6 = 51 (full Sara count)
    // deficit = 900 - 51 = 849
    // daysRemaining = 20
    // required = round(849 / 20 * 10) / 10 = 42.5 (but Math.round(42.45) = 42)
    expect(result.total).toBe(51);
    expect(result.deficit).toBe(MONTHLY_GOAL - 51);
    expect(result.requiredDailyRate).toBe(42.5);
  });

  it('MSC projectedEOM recomputes from MSC-only total (with full sara)', () => {
    const result = deriveMtdForBrand(makeRawMtd(), makeKPIMtd(), makeSummary(), 'msc');
    // MSC total = 12 + 8 + 6 = 26, day 10 of 30 → projected 78
    expect(result.total).toBe(26);
    expect(result.projectedEOM).toBe(78);
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

  it('handles agents without daily field (no mtdDaily data)', () => {
    const raw = makeRawMtd({
      byAgent: [{ agent: 'omar', count: 5 }], // no daily field
      mtdDaily: [],
    });
    const result = deriveMtdForBrand(raw, makeKPIMtd({ byAgent: [] }), makeSummary(), 'jc');
    expect(result.total).toBe(5);
    expect(result.mtdDaily).toEqual([]); // no daily data to aggregate
  });
});
