import { describe, it, expect } from 'vitest';
import { buildBrandSummary, deriveBrandView } from '../lib/blender';
import type { PeriodData, PairedCall, RepAgent } from '../lib/types';

// ── Helpers ─────────────────────────────────────────────────────

function makeCall(overrides: Partial<PairedCall>): PairedCall {
  return {
    id: 'CA' + Math.random().toString(36).slice(2, 8),
    time: '2026-04-01T16:00:00Z',
    agent: 'omar',
    from: '+14155551234',
    to: '+16193739225',
    client: 'Sapochnick',
    direction: 'inbound',
    duration: 300,
    totalDuration: 310,
    ringTime: 10,
    status: 'completed',
    resolvedBrand: 'jc',
    ...overrides,
  };
}

function makeAgent(name: string, calls: number, talkMin: number, speedSec: number | null = 10): RepAgent {
  return {
    agent: name,
    calls,
    talkMin,
    speedSec,
    wrapUpSec: 15,
    hoursScheduled: 8,
    conversions: 3,
    convsPerHour: 0.5,
  };
}

function makePeriod(agents: RepAgent[], teamTotal: number): PeriodData {
  return {
    date: '2026-04-01',
    conversions: {
      total: 10,
      byAgent: [],
      byAccount: [],
      hourly: new Array(24).fill(0),
    },
    missedCalls: { total: 5, byAccount: [] },
    repActivity: {
      agents,
      outbound: [{ agent: 'william', callsMade: 5, talkMin: 10 }],
      avgSpeedSec: 10,
    },
    teamStats: {
      totalCalls: teamTotal,
      inbound: teamTotal - 5,
      outbound: 5,
      talkTime: '5h',
      avgTalk: '3m',
      missed: 5,
      missedOver15: 2,
      missedPct: '10%',
      source: 'ytica' as const,
    },
    conversionRate: 20,
  };
}

// ── JC + MSC = Mixed reconciliation ───────────────────────────────

