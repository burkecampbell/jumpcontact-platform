import { describe, it, expect } from 'vitest';
import type { PairedCall, RawCall } from '../lib/types';

// ── Replicate buildRecentCalls logic from route.ts ──────────────────
// This is a pure data-transformation function defined inline in the
// route handler. We replicate it here to test the filtering logic.

function buildRecentCalls(calls: PairedCall[]): RawCall[] {
  return calls
    .filter(c => {
      const hasPhone = c.from?.startsWith('+') || c.to?.startsWith('+');
      return hasPhone;
    })
    .slice(0, 20)
    .map(c => ({
      time: c.time,
      agent: c.agent,
      phone: c.from?.startsWith('+') ? c.from : c.to?.startsWith('+') ? c.to : '',
      duration: c.duration,
      direction: c.direction,
      callSid: c.id,
      recordingUrl: c.agentLegSid ? `/api/calls/recording?sid=${c.id}&agent_sid=${c.agentLegSid}` : undefined,
      account: c.client || undefined,
    }));
}

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
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('buildRecentCalls', () => {
  it('filters out calls without phone numbers starting with +', () => {
    const calls: PairedCall[] = [
      makePairedCall({ from: '+14155551234', to: 'client:omar_40jumpcontact_2Ecom' }),
      makePairedCall({ from: 'client:burke_40jumpcontact_2Ecom', to: 'client:omar_40jumpcontact_2Ecom' }),
      makePairedCall({ from: 'sip:trunk@provider.com', to: 'internal-ext' }),
    ];
    const result = buildRecentCalls(calls);
    expect(result).toHaveLength(1);
    expect(result[0].phone).toBe('+14155551234');
  });

  it('includes calls where only to starts with +', () => {
    const calls: PairedCall[] = [
      makePairedCall({ from: 'client:omar_40jumpcontact_2Ecom', to: '+18005551234' }),
    ];
    const result = buildRecentCalls(calls);
    expect(result).toHaveLength(1);
    expect(result[0].phone).toBe('+18005551234');
  });

  it('prefers from when both start with +', () => {
    const calls: PairedCall[] = [
      makePairedCall({ from: '+14155551234', to: '+18005559999' }),
    ];
    const result = buildRecentCalls(calls);
    expect(result[0].phone).toBe('+14155551234');
  });

  it('limits output to 20 calls', () => {
    const calls = Array.from({ length: 30 }, (_, i) =>
      makePairedCall({ id: `CA${i}`, from: `+1415555${String(i).padStart(4, '0')}` }),
    );
    const result = buildRecentCalls(calls);
    expect(result).toHaveLength(20);
  });

  it('does not show duplicate legs (only paired calls pass through)', () => {
    // Same call with same ID should not appear twice if input is deduped
    const call = makePairedCall({ id: 'CA_UNIQUE_123' });
    const result = buildRecentCalls([call]);
    expect(result).toHaveLength(1);
    expect(result[0].callSid).toBe('CA_UNIQUE_123');
  });

  it('preserves call metadata correctly', () => {
    const call = makePairedCall({
      id: 'CAxyz123',
      time: '2026-04-03T14:30:00Z',
      agent: 'burke',
      from: '+16193739225',
      duration: 300,
      direction: 'inbound',
      client: 'TTN Plumbing',
      agentLegSid: 'CA_agent_leg',
    });
    const result = buildRecentCalls([call]);
    expect(result[0]).toEqual({
      time: '2026-04-03T14:30:00Z',
      agent: 'burke',
      phone: '+16193739225',
      duration: 300,
      direction: 'inbound',
      callSid: 'CAxyz123',
      recordingUrl: '/api/calls/recording?sid=CAxyz123&agent_sid=CA_agent_leg',
      account: 'TTN Plumbing',
    });
  });

  it('omits recordingUrl when no agentLegSid', () => {
    const call = makePairedCall({ agentLegSid: undefined });
    const result = buildRecentCalls([call]);
    expect(result[0].recordingUrl).toBeUndefined();
  });

  it('omits account when client is empty', () => {
    const call = makePairedCall({ client: '' });
    const result = buildRecentCalls([call]);
    expect(result[0].account).toBeUndefined();
  });

  it('returns empty array for empty input', () => {
    expect(buildRecentCalls([])).toEqual([]);
  });

  it('handles outbound calls with + numbers', () => {
    const call = makePairedCall({
      direction: 'outbound',
      from: '+18005551234',
      to: '+14155559876',
    });
    const result = buildRecentCalls([call]);
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe('outbound');
    expect(result[0].phone).toBe('+18005551234');
  });
});
