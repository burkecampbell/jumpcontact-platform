import { describe, it, expect } from 'vitest';
import { buildBrandSummary, deriveBrandView } from '../lib/blender';
import type { PeriodData, PairedCall, BrandCallSummary } from '../lib/types';

// ── Test fixtures ────────────────────────────────────────────────────

function makePeriod(agents: string[]): PeriodData {
  return {
    date: '2026-04-01',
    conversions: {
      total: 10,
      byAgent: [{ agent: 'omar', count: 5 }, { agent: 'sue', count: 3 }, { agent: 'wendy', count: 2 }],
      byAccount: [{ account: 'Acme', count: 10 }],
      hourly: new Array(24).fill(0),
    },
    missedCalls: { total: 10, byAccount: [{ account: 'Acme', count: 10 }] },
    repActivity: {
      agents: agents.map(a => ({
        agent: a,
        calls: 10,
        talkMin: 30,
        speedSec: a === 'wendy' ? 16 : a === 'sara' ? 5 : 10,
        wrapUpSec: 15,
        hoursScheduled: 8,
        conversions: 3,
        convsPerHour: 0.5,
      })),
      outbound: agents.map(a => ({ agent: a, callsMade: 2, talkMin: 5 })),
      avgSpeedSec: 10,
    },
    teamStats: {
      totalCalls: 50, inbound: 45, outbound: 5,
      talkTime: '5h', avgTalk: '3m', missed: 10,
      missedOver15: 2, missedPct: '18%', source: 'ytica' as const,
    },
    conversionRate: 20,
  };
}

/** Build a summary where Wendy is 70% JC / 30% MSC, Sara is 50/50,
 *  and missed calls are 6 JC + 4 MSC */
function makeSummary(): BrandCallSummary {
  return {
    jc: { answered: 25, missed: 6, talkSec: 3000, ringSum: 200, ringCount: 20 },
    msc: { answered: 18, missed: 4, talkSec: 2000, ringSum: 180, ringCount: 15 },
    unknown: { answered: 2, missed: 0, talkSec: 100, ringSum: 0, ringCount: 0 },
    agentRatios: {
      wendy: { jc: 0.7, msc: 0.3 },
      sara: { jc: 0.5, msc: 0.5 },
    },
    missedByBrand: {
      jc: { total: 6, byAccount: [{ account: 'JC Client', count: 6 }] },
      msc: { total: 4, byAccount: [{ account: 'MSC Client', count: 4 }] },
    },
  };
}

const ALL_AGENTS = ['omar', 'burke', 'sue', 'desi', 'wendy', 'sara'];

// ── Tests ────────────────────────────────────────────────────────────

