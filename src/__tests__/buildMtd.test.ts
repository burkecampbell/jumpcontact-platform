import { describe, it, expect } from 'vitest';
import type { AgentStat, AcctStat, MtdData } from '../lib/types';
import { MONTHLY_GOAL, DAILY_GOAL } from '../lib/constants';

// ── Replicate buildMtd logic from route.ts ──────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

type ConvEntry = {
  total: number;
  byAgent: Record<string, number>;
  byAccount: AcctStat[];
  byHour: number[];
};

function buildMtd(
  mtdMap: Map<string, ConvEntry>,
  now: Date,
): MtdData {
  let total = 0;
  const agentTotals: Record<string, number> = {};
  const agentDaily: Record<string, Record<string, number>> = {};
  const acctTotals: Record<string, number> = {};
  const hourly = new Array(24).fill(0);
  const mtdDaily: { date: string; total: number }[] = [];

  const sortedDates = [...mtdMap.keys()].sort();
  for (const date of sortedDates) {
    const entry = mtdMap.get(date)!;
    total += entry.total;
    mtdDaily.push({ date, total: entry.total });
    for (const [agent, count] of Object.entries(entry.byAgent)) {
      agentTotals[agent] = (agentTotals[agent] || 0) + count;
      if (!agentDaily[agent]) agentDaily[agent] = {};
      agentDaily[agent][date] = count;
    }
    for (const a of entry.byAccount) {
      acctTotals[a.account] = (acctTotals[a.account] || 0) + a.count;
    }
    for (let h = 0; h < 24; h++) hourly[h] += entry.byHour[h];
  }

  const dayOfMonth = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const dim = daysInMonth(year, month);
  const daysRemaining = dim - dayOfMonth;
  const goalPace = dayOfMonth > 0 ? Math.round((total / dayOfMonth) * dim) : 0;
  const projectedEOM = goalPace;
  const deficit = MONTHLY_GOAL - total;
  const requiredDailyRate = daysRemaining > 0 ? Math.round((deficit / daysRemaining) * 10) / 10 : 0;

  const byAgent: AgentStat[] = Object.entries(agentTotals)
    .map(([agent, count]) => ({ agent, count, daily: agentDaily[agent] }))
    .sort((a, b) => b.count - a.count);

  const byAccount: AcctStat[] = Object.entries(acctTotals)
    .map(([account, count]) => ({ account, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total,
    byAgent,
    goal: MONTHLY_GOAL,
    dailyGoal: DAILY_GOAL,
    dayOfMonth,
    daysInMonth: dim,
    daysRemaining,
    goalPace,
    projectedEOM,
    deficit,
    requiredDailyRate,
    onTrack: projectedEOM >= MONTHLY_GOAL,
    byAccount,
    hourly,
    mtdDaily,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<ConvEntry> = {}): ConvEntry {
  return {
    total: 0,
    byAgent: {},
    byAccount: [],
    byHour: new Array(24).fill(0),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('buildMtd', () => {
  it('calculates total from all dates', () => {
    const mtdMap = new Map<string, ConvEntry>();
    mtdMap.set('2026-04-01', makeEntry({ total: 30 }));
    mtdMap.set('2026-04-02', makeEntry({ total: 25 }));
    mtdMap.set('2026-04-03', makeEntry({ total: 20 }));

    const result = buildMtd(mtdMap, new Date(2026, 3, 3)); // April 3
    expect(result.total).toBe(75);
  });

  it('includes the daily field on byAgent entries', () => {
    const mtdMap = new Map<string, ConvEntry>();
    mtdMap.set('2026-04-01', makeEntry({ total: 5, byAgent: { omar: 3, burke: 2 } }));
    mtdMap.set('2026-04-02', makeEntry({ total: 4, byAgent: { omar: 1, danny: 3 } }));

    const result = buildMtd(mtdMap, new Date(2026, 3, 2)); // April 2

    // Check omar has daily breakdown
    const omar = result.byAgent.find(a => a.agent === 'omar');
    expect(omar).toBeDefined();
    expect(omar!.daily).toBeDefined();
    expect(omar!.daily!['2026-04-01']).toBe(3);
    expect(omar!.daily!['2026-04-02']).toBe(1);

    // Check burke has daily breakdown (only appears on day 1)
    const burke = result.byAgent.find(a => a.agent === 'burke');
    expect(burke).toBeDefined();
    expect(burke!.daily).toBeDefined();
    expect(burke!.daily!['2026-04-01']).toBe(2);
    expect(burke!.daily!['2026-04-02']).toBeUndefined();

    // Check danny
    const danny = result.byAgent.find(a => a.agent === 'danny');
    expect(danny).toBeDefined();
    expect(danny!.daily!['2026-04-02']).toBe(3);
  });

  it('calculates projections correctly mid-month', () => {
    const mtdMap = new Map<string, ConvEntry>();
    // 10 days with 30 each = 300 total on day 10 of April (30 days)
    for (let d = 1; d <= 10; d++) {
      mtdMap.set(`2026-04-${String(d).padStart(2, '0')}`, makeEntry({ total: 30 }));
    }

    const result = buildMtd(mtdMap, new Date(2026, 3, 10)); // April 10
    expect(result.total).toBe(300);
    expect(result.dayOfMonth).toBe(10);
    expect(result.daysInMonth).toBe(30);
    expect(result.daysRemaining).toBe(20);
    // projected = (300 / 10) * 30 = 900
    expect(result.projectedEOM).toBe(900);
    expect(result.goalPace).toBe(900);
    expect(result.onTrack).toBe(true);
    expect(result.deficit).toBe(MONTHLY_GOAL - 300);
    // requiredDailyRate = (900 - 300) / 20 = 30
    expect(result.requiredDailyRate).toBe(30);
  });

  it('handles empty dates map', () => {
    const mtdMap = new Map<string, ConvEntry>();
    const result = buildMtd(mtdMap, new Date(2026, 3, 5)); // April 5
    expect(result.total).toBe(0);
    expect(result.byAgent).toEqual([]);
    expect(result.byAccount).toEqual([]);
    expect(result.mtdDaily).toEqual([]);
    expect(result.projectedEOM).toBe(0);
    expect(result.onTrack).toBe(false);
  });

  it('sorts byAgent by count descending', () => {
    const mtdMap = new Map<string, ConvEntry>();
    mtdMap.set('2026-04-01', makeEntry({
      total: 15,
      byAgent: { omar: 8, burke: 2, danny: 5 },
    }));

    const result = buildMtd(mtdMap, new Date(2026, 3, 1)); // April 1
    expect(result.byAgent[0].agent).toBe('omar');
    expect(result.byAgent[0].count).toBe(8);
    expect(result.byAgent[1].agent).toBe('danny');
    expect(result.byAgent[1].count).toBe(5);
    expect(result.byAgent[2].agent).toBe('burke');
    expect(result.byAgent[2].count).toBe(2);
  });

  it('aggregates byAccount across dates', () => {
    const mtdMap = new Map<string, ConvEntry>();
    mtdMap.set('2026-04-01', makeEntry({
      total: 3,
      byAccount: [{ account: 'sapochnick', count: 2 }, { account: 'ttn', count: 1 }],
    }));
    mtdMap.set('2026-04-02', makeEntry({
      total: 2,
      byAccount: [{ account: 'sapochnick', count: 1 }, { account: 'brudner', count: 1 }],
    }));

    const result = buildMtd(mtdMap, new Date(2026, 3, 2)); // April 2
    const sapochnick = result.byAccount!.find(a => a.account === 'sapochnick');
    expect(sapochnick!.count).toBe(3);
    const ttn = result.byAccount!.find(a => a.account === 'ttn');
    expect(ttn!.count).toBe(1);
    const brudner = result.byAccount!.find(a => a.account === 'brudner');
    expect(brudner!.count).toBe(1);
  });

  it('aggregates hourly across dates element-wise', () => {
    const hourly1 = new Array(24).fill(0);
    hourly1[9] = 5;
    hourly1[10] = 8;

    const hourly2 = new Array(24).fill(0);
    hourly2[9] = 3;
    hourly2[11] = 4;

    const mtdMap = new Map<string, ConvEntry>();
    mtdMap.set('2026-04-01', makeEntry({ total: 13, byHour: hourly1 }));
    mtdMap.set('2026-04-02', makeEntry({ total: 7, byHour: hourly2 }));

    const result = buildMtd(mtdMap, new Date(2026, 3, 2)); // April 2
    expect(result.hourly![9]).toBe(8);
    expect(result.hourly![10]).toBe(8);
    expect(result.hourly![11]).toBe(4);
    expect(result.hourly![0]).toBe(0);
  });

  it('generates mtdDaily entries sorted by date', () => {
    const mtdMap = new Map<string, ConvEntry>();
    mtdMap.set('2026-04-03', makeEntry({ total: 10 }));
    mtdMap.set('2026-04-01', makeEntry({ total: 20 }));
    mtdMap.set('2026-04-02', makeEntry({ total: 15 }));

    const result = buildMtd(mtdMap, new Date(2026, 3, 3)); // April 3
    expect(result.mtdDaily).toEqual([
      { date: '2026-04-01', total: 20 },
      { date: '2026-04-02', total: 15 },
      { date: '2026-04-03', total: 10 },
    ]);
  });

  it('handles February correctly (28 days in 2026)', () => {
    const mtdMap = new Map<string, ConvEntry>();
    mtdMap.set('2026-02-14', makeEntry({ total: 450 }));

    const result = buildMtd(mtdMap, new Date(2026, 1, 14)); // Feb 14
    expect(result.daysInMonth).toBe(28);
    // projected = (450 / 14) * 28 = 900
    expect(result.projectedEOM).toBe(900);
  });

  it('handles last day of month (no days remaining)', () => {
    const mtdMap = new Map<string, ConvEntry>();
    mtdMap.set('2026-04-30', makeEntry({ total: 850 }));

    const result = buildMtd(mtdMap, new Date(2026, 3, 30)); // April 30
    expect(result.daysRemaining).toBe(0);
    expect(result.requiredDailyRate).toBe(0);
    expect(result.deficit).toBe(MONTHLY_GOAL - 850);
  });

  it('uses MONTHLY_GOAL (900) and DAILY_GOAL (30)', () => {
    expect(MONTHLY_GOAL).toBe(900);
    expect(DAILY_GOAL).toBe(30);

    const mtdMap = new Map<string, ConvEntry>();
    mtdMap.set('2026-04-01', makeEntry({ total: 30 }));

    const result = buildMtd(mtdMap, new Date(2026, 3, 1)); // April 1
    expect(result.goal).toBe(900);
    expect(result.dailyGoal).toBe(30);
  });
});