describe('reconciliation: JC + MSC = Mixed', () => {
  const agents = [
    makeAgent('omar', 20, 60, 8),    // JC-only
    makeAgent('burke', 15, 45, 12),   // JC-only
    makeAgent('sue', 10, 30, 14),     // MSC-only
    makeAgent('desi', 8, 25, 16),     // MSC-only
    makeAgent('sara', 12, 35, 10),    // Blended
    makeAgent('wendy', 10, 30, 11),   // Blended
  ];
  const teamTotal = 75;

  // CDR: 40 JC calls, 30 MSC calls, 5 unknown
  const calls: PairedCall[] = [
    ...Array.from({ length: 40 }, () => makeCall({ resolvedBrand: 'jc', duration: 100, status: 'completed' })),
    ...Array.from({ length: 30 }, () => makeCall({ resolvedBrand: 'msc', duration: 100, status: 'completed' })),
    ...Array.from({ length: 5 }, () => makeCall({ resolvedBrand: null, duration: 100, status: 'completed' })),
    // Missed calls
    ...Array.from({ length: 3 }, () => makeCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, client: 'JC Client' })),
    ...Array.from({ length: 2 }, () => makeCall({ resolvedBrand: 'msc', direction: 'inbound', duration: 0, client: 'MSC Client' })),
  ];

  const period = makePeriod(agents, teamTotal);
  const summary = buildBrandSummary(calls);

  it('answered calls: JC + MSC = teamStats total', () => {
    const jc = deriveBrandView(period, 'jc', summary);
    const msc = deriveBrandView(period, 'msc', summary);
    expect(jc.answeredCalls! + msc.answeredCalls!).toBe(teamTotal);
  });

  it('missed calls: JC + MSC = Mixed total missed', () => {
    const jc = deriveBrandView(period, 'jc', summary);
    const msc = deriveBrandView(period, 'msc', summary);
    const mixed = deriveBrandView(period, 'mixed', summary);
    expect(jc.missedCalls.total + msc.missedCalls.total).toBe(
      summary.jc.missed + summary.msc.missed
    );
    // Mixed includes unknown missed too
    expect(mixed.missedCalls.total).toBe(
      summary.jc.missed + summary.msc.missed + summary.unknown.missed
    );
  });

  it('blended agent calls are split: JC + MSC = original total', () => {
    const jc = deriveBrandView(period, 'jc', summary);
    const msc = deriveBrandView(period, 'msc', summary);

    const saraJC = jc.repActivity.agents.find(a => a.agent === 'sara');
    const saraMSC = msc.repActivity.agents.find(a => a.agent === 'sara');
    const saraOrig = agents.find(a => a.agent === 'sara')!;

    expect(saraJC).toBeDefined();
    expect(saraMSC).toBeDefined();
    expect(saraJC!.calls + saraMSC!.calls).toBe(saraOrig.calls);
  });

  it('blended agent talkMin splits sum to original', () => {
    const jc = deriveBrandView(period, 'jc', summary);
    const msc = deriveBrandView(period, 'msc', summary);

    const wendyJC = jc.repActivity.agents.find(a => a.agent === 'wendy');
    const wendyMSC = msc.repActivity.agents.find(a => a.agent === 'wendy');
    const wendyOrig = agents.find(a => a.agent === 'wendy')!;

    expect(wendyJC).toBeDefined();
    expect(wendyMSC).toBeDefined();
    const sum = +(wendyJC!.talkMin + wendyMSC!.talkMin).toFixed(1);
    expect(sum).toBeCloseTo(wendyOrig.talkMin, 0);
  });

  it('JC-only agents have full calls in JC view', () => {
    const jc = deriveBrandView(period, 'jc', summary);
    const omar = jc.repActivity.agents.find(a => a.agent === 'omar');
    expect(omar!.calls).toBe(20); // unchanged
  });

  it('MSC-only agents have full calls in MSC view', () => {
    const msc = deriveBrandView(period, 'msc', summary);
    const sue = msc.repActivity.agents.find(a => a.agent === 'sue');
    expect(sue!.calls).toBe(10); // unchanged
  });

  it('mixed view has all agents', () => {
    const mixed = deriveBrandView(period, 'mixed', summary);
    expect(mixed.repActivity.agents).toHaveLength(6);
  });

  it('jc view answerRate is a round integer percentage', () => {
    const jc = deriveBrandView(period, 'jc', summary);
    expect(Number.isInteger(jc.answerRate!)).toBe(true);
    expect(jc.answerRate!).toBeGreaterThanOrEqual(0);
    expect(jc.answerRate!).toBeLessThanOrEqual(100);
  });

  it('missedCallRate has at most one decimal', () => {
    const jc = deriveBrandView(period, 'jc', summary);
    const rate = jc.missedCallRate!;
    expect(Math.round(rate * 10) / 10).toBe(rate);
  });

  it('teamStats totalCalls is proportionally split', () => {
    const jc = deriveBrandView(period, 'jc', summary);
    const msc = deriveBrandView(period, 'msc', summary);
    expect(jc.teamStats!.totalCalls + msc.teamStats!.totalCalls).toBe(teamTotal);
  });

  it('handles all calls being JC (no MSC)', () => {
    const jcOnlyCalls = Array.from({ length: 30 }, () =>
      makeCall({ resolvedBrand: 'jc', duration: 100, status: 'completed' })
    );
    const sum = buildBrandSummary(jcOnlyCalls);
    const jc = deriveBrandView(period, 'jc', sum);
    const msc = deriveBrandView(period, 'msc', sum);
    expect(jc.answeredCalls!).toBe(teamTotal);
    expect(msc.answeredCalls!).toBe(0);
  });

  it('handles no CDR data — falls back to agent sums', () => {
    const sum = buildBrandSummary([]);
    const jc = deriveBrandView(period, 'jc', sum);
    // Falls back to filtered agent sum
    expect(jc.answeredCalls!).toBeGreaterThan(0);
  });

  it('blended 50/50 when no CDR ratio: JC gets ceil, MSC gets floor', () => {
    // Build summary with no blended agent calls
    const sum = buildBrandSummary([
      makeCall({ agent: 'omar', resolvedBrand: 'jc', duration: 100, status: 'completed' }),
    ]);
    // sara has no CDR ratio → default 50/50 split
    const jc = deriveBrandView(period, 'jc', sum);
    const msc = deriveBrandView(period, 'msc', sum);

    const saraJC = jc.repActivity.agents.find(a => a.agent === 'sara');
    const saraMSC = msc.repActivity.agents.find(a => a.agent === 'sara');
    // 12 calls → JC gets ceil(6) = 6, MSC gets floor(6) = 6
    expect(saraJC!.calls + saraMSC!.calls).toBe(12);
    // Verify ceil/floor: JC >= MSC
    expect(saraJC!.calls).toBeGreaterThanOrEqual(saraMSC!.calls);
  });

  it('handles odd call count split for blended agents', () => {
    const oddAgents = [makeAgent('sara', 7, 21, 10)]; // 7 calls = odd
    const oddPeriod = makePeriod(oddAgents, 7);
    const sum = buildBrandSummary([]); // no CDR ratio → 50/50

    const jc = deriveBrandView(oddPeriod, 'jc', sum);
    const msc = deriveBrandView(oddPeriod, 'msc', sum);
    const saraJC = jc.repActivity.agents.find(a => a.agent === 'sara')!;
    const saraMSC = msc.repActivity.agents.find(a => a.agent === 'sara')!;
    // 7/2: JC=ceil(3.5)=4, MSC=floor(3.5)=3
    expect(saraJC.calls + saraMSC.calls).toBe(7);
    expect(saraJC.calls).toBe(4);
    expect(saraMSC.calls).toBe(3);
  });
});
