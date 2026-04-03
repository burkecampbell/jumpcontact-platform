import { describe, it, expect } from 'vitest';
import { deriveBrandView, buildBrandSummary } from '../lib/blender';
import type { PeriodData, PairedCall, BrandCallSummary } from '../lib/types';

// ── Helpers ──────────────────────────────────────────────────────────

function makePairedCall(overrides: Partial<PairedCall> = {}): PairedCall {
  return {
    id: 'CA' + Math.random().toString(36).slice(2, 10),
    time: '2026-04-03T10:00:00Z',
    agent: 'omar',
    from: '+14155551234',
    to: '+18005551234',
    client: 'Sapochnick Law',
    direction: 'inbound',
    duration: 120,
    totalDuration: 130,
    ringTime: 5.2,
    status: 'completed',
    resolvedBrand: 'jc',
    brandSource: 'trunk-phone',
    ...overrides,
  };
}

function makeBasePeriod(agents: PeriodData['repActivity']['agents'] = []): PeriodData {
  return {
    date: '2026-04-03',
    conversions: {
      total: 10,
      byAgent: [
        { agent: 'omar', count: 4 },
        { agent: 'burke', count: 3 },
        { agent: 'sara', count: 2 },
        { agent: 'desi', count: 1 },
      ],
      byAccount: [{ account: 'sapochnick', count: 5 }, { account: 'med spa x', count: 3 }],
      hourly: new Array(24).fill(0),
    },
    missedCalls: { total: 5, byAccount: [] },
    repActivity: {
      agents: agents.length > 0 ? agents : [
        { agent: 'omar', calls: 20, talkMin: 45, speedSec: 6.2, wrapUpSec: 15, hoursScheduled: 9, conversions: 4 },
        { agent: 'burke', calls: 15, talkMin: 35, speedSec: 8.1, wrapUpSec: 12, hoursScheduled: 11, conversions: 3 },
        { agent: 'sara', calls: 10, talkMin: 25, speedSec: 7.5, wrapUpSec: 18, hoursScheduled: 8, conversions: 2 },
        { agent: 'desi', calls: 8, talkMin: 20, speedSec: 9.3, wrapUpSec: 14, hoursScheduled: 8, conversions: 1 },
      ],
      outbound: [],
      avgSpeedSec: 7.8,
    },
    teamStats: { totalCalls: 53, inbound: 48, outbound: 5, talkTime: '2:30:00', avgTalk: '4:00', missed: 5, missedOver15: 2, missedPct: '10.4%', source: 'ytica' as const },
    conversionRate: 18.9,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('deriveBrandView additivity', () => {
  it('JC.answeredCalls + MSC.answeredCalls = Mixed.answeredCalls with CDR data', () => {
    // Build a realistic set of CDR calls with brand tags
    const calls: PairedCall[] = [
      // JC calls
      ...Array.from({ length: 30 }, (_, i) =>
        makePairedCall({ id: `jc${i}`, agent: 'omar', resolvedBrand: 'jc', duration: 120, status: 'completed' }),
      ),
      // MSC calls
      ...Array.from({ length: 20 }, (_, i) =>
        makePairedCall({ id: `msc${i}`, agent: 'desi', resolvedBrand: 'msc', duration: 100, status: 'completed' }),
      ),
      // Missed calls
      makePairedCall({ id: 'missed_jc', resolvedBrand: 'jc', direction: 'inbound', duration: 0, status: 'no-answer', agent: '' }),
      makePairedCall({ id: 'missed_msc', resolvedBrand: 'msc', direction: 'inbound', duration: 0, status: 'no-answer', agent: '' }),
    ];

    const summary = buildBrandSummary(calls);
    const period = makeBasePeriod();

    const jcView = deriveBrandView(period, 'jc', summary);
    const mscView = deriveBrandView(period, 'msc', summary);
    const mixedView = deriveBrandView(period, 'mixed', summary);

    // Core additivity: JC.answeredCalls + MSC.answeredCalls = Mixed.answeredCalls
    expect(jcView.answeredCalls! + mscView.answeredCalls!).toBe(mixedView.answeredCalls!);
  });

  it('JC.totalCalls + MSC.totalCalls = Mixed.totalCalls', () => {
    const calls: PairedCall[] = [
      ...Array.from({ length: 25 }, (_, i) =>
        makePairedCall({ id: `jc${i}`, agent: 'burke', resolvedBrand: 'jc', duration: 90, status: 'completed' }),
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        makePairedCall({ id: `msc${i}`, agent: 'natalie', resolvedBrand: 'msc', duration: 80, status: 'completed' }),
      ),
      makePairedCall({ id: 'miss_jc1', resolvedBrand: 'jc', direction: 'inbound', duration: 0, status: 'no-answer', agent: '' }),
      makePairedCall({ id: 'miss_jc2', resolvedBrand: 'jc', direction: 'inbound', duration: 0, status: 'no-answer', agent: '' }),
      makePairedCall({ id: 'miss_msc1', resolvedBrand: 'msc', direction: 'inbound', duration: 0, status: 'no-answer', agent: '' }),
    ];

    const summary = buildBrandSummary(calls);
    const period = makeBasePeriod([
      { agent: 'burke', calls: 25, talkMin: 37.5, speedSec: 8.1, wrapUpSec: 12, hoursScheduled: 11, conversions: 3 },
      { agent: 'natalie', calls: 15, talkMin: 20, speedSec: 10.0, wrapUpSec: 14, hoursScheduled: 8, conversions: 1 },
    ]);

    const jcView = deriveBrandView(period, 'jc', summary);
    const mscView = deriveBrandView(period, 'msc', summary);
    const mixedView = deriveBrandView(period, 'mixed', summary);

    expect(jcView.totalCalls! + mscView.totalCalls!).toBe(mixedView.totalCalls!);
  });

  it('missed calls additivity: JC.missed + MSC.missed = Mixed.missed', () => {
    const calls: PairedCall[] = [
      makePairedCall({ id: 'miss1', resolvedBrand: 'jc', direction: 'inbound', duration: 0, status: 'no-answer', agent: '', client: 'Sapochnick' }),
      makePairedCall({ id: 'miss2', resolvedBrand: 'jc', direction: 'inbound', duration: 0, status: 'no-answer', agent: '', client: 'TTN' }),
      makePairedCall({ id: 'miss3', resolvedBrand: 'msc', direction: 'inbound', duration: 0, status: 'no-answer', agent: '', client: 'Med Spa' }),
      makePairedCall({ id: 'ans1', resolvedBrand: 'jc', duration: 120, status: 'completed' }),
      makePairedCall({ id: 'ans2', resolvedBrand: 'msc', duration: 100, status: 'completed', agent: 'desi' }),
    ];

    const summary = buildBrandSummary(calls);
    const period = makeBasePeriod();

    const jcView = deriveBrandView(period, 'jc', summary);
    const mscView = deriveBrandView(period, 'msc', summary);
    const mixedView = deriveBrandView(period, 'mixed', summary);

    expect(jcView.missedCalls.total + mscView.missedCalls.total).toBe(mixedView.missedCalls.total);
  });

  it('handles blended agents — calls split between brands', () => {
    // Sara is a blended agent who takes both JC and MSC calls
    const calls: PairedCall[] = [
      // Sara's JC calls
      ...Array.from({ length: 6 }, (_, i) =>
        makePairedCall({ id: `sara_jc${i}`, agent: 'sara', resolvedBrand: 'jc', duration: 120, status: 'completed', ringTime: 7.5 }),
      ),
      // Sara's MSC calls
      ...Array.from({ length: 4 }, (_, i) =>
        makePairedCall({ id: `sara_msc${i}`, agent: 'sara', resolvedBrand: 'msc', duration: 100, status: 'completed', ringTime: 7.5 }),
      ),
      // Omar's JC-only calls
      ...Array.from({ length: 20 }, (_, i) =>
        makePairedCall({ id: `omar_jc${i}`, agent: 'omar', resolvedBrand: 'jc', duration: 150, status: 'completed', ringTime: 6.2 }),
      ),
      // Desi's MSC-only calls
      ...Array.from({ length: 12 }, (_, i) =>
        makePairedCall({ id: `desi_msc${i}`, agent: 'desi', resolvedBrand: 'msc', duration: 90, status: 'completed', ringTime: 9.0 }),
      ),
    ];

    const summary = buildBrandSummary(calls);

    // Verify blended agent ratio was computed
    expect(summary.agentRatios['sara']).toBeDefined();
    expect(summary.agentRatios['sara'].jc).toBeCloseTo(0.6, 1);
    expect(summary.agentRatios['sara'].msc).toBeCloseTo(0.4, 1);

    const period = makeBasePeriod([
      { agent: 'omar', calls: 20, talkMin: 50, speedSec: 6.2, wrapUpSec: 12, hoursScheduled: 9, conversions: 5 },
      { agent: 'sara', calls: 10, talkMin: 18.3, speedSec: 7.5, wrapUpSec: 15, hoursScheduled: 8, conversions: 3 },
      { agent: 'desi', calls: 12, talkMin: 18, speedSec: 9.0, wrapUpSec: 14, hoursScheduled: 8, conversions: 1 },
    ]);

    const jcView = deriveBrandView(period, 'jc', summary);
    const mscView = deriveBrandView(period, 'msc', summary);

    // Sara should appear in both views with split calls
    const saraJC = jcView.repActivity.agents.find(a => a.agent === 'sara');
    const saraMSC = mscView.repActivity.agents.find(a => a.agent === 'sara');

    // At least one view should have Sara (she has calls in both brands)
    const saraJCCalls = saraJC?.calls ?? 0;
    const saraMSCCalls = saraMSC?.calls ?? 0;

    // The split should add up to original
    expect(saraJCCalls + saraMSCCalls).toBe(10);
  });

  it('mixed view returns all agents (no filtering)', () => {
    const calls: PairedCall[] = [
      makePairedCall({ agent: 'omar', resolvedBrand: 'jc', status: 'completed' }),
      makePairedCall({ agent: 'desi', resolvedBrand: 'msc', status: 'completed' }),
      makePairedCall({ agent: 'sara', resolvedBrand: 'jc', status: 'completed' }),
    ];

    const summary = buildBrandSummary(calls);
    const period = makeBasePeriod();
    const mixedView = deriveBrandView(period, 'mixed', summary);

    // Mixed keeps all agents from the original period
    const agentNames = mixedView.repActivity.agents.map(a => a.agent);
    expect(agentNames).toContain('omar');
    expect(agentNames).toContain('desi');
    expect(agentNames).toContain('sara');
  });

  it('JC view excludes MSC-only agents', () => {
    const calls: PairedCall[] = [
      makePairedCall({ agent: 'omar', resolvedBrand: 'jc', status: 'completed' }),
      makePairedCall({ agent: 'desi', resolvedBrand: 'msc', status: 'completed' }),
    ];

    const summary = buildBrandSummary(calls);
    const period = makeBasePeriod();
    const jcView = deriveBrandView(period, 'jc', summary);

    const agentNames = jcView.repActivity.agents.map(a => a.agent);
    expect(agentNames).toContain('omar');
    expect(agentNames).not.toContain('desi');
  });

  it('MSC view excludes JC-only agents', () => {
    const calls: PairedCall[] = [
      makePairedCall({ agent: 'omar', resolvedBrand: 'jc', status: 'completed' }),
      makePairedCall({ agent: 'desi', resolvedBrand: 'msc', status: 'completed' }),
    ];

    const summary = buildBrandSummary(calls);
    const period = makeBasePeriod();
    const mscView = deriveBrandView(period, 'msc', summary);

    const agentNames = mscView.repActivity.agents.map(a => a.agent);
    expect(agentNames).not.toContain('omar');
    expect(agentNames).toContain('desi');
  });

  it('buildBrandSummary correctly buckets answered and missed', () => {
    const calls: PairedCall[] = [
      makePairedCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 120, status: 'completed' }),
      makePairedCall({ resolvedBrand: 'jc', direction: 'inbound', duration: 0, status: 'no-answer' }),
      makePairedCall({ resolvedBrand: 'msc', direction: 'inbound', duration: 90, status: 'completed' }),
      makePairedCall({ resolvedBrand: 'msc', direction: 'inbound', duration: 0, status: 'no-answer' }),
      makePairedCall({ resolvedBrand: 'msc', direction: 'inbound', duration: 0, status: 'no-answer' }),
    ];

    const summary = buildBrandSummary(calls);
    expect(summary.jc.answered).toBe(1);
    expect(summary.jc.missed).toBe(1);
    expect(summary.msc.answered).toBe(1);
    expect(summary.msc.missed).toBe(2);
  });
});
