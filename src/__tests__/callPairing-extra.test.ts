import { describe, it, expect } from 'vitest';
import { pairCallLegs } from '../lib/twilio';
import { xName, emptyAct } from '../lib/daily-analytics';
import type { CallLeg } from '../lib/types';

function leg(overrides: Partial<CallLeg> & Pick<CallLeg, 'sid' | 'from' | 'to' | 'direction'>): CallLeg {
  return {
    status: 'completed',
    startTime: '2026-04-01T16:00:00Z',
    endTime: '2026-04-01T16:05:00Z',
    duration: 300,
    queueTime: 0,
    ...overrides,
  };
}

describe('pairCallLegs — additional edge cases', () => {
  it('handles empty legs array', () => {
    expect(pairCallLegs([])).toEqual([]);
  });

  it('pairs via intermediate parent SID chain (two-hop)', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'IN_ORIG', from: '+14155551234', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:00:00Z' }),
      // Conference leg whose parent is the inbound leg
      leg({ sid: 'CONF1', from: '+14155551234', to: '+16193739225', direction: 'outbound-api', startTime: '2026-04-01T16:00:05Z', parentCallSid: 'IN_ORIG' }),
      // Agent leg whose parent is the conference leg (not the inbound directly)
      leg({ sid: 'AG_CHAIN', from: '+16193739225', to: 'client:ian_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:03:00Z', parentCallSid: 'CONF1' }),
    ];
    const result = pairCallLegs(legs);
    const ian = result.find(c => c.agent === 'ian');
    expect(ian).toBeDefined();
    expect(ian!.id).toBe('IN_ORIG');
    expect(ian!.pairMethod).toBe('parent-sid');
  });

  it('sets pairMethod to "missed" for unmatched inbound', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'MISS1', from: '+14155551234', to: '+16193739225', direction: 'inbound', duration: 0, status: 'no-answer' }),
    ];
    const result = pairCallLegs(legs);
    expect(result[0].pairMethod).toBe('missed');
  });

  it('sets pairMethod to "outbound" for agent-initiated', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'OB1', from: '+16193739225', to: '+14155559999', direction: 'outbound-api', duration: 120 }),
    ];
    const result = pairCallLegs(legs);
    expect(result[0].pairMethod).toBe('outbound');
    expect(result[0].direction).toBe('outbound');
  });

  it('sets pairMethod to "trunk-match" for same-trunk pair', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'IN_T', from: '+14155551234', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:00:00Z' }),
      leg({ sid: 'AG_T', from: '+16193739225', to: 'client:omar_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:00:05Z' }),
    ];
    const result = pairCallLegs(legs);
    const paired = result.find(c => c.agent === 'omar');
    expect(paired!.pairMethod).toBe('trunk-match');
  });

  it('does not pair outbound legs that have a parent call SID', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'PARENT_OB', from: '+16193739225', to: '+14155559999', direction: 'outbound-api', parentCallSid: 'SOME_PARENT', duration: 120 }),
    ];
    const result = pairCallLegs(legs);
    // Should not be counted as standalone outbound since it has a parent
    const outbound = result.filter(c => c.direction === 'outbound');
    expect(outbound).toHaveLength(0);
  });

  it('uses agent duration (not inbound total duration) for paired call duration', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'IN_DUR', from: '+14155551234', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:00:00Z', duration: 400 }),
      leg({ sid: 'AG_DUR', from: '+16193739225', to: 'client:omar_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:00:10Z', duration: 280 }),
    ];
    const result = pairCallLegs(legs);
    const paired = result.find(c => c.agent === 'omar')!;
    expect(paired.duration).toBe(280);       // agent leg duration
    expect(paired.totalDuration).toBe(400);  // inbound leg duration
  });

  it('handles multiple agent legs pairing to different inbound legs', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'IN_1', from: '+14155551111', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:00:00Z' }),
      leg({ sid: 'IN_2', from: '+14155552222', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:05:00Z' }),
      leg({ sid: 'AG_1', from: '+16193739225', to: 'client:omar_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:00:05Z' }),
      leg({ sid: 'AG_2', from: '+16193739225', to: 'client:burke_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:05:05Z' }),
    ];
    const result = pairCallLegs(legs);
    const omar = result.find(c => c.agent === 'omar');
    const burke = result.find(c => c.agent === 'burke');
    expect(omar).toBeDefined();
    expect(burke).toBeDefined();
    expect(omar!.id).toBe('IN_1');
    expect(burke!.id).toBe('IN_2');
  });

  it('ringTime is 0 when agent leg starts before inbound', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'IN_RT', from: '+14155551234', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:00:10Z' }),
      leg({ sid: 'AG_RT', from: '+16193739225', to: 'client:omar_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:00:05Z' }),
    ];
    const result = pairCallLegs(legs);
    const paired = result.find(c => c.agent === 'omar')!;
    expect(paired.ringTime).toBe(0);
  });
});

// ── xName (worker name extraction) ────────────────────────────────

describe('xName', () => {
  it('extracts name before @', () => {
    expect(xName('omar@jumpcontact.com')).toBe('omar');
  });

  it('returns full name if no @', () => {
    expect(xName('Burke')).toBe('burke');
  });

  it('lowercases and trims', () => {
    expect(xName('  OMAR@test.com  ')).toBe('omar');
  });

  it('handles empty string', () => {
    expect(xName('')).toBe('');
  });
});

// ── emptyAct ──────────────────────────────────────────────────────

describe('emptyAct', () => {
  it('returns all-zero activity breakdown', () => {
    const a = emptyAct();
    expect(a.availableSec).toBe(0);
    expect(a.busySec).toBe(0);
    expect(a.wrapUpSec).toBe(0);
    expect(a.offlineSec).toBe(0);
    expect(a.totalActiveSec).toBe(0);
    expect(a.reservationsCreated).toBe(0);
    expect(a.avgSpeed).toBe(0);
    expect(a.avgWrapUp).toBe(0);
  });
});
