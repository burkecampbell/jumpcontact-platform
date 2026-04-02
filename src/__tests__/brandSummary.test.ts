import { describe, it, expect } from 'vitest';
import { buildBrandSummary, deriveBrandView, blendYticaIntoPerioData } from '../lib/blender';
import type { PeriodData, PairedCall, RepAgent, TeamStats } from '../lib/types';
import type { YticaRepActivity } from '../lib/sheets';

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

function makeAgent(name: string, overrides?: Partial<RepAgent>): RepAgent {
  return {
    agent: name,
    calls: 10,
    talkMin: 30,
    speedSec: 10,
    wrapUpSec: 15,
    hoursScheduled: 8,
    conversions: 3,
    convsPerHour: 0.5,
    ...overrides,
  };
}

function makePeriod(agents: RepAgent[], teamTotal = 50): PeriodData {
  return {
    date: '2026-04-01',
    conversions: {
      total: 10,
      byAgent: [{ agent: 'omar', count: 5 }],
      byAccount: [{ account: 'Acme', count: 10 }],
      hourly: new Array(24).fill(0),
    },
    missedCalls: { total: 5, byAccount: [{ account: 'Acme', count: 5 }] },
    repActivity: {
      agents,
      outbound: [],
      avgSpeedSec: 10,
    },
    teamStats: {
      totalCalls: teamTotal,
      inbound: 45,
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

// ── buildBrandSummary ─────────────────────────────────────────────

describe('buildBrandSummary', () => {
  it('buckets JC calls into jc bucket', () => {
    const calls = [
      makeCall({ resolvedBrand: 'jc', duration: 100, status: 'completed' }),
      makeCall({ resolvedBrand: 'jc', duration: 200, status: 'completed' }),
    ];
    const summary = buildBrandSummary(calls);
    expect(summary.jc.answered).toBe(2);
    expect(summary.jc.talkSec).toBe(300);
    expect(summary.msc.answered).toBe(0);
  });

  it('buckets MSC calls into msc bucket', () => {
    const calls = [
      makeCall({ resolvedBrand: 'msc', duration: 150, status: 'completed' }),
    ];
    const summary = buildBrandSummary(calls);
    expect(summary.msc.answered).toBe(1);
    expect(summary.msc.talkSec).toBe(150);
    expect(summary.jc.answered).toBe(0);
  });

  it('counts missed calls (inbound + duration=0)', () => {
    const calls = [
      makeCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, status: 'no-answer', client: 'Sapochnick' }),
      makeCall({ resolvedBrand: 'msc', direction: 'inbound', duration: 0, status: 'no-answer', client: 'Med Spa' }),
    ];
    const summary = buildBrandSummary(calls);
    expect(summary.jc.missed).toBe(1);
    expect(summary.msc.missed).toBe(1);
    expect(summary.missedByBrand.jc.total).toBe(1);
    expect(summary.missedByBrand.msc.total).toBe(1);
  });

  it('tracks missed calls by account', () => {
    const calls = [
      makeCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, status: 'no-answer', client: 'Sapochnick' }),
      makeCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, status: 'no-answer', client: 'Sapochnick' }),
      makeCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, status: 'no-answer', client: 'TTN' }),
    ];
    const summary = buildBrandSummary(calls);
    expect(summary.missedByBrand.jc.byAccount[0]).toEqual({ account: 'Sapochnick', count: 2 });
    expect(summary.missedByBrand.jc.byAccount[1]).toEqual({ account: 'TTN', count: 1 });
  });

  it('sorts missed accounts by count descending', () => {
    const calls = [
      makeCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, client: 'A' }),
      makeCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, client: 'B' }),
      makeCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, client: 'B' }),
      makeCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, client: 'B' }),
    ];
    const summary = buildBrandSummary(calls);
    expect(summary.missedByBrand.jc.byAccount[0].account).toBe('B');
  });

  it('puts unknown-brand calls into unknown bucket', () => {
    const calls = [
      makeCall({ resolvedBrand: null, duration: 100, status: 'completed' }),
    ];
    const summary = buildBrandSummary(calls);
    expect(summary.unknown.answered).toBe(1);
    expect(summary.jc.answered).toBe(0);
    expect(summary.msc.answered).toBe(0);
  });

  it('computes blended agent ratios for sara (blended)', () => {
    const calls = [
      makeCall({ agent: 'sara', resolvedBrand: 'jc', duration: 100, status: 'completed' }),
      makeCall({ agent: 'sara', resolvedBrand: 'jc', duration: 100, status: 'completed' }),
      makeCall({ agent: 'sara', resolvedBrand: 'msc', duration: 100, status: 'completed' }),
    ];
    const summary = buildBrandSummary(calls);
    // Sara = blended agent, 2 JC + 1 MSC = 2/3 JC, 1/3 MSC
    expect(summary.agentRatios['sara']).toBeDefined();
    expect(summary.agentRatios['sara'].jc).toBeCloseTo(2 / 3, 5);
    expect(summary.agentRatios['sara'].msc).toBeCloseTo(1 / 3, 5);
  });

  it('computes blended agent ratios for wendy', () => {
    const calls = [
      makeCall({ agent: 'wendy', resolvedBrand: 'jc', duration: 100, status: 'completed' }),
      makeCall({ agent: 'wendy', resolvedBrand: 'msc', duration: 100, status: 'completed' }),
    ];
    const summary = buildBrandSummary(calls);
    expect(summary.agentRatios['wendy'].jc).toBe(0.5);
    expect(summary.agentRatios['wendy'].msc).toBe(0.5);
  });

  it('only tracks ring time for completed calls with valid ring', () => {
    const calls = [
      makeCall({ resolvedBrand: 'jc', duration: 100, ringTime: 8, status: 'completed' }),
      makeCall({ resolvedBrand: 'jc', duration: 100, ringTime: 200, status: 'completed' }), // > 120, excluded
      makeCall({ resolvedBrand: 'jc', duration: 0, ringTime: 5, status: 'no-answer' }), // missed, not counted
    ];
    const summary = buildBrandSummary(calls);
    expect(summary.jc.ringCount).toBe(1);
    expect(summary.jc.ringSum).toBe(8);
  });

  it('handles empty calls array', () => {
    const summary = buildBrandSummary([]);
    expect(summary.jc.answered).toBe(0);
    expect(summary.msc.answered).toBe(0);
    expect(summary.unknown.answered).toBe(0);
    expect(summary.missedByBrand.jc.total).toBe(0);
    expect(summary.missedByBrand.msc.total).toBe(0);
  });

  it('does not double-count outbound calls', () => {
    const calls = [
      makeCall({ direction: 'outbound', resolvedBrand: 'jc', duration: 100, status: 'completed' }),
    ];
    const summary = buildBrandSummary(calls);
    // Outbound calls are not counted as answered or missed
    expect(summary.jc.answered).toBe(0);
    expect(summary.jc.missed).toBe(0);
  });

  it('labels missed calls with "Unknown" when client is empty', () => {
    const calls = [
      makeCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, client: '' }),
    ];
    const summary = buildBrandSummary(calls);
    expect(summary.missedByBrand.jc.byAccount[0].account).toBe('Unknown');
  });
});

