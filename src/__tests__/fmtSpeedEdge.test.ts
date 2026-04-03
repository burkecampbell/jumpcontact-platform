import { describe, it, expect } from 'vitest';
import { fmtSpeed } from '../lib/constants';

// ── fmtSpeed edge cases ──────────────────────────────────────────────
// Covers the exact boundary cases requested:
// 0, 0.01, 59.99, 60, 60.1, null, negative numbers

describe('fmtSpeed edge cases', () => {
  it('returns "---" for null', () => {
    expect(fmtSpeed(null)).toBe('—');
  });

  it('formats 0 as "0.00s"', () => {
    expect(fmtSpeed(0)).toBe('0.00s');
  });

  it('formats 0.01 as "0.01s"', () => {
    expect(fmtSpeed(0.01)).toBe('0.01s');
  });

  it('formats 59.99 as "59.99s" (just under threshold)', () => {
    expect(fmtSpeed(59.99)).toBe('59.99s');
  });

  it('formats exactly 60 as "1m 0s" (threshold boundary)', () => {
    expect(fmtSpeed(60)).toBe('1m 0s');
  });

  it('formats 60.1 as "1m 0s" (just over threshold)', () => {
    // 60.1 → rounded = 60.10 → Math.floor(60.10/60)=1, Math.round(60.10%60)=0
    expect(fmtSpeed(60.1)).toBe('1m 0s');
  });

  it('formats negative numbers as seconds (below 60)', () => {
    // Negative numbers: rounded = Math.round(-5 * 100) / 100 = -5.00
    // -5.00 < 60 → "-5.00s"
    expect(fmtSpeed(-5)).toBe('-5.00s');
  });

  it('formats -0.5 as "-0.50s"', () => {
    expect(fmtSpeed(-0.5)).toBe('-0.50s');
  });

  it('formats very small positive as "0.00s"', () => {
    // 0.001 → rounded = 0.00 (Math.round(0.001*100)/100 = 0)
    expect(fmtSpeed(0.001)).toBe('0.00s');
  });

  it('formats 0.005 correctly (rounding boundary)', () => {
    // 0.005 → Math.round(0.005*100)/100 = Math.round(0.5)/100 = 1/100 = 0.01
    expect(fmtSpeed(0.005)).toBe('0.01s');
  });

  it('formats 59.999 as seconds (rounds to 60.00 → minutes)', () => {
    // 59.999 → Math.round(59.999*100)/100 = Math.round(5999.9)/100 = 6000/100 = 60.00
    // 60.00 >= 60 → "1m 0s"
    expect(fmtSpeed(59.999)).toBe('1m 0s');
  });

  it('formats 59.994 as seconds (just under rounding to 60)', () => {
    // 59.994 → Math.round(59.994*100)/100 = Math.round(5999.4)/100 = 5999/100 = 59.99
    // 59.99 < 60 → "59.99s"
    expect(fmtSpeed(59.994)).toBe('59.99s');
  });

  it('formats 120 as "2m 0s"', () => {
    expect(fmtSpeed(120)).toBe('2m 0s');
  });

  it('formats 90.5 as "1m 31s"', () => {
    // 90.5 → rounded = 90.50 → floor(90.50/60)=1, round(90.50%60)=round(30.5)=31
    expect(fmtSpeed(90.5)).toBe('1m 31s');
  });

  it('formats large numbers correctly', () => {
    expect(fmtSpeed(3600)).toBe('60m 0s');
  });

  it('preserves decimal precision for sub-minute values', () => {
    expect(fmtSpeed(7.89)).toBe('7.89s');
    expect(fmtSpeed(12.34)).toBe('12.34s');
    expect(fmtSpeed(0.10)).toBe('0.10s');
  });
});
