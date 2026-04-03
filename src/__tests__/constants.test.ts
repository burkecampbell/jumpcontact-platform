import { describe, it, expect } from 'vitest';
import {
  normalizeAgent,
  decodeAgent,
  agentColor,
  capitalize,
  rankBadge,
  speedGrade,
  fmtSpeed,
  fmtDuration,
  fmtHours,
  fmtTalkTime,
  parseHMS,
  computePace,
  isJCAccount,
  parseShiftRange,
  isOnShift,
  formatPhone,
  formatDuration,
  formatTime,
  formatDate,
  GOAL,
  C,
  ACTIVE_AGENTS,
  OUTBOUND_AGENTS,
  EXCLUDED_AGENTS,
} from '../lib/constants';

// ── normalizeAgent ────────────────────────────────────────────────

describe('normalizeAgent', () => {
  it('lowercases and trims', () => {
    expect(normalizeAgent('  Omar  ')).toBe('omar');
  });

  it('jose is his own agent (not aliased to danny)', () => {
    expect(normalizeAgent('Jose')).toBe('jose');
    expect(normalizeAgent('jose')).toBe('jose');
  });

  it('maps "daniel" → "danny"', () => {
    expect(normalizeAgent('Daniel')).toBe('danny');
  });

  it('maps "danny r" → "danny"', () => {
    expect(normalizeAgent('Danny R')).toBe('danny');
  });

  it('maps "danny rodriguez" → "danny"', () => {
    expect(normalizeAgent('danny rodriguez')).toBe('danny');
  });

  it('returns empty for non-agent values', () => {
    expect(normalizeAgent('yes')).toBe('');
    expect(normalizeAgent('no')).toBe('');
    expect(normalizeAgent('true')).toBe('');
    expect(normalizeAgent('false')).toBe('');
    expect(normalizeAgent('n/a')).toBe('');
    expect(normalizeAgent('NA')).toBe('');
    expect(normalizeAgent('-')).toBe('');
    expect(normalizeAgent('other')).toBe('');
    expect(normalizeAgent('')).toBe('');
  });

  it('passes through regular agent names', () => {
    expect(normalizeAgent('Burke')).toBe('burke');
    expect(normalizeAgent('Ian')).toBe('ian');
    expect(normalizeAgent('Chris')).toBe('chris');
  });
});

// ── decodeAgent ───────────────────────────────────────────────────

describe('decodeAgent', () => {
  it('decodes Twilio client: URI with hex escapes', () => {
    expect(decodeAgent('client:omar_40jumpcontact_2Ecom')).toBe('omar');
  });

  it('decodes burke client URI', () => {
    expect(decodeAgent('client:burke_40jumpcontact_2Ecom')).toBe('burke');
  });

  it('decodes jose as his own agent', () => {
    expect(decodeAgent('client:jose_40jumpcontact_2Ecom')).toBe('jose');
  });

  it('returns raw string if no client: prefix', () => {
    expect(decodeAgent('+14155551234')).toBe('+14155551234');
  });

  it('handles client: with no hex escapes', () => {
    expect(decodeAgent('client:test@example.com')).toBe('test');
  });

  it('decodes multiple hex sequences', () => {
    // _2E = '.', _40 = '@'
    expect(decodeAgent('client:agent_40company_2Ecom')).toBe('agent');
  });
});

// ── agentColor ────────────────────────────────────────────────────

describe('agentColor', () => {
  it('returns known agent color', () => {
    expect(agentColor('omar')).toBe('#38bdf8');
    expect(agentColor('burke')).toBe('#4ade80');
  });

  it('returns color for capitalized name (via normalizeAgent)', () => {
    expect(agentColor('Omar')).toBe('#38bdf8');
  });

  it('returns default gray for unknown agent', () => {
    expect(agentColor('unknownperson')).toBe('#64748b');
  });

  it('returns default for empty string', () => {
    expect(agentColor('')).toBe('#64748b');
  });
});

