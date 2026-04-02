import { describe, it, expect } from 'vitest';
import { filterByBrand, filterOutMSCAgents, filterToMSCAgents, stripConversions } from '../lib/blender';
import type { PeriodData } from '../lib/types';

function makePeriod(agents: string[]): PeriodData {
  return {
    date: '2026-04-01',
    conversions: {
      total: 10,
      byAgent: [{ agent: 'omar', count: 5 }, { agent: 'sue', count: 3 }, { agent: 'wendy', count: 2 }],
      byAccount: [{ account: 'Acme', count: 10 }],
      hourly: new Array(24).fill(0),
    },
    missedCalls: { total: 2, byAccount: [] },
    repActivity: {
      agents: agents.map(a => ({
        agent: a,
        calls: 10,
        talkMin: 30,
        speedSec: 5,
        wrapUpSec: 15,
        hoursScheduled: 8,
        conversions: 3,
        convsPerHour: 0.5,
      })),
      outbound: agents.map(a => ({ agent: a, callsMade: 2, talkMin: 5 })),
      avgSpeedSec: 5,
    },
    teamStats: null,
    conversionRate: 20,
  };
}

describe('filterByBrand', () => {
  const agents = ['omar', 'burke', 'sue', 'desi', 'wendy', 'sara'];

  describe('JC brand', () => {
    it('removes MSC-only agents (desi, sue)', () => {
      const period = makePeriod(agents);
      const result = filterByBrand(period, 'jc');

      const names = result.repActivity.agents.map(a => a.agent);
      expect(names).toContain('omar');
      expect(names).toContain('burke');
      expect(names).toContain('wendy'); // blended
      expect(names).toContain('sara');  // blended
      expect(names).not.toContain('desi');  // MSC-only
      expect(names).not.toContain('sue');   // MSC-only
    });

    it('also filters outbound agents', () => {
      const period = makePeriod(agents);
      const result = filterByBrand(period, 'jc');
      const outboundNames = result.repActivity.outbound.map(a => a.agent);
      expect(outboundNames).not.toContain('desi');
      expect(outboundNames).not.toContain('sue');
    });

    it('preserves conversion data', () => {
      const period = makePeriod(agents);
      const result = filterByBrand(period, 'jc');
      expect(result.conversions.total).toBe(10);
      expect(result.conversionRate).toBe(20);
    });
  });

  describe('MSC brand', () => {
    it('keeps only MSC-only + blended agents', () => {
      const period = makePeriod(agents);
      const result = filterByBrand(period, 'msc');

      const names = result.repActivity.agents.map(a => a.agent);
      expect(names).toContain('desi');   // MSC-only
      expect(names).toContain('sue');    // MSC-only
      expect(names).toContain('wendy');  // blended
      expect(names).toContain('sara');   // blended
      expect(names).not.toContain('omar');  // JC-only
      expect(names).not.toContain('burke'); // JC-only
    });
  });

  describe('Mixed brand', () => {
    it('keeps ALL agents but zeros conversions', () => {
      const period = makePeriod(agents);
      const result = filterByBrand(period, 'mixed');

      const names = result.repActivity.agents.map(a => a.agent);
      expect(names).toHaveLength(agents.length); // all kept

      expect(result.conversions.total).toBe(0);
      expect(result.conversionRate).toBeNull();

      for (const agent of result.repActivity.agents) {
        expect(agent.conversions).toBe(0);
        expect(agent.convsPerHour).toBeUndefined();
      }
    });
  });
});
