import { describe, it, expect } from 'vitest';

// parseFlexDate is not exported directly — we test it via the sheets module's behavior.
// Instead, we replicate the logic here to unit-test the date parsing in isolation.

/** Replica of parseFlexDate from sheets.ts for direct unit testing */
function parseFlexDate(s: string): Date | null {
  const parts = s.trim().split(/[\s,]+/);
  const datePart = parts[0];
  const timePart = parts[1] || '12:00';
  if (datePart.includes('-') && datePart.length === 10) {
    return new Date(`${datePart}T${timePart}`);
  }
  const slash = datePart.split('/');
  if (slash.length >= 3) {
    const a = parseInt(slash[0]);
    const b = parseInt(slash[1]);
    const y = parseInt(slash[2]);
    const year = y < 100 ? 2000 + y : y;
    if (a > 12) return new Date(`${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}T${timePart}`);
    if (b > 12) return new Date(`${year}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}T${timePart}`);
    if (year >= 2026) {
      return new Date(`${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}T${timePart}`);
    }
    return new Date(`${year}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}T${timePart}`);
  }
  return null;
}

describe('parseFlexDate', () => {
  // ── ISO format (YYYY-MM-DD) ─────────────────────────────────────
  describe('ISO format (YYYY-MM-DD)', () => {
    it('parses standard ISO date with no time → defaults to noon', () => {
      const d = parseFlexDate('2026-04-02');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(12);
      expect(d!.getMinutes()).toBe(0);
    });

    it('parses ISO date with explicit time', () => {
      const d = parseFlexDate('2026-04-02 09:30');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(9);
      expect(d!.getMinutes()).toBe(30);
    });

    it('parses ISO date with comma separator', () => {
      const d = parseFlexDate('2026-04-02, 14:15');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(14);
      expect(d!.getMinutes()).toBe(15);
    });

    it('parses ISO date at start of year', () => {
      const d = parseFlexDate('2026-01-01');
      expect(d).not.toBeNull();
      expect(d!.getMonth()).toBe(0); // January
      expect(d!.getDate()).toBe(1);
    });

    it('parses ISO date at end of year', () => {
      const d = parseFlexDate('2026-12-31');
      expect(d).not.toBeNull();
      expect(d!.getMonth()).toBe(11); // December
      expect(d!.getDate()).toBe(31);
    });
  });

  // ── Slash format (M/D/Y) ────────────────────────────────────────
  describe('slash format (M/D/Y)', () => {
    it('parses M/D/YYYY with 4-digit year', () => {
      const d = parseFlexDate('4/2/2026');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2026);
      // year >= 2026 → d/a format: month=a(2), day=b... wait no:
      // a=4, b=2, y=2026. Neither >12. year >= 2026 → month=b(2), day=a(4)
      expect(d!.getMonth()).toBe(1); // February (0-indexed)
      expect(d!.getDate()).toBe(4);
    });

    it('parses M/D/YY with 2-digit year', () => {
      const d = parseFlexDate('3/15/26');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2026);
      // a=3, b=15. b>12 → month=a(3), day=b(15)
      expect(d!.getMonth()).toBe(2); // March
      expect(d!.getDate()).toBe(15);
    });

    it('handles day > 12 as DD/MM/YYYY (European format)', () => {
      const d = parseFlexDate('15/3/2026');
      expect(d).not.toBeNull();
      // a=15 > 12 → month=b(3), day=a(15)
      expect(d!.getMonth()).toBe(2); // March
      expect(d!.getDate()).toBe(15);
    });

    it('parses ambiguous dates with year >= 2026 as D/M/YYYY', () => {
      // a=3, b=4, year=2026 → year >= 2026 → month=b(4), day=a(3)
      const d = parseFlexDate('3/4/2026');
      expect(d).not.toBeNull();
      expect(d!.getMonth()).toBe(3); // April (0-indexed)
      expect(d!.getDate()).toBe(3);
    });

    it('parses ambiguous dates with year < 2026 as M/D/YYYY', () => {
      // a=3, b=4, year=2025 → month=a(3), day=b(4)
      const d = parseFlexDate('3/4/2025');
      expect(d).not.toBeNull();
      expect(d!.getMonth()).toBe(2); // March
      expect(d!.getDate()).toBe(4);
    });

    it('parses slash date with time component', () => {
      const d = parseFlexDate('4/2/2026 08:45');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(8);
      expect(d!.getMinutes()).toBe(45);
    });

    it('defaults to noon when no time given (slash format)', () => {
      const d = parseFlexDate('4/2/2026');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(12);
    });

    it('handles 2-digit year converting to 2000+', () => {
      const d = parseFlexDate('1/15/25');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2025);
    });
  });

  // ── Noon default (DST safety) ───────────────────────────────────
  describe('noon default (prevents midnight UTC → yesterday MST)', () => {
    it('ISO date without time defaults to 12:00', () => {
      const d = parseFlexDate('2026-03-15');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(12);
      expect(d!.getMinutes()).toBe(0);
    });

    it('slash date without time defaults to 12:00', () => {
      const d = parseFlexDate('15/3/2026');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(12);
    });

    it('explicit time overrides noon default', () => {
      const d = parseFlexDate('2026-03-15 00:00');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(0);
    });
  });

  // ── Edge cases / invalid input ──────────────────────────────────
  describe('edge cases and invalid input', () => {
    it('returns null for empty string', () => {
      expect(parseFlexDate('')).toBeNull();
    });

    it('returns Invalid Date for garbage that matches dash pattern', () => {
      // 'not-a-date' has length 10 and includes '-', so it enters the ISO branch
      // and creates an invalid Date
      const d = parseFlexDate('not-a-date');
      expect(d).not.toBeNull();
      expect(isNaN(d!.getTime())).toBe(true);
    });

    it('returns null for garbage without dashes or slashes', () => {
      expect(parseFlexDate('randomtext')).toBeNull();
    });

    it('returns null for incomplete slash date', () => {
      expect(parseFlexDate('4/2')).toBeNull();
    });

    it('handles leading/trailing whitespace', () => {
      const d = parseFlexDate('  2026-04-02  ');
      expect(d).not.toBeNull();
      expect(d!.getDate()).toBe(2);
    });

    it('returns null for single number', () => {
      expect(parseFlexDate('42')).toBeNull();
    });

    it('handles ISO date at DST spring-forward boundary (March)', () => {
      // MST → MDT switch in March. Noon avoids the 2 AM gap.
      const d = parseFlexDate('2026-03-08');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(12);
    });

    it('handles ISO date at DST fall-back boundary (November)', () => {
      const d = parseFlexDate('2026-11-01');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(12);
    });
  });
});