// ── capitalize ────────────────────────────────────────────────────

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('omar')).toBe('Omar');
  });

  it('returns empty for empty string', () => {
    expect(capitalize('')).toBe('');
  });

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('keeps already capitalized', () => {
    expect(capitalize('Omar')).toBe('Omar');
  });
});

// ── rankBadge ─────────────────────────────────────────────────────

describe('rankBadge', () => {
  it('returns gold medal for index 0', () => {
    expect(rankBadge(0)).toBe('🥇');
  });

  it('returns silver medal for index 1', () => {
    expect(rankBadge(1)).toBe('🥈');
  });

  it('returns bronze medal for index 2', () => {
    expect(rankBadge(2)).toBe('🥉');
  });

  it('returns number for index >= 3', () => {
    expect(rankBadge(3)).toBe('4');
    expect(rankBadge(9)).toBe('10');
  });
});

// ── speedGrade ────────────────────────────────────────────────────

describe('speedGrade', () => {
  it('returns "—" for null', () => {
    const g = speedGrade(null);
    expect(g.grade).toBe('—');
    expect(g.letter).toBe('—');
    expect(g.color).toBe(C.sub);
  });

  it('returns "—" for 0 seconds', () => {
    expect(speedGrade(0).grade).toBe('—');
  });

  it('returns "—" for negative seconds', () => {
    expect(speedGrade(-5).grade).toBe('—');
  });

  it('returns A+ for < 8s', () => {
    expect(speedGrade(5).grade).toBe('A+');
    expect(speedGrade(7.9).grade).toBe('A+');
  });

  it('returns A for 8–9.9s', () => {
    expect(speedGrade(8).grade).toBe('A');
    expect(speedGrade(9.9).grade).toBe('A');
  });

  it('returns B+ for 10–11.9s', () => {
    expect(speedGrade(10).grade).toBe('B+');
    expect(speedGrade(11).grade).toBe('B+');
  });

  it('returns B for 12–13.9s', () => {
    expect(speedGrade(12).grade).toBe('B');
    expect(speedGrade(13.9).grade).toBe('B');
  });

  it('returns B- for 14–16.9s', () => {
    expect(speedGrade(14).grade).toBe('B-');
    expect(speedGrade(16).grade).toBe('B-');
  });

  it('returns C for 17–24.9s', () => {
    expect(speedGrade(17).grade).toBe('C');
    expect(speedGrade(24).grade).toBe('C');
  });

  it('returns D for 25–34.9s', () => {
    expect(speedGrade(25).grade).toBe('D');
    expect(speedGrade(34).grade).toBe('D');
  });

  it('returns F for >= 35s', () => {
    expect(speedGrade(35).grade).toBe('F');
    expect(speedGrade(100).grade).toBe('F');
    expect(speedGrade(35).color).toBe(C.pink);
  });
});

// ── fmtSpeed ──────────────────────────────────────────────────────

describe('fmtSpeed', () => {
  it('returns "—" for null', () => {
    expect(fmtSpeed(null)).toBe('—');
  });

  it('formats seconds under 60 with one decimal', () => {
    expect(fmtSpeed(12)).toBe('12.0s');
    expect(fmtSpeed(0)).toBe('0.0s');
    expect(fmtSpeed(6)).toBe('6.0s');
  });

  it('formats seconds over 60 as Xm Ys', () => {
    expect(fmtSpeed(75)).toBe('1m 15s');
    expect(fmtSpeed(130)).toBe('2m 10s');
  });

  it('shows one decimal for fractional seconds', () => {
    expect(fmtSpeed(12.7)).toBe('12.7s');
    expect(fmtSpeed(17.3)).toBe('17.3s');
    expect(fmtSpeed(5.0)).toBe('5.0s');  // always one decimal
    expect(fmtSpeed(0.4)).toBe('0.4s');
  });

  it('formats exactly 60s', () => {
    expect(fmtSpeed(60)).toBe('1m 0s');
  });
});

