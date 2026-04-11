import { describe, it, expect } from 'vitest';
import { buildTeamSummary } from '../app/api/calls/route';
import type { YticaTeamStats } from '../lib/sheets';

// ── Helpers ──────────────────────────────────────────────────────────

interface MinimalCall {
  time: string;
  agent: string;
  phone: string;
  duration: number;
  direction: 'inbound' | 'outbound';
}

function makeTeamStats(overrides: Partial<YticaTeamStats> = {}): YticaTeamStats {
  return {
    totalCalls: 100,
    inbound: 60,
    outbound: 40,
    talkTime: '10:00:00',  // 600 minutes
    avgTalk: '0:06:00',
    missed: 5,
    missedOver15: 2,
    missedPct: '5.0%',
    ...overrides,
  };
}

function makeCall(overrides: Partial<MinimalCall> = {}): MinimalCall {
  return {
    time: '2026-04-10T10:00:00Z',
    agent: 'omar',
    phone: '+14155551234',
    duration: 120,
    direction: 'inbound',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('buildTeamSummary — Mixed brand', () => {
  it('Mixed with brandCalls populated derives from CDR (primary path)', () => {
    const teamStats = [makeTeamStats({ totalCalls: 500, talkTime: '50:00:00' })];
    const brandCalls: MinimalCall[] = [
      makeCall({ direction: 'inbound', duration: 300 }),
      makeCall({ direction: 'inbound', duration: 180 }),
      makeCall({ direction: 'outbound', duration: 120 }),
    ];
    const result = buildTeamSummary(teamStats, 'mixed', brandCalls);

    // CDR is primary — teamStats ignored when brandCalls is non-empty
    expect(result.totalCalls).toBe(3);
    expect(result.inbound).toBe(2);
    expect(result.outbound).toBe(1);
    expect(result.totalTalkMin).toBe(10);
  });

  it('Mixed falls back to YticaTeamStats when brandCalls is empty', () => {
    const teamStats = [
      makeTeamStats({ totalCalls: 50, inbound: 30, outbound: 20, talkTime: '5:00:00' }),
      makeTeamStats({ totalCalls: 50, inbound: 30, outbound: 20, talkTime: '5:00:00' }),
    ];
    const result = buildTeamSummary(teamStats, 'mixed', []);

    expect(result.totalCalls).toBe(100);
    expect(result.inbound).toBe(60);
    expect(result.outbound).toBe(40);
    expect(result.totalTalkMin).toBe(600);
  });

  it('Mixed returns zero summary when both sources are empty', () => {
    const result = buildTeamSummary([], 'mixed', []);
    expect(result.totalCalls).toBe(0);
    expect(result.totalTalkMin).toBe(0);
  });
});

describe('buildTeamSummary — JC brand', () => {
  it('JC returns summary derived from brandCalls (not teamStats)', () => {
    const teamStats = [makeTeamStats({ totalCalls: 500, talkTime: '50:00:00' })];
    const brandCalls: MinimalCall[] = [
      makeCall({ direction: 'inbound', duration: 300 }),  // 5 min
      makeCall({ direction: 'inbound', duration: 180 }),  // 3 min
      makeCall({ direction: 'outbound', duration: 120 }), // 2 min
    ];
    const result = buildTeamSummary(teamStats, 'jc', brandCalls);

    expect(result.totalCalls).toBe(3);
    expect(result.inbound).toBe(2);
    expect(result.outbound).toBe(1);
    expect(result.totalTalkMin).toBe(10);  // 600s / 60
  });

  it('JC with empty brandCalls returns zero summary', () => {
    const teamStats = [makeTeamStats({ totalCalls: 500 })];
    const result = buildTeamSummary(teamStats, 'jc', []);

    expect(result.totalCalls).toBe(0);
    expect(result.inbound).toBe(0);
    expect(result.outbound).toBe(0);
    expect(result.totalTalkMin).toBe(0);
  });
});

describe('buildTeamSummary — MSC brand', () => {
  it('MSC returns summary derived from brandCalls (not teamStats)', () => {
    const teamStats = [makeTeamStats({ totalCalls: 500, talkTime: '50:00:00' })];
    const brandCalls: MinimalCall[] = [
      makeCall({ agent: 'desi', direction: 'inbound', duration: 240 }),  // 4 min
      makeCall({ agent: 'natalie', direction: 'inbound', duration: 360 }), // 6 min
    ];
    const result = buildTeamSummary(teamStats, 'msc', brandCalls);

    expect(result.totalCalls).toBe(2);
    expect(result.inbound).toBe(2);
    expect(result.outbound).toBe(0);
    expect(result.totalTalkMin).toBe(10);  // 600s / 60
  });

  it('MSC totalTalkMin differs from Mixed when passed different brandCalls', () => {
    const teamStats = [makeTeamStats({ totalCalls: 200, talkTime: '10:00:00' })];
    const mscCalls: MinimalCall[] = [
      makeCall({ agent: 'desi', direction: 'inbound', duration: 1200 }), // 20 min
    ];
    const allCalls: MinimalCall[] = [
      ...mscCalls,
      makeCall({ direction: 'inbound', duration: 1800 }), // +30 min JC
    ];

    // Mixed gets all calls, MSC gets only MSC calls
    const mixed = buildTeamSummary(teamStats, 'mixed', allCalls);
    const msc = buildTeamSummary(teamStats, 'msc', mscCalls);

    expect(mixed.totalTalkMin).toBe(50);
    expect(msc.totalTalkMin).toBe(20);
    expect(mixed.totalTalkMin).not.toBe(msc.totalTalkMin);
  });
});

describe('buildTeamSummary — the bug Burke explicitly called out', () => {
  it('JC, MSC, and Mixed return different totalTalkMin values for the same range', () => {
    // All three brands derive from brand-filtered CDR calls. In production,
    // the brand-filter happens upstream in the route; here we pass different
    // brandCalls arrays for each brand.
    const teamStats = [makeTeamStats({ totalCalls: 1000, talkTime: '21:21:00' })];
    const jcCalls: MinimalCall[] = Array.from({ length: 40 }, () =>
      makeCall({ direction: 'inbound', duration: 900 })); // 40 * 15 min = 600 min
    const mscCalls: MinimalCall[] = Array.from({ length: 40 }, () =>
      makeCall({ direction: 'inbound', duration: 1020 })); // 40 * 17 min = 680 min
    const allCalls: MinimalCall[] = [...jcCalls, ...mscCalls]; // 1280 min

    const jc = buildTeamSummary(teamStats, 'jc', jcCalls);
    const msc = buildTeamSummary(teamStats, 'msc', mscCalls);
    const mixed = buildTeamSummary(teamStats, 'mixed', allCalls);

    expect(jc.totalTalkMin).toBe(600);
    expect(msc.totalTalkMin).toBe(680);
    expect(mixed.totalTalkMin).toBe(1280);

    // All three values must be distinct — this is the exact bug report
    expect(new Set([mixed.totalTalkMin, jc.totalTalkMin, msc.totalTalkMin]).size).toBe(3);
    // And additivity should hold for CDR-derived summaries
    expect(jc.totalTalkMin + msc.totalTalkMin).toBe(mixed.totalTalkMin);
  });
});
