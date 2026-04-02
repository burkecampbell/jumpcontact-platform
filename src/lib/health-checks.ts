// ── Shared Health Check Logic ────────────────────────────────────────
// Used by both the cron endpoint (sends Telegram) and the /api/health
// endpoint (returns JSON for the dashboard banner).

import { readSheet, fetchYticaTeamStats, fetchConversions } from '@/lib/sheets';
import { twilioAuth, twilioAccountSid } from '@/lib/auth/twilio';
import { TZ, CONVERSIONS_SHEET_ID } from '@/lib/constants';

export interface HealthAlert {
  title: string;
  message: string;
  severity: 'warning' | 'critical';
}

export interface HealthResult {
  ok: boolean;
  timestamp: string;
  mstHour: number;
  checks: Record<string, string>;
  alerts: HealthAlert[];
}

function mstHour(): number {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ })).getHours();
}

function todayMST(): string {
  const parts = new Date().toLocaleDateString('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).split('/');
  return `${parts[2]}-${parts[0]}-${parts[1]}`;
}

function yesterdayMST(): string {
  const d = new Date(todayMST() + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Run all 4 health checks and return results. Does NOT send alerts. */
export async function runHealthChecks(): Promise<HealthResult> {
  const hour = mstHour();
  const alerts: HealthAlert[] = [];
  const checks: Record<string, string> = {};

  // 1. Ytica staleness (after 8am)
  if (hour >= 8) {
    try {
      const yesterday = yesterdayMST();
      const teamStats = await fetchYticaTeamStats(yesterday);
      if (!teamStats) {
        alerts.push({ title: 'Ytica Daily Dump Missing', message: `No TeamStats for ${yesterday}`, severity: 'warning' });
        checks.ytica = `ALERT: no data for ${yesterday}`;
      } else {
        checks.ytica = `OK: ${teamStats.totalCalls} calls`;
      }
    } catch (err) {
      checks.ytica = `ERROR: ${(err as Error).message}`;
      alerts.push({ title: 'Ytica Check Failed', message: (err as Error).message, severity: 'critical' });
    }
  } else {
    checks.ytica = 'SKIP: before 8am';
  }

  // 2. Sheets auth (always)
  try {
    const rows = await readSheet(CONVERSIONS_SHEET_ID, 'A1:A2');
    if (rows.length === 0) {
      alerts.push({ title: 'Sheets Auth Failure', message: 'Empty response — credentials may be broken', severity: 'critical' });
      checks.sheets = 'ALERT: empty response';
    } else {
      checks.sheets = 'OK';
    }
  } catch (err) {
    checks.sheets = `ERROR: ${(err as Error).message}`;
    alerts.push({ title: 'Sheets Unreachable', message: (err as Error).message, severity: 'critical' });
  }

  // 3. Zero conversions (after 11am)
  if (hour >= 11) {
    try {
      const convs = await fetchConversions(todayMST());
      if (convs.total === 0) {
        alerts.push({ title: 'Zero Conversions', message: `0 conversions past ${hour}:00 MST`, severity: 'warning' });
        checks.conversions = `ALERT: 0 by ${hour}:00`;
      } else {
        checks.conversions = `OK: ${convs.total}`;
      }
    } catch (err) {
      checks.conversions = `ERROR: ${(err as Error).message}`;
    }
  } else {
    checks.conversions = 'SKIP: before 11am';
  }

  // 4. CDR health (after 9am)
  if (hour >= 9) {
    try {
      const sid = twilioAccountSid();
      const auth = twilioAuth();
      const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json?StartTime>=${todayMST()}&PageSize=1`;
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (!res.ok) throw new Error(`Twilio API ${res.status}`);
      const json = await res.json();
      if ((json.calls || []).length === 0) {
        alerts.push({ title: 'CDR Empty', message: '0 calls today past 9am', severity: 'warning' });
        checks.cdr = 'ALERT: 0 calls';
      } else {
        checks.cdr = 'OK';
      }
    } catch (err) {
      checks.cdr = `ERROR: ${(err as Error).message}`;
      alerts.push({ title: 'CDR Unreachable', message: (err as Error).message, severity: 'critical' });
    }
  } else {
    checks.cdr = 'SKIP: before 9am';
  }

  return {
    ok: alerts.length === 0,
    timestamp: new Date().toISOString(),
    mstHour: hour,
    checks,
    alerts,
  };
}
