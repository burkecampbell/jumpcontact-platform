import { describe, it, expect } from 'vitest';
import { deriveMtdRepActivityForBrand } from '../lib/blender';
import type { YticaMtdAgent, BrandCallSummary } from '../lib/types';
import type { KPIMtdSummary, KPIMtdAgent } from '../lib/kpi-sheet';

// ── Helpers ──────────────────────────────────────────────────────────

function makeYticaMtdAgent(agent: string, totalCalls: number, totalTalkMin = totalCalls * 4): YticaMtdAgent {
  return {
    agent,
    totalCalls,
    totalTalkMin,
    avgSpeedSec: 7.5,
    avgWrapUpSec: 30,
  };
}

function makeKPIAgent(
  agent: string,
  team: 'jc' | 'msc' | 'blended',
  calls: number,
): KPIMtdAgent {
  return {
    agent,
    team,
    conversions: Math.round(calls / 3),
    calls,
    ringTimeSec: 7,
    pickupPct: 90,
    avgWrapSec: 30,
    totalTalkMin: calls * 4,
  };
}

function makeKPIMtd(): KPIMtdSummary {
  return {
    totalConversions: 100,
    totalCalls: 400,
    byAgent: [
      makeKPIAgent('omar', 'jc', 100),
      makeKPIAgent('burke', 'jc', 80),
      makeKPIAgent('desi', 'msc', 60),
      makeKPIAgent('natalie', 'msc', 40),
      makeKPIAgent('sara', 'blended', 30),
      makeKPIAgent('wendy', 'blended', 25),
    ],
    byDate: [],
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

function makeRawMtdRA(): YticaMtdAgent[] {
  return [
    makeYticaMtdAgent('omar', 100),
    makeYticaMtdAgent('burke', 80),
    makeYticaMtdAgent('desi', 60),
    makeYticaMtdAgent('natalie', 40),
    makeYticaMtdAgent('sara', 30),
    makeYticaMtdAgent('wendy', 25),
  ];
}

// ── Tests ────────────────────────────────────────────────────────────

describe('deriveMtdRepActivityForBrand — brand filtering', () => {
  it('Mixed returns raw array unchanged', () => {
    const raw = makeRawMtdRA();
    const result = deriveMtdRepActivityForBrand(raw, makeKPIMtd(), makeSummary(), 'mixed');
    expect(result).toEqual(raw);
  });

  it('JC view excludes MSC-only agents', () => {
    const result = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), makeSummary(), 'jc');
    const names = result.map(a => a.agent.toLowerCase());
    expect(names).toContain('omar');
    expect(names).toContain('burke');
    expect(names).not.toContain('desi');
    expect(names).not.toContain('natalie');
  });

  it('MSC view excludes JC-only agents', () => {
    const result = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), makeSummary(), 'msc');
    const names = result.map(a => a.agent.toLowerCase());
    expect(names).toContain('desi');
    expect(names).toContain('natalie');
    expect(names).not.toContain('omar');
    expect(names).not.toContain('burke');
  });
});

describe('deriveMtdRepActivityForBrand — whole-count rule for blended agents', () => {
  it('blended agents appear in both JC and MSC views with FULL totalCalls', () => {
    const jc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), makeSummary(), 'jc');
    const msc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), makeSummary(), 'msc');

    const saraJc = jc.find(a => a.agent.toLowerCase() === 'sara');
    const saraMsc = msc.find(a => a.agent.toLowerCase() === 'sara');
    const wendyJc = jc.find(a => a.agent.toLowerCase() === 'wendy');
    const wendyMsc = msc.find(a => a.agent.toLowerCase() === 'wendy');

    // Sara = 30 calls, Wendy = 25 calls, both appear full in both views
    expect(saraJc?.totalCalls).toBe(30);
    expect(saraMsc?.totalCalls).toBe(30);
    expect(wendyJc?.totalCalls).toBe(25);
    expect(wendyMsc?.totalCalls).toBe(25);
  });

  it('blended totalTalkMin is not scaled between views', () => {
    const jc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), makeSummary(), 'jc');
    const msc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), makeSummary(), 'msc');

    const saraJc = jc.find(a => a.agent.toLowerCase() === 'sara');
    const saraMsc = msc.find(a => a.agent.toLowerCase() === 'sara');
    expect(saraJc!.totalTalkMin).toBe(saraMsc!.totalTalkMin);
  });

  it('(JC sum) + (MSC sum) - (Mixed sum) == blended agent totalCalls', () => {
    const jc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), makeSummary(), 'jc');
    const msc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), makeSummary(), 'msc');
    const mixed = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), makeSummary(), 'mixed');

    const jcSum = jc.reduce((s, a) => s + a.totalCalls, 0);
    const mscSum = msc.reduce((s, a) => s + a.totalCalls, 0);
    const mixedSum = mixed.reduce((s, a) => s + a.totalCalls, 0);

    // Blended agents in the fixture: sara (30) + wendy (25) = 55
    // JC includes JC-only (omar 100 + burke 80 = 180) + blended (55) = 235
    // MSC includes MSC-only (desi 60 + natalie 40 = 100) + blended (55) = 155
    // Mixed is everyone (all 6) = 335
    // JC + MSC - Mixed = 235 + 155 - 335 = 55 = sum of blended totalCalls ✓
    expect(jcSum).toBe(235);
    expect(mscSum).toBe(155);
    expect(mixedSum).toBe(335);
    expect(jcSum + mscSum - mixedSum).toBe(55);
  });
});

describe('deriveMtdRepActivityForBrand — KPI-driven vs fallback', () => {
  it('uses KPI team tags when available', () => {
    const result = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), makeSummary(), 'jc');
    expect(result.find(a => a.agent === 'omar')).toBeDefined();
    expect(result.find(a => a.agent === 'burke')).toBeDefined();
  });

  it('falls back to isAgentForBrand when KPI has no data for agent', () => {
    // Chris is JC-only per brand.ts but not in the KPI fixture below
    const raw = [...makeRawMtdRA(), makeYticaMtdAgent('chris', 50)];
    const kpiMtd = makeKPIMtd();
    const jc = deriveMtdRepActivityForBrand(raw, kpiMtd, makeSummary(), 'jc');
    expect(jc.find(a => a.agent === 'chris')).toBeDefined();
  });

  it('empty KPI → pure fallback to isAgentForBrand', () => {
    const emptyKpi: KPIMtdSummary = { totalConversions: 0, totalCalls: 0, byAgent: [], byDate: [] };
    const result = deriveMtdRepActivityForBrand(makeRawMtdRA(), emptyKpi, makeSummary(), 'jc');
    const names = result.map(a => a.agent.toLowerCase());
    expect(names).not.toContain('desi');
    expect(names).not.toContain('natalie');
    // But blended agents should still show up (fallback uses isAgentForBrand)
    expect(names).toContain('sara');
    expect(names).toContain('wendy');
  });
});

describe('deriveMtdRepActivityForBrand — empty cases', () => {
  it('handles empty raw array without throwing', () => {
    expect(() => deriveMtdRepActivityForBrand([], makeKPIMtd(), makeSummary(), 'jc')).not.toThrow();
    expect(deriveMtdRepActivityForBrand([], makeKPIMtd(), makeSummary(), 'msc')).toEqual([]);
  });
});