// ── fmtDuration ───────────────────────────────────────────────────

describe('fmtDuration', () => {
  it('formats seconds only', () => {
    expect(fmtDuration(45)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(fmtDuration(125)).toBe('2m 5s');
  });

  it('formats zero', () => {
    expect(fmtDuration(0)).toBe('0s');
  });
});

// ── fmtHours ──────────────────────────────────────────────────────

describe('fmtHours', () => {
  it('formats hours and minutes', () => {
    expect(fmtHours(3661)).toBe('1h 1m');
  });

  it('formats sub-hour as minutes only', () => {
    expect(fmtHours(1800)).toBe('30m');
  });

  it('formats zero', () => {
    expect(fmtHours(0)).toBe('0m');
  });

  it('formats exactly one hour', () => {
    expect(fmtHours(3600)).toBe('1h 0m');
  });
});

// ── fmtTalkTime ───────────────────────────────────────────────────

describe('fmtTalkTime', () => {
  it('formats minutes under 60', () => {
    expect(fmtTalkTime(45)).toBe('45m');
  });

  it('formats hours with zero-padded minutes', () => {
    expect(fmtTalkTime(65)).toBe('1h 05m');
  });

  it('formats exact hours', () => {
    expect(fmtTalkTime(120)).toBe('2h 00m');
  });

  it('rounds fractional minutes', () => {
    expect(fmtTalkTime(45.7)).toBe('46m');
  });

  it('handles zero', () => {
    expect(fmtTalkTime(0)).toBe('0m');
  });
});

// ── parseHMS ──────────────────────────────────────────────────────

describe('parseHMS', () => {
  it('parses H:MM:SS', () => {
    expect(parseHMS('1:30:15')).toBe(5415);
  });

  it('parses MM:SS', () => {
    expect(parseHMS('5:30')).toBe(330);
  });

  it('parses plain seconds', () => {
    expect(parseHMS('45')).toBe(45);
  });

  it('returns 0 for empty string', () => {
    expect(parseHMS('')).toBe(0);
  });

  it('returns 0 for garbage', () => {
    expect(parseHMS('abc')).toBe(0);
  });
});

// ── computePace ───────────────────────────────────────────────────

describe('computePace', () => {
  it('projects correctly mid-month', () => {
    const result = computePace(150, '2026-04-10T12:00:00Z');
    expect(result.dayOfMonth).toBe(10);
    expect(result.daysInMonth).toBe(30);
    expect(result.projected).toBe(450); // (150/10)*30
    expect(result.pacePercent).toBe(50); // 450/900*100
  });

  it('projects on first day of month', () => {
    const result = computePace(30, '2026-04-01T12:00:00Z');
    expect(result.dayOfMonth).toBe(1);
    expect(result.projected).toBe(900); // (30/1)*30
    expect(result.pacePercent).toBe(100);
  });

  it('handles zero conversions', () => {
    const result = computePace(0, '2026-04-15T12:00:00Z');
    expect(result.projected).toBe(0);
    expect(result.pacePercent).toBe(0);
  });

  it('handles last day of month', () => {
    const result = computePace(900, '2026-04-30T12:00:00Z');
    expect(result.dayOfMonth).toBe(30);
    expect(result.projected).toBe(900);
    expect(result.pacePercent).toBe(100);
  });

  it('handles February (28 days)', () => {
    const result = computePace(140, '2026-02-14T12:00:00Z');
    expect(result.daysInMonth).toBe(28);
    expect(result.projected).toBe(280); // (140/14)*28
  });

  it('uses GOAL constant (900)', () => {
    expect(GOAL).toBe(900);
  });
});

// ── isJCAccount ───────────────────────────────────────────────────

describe('isJCAccount', () => {
  it('detects JC client names', () => {
    expect(isJCAccount('Sapochnick Law')).toBe(true);
    expect(isJCAccount('TTN Plumbing')).toBe(true);
    expect(isJCAccount('Brudner Law')).toBe(true);
    expect(isJCAccount('SOS Handyman')).toBe(true);
    expect(isJCAccount('Divine Restoration LLC')).toBe(true);
    expect(isJCAccount('Jump Contact')).toBe(true);
  });

  it('returns false for non-JC accounts', () => {
    expect(isJCAccount('Random Company')).toBe(false);
    expect(isJCAccount('Med Spa')).toBe(false);
    expect(isJCAccount('')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isJCAccount('SAPOCHNICK')).toBe(true);
    expect(isJCAccount('sapochnick')).toBe(true);
  });

  it('matches partial keywords', () => {
    expect(isJCAccount('The Ibrahim Law Office')).toBe(true);
    expect(isJCAccount("Moe's BBQ")).toBe(true);
  });
});

// ── formatPhone (constants.ts version) ────────────────────────────

describe('formatPhone (constants)', () => {
  it('formats 11-digit US number', () => {
    expect(formatPhone('+14155551234')).toBe('(415) 555-1234');
  });

  it('formats 10-digit number', () => {
    expect(formatPhone('4155551234')).toBe('(415) 555-1234');
  });

  it('returns "—" for empty string', () => {
    expect(formatPhone('')).toBe('—');
  });

  it('returns raw phone for non-standard length', () => {
    expect(formatPhone('12345')).toBe('12345');
  });

  it('strips non-digit characters', () => {
    expect(formatPhone('(415) 555-1234')).toBe('(415) 555-1234');
  });
});

// ── formatDuration (constants.ts version) ─────────────────────────

describe('formatDuration (constants)', () => {
  it('formats as m:ss', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('handles zero seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats sub-minute durations', () => {
    expect(formatDuration(5)).toBe('0:05');
  });

  it('uses floor for seconds (integer input)', () => {
    expect(formatDuration(125)).toBe('2:05');
  });
});

// ── parseShiftRange ───────────────────────────────────────────────

describe('parseShiftRange', () => {
  it('parses simple AM-PM shift', () => {
    const r = parseShiftRange('9am-5pm');
    expect(r).toEqual({ start: 9, end: 17 });
  });

  it('parses shift with single letter (a/p)', () => {
    const r = parseShiftRange('9a-5p');
    expect(r).toEqual({ start: 9, end: 17 });
  });

  it('returns null for "OFF"', () => {
    expect(parseShiftRange('OFF')).toBeNull();
  });

  it('returns null for "off"', () => {
    expect(parseShiftRange('off')).toBeNull();
  });

  it('returns null for "-"', () => {
    expect(parseShiftRange('-')).toBeNull();
  });

  it('returns null for "N/A"', () => {
    expect(parseShiftRange('N/A')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseShiftRange('')).toBeNull();
  });

  it('handles 12pm correctly (noon)', () => {
    const r = parseShiftRange('12pm-8pm');
    expect(r).toEqual({ start: 12, end: 20 });
  });

  it('handles 12am correctly (midnight)', () => {
    const r = parseShiftRange('12am-8am');
    expect(r).toEqual({ start: 0, end: 8 });
  });

  it('parses shift with minutes', () => {
    const r = parseShiftRange('9:30am-5:30pm');
    expect(r).toEqual({ start: 9.5, end: 17.5 });
  });
});

// ── Constants sanity checks ───────────────────────────────────────

describe('constants', () => {
  it('ACTIVE_AGENTS includes expected agents', () => {
    expect(ACTIVE_AGENTS).toContain('omar');
    expect(ACTIVE_AGENTS).toContain('danny');
    expect(ACTIVE_AGENTS).toContain('burke');
  });

  it('OUTBOUND_AGENTS includes william and joseph', () => {
    expect(OUTBOUND_AGENTS).toContain('william');
    expect(OUTBOUND_AGENTS).toContain('joseph');
  });

  it('EXCLUDED_AGENTS includes sara', () => {
    expect(EXCLUDED_AGENTS).toContain('sara');
  });
});
