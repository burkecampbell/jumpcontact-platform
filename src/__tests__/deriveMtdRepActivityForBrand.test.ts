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

function makeSummary(ratios: Record<string, { jc: number; msc: number }> = {}): BrandCallSummary {
  return {
    jc: { answered: 0, missed: 0, talkSec: 0, ringSum: 0, ringCount: 0 },
    msc: { answered: 0, missed: 0, talkSec: 0, ringSum: 0, ringCount: 0 },
    unknown: { answered: 0, missed: 0, talkSec: 0, ringSum: 0, ringCount: 0 },
    agentRatios: ratios,
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

describe('deriveMtdRepActivityForBrand — blended agents', () => {
  it('blended agents appear in both JC and MSC views (split proportionally)', () => {
    const summary = makeSummary({
      sara: { jc: 0.7, msc: 0.3 },
      wendy: { jc: 0.4, msc: 0.6 },
    });
    const jc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), summary, 'jc');
    const msc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), summary, 'msc');

    const saraJc = jc.find(a => a.agent.toLowerCase() === 'sara');
    const saraMsc = msc.find(a => a.agent.toLowerCase() === 'sara');
    expect(saraJc).toBeDefined();
    expect(saraMsc).toBeDefined();

    // Sara 30 calls: 70/30 split → 21 + 9
    expect(saraJc!.totalCalls).toBe(21);
    expect(saraMsc!.totalCalls).toBe(9);
  });

  it('additivity on blended agent totalCalls (JC + MSC = raw)', () => {
    const summary = makeSummary({
      sara: { jc: 0.7, msc: 0.3 },
      wendy: { jc: 0.4, msc: 0.6 },
    });
    const jc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), summary, 'jc');
    const msc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), summary, 'msc');

    const agents = ['sara', 'wendy'];
    for (const name of agents) {
      const jcCalls = jc.find(a => a.agent.toLowerCase() === name)?.totalCalls ?? 0;
      const mscCalls = msc.find(a => a.agent.toLowerCase() === name)?.totalCalls ?? 0;
      const rawCalls = makeRawMtdRA().find(a => a.agent.toLowerCase() === name)!.totalCalls;
      expect(jcCalls + mscCalls).toBe(rawCalls);
    }
  });

  it('blended agents get 50/50 split when no CDR ratios', () => {
    const summary = makeSummary({});
    const jc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), summary, 'jc');
    const msc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), summary, 'msc');

    const sara30 = makeRawMtdRA().find(a => a.agent === 'sara')!.totalCalls;
    const saraJc = jc.find(a => a.agent.toLowerCase() === 'sara')?.totalCalls ?? 0;
    const saraMsc = msc.find(a => a.agent.toLowerCase() === 'sara')?.totalCalls ?? 0;

    // Exact additivity: 15 + 15 = 30
    expect(saraJc + saraMsc).toBe(sara30);
  });
});

describe('deriveMtdRepActivityForBrand — KPI-driven vs fallback', () => {
  it('uses KPI team tags when available', () => {
    const result = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), makeSummary(), 'jc');
    // omar and burke tagged 'jc' in KPI — included
    expect(result.find(a => a.agent === 'omar')).toBeDefined();
    expect(result.find(a => a.agent === 'burke')).toBeDefined();
  });

  it('falls back to isAgentForBrand when KPI has no data for agent', () => {
    const raw = [...makeRawMtdRA(), makeYticaMtdAgent('chris', 50)]; // chris is JC per brand.ts but not in KPI
    const kpiMtd = makeKPIMtd(); // no chris
    const jc = deriveMtdRepActivityForBrand(raw, kpiMtd, makeSummary(), 'jc');

    // Chris is JC_ONLY_AGENTS per brand.ts — fallback should include him
    expect(jc.find(a => a.agent === 'chris')).toBeDefined();
  });

  it('empty KPI → pure fallback to isAgentForBrand', () => {
    const emptyKpi: KPIMtdSummary = { totalConversions: 0, totalCalls: 0, byAgent: [], byDate: [] };
    const result = deriveMtdRepActivityForBrand(makeRawMtdRA(), emptyKpi, makeSummary(), 'jc');

    // With no KPI, relies on brand.ts MSC_ONLY_AGENTS set → desi, natalie excluded
    const names = result.map(a => a.agent.toLowerCase());
    expect(names).not.toContain('desi');
    expect(names).not.toContain('natalie');
  });
});

describe('deriveMtdRepActivityForBrand — empty cases', () => {
  it('handles empty raw array without throwing', () => {
    expect(() => deriveMtdRepActivityForBrand([], makeKPIMtd(), makeSummary(), 'jc')).not.toThrow();
    expect(deriveMtdRepActivityForBrand([], makeKPIMtd(), makeSummary(), 'msc')).toEqual([]);
  });

  it('removes blended agents with zero share for the brand', () => {
    const summary = makeSummary({ sara: { jc: 1.0, msc: 0.0 } });
    const msc = deriveMtdRepActivityForBrand(makeRawMtdRA(), makeKPIMtd(), summary, 'msc');
    // Sara has 0% MSC share → shouldn't appear (she's 0 calls on MSC)
    expect(msc.find(a => a.agent.toLowerCase() === 'sara')).toBeUndefined();
  });
});