// ── deriveBrandView ───────────────────────────────────────────────

describe('deriveBrandView', () => {
  it('mixed view preserves merged conversions from canonical period', () => {
    const period = makePeriod([
      makeAgent('omar'),
      makeAgent('sue'),
      makeAgent('sara'),
    ]);
    const summary = buildBrandSummary([
      makeCall({ resolvedBrand: 'jc' }),
      makeCall({ resolvedBrand: 'msc' }),
    ]);

    const mixed = deriveBrandView(period, 'mixed', summary);
    expect(mixed.repActivity.agents).toHaveLength(3);
    // Mixed now keeps conversions (JC Sheets + MSC GHL merged upstream in route.ts)
    expect(mixed.conversions.total).toBe(10); // from canonical period
  });

  it('jc view excludes MSC-only agents', () => {
    const period = makePeriod([
      makeAgent('omar'),
      makeAgent('sue'),  // MSC-only
      makeAgent('sara'), // blended
    ]);
    const summary = buildBrandSummary([
      makeCall({ agent: 'sara', resolvedBrand: 'jc', duration: 100, status: 'completed' }),
      makeCall({ agent: 'sara', resolvedBrand: 'msc', duration: 100, status: 'completed' }),
    ]);

    const jc = deriveBrandView(period, 'jc', summary);
    const agentNames = jc.repActivity.agents.map(a => a.agent);
    expect(agentNames).toContain('omar');
    expect(agentNames).not.toContain('sue');
    expect(agentNames).toContain('sara'); // blended appears in JC
  });

  it('msc view includes MSC-only + blended agents', () => {
    const period = makePeriod([
      makeAgent('omar'),
      makeAgent('sue'),
      makeAgent('sara'),
    ]);
    const summary = buildBrandSummary([]);

    const msc = deriveBrandView(period, 'msc', summary);
    const agentNames = msc.repActivity.agents.map(a => a.agent);
    expect(agentNames).not.toContain('omar'); // JC-only
    expect(agentNames).toContain('sue');      // MSC-only
    expect(agentNames).toContain('sara');     // blended
  });

  it('JC + MSC answered = Mixed answered (reconciliation)', () => {
    const period = makePeriod([
      makeAgent('omar', { calls: 20 }),
      makeAgent('sue', { calls: 15 }),
      makeAgent('sara', { calls: 10 }),
    ], 45);

    const jcCalls = Array.from({ length: 25 }, () =>
      makeCall({ resolvedBrand: 'jc', duration: 100, status: 'completed' })
    );
    const mscCalls = Array.from({ length: 20 }, () =>
      makeCall({ resolvedBrand: 'msc', duration: 100, status: 'completed' })
    );
    const summary = buildBrandSummary([...jcCalls, ...mscCalls]);

    const jcView = deriveBrandView(period, 'jc', summary);
    const mscView = deriveBrandView(period, 'msc', summary);
    const mixedView = deriveBrandView(period, 'mixed', summary);

    // JC answered + MSC answered = Mixed total
    expect(jcView.answeredCalls! + mscView.answeredCalls!).toBe(mixedView.answeredCalls!);
  });

  it('handles zero CDR calls gracefully', () => {
    const period = makePeriod([makeAgent('omar')], 50);
    const summary = buildBrandSummary([]);

    const jc = deriveBrandView(period, 'jc', summary);
    expect(jc.answerRate).toBeDefined();
    expect(jc.missedCallRate).toBeDefined();
  });

  it('computes answerRate as integer percentage', () => {
    const period = makePeriod([makeAgent('omar', { calls: 10 })], 10);
    const calls = [
      ...Array.from({ length: 8 }, () => makeCall({ resolvedBrand: 'jc', duration: 100, status: 'completed' })),
      ...Array.from({ length: 2 }, () => makeCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, status: 'no-answer' })),
    ];
    const summary = buildBrandSummary(calls);
    const jc = deriveBrandView(period, 'jc', summary);
    // answerRate = round(answered / totalCalls * 100), always integer
    expect(Number.isInteger(jc.answerRate!)).toBe(true);
    expect(jc.answerRate!).toBeGreaterThan(0);
    expect(jc.answerRate!).toBeLessThanOrEqual(100);
  });

  it('missedCallRate rounds to one decimal', () => {
    const period = makePeriod([makeAgent('omar', { calls: 10 })], 10);
    const calls = [
      ...Array.from({ length: 7 }, () => makeCall({ resolvedBrand: 'jc', duration: 100, status: 'completed' })),
      ...Array.from({ length: 3 }, () => makeCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, status: 'no-answer' })),
    ];
    const summary = buildBrandSummary(calls);
    const jc = deriveBrandView(period, 'jc', summary);
    // missedCallRate = round((missed / totalCalls) * 1000) / 10
    // totalCalls = answeredCalls + missed = proportional teamStats + 3
    const rate = jc.missedCallRate!;
    expect(Math.round(rate * 10) / 10).toBe(rate); // at most 1 decimal
  });

  it('computes fastest pickup from filtered agents', () => {
    const period = makePeriod([
      makeAgent('omar', { speedSec: 12 }),
      makeAgent('burke', { speedSec: 5 }),
    ], 20);
    const summary = buildBrandSummary([
      ...Array.from({ length: 10 }, () => makeCall({ resolvedBrand: 'jc', duration: 100, status: 'completed' })),
    ]);
    const jc = deriveBrandView(period, 'jc', summary);
    expect(jc.fastestPickup).toBe(5);
  });
});