describe('deriveBrandView', () => {
  const period = makePeriod(ALL_AGENTS);
  const summary = makeSummary();

  describe('Mixed view', () => {
    const mixed = deriveBrandView(period, 'mixed', summary);

    it('keeps ALL agents', () => {
      expect(mixed.repActivity.agents).toHaveLength(ALL_AGENTS.length);
    });

    it('uses teamStats.totalCalls for headline', () => {
      expect(mixed.answeredCalls).toBe(50); // from teamStats
    });

    it('sums all missed calls', () => {
      expect(mixed.missedCalls.total).toBe(10); // 6 + 4 + 0 unknown
    });

    it('strips conversions (incompatible sources)', () => {
      expect(mixed.conversions.total).toBe(0);
      expect(mixed.conversionRate).toBeNull();
    });
  });

  describe('JC view', () => {
    const jc = deriveBrandView(period, 'jc', summary);

    it('excludes MSC-only agents (sue, desi)', () => {
      const names = jc.repActivity.agents.map(a => a.agent);
      expect(names).toContain('omar');
      expect(names).toContain('burke');
      expect(names).toContain('wendy');
      expect(names).toContain('sara');
      expect(names).not.toContain('sue');
      expect(names).not.toContain('desi');
    });

    it('splits blended agent calls by JC ratio', () => {
      const wendy = jc.repActivity.agents.find(a => a.agent === 'wendy')!;
      expect(wendy.calls).toBe(7); // 10 * 0.7
      const sara = jc.repActivity.agents.find(a => a.agent === 'sara')!;
      expect(sara.calls).toBe(5); // 10 * 0.5
    });

    it('uses brand-specific missed calls', () => {
      expect(jc.missedCalls.total).toBe(6);
    });

    it('derives answeredCalls from teamStats proportionally', () => {
      // teamStats.totalCalls=50, jc.answered=25, msc.answered=18, total known=43
      // jcShare = round(50 * 25/43) = round(29.07) = 29
      expect(jc.answeredCalls).toBe(29);
    });

    it('computes brand-specific speed average', () => {
      // JC agents: omar(10), burke(10), wendy(16), sara(5) → avg = (10+10+16+5)/4 = 10.25 → 10.3
      expect(jc.repActivity.avgSpeedSec).toBe(10.3);
    });
  });

  describe('MSC view', () => {
    const msc = deriveBrandView(period, 'msc', summary);

    it('keeps MSC-only + blended agents', () => {
      const names = msc.repActivity.agents.map(a => a.agent);
      expect(names).toContain('sue');
      expect(names).toContain('desi');
      expect(names).toContain('wendy');
      expect(names).toContain('sara');
      expect(names).not.toContain('omar');
      expect(names).not.toContain('burke');
    });

    it('splits blended agent calls by MSC ratio', () => {
      const wendy = msc.repActivity.agents.find(a => a.agent === 'wendy')!;
      expect(wendy.calls).toBe(3); // 10 * 0.3
      const sara = msc.repActivity.agents.find(a => a.agent === 'sara')!;
      expect(sara.calls).toBe(5); // 10 * 0.5
    });

    it('uses brand-specific missed calls', () => {
      expect(msc.missedCalls.total).toBe(4);
    });

    it('derives answeredCalls as teamTotal - JC (rounding guarantee)', () => {
      // MSC = teamTotal - jcShare = 50 - 29 = 21
      expect(msc.answeredCalls).toBe(21);
    });
  });

  // ── CRITICAL: Additivity constraints ────────────────────────────

  describe('JC + MSC = Mixed (additivity)', () => {
    const jc = deriveBrandView(period, 'jc', summary);
    const msc = deriveBrandView(period, 'msc', summary);
    const mixed = deriveBrandView(period, 'mixed', summary);

    it('answeredCalls: JC + MSC = Mixed', () => {
      expect(jc.answeredCalls! + msc.answeredCalls!).toBe(mixed.answeredCalls);
    });

    it('missedCalls: JC + MSC = Mixed', () => {
      expect(jc.missedCalls.total + msc.missedCalls.total).toBe(mixed.missedCalls.total);
    });

    it('totalCalls: JC + MSC = Mixed', () => {
      expect(jc.totalCalls! + msc.totalCalls!).toBe(mixed.totalCalls);
    });

    it('blended agent calls sum to original', () => {
      const wendyJC = jc.repActivity.agents.find(a => a.agent === 'wendy')!.calls;
      const wendyMSC = msc.repActivity.agents.find(a => a.agent === 'wendy')!.calls;
      expect(wendyJC + wendyMSC).toBe(10); // original calls

      const saraJC = jc.repActivity.agents.find(a => a.agent === 'sara')!.calls;
      const saraMSC = msc.repActivity.agents.find(a => a.agent === 'sara')!.calls;
      expect(saraJC + saraMSC).toBe(10);
    });
  });
});

