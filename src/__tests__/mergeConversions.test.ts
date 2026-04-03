import { describe, it, expect } from 'vitest';
import type { AcctStat } from '../lib/types';
import type { MscConversions } from '../lib/ops-center';

// ── Replicate mergeConversions logic from route.ts ──────────────────
// This function merges JC (Google Sheets) conversions with MSC (GHL)
// conversions into a single combined entry.

type ConvEntry = {
  total: number;
  byAgent: Record<string, number>;
  byAccount: AcctStat[];
  byHour: number[];
};

function mergeConversions(jc: ConvEntry, msc: MscConversions | null): ConvEntry {
  if (!msc || msc.total === 0) return jc;
  const byAgent = { ...jc.byAgent };
  for (const [agent, count] of Object.entries(msc.byAgent)) {
    byAgent[agent] = (byAgent[agent] || 0) + count;
  }
  const acctMap: Record<string, number> = {};
  for (const a of jc.byAccount) acctMap[a.account] = (acctMap[a.account] || 0) + a.count;
  for (const a of msc.byAccount) acctMap[a.account] = (acctMap[a.account] || 0) + a.count;
  const byAccount = Object.entries(acctMap).map(([account, count]) => ({ account, count })).sort((a, b) => b.count - a.count);
  const byHour = jc.byHour.map((h, i) => h + (msc.byHour[i] || 0));
  return { total: jc.total + msc.total, byAgent, byAccount, byHour };
}

// ── Helpers ──────────────────────────────────────────────────────────

function makeJcEntry(overrides: Partial<ConvEntry> = {}): ConvEntry {
  return {
    total: 0,
    byAgent: {},
    byAccount: [],
    byHour: new Array(24).fill(0),
    ...overrides,
  };
}