// ── blendYticaIntoPerioData ───────────────────────────────────────

describe('blendYticaIntoPerioData', () => {
  it('returns period unchanged when ytica is null', () => {
    const period = makePeriod([makeAgent('omar')]);
    const result = blendYticaIntoPerioData(period, null);
    expect(result).toEqual(period);
  });

  it('returns period unchanged when ytica has no agents', () => {
    const period = makePeriod([makeAgent('omar')]);
    const ytica: YticaRepActivity = { agents: [], avgSpeedSec: null, source: 'ytica' };
    const result = blendYticaIntoPerioData(period, ytica);
    expect(result).toEqual(period);
  });

  it('blends ytica speed into CDR agent', () => {
    const period = makePeriod([makeAgent('omar', { speedSec: 0, wrapUpSec: null })]);
    const ytica: YticaRepActivity = {
      agents: [{ agent: 'omar', calls: 15, talkMin: 40, speedSec: 8, wrapUpSec: 12, avgHandlingMin: null, inboundConversations: 0, holdTimeSec: null }],
      avgSpeedSec: 8,
      source: 'ytica',
    };
    const result = blendYticaIntoPerioData(period, ytica);
    const omar = result.repActivity.agents.find(a => a.agent === 'omar')!;
    expect(omar.speedSec).toBe(8);  // Ytica fills the gap
    expect(omar.wrapUpSec).toBe(12);
    expect(omar.calls).toBe(15); // Ytica calls preferred
  });

  it('prefers Ytica speed over CDR speed (Ytica = ring time, CDR = total wait)', () => {
    const period = makePeriod([makeAgent('omar', { speedSec: 16 })]);
    const ytica: YticaRepActivity = {
      agents: [{ agent: 'omar', calls: 10, talkMin: 30, speedSec: 5, wrapUpSec: 15, avgHandlingMin: null, inboundConversations: 0, holdTimeSec: null }],
      avgSpeedSec: 5,
      source: 'ytica',
    };
    const result = blendYticaIntoPerioData(period, ytica);
    const omar = result.repActivity.agents.find(a => a.agent === 'omar')!;
    expect(omar.speedSec).toBe(5); // Ytica wins — measures actual ring, not queue+IVR
  });

  it('adds ytica-only agents to the blended list', () => {
    const period = makePeriod([makeAgent('omar')]);
    const ytica: YticaRepActivity = {
      agents: [
        { agent: 'george', calls: 5, talkMin: 10, speedSec: 11, wrapUpSec: 8, avgHandlingMin: null, inboundConversations: 0, holdTimeSec: null },
      ],
      avgSpeedSec: 11,
      source: 'ytica',
    };
    const result = blendYticaIntoPerioData(period, ytica);
    const names = result.repActivity.agents.map(a => a.agent);
    expect(names).toContain('george');
    const george = result.repActivity.agents.find(a => a.agent === 'george')!;
    expect(george.calls).toBe(5);
    expect(george.talkMin).toBe(10);
  });

  it('uses ytica avgSpeedSec for team', () => {
    const period = makePeriod([makeAgent('omar')]);
    const ytica: YticaRepActivity = {
      agents: [{ agent: 'omar', calls: 10, talkMin: 30, speedSec: 9, wrapUpSec: 15, avgHandlingMin: null, inboundConversations: 0, holdTimeSec: null }],
      avgSpeedSec: 9.5,
      source: 'ytica',
    };
    const result = blendYticaIntoPerioData(period, ytica);
    expect(result.repActivity.avgSpeedSec).toBe(9.5);
  });
});