describe('no-ratio fallback (blended agent with no CDR data)', () => {
  // Sara has calls but NO CDR ratio — should split 50/50 not zero
  const noRatioSummary: BrandCallSummary = {
    ...makeSummary(),
    agentRatios: { wendy: { jc: 0.7, msc: 0.3 } }, // Sara missing!
  };
  const period = makePeriod(['omar', 'sue', 'wendy', 'sara']);

  it('splits evenly when no CDR ratio exists', () => {
    const jc = deriveBrandView(period, 'jc', noRatioSummary);
    const msc = deriveBrandView(period, 'msc', noRatioSummary);
    const saraJC = jc.repActivity.agents.find(a => a.agent === 'sara')!.calls;
    const saraMSC = msc.repActivity.agents.find(a => a.agent === 'sara')!.calls;
    expect(saraJC).toBe(5);  // ceil(10/2)
    expect(saraMSC).toBe(5); // floor(10/2)
    expect(saraJC + saraMSC).toBe(10); // exact additivity
  });

  it('handles odd call counts exactly', () => {
    const oddPeriod = makePeriod(['omar', 'sue', 'wendy', 'sara']);
    oddPeriod.repActivity.agents.find(a => a.agent === 'sara')!.calls = 17;
    const jc = deriveBrandView(oddPeriod, 'jc', noRatioSummary);
    const msc = deriveBrandView(oddPeriod, 'msc', noRatioSummary);
    const saraJC = jc.repActivity.agents.find(a => a.agent === 'sara')!.calls;
    const saraMSC = msc.repActivity.agents.find(a => a.agent === 'sara')!.calls;
    expect(saraJC + saraMSC).toBe(17); // ceil(9) + floor(8) = 17
  });
});

describe('buildBrandSummary', () => {
  it('buckets calls by brand correctly', () => {
    const calls: PairedCall[] = [
      { id: '1', time: '', agent: 'omar', from: '', to: '', client: 'JC Client', direction: 'inbound', duration: 60, totalDuration: 60, ringTime: 5, status: 'completed', resolvedBrand: 'jc', brandSource: 'client-name' },
      { id: '2', time: '', agent: 'sue', from: '', to: '', client: 'MSC Client', direction: 'inbound', duration: 30, totalDuration: 30, ringTime: 8, status: 'completed', resolvedBrand: 'msc', brandSource: 'client-name' },
      { id: '3', time: '', agent: '', from: '', to: '', client: 'JC Client', direction: 'inbound', duration: 0, totalDuration: 0, ringTime: 0, status: 'no-answer', resolvedBrand: 'jc', brandSource: 'client-name' },
      { id: '4', time: '', agent: '', from: '', to: '', client: 'MSC Client', direction: 'inbound', duration: 0, totalDuration: 0, ringTime: 0, status: 'no-answer', resolvedBrand: 'msc', brandSource: 'client-name' },
    ];

    const summary = buildBrandSummary(calls);
    expect(summary.jc.answered).toBe(1);
    expect(summary.jc.missed).toBe(1);
    expect(summary.msc.answered).toBe(1);
    expect(summary.msc.missed).toBe(1);
    expect(summary.missedByBrand.jc.total).toBe(1);
    expect(summary.missedByBrand.msc.total).toBe(1);
  });

  it('computes blended agent ratios', () => {
    const calls: PairedCall[] = [
      { id: '1', time: '', agent: 'wendy', from: '', to: '', client: '', direction: 'inbound', duration: 60, totalDuration: 60, ringTime: 5, status: 'completed', resolvedBrand: 'jc', brandSource: 'trunk-phone' },
      { id: '2', time: '', agent: 'wendy', from: '', to: '', client: '', direction: 'inbound', duration: 60, totalDuration: 60, ringTime: 5, status: 'completed', resolvedBrand: 'jc', brandSource: 'trunk-phone' },
      { id: '3', time: '', agent: 'wendy', from: '', to: '', client: '', direction: 'inbound', duration: 60, totalDuration: 60, ringTime: 5, status: 'completed', resolvedBrand: 'msc', brandSource: 'trunk-phone' },
    ];

    const summary = buildBrandSummary(calls);
    // 2 JC + 1 MSC = 67% JC
    expect(summary.agentRatios['wendy'].jc).toBeCloseTo(0.667, 2);
    expect(summary.agentRatios['wendy'].msc).toBeCloseTo(0.333, 2);
  });
});
