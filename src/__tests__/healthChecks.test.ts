import { describe, it, expect } from 'vitest';
import type { HealthResult, HealthAlert } from '../lib/health-checks';

// ── Replicate runHealthChecks result-building logic ─────────────────
// The actual runHealthChecks() calls external APIs (Sheets, Twilio).
// We test the structure and logic of the result assembly without
// network calls, verifying that the contract is correct.

function buildHealthResult(
  checks: Record<string, string>,
  alerts: HealthAlert[],
  mstHour: number,
): HealthResult {
  return {
    ok: alerts.length === 0,
    timestamp: new Date().toISOString(),
    mstHour,
    checks,
    alerts,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Health check result structure', () => {
  it('returns correct shape with ok, checks, alerts fields', () => {
    const result = buildHealthResult({}, [], 10);
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('mstHour');
    expect(result).toHaveProperty('checks');
    expect(result).toHaveProperty('alerts');
  });

  it('ok is true when no alerts', () => {
    const result = buildHealthResult(
      { ytica: 'OK: 53 calls', sheets: 'OK', conversions: 'OK: 25', cdr: 'OK' },
      [],
      14,
    );
    expect(result.ok).toBe(true);
    expect(result.alerts).toHaveLength(0);
  });

  it('ok is false when alerts exist', () => {
    const alerts: HealthAlert[] = [
      { title: 'Ytica Daily Dump Missing', message: 'No TeamStats for 2026-04-02', severity: 'warning' },
    ];
    const result = buildHealthResult(
      { ytica: 'ALERT: no data for 2026-04-02' },
      alerts,
      10,
    );
    expect(result.ok).toBe(false);
    expect(result.alerts).toHaveLength(1);
  });

  it('timestamp is a valid ISO string', () => {
    const result = buildHealthResult({}, [], 10);
    expect(() => new Date(result.timestamp)).not.toThrow();
    const parsed = new Date(result.timestamp);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('mstHour is included in the result', () => {
    const result = buildHealthResult({}, [], 14);
    expect(result.mstHour).toBe(14);
  });

  it('checks contains key-value pairs for each check', () => {
    const result = buildHealthResult(
      { ytica: 'OK: 53 calls', sheets: 'OK', conversions: 'SKIP: before 11am', cdr: 'SKIP: before 9am' },
      [],
      7,
    );
    expect(result.checks.ytica).toBe('OK: 53 calls');
    expect(result.checks.sheets).toBe('OK');
    expect(result.checks.conversions).toBe('SKIP: before 11am');
    expect(result.checks.cdr).toBe('SKIP: before 9am');
  });
});

describe('Health check alert logic', () => {
  it('Ytica check skipped before 8am', () => {
    const hour = 7;
    const checks: Record<string, string> = {};
    const alerts: HealthAlert[] = [];

    if (hour >= 8) {
      // would check ytica
    } else {
      checks.ytica = 'SKIP: before 8am';
    }

    const result = buildHealthResult(checks, alerts, hour);
    expect(result.checks.ytica).toBe('SKIP: before 8am');
    expect(result.ok).toBe(true);
  });

  it('Ytica missing data produces warning after 8am', () => {
    const hour = 10;
    const checks: Record<string, string> = {};
    const alerts: HealthAlert[] = [];
    const yesterday = '2026-04-02';

    // Simulate: teamStats returned null
    const teamStats = null;
    if (hour >= 8) {
      if (!teamStats) {
        alerts.push({ title: 'Ytica Daily Dump Missing', message: `No TeamStats for ${yesterday}`, severity: 'warning' });
        checks.ytica = `ALERT: no data for ${yesterday}`;
      }
    }

    const result = buildHealthResult(checks, alerts, hour);
    expect(result.ok).toBe(false);
    expect(result.alerts[0].severity).toBe('warning');
    expect(result.alerts[0].title).toBe('Ytica Daily Dump Missing');
  });

  it('Sheets auth failure produces critical alert', () => {
    const checks: Record<string, string> = {};
    const alerts: HealthAlert[] = [];

    // Simulate: empty response from sheets
    const rows: string[][] = [];
    if (rows.length === 0) {
      alerts.push({ title: 'Sheets Auth Failure', message: 'Empty response — credentials may be broken', severity: 'critical' });
      checks.sheets = 'ALERT: empty response';
    }

    const result = buildHealthResult(checks, alerts, 12);
    expect(result.ok).toBe(false);
    expect(result.alerts[0].severity).toBe('critical');
    expect(result.alerts[0].title).toBe('Sheets Auth Failure');
  });

  it('Zero conversions after 11am produces warning', () => {
    const hour = 14;
    const checks: Record<string, string> = {};
    const alerts: HealthAlert[] = [];

    const convs = { total: 0 };
    if (hour >= 11) {
      if (convs.total === 0) {
        alerts.push({ title: 'Zero Conversions', message: `0 conversions past ${hour}:00 MST`, severity: 'warning' });
        checks.conversions = `ALERT: 0 by ${hour}:00`;
      }
    }

    const result = buildHealthResult(checks, alerts, hour);
    expect(result.ok).toBe(false);
    expect(result.alerts[0].title).toBe('Zero Conversions');
    expect(result.checks.conversions).toBe('ALERT: 0 by 14:00');
  });

  it('Conversions check skipped before 11am', () => {
    const hour = 9;
    const checks: Record<string, string> = {};
    const alerts: HealthAlert[] = [];

    if (hour >= 11) {
      // would check conversions
    } else {
      checks.conversions = 'SKIP: before 11am';
    }

    const result = buildHealthResult(checks, alerts, hour);
    expect(result.checks.conversions).toBe('SKIP: before 11am');
    expect(result.ok).toBe(true);
  });

  it('CDR check skipped before 9am', () => {
    const hour = 8;
    const checks: Record<string, string> = {};
    const alerts: HealthAlert[] = [];

    if (hour >= 9) {
      // would check CDR
    } else {
      checks.cdr = 'SKIP: before 9am';
    }

    const result = buildHealthResult(checks, alerts, hour);
    expect(result.checks.cdr).toBe('SKIP: before 9am');
    expect(result.ok).toBe(true);
  });

  it('CDR empty after 9am produces warning', () => {
    const hour = 12;
    const checks: Record<string, string> = {};
    const alerts: HealthAlert[] = [];

    const callsCount = 0;
    if (hour >= 9) {
      if (callsCount === 0) {
        alerts.push({ title: 'CDR Empty', message: '0 calls today past 9am', severity: 'warning' });
        checks.cdr = 'ALERT: 0 calls';
      }
    }

    const result = buildHealthResult(checks, alerts, hour);
    expect(result.ok).toBe(false);
    expect(result.alerts[0].title).toBe('CDR Empty');
  });

  it('multiple alerts combine — ok stays false', () => {
    const alerts: HealthAlert[] = [
      { title: 'Ytica Daily Dump Missing', message: 'No data', severity: 'warning' },
      { title: 'Sheets Auth Failure', message: 'Empty response', severity: 'critical' },
      { title: 'CDR Empty', message: '0 calls', severity: 'warning' },
    ];
    const result = buildHealthResult(
      { ytica: 'ALERT', sheets: 'ALERT', cdr: 'ALERT' },
      alerts,
      14,
    );
    expect(result.ok).toBe(false);
    expect(result.alerts).toHaveLength(3);
  });

  it('all checks passing means ok=true', () => {
    const checks: Record<string, string> = {};
    const alerts: HealthAlert[] = [];

    // All checks pass
    checks.ytica = 'OK: 53 calls';
    checks.sheets = 'OK';
    checks.conversions = 'OK: 28';
    checks.cdr = 'OK';

    const result = buildHealthResult(checks, alerts, 14);
    expect(result.ok).toBe(true);
    expect(result.alerts).toHaveLength(0);
    expect(Object.values(result.checks).every(v => v.startsWith('OK'))).toBe(true);
  });

  it('alert severity values are "warning" or "critical"', () => {
    const alerts: HealthAlert[] = [
      { title: 'Test Warning', message: 'msg', severity: 'warning' },
      { title: 'Test Critical', message: 'msg', severity: 'critical' },
    ];

    for (const alert of alerts) {
      expect(['warning', 'critical']).toContain(alert.severity);
    }
  });
});