function makeMscEntry(overrides: Partial<MscConversions> = {}): MscConversions {
  return {
    date: '2026-04-03',
    total: 0,
    byAgent: {},
    byAccount: [],
    byHour: new Array(24).fill(0),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('mergeConversions', () => {
  it('returns JC entry when MSC is null', () => {
    const jc = makeJcEntry({ total: 10, byAgent: { omar: 5, burke: 5 } });
    const result = mergeConversions(jc, null);
    expect(result).toBe(jc); // same reference
    expect(result.total).toBe(10);
  });

  it('returns JC entry when MSC has zero total', () => {
    const jc = makeJcEntry({ total: 10, byAgent: { omar: 5, burke: 5 } });
    const msc = makeMscEntry({ total: 0 });
    const result = mergeConversions(jc, msc);
    expect(result).toBe(jc); // same reference, short-circuit
  });

  it('merges totals: JC.total + MSC.total', () => {
    const jc = makeJcEntry({ total: 25 });
    const msc = makeMscEntry({ total: 15 });
    const result = mergeConversions(jc, msc);
    expect(result.total).toBe(40);
  });

  it('merges byAgent: combines agent counts from both sources', () => {
    const jc = makeJcEntry({
      total: 10,
      byAgent: { omar: 5, burke: 3, sara: 2 },
    });
    const msc = makeMscEntry({
      total: 8,
      byAgent: { desi: 3, sara: 2, natalie: 3 },
    });
    const result = mergeConversions(jc, msc);

    // JC-only agents preserved
    expect(result.byAgent['omar']).toBe(5);
    expect(result.byAgent['burke']).toBe(3);

    // MSC-only agents added
    expect(result.byAgent['desi']).toBe(3);
    expect(result.byAgent['natalie']).toBe(3);

    // Blended agent (sara) combines
    expect(result.byAgent['sara']).toBe(4); // 2 + 2
  });

  it('merges byAccount: combines account counts from both sources', () => {
    const jc = makeJcEntry({
      total: 5,
      byAccount: [
        { account: 'sapochnick', count: 3 },
        { account: 'ttn', count: 2 },
      ],
    });
    const msc = makeMscEntry({
      total: 4,
      byAccount: [
        { account: 'med spa x', count: 2 },
        { account: 'sapochnick', count: 2 }, // overlapping account
      ],
    });
    const result = mergeConversions(jc, msc);

    // Merged and sorted by count desc
    const sapochnick = result.byAccount.find(a => a.account === 'sapochnick');
    expect(sapochnick!.count).toBe(5); // 3 + 2

    const ttn = result.byAccount.find(a => a.account === 'ttn');
    expect(ttn!.count).toBe(2);

    const medSpa = result.byAccount.find(a => a.account === 'med spa x');
    expect(medSpa!.count).toBe(2);

    // Check sorted by count descending
    for (let i = 0; i < result.byAccount.length - 1; i++) {
      expect(result.byAccount[i].count).toBeGreaterThanOrEqual(result.byAccount[i + 1].count);
    }
  });

  it('merges byHour: adds element-wise', () => {
    const jcHours = new Array(24).fill(0);
    jcHours[9] = 5;
    jcHours[10] = 8;
    jcHours[11] = 3;

    const mscHours = new Array(24).fill(0);
    mscHours[9] = 2;
    mscHours[10] = 1;
    mscHours[12] = 4;

    const jc = makeJcEntry({ total: 16, byHour: jcHours });
    const msc = makeMscEntry({ total: 7, byHour: mscHours });
    const result = mergeConversions(jc, msc);

    expect(result.byHour[9]).toBe(7);   // 5 + 2
    expect(result.byHour[10]).toBe(9);  // 8 + 1
    expect(result.byHour[11]).toBe(3);  // 3 + 0
    expect(result.byHour[12]).toBe(4);  // 0 + 4
    expect(result.byHour[0]).toBe(0);   // both zero
    expect(result.byHour).toHaveLength(24);
  });

  it('handles MSC with shorter byHour array gracefully', () => {
    const jcHours = new Array(24).fill(1);
    const mscHours = [5, 3]; // only 2 elements

    const jc = makeJcEntry({ total: 24, byHour: jcHours });
    const msc = makeMscEntry({ total: 8, byHour: mscHours });
    const result = mergeConversions(jc, msc);

    expect(result.byHour[0]).toBe(6);   // 1 + 5
    expect(result.byHour[1]).toBe(4);   // 1 + 3
    expect(result.byHour[2]).toBe(1);   // 1 + (undefined || 0)
    expect(result.byHour[23]).toBe(1);  // 1 + (undefined || 0)
  });

  it('handles empty JC entry with non-empty MSC', () => {
    const jc = makeJcEntry({ total: 0 });
    const msc = makeMscEntry({
      total: 5,
      byAgent: { desi: 3, natalie: 2 },
      byAccount: [{ account: 'med spa', count: 5 }],
    });
    const result = mergeConversions(jc, msc);
    expect(result.total).toBe(5);
    expect(result.byAgent['desi']).toBe(3);
    expect(result.byAgent['natalie']).toBe(2);
    expect(result.byAccount[0]).toEqual({ account: 'med spa', count: 5 });
  });

  it('does not mutate the original JC entry', () => {
    const jc = makeJcEntry({
      total: 10,
      byAgent: { omar: 5 },
      byAccount: [{ account: 'ttn', count: 3 }],
    });
    const msc = makeMscEntry({
      total: 5,
      byAgent: { omar: 2 },
      byAccount: [{ account: 'med spa', count: 5 }],
    });

    // Save originals
    const origJcTotal = jc.total;
    const origJcOmar = jc.byAgent['omar'];

    mergeConversions(jc, msc);

    // JC should not be mutated
    expect(jc.total).toBe(origJcTotal);
    expect(jc.byAgent['omar']).toBe(origJcOmar);
  });

  it('realistic scenario: 25 JC from Sheets + 12 MSC from GHL', () => {
    const jcHours = new Array(24).fill(0);
    jcHours[8] = 2; jcHours[9] = 4; jcHours[10] = 5;
    jcHours[11] = 6; jcHours[13] = 4; jcHours[14] = 2; jcHours[15] = 2;

    const mscHours = new Array(24).fill(0);
    mscHours[9] = 1; mscHours[10] = 2; mscHours[11] = 3;
    mscHours[13] = 2; mscHours[14] = 2; mscHours[15] = 2;

    const jc = makeJcEntry({
      total: 25,
      byAgent: { omar: 8, burke: 7, danny: 5, sara: 3, ian: 2 },
      byAccount: [
        { account: 'sapochnick', count: 8 },
        { account: 'ttn', count: 6 },
        { account: 'brudner', count: 5 },
        { account: 'mckee', count: 4 },
        { account: 'dansel', count: 2 },
      ],
      byHour: jcHours,
    });

    const msc = makeMscEntry({
      total: 12,
      byAgent: { desi: 4, sara: 3, natalie: 3, sue: 2 },
      byAccount: [
        { account: 'med spa x', count: 5 },
        { account: 'aesthetics plus', count: 4 },
        { account: 'skin clinic', count: 3 },
      ],
      byHour: mscHours,
    });

    const result = mergeConversions(jc, msc);

    // Total
    expect(result.total).toBe(37);

    // Sara (blended) combined correctly
    expect(result.byAgent['sara']).toBe(6); // 3 JC + 3 MSC

    // All agents present
    expect(Object.keys(result.byAgent).sort()).toEqual(
      ['burke', 'danny', 'desi', 'ian', 'natalie', 'omar', 'sara', 'sue'],
    );

    // Accounts from both sources present
    const accounts = result.byAccount.map(a => a.account);
    expect(accounts).toContain('sapochnick');
    expect(accounts).toContain('med spa x');

    // Hourly sums correct
    expect(result.byHour[10]).toBe(7); // 5 + 2
  });
});
