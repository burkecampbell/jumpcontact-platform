import { describe, it, expect } from 'vitest';
import {
  formatPhone,
  formatDuration,
  formatTime,
  formatDateTime,
} from '../lib/formatters';

// ── formatPhone ───────────────────────────────────────────────────

describe('formatPhone', () => {
  it('formats 11-digit US number starting with 1', () => {
    expect(formatPhone('+14155551234')).toBe('(415) 555-1234');
    expect(formatPhone('14155551234')).toBe('(415) 555-1234');
  });

  it('formats 10-digit number', () => {
    expect(formatPhone('4155551234')).toBe('(415) 555-1234');
  });

  it('returns "—" for empty string', () => {
    expect(formatPhone('')).toBe('—');
  });

  it('returns raw number for non-standard length', () => {
    expect(formatPhone('12345')).toBe('12345');
    expect(formatPhone('+447911123456')).toBe('+447911123456');
  });

  it('strips formatting characters before processing', () => {
    expect(formatPhone('(415) 555-1234')).toBe('(415) 555-1234');
    expect(formatPhone('415.555.1234')).toBe('(415) 555-1234');
  });

  it('handles number with + prefix (11 digits)', () => {
    expect(formatPhone('+16193739225')).toBe('(619) 373-9225');
  });
});

// ── formatDuration ────────────────────────────────────────────────

describe('formatDuration', () => {
  it('floors fractional seconds', () => {
    expect(formatDuration(65.9)).toBe('1:05');
    expect(formatDuration(59.999)).toBe('0:59');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats exact minutes', () => {
    expect(formatDuration(120)).toBe('2:00');
  });

  it('pads seconds to 2 digits', () => {
    expect(formatDuration(61)).toBe('1:01');
    expect(formatDuration(9)).toBe('0:09');
  });

  it('handles large durations', () => {
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('floors before computing minutes and seconds', () => {
    // 90.7 → floor → 90 → 1:30
    expect(formatDuration(90.7)).toBe('1:30');
  });
});

// ── formatTime ────────────────────────────────────────────────────

describe('formatTime', () => {
  it('formats ISO timestamp to MST time', () => {
    // 2026-04-02T18:00:00Z in MDT (UTC-6) = 12:00 PM
    const result = formatTime('2026-04-02T18:00:00Z');
    expect(result).toMatch(/12:00\s*PM/i);
  });

  it('returns "Invalid Date" for garbage input (no throw)', () => {
    // formatters.ts formatTime catches exceptions but Invalid Date doesn't throw
    const result = formatTime('garbage');
    expect(typeof result).toBe('string');
  });

  it('formats morning time', () => {
    // 2026-04-02T14:30:00Z in MDT = 8:30 AM
    const result = formatTime('2026-04-02T14:30:00Z');
    expect(result).toMatch(/08:30\s*AM/i);
  });

  it('formats evening time', () => {
    // 2026-04-02T23:45:00Z in MDT = 5:45 PM
    const result = formatTime('2026-04-02T23:45:00Z');
    expect(result).toMatch(/05:45\s*PM/i);
  });
});

// ── formatDateTime ────────────────────────────────────────────────

describe('formatDateTime', () => {
  it('formats ISO timestamp to date + time', () => {
    const result = formatDateTime('2026-04-02T18:00:00Z');
    expect(result).toContain('Apr');
    expect(result).toContain('2');
    expect(result).toMatch(/12:00\s*PM/i);
  });

  it('returns string for invalid timestamp (no throw)', () => {
    const result = formatDateTime('invalid');
    expect(typeof result).toBe('string');
  });
});
