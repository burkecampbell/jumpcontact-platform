import { describe, it, expect } from 'vitest';
import { pairCallLegs } from '../lib/twilio';
import type { CallLeg } from '../lib/types';

// Helper to create a call leg with sensible defaults
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

describe('pairCallLegs', () => {
  it('pairs inbound leg with agent leg on same trunk (Strategy 1)', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'IN1', from: '+14155551234', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:00:00Z', duration: 300 }),
      leg({ sid: 'AG1', from: '+16193739225', to: 'client:omar_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:00:10Z', duration: 280 }),
    ];

    const result = pairCallLegs(legs);
    const paired = result.find(c => c.id === 'IN1');

    expect(paired).toBeDefined();
    expect(paired!.agent).toBe('omar');
    expect(paired!.from).toBe('+14155551234');
    expect(paired!.to).toBe('+16193739225');
    expect(paired!.direction).toBe('inbound');
    expect(paired!.ringTime).toBe(10);
    expect(paired!.agentLegSid).toBe('AG1');
  });

  it('pairs inbound leg with agent leg on DIFFERENT trunk (Strategy 1b cross-trunk)', () => {
    // This is the key fix: agent leg from trunk A, inbound leg to trunk B
    const legs: CallLeg[] = [
      leg({ sid: 'IN2', from: '+14155559999', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:00:00Z', duration: 200 }),
      leg({ sid: 'AG2', from: '+15873551639', to: 'client:burke_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:00:15Z', duration: 180 }),
    ];

    const result = pairCallLegs(legs);
    const paired = result.find(c => c.id === 'IN2');

    expect(paired).toBeDefined();
    expect(paired!.agent).toBe('burke');
    expect(paired!.from).toBe('+14155559999');
    expect(paired!.ringTime).toBe(15);
  });

  it('prefers same-trunk match over cross-trunk match', () => {
    const legs: CallLeg[] = [
      // Two inbound legs on different trunks, same time
      leg({ sid: 'IN_A', from: '+14155551111', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:00:00Z' }),
      leg({ sid: 'IN_B', from: '+14155552222', to: '+15873551639', direction: 'inbound', startTime: '2026-04-01T16:00:02Z' }),
      // Agent leg from trunk A
      leg({ sid: 'AG_A', from: '+16193739225', to: 'client:omar_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:00:05Z' }),
    ];

    const result = pairCallLegs(legs);
    // Omar should match IN_A (same trunk), not IN_B
    const omarCall = result.find(c => c.agent === 'omar');
    expect(omarCall).toBeDefined();
    expect(omarCall!.id).toBe('IN_A');
  });

  it('does NOT cross-trunk pair MSC agent with JC trunk', () => {
    // Richard (MSC-only) should never pair with Sapochnick (JC trunk)
    const legs: CallLeg[] = [
      leg({ sid: 'IN_JC', from: '+14155551234', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:00:00Z' }),
      leg({ sid: 'AG_MSC', from: '+18632641010', to: 'client:richard_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:00:10Z', duration: 36 }),
    ];

    const result = pairCallLegs(legs);
    // JC inbound should be unmatched (missed), NOT paired with Richard
    const jcInbound = result.find(c => c.id === 'IN_JC');
    expect(jcInbound).toBeDefined();
    expect(jcInbound!.agent).toBe(''); // unmatched, not 'richard'
  });

  it('DOES cross-trunk pair MSC agent with MSC trunk', () => {
    // Richard (MSC-only) SHOULD pair with Gambhir (MSC trunk +16107728771)
    const legs: CallLeg[] = [
      leg({ sid: 'IN_MSC', from: '+14155551234', to: '+16107728771', direction: 'inbound', startTime: '2026-04-01T16:00:00Z' }),
      leg({ sid: 'AG_MSC2', from: '+18632641010', to: 'client:richard_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:00:10Z', duration: 36 }),
    ];

    const result = pairCallLegs(legs);
    const paired = result.find(c => c.agent === 'richard');
    expect(paired).toBeDefined();
    expect(paired!.id).toBe('IN_MSC');
    expect(paired!.ringTime).toBe(10);
  });

  it('does not pair agent legs outside 60s window', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'IN3', from: '+14155551234', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:00:00Z' }),
      leg({ sid: 'AG3', from: '+15873551639', to: 'client:ian_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:02:00Z' }),
    ];

    const result = pairCallLegs(legs);
    // IN3 should be unmatched (missed), AG3 should fall through to fallback
    const inbound = result.find(c => c.id === 'IN3');
    expect(inbound).toBeDefined();
    expect(inbound!.agent).toBe(''); // unmatched
  });

  it('pairs via parent-call SID (Strategy 2)', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'IN4', from: '+14155551234', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:00:00Z' }),
      leg({ sid: 'AG4', from: '+15873551639', to: 'client:chris_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:02:30Z', parentCallSid: 'IN4' }),
    ];

    const result = pairCallLegs(legs);
    const paired = result.find(c => c.agent === 'chris');

    expect(paired).toBeDefined();
    expect(paired!.id).toBe('IN4');
    expect(paired!.from).toBe('+14155551234');
  });

  it('marks unmatched inbound legs as missed (empty agent)', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'IN5', from: '+14155551234', to: '+16193739225', direction: 'inbound', duration: 0, status: 'no-answer' }),
    ];

    const result = pairCallLegs(legs);
    expect(result).toHaveLength(1);
    expect(result[0].agent).toBe('');
    expect(result[0].duration).toBe(0);
    expect(result[0].status).toBe('no-answer');
  });

  it('handles outbound calls (agent-initiated, no parent)', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'OB1', from: '+16193739225', to: '+14155559999', direction: 'outbound-api', duration: 120 }),
    ];

    const result = pairCallLegs(legs);
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe('outbound');
    expect(result[0].duration).toBe(120);
  });

  it('sorts paired calls newest-first', () => {
    const legs: CallLeg[] = [
      leg({ sid: 'IN_OLD', from: '+14155551111', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T15:00:00Z' }),
      leg({ sid: 'AG_OLD', from: '+16193739225', to: 'client:omar_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T15:00:05Z' }),
      leg({ sid: 'IN_NEW', from: '+14155552222', to: '+16193739225', direction: 'inbound', startTime: '2026-04-01T16:00:00Z' }),
      leg({ sid: 'AG_NEW', from: '+16193739225', to: 'client:burke_40jumpcontact_2Ecom', direction: 'outbound-api', startTime: '2026-04-01T16:00:05Z' }),
    ];

    const result = pairCallLegs(legs);
    const agents = result.filter(c => c.agent).map(c => c.agent);
    expect(agents[0]).toBe('burke'); // newer
    expect(agents[1]).toBe('omar');  // older
  });
});
