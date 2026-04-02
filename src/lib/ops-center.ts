/**
 * Ops-Center API client.
 *
 * The operations center (https://operations-center-phi.vercel.app) is the
 * canonical data backend for both JC and MSC.  This module provides typed
 * helpers for calling its endpoints.
 *
 * Currently used for:
 *   - MSC conversion counts (GHL appt_booked tags)
 *
 * Future: migrate all Twilio/Sheets calls through ops-center so this
 * platform becomes a pure presentation layer.
 */

import { OPS_CENTER_URL } from './brand';

// ── Types ──────────────────────────────────────────────────────────────

export interface MscConversions {
  date: string;
  total: number;
  byAgent: Record<string, number>;
  byAccount: { account: string; count: number }[];
  byHour: number[];
}

export interface OpsLiveData {
  date: string;
  yesterdayDate: string;
  today: unknown;
  yesterday: unknown;
  mtd: unknown;
  trend7d: unknown;
  ytd: unknown;
  thisWeek: number;
  lastWeek: number;
  schedule: unknown;
  recentCalls: unknown[];
  pulledAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function opsGet<T>(path: string): Promise<T> {
  const url = `${OPS_CENTER_URL}${path}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ops-center ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ── Endpoints ───────────────────────────────────────────────────────────

/**
 * Fetch the full live dashboard payload from ops-center.
 * Returns the same DashboardData shape that /api/data produces.
 */
export async function fetchOpsLive(): Promise<OpsLiveData> {
  return opsGet<OpsLiveData>('/api/live');
}

/**
 * Fetch MSC conversion counts from GHL (appt_booked tags).
 * This is the ONLY source of truth for MSC conversions —
 * Google Sheets only tracks JC conversions.
 */
export async function fetchMscConversions(date: string): Promise<MscConversions> {
  return opsGet<MscConversions>(`/api/msc/conversions?date=${date}`);
}

/**
 * Fetch MSC conversion counts for a date range.
 */
export async function fetchMscConversionsRange(
  from: string,
  to: string,
): Promise<MscConversions[]> {
  return opsGet<MscConversions[]>(`/api/msc/conversions?from=${from}&to=${to}`);
}
