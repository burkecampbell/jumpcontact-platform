/**
 * KPI Sheet — PRIMARY data source for all agent metrics
 *
 * "Stats & KPI - Agents & Teams | Jump & MSC"
 * Sheet ID: 15d--jXhaWvWk_QuMJcsxV1Oirlc7bjtieS1p4ClZnec
 *
 * Replaces: Ytica (speed/wrap), TaskRouter (pickup rate), CDR pairing (agent metrics)
 *
 * Columns (Agents tab):
 *   A: Date                    — "04-06-2026" format
 *   B: Agent                   — Agent name
 *   C: Team - Jump/MSC         — "MSC", "Jump", "MSC/Jump"
 *   D: # of Conversions        — Integer
 *   E: # of Tickets            — Integer
 *   F: Ring Time (seconds)     — Decimal (THE speed metric Burke wants)
 *   G: Calls - Total Available — Total calls offered
 *   H: Total Picked up calls   — Calls answered
 *   I: % picked up calls       — Pickup rate as percentage string
 *   J: Conversion Rate         — Rate as percentage string
 *   K: Avg Talk time           — "0:02:35" format (h:mm:ss)
 *   L: Avg Hold                — "0:00:05" format
 *   M: Avg Wrap up time        — "0:02:23" format
 *   N: On Queue (seconds)      — Decimal
 *   O: BRB (seconds)           — Decimal or time format
 *   P: Lunch (seconds)         — Decimal or time format
 *   Q: Breaks total            — Decimal or time format
 *   R: Total Minutes           — "2:01:45" format (total talk time)
 */

import { readSheet } from './sheets';
import { normalizeAgent, TZ } from './constants';
import { cached } from './cache';
import type { Brand } from './brand';

const KPI_SHEET_ID = process.env.MSC_KPI_SHEET_ID || '15d--jXhaWvWk_QuMJcsxV1Oirlc7bjtieS1p4ClZnec';

// ── Types ──────────────────────────────────────────────────────────────

export interface KPIAgentDay {
  date: string;          // YYYY-MM-DD
  agent: string;         // normalized agent name
  rawAgent: string;      // original name from sheet
  team: 'jc' | 'msc' | 'blended';
  conversions: number;
  tickets: number;
  ringTimeSec: number;   // THE speed metric
  callsAvailable: number;
  callsPickedUp: number;
  pickupPct: number;     // 0-100
  conversionRate: number; // 0-100
  avgTalkSec: number;
  avgHoldSec: number;
  avgWrapSec: number;
  onQueueSec: number;
  totalTalkMin: number;  // total talk time in minutes
}

export interface KPIDailySummary {
  date: string;
  agents: KPIAgentDay[];
  team: {
    totalCalls: number;
    totalPickedUp: number;
    totalConversions: number;
    avgRingTime: number;
    avgPickupPct: number;
    avgTalkSec: number;
    avgWrapSec: number;
  };
}

// ── Parsing ────────────────────────────────────────────────────────────

/** Parse "0:02:35" or "0:00:05" to seconds */
function parseTimeSec(val: string): number {
  if (!val) return 0;
  const clean = val.trim();
  // Handle pure seconds
  const asNum = parseFloat(clean);
  if (!clean.includes(':') && !isNaN(asNum)) return asNum;
  // h:mm:ss or mm:ss
  const parts = clean.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return isNaN(asNum) ? 0 : asNum;
}

/** Parse percentage string "26.47%" to number 26.47 */
function parsePct(val: string): number {
  if (!val) return 0;
  const n = parseFloat(val.replace('%', ''));
  return isNaN(n) ? 0 : n;
}

/** Parse date "04-06-2026" to "2026-04-06" */
function parseDate(val: string): string | null {
  if (!val) return null;
  const clean = val.trim();
  // MM-DD-YYYY → YYYY-MM-DD
  const m = clean.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  // Already YYYY-MM-DD?
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  return null;
}

/** Map team column to brand */
function parseTeam(val: string): 'jc' | 'msc' | 'blended' {
  const lower = (val || '').toLowerCase().trim();
  if (lower === 'msc') return 'msc';
  if (lower === 'jump') return 'jc';
  if (lower.includes('msc') && lower.includes('jump')) return 'blended';
  if (lower.includes('/')) return 'blended';
  return 'jc'; // default
}

function parseRow(row: string[]): KPIAgentDay | null {
  const date = parseDate(row[0]);
  if (!date) return null;
  const rawAgent = (row[1] || '').trim();
  const agent = normalizeAgent(rawAgent) || rawAgent.toLowerCase();
  if (!agent) return null;

  return {
    date,
    agent,
    rawAgent,
    team: parseTeam(row[2]),
    conversions: parseInt(row[3]) || 0,
    tickets: parseInt(row[4]) || 0,
    ringTimeSec: parseFloat(row[5]) || 0,
    callsAvailable: parseInt(row[6]) || 0,
    callsPickedUp: parseInt(row[7]) || 0,
    pickupPct: parsePct(row[8]),
    conversionRate: parsePct(row[9]),
    avgTalkSec: parseTimeSec(row[10]),
    avgHoldSec: parseTimeSec(row[11]),
    avgWrapSec: parseTimeSec(row[12]),
    onQueueSec: parseFloat(row[13]) || 0,
    totalTalkMin: parseTimeSec(row[17]) / 60, // Column R: total talk time → minutes
  };
}

// ── Fetchers ───────────────────────────────────────────────────────────

/** Fetch all KPI rows from the Agents tab, cached 5 minutes */
async function fetchAllRows(): Promise<KPIAgentDay[]> {
  return cached('kpi-sheet-all', 300_000, async () => {
    const rows = await readSheet(KPI_SHEET_ID, 'Agents!A:R');
    if (rows.length < 2) return [];
    return rows.slice(1)
      .map(parseRow)
      .filter((r): r is KPIAgentDay => r !== null);
  });
}

/** Get agent data for a specific date */
export async function fetchKPIForDate(dateStr: string): Promise<KPIAgentDay[]> {
  const all = await fetchAllRows();
  return all.filter(r => r.date === dateStr);
}

/** Get agent data for a date range */
export async function fetchKPIForRange(from: string, to: string): Promise<KPIAgentDay[]> {
  const all = await fetchAllRows();
  return all.filter(r => r.date >= from && r.date <= to);
}

/** Get daily summary for a specific date */
export async function fetchKPIDailySummary(dateStr: string): Promise<KPIDailySummary> {
  const agents = await fetchKPIForDate(dateStr);

  const totalCalls = agents.reduce((s, a) => s + a.callsAvailable, 0);
  const totalPickedUp = agents.reduce((s, a) => s + a.callsPickedUp, 0);
  const totalConversions = agents.reduce((s, a) => s + a.conversions, 0);
  const withRing = agents.filter(a => a.ringTimeSec > 0);
  const avgRingTime = withRing.length > 0
    ? +(withRing.reduce((s, a) => s + a.ringTimeSec, 0) / withRing.length).toFixed(2)
    : 0;
  const avgPickupPct = totalCalls > 0
    ? +(totalPickedUp / totalCalls * 100).toFixed(1)
    : 0;
  const withTalk = agents.filter(a => a.avgTalkSec > 0);
  const avgTalkSec = withTalk.length > 0
    ? Math.round(withTalk.reduce((s, a) => s + a.avgTalkSec, 0) / withTalk.length)
    : 0;
  const withWrap = agents.filter(a => a.avgWrapSec > 0);
  const avgWrapSec = withWrap.length > 0
    ? Math.round(withWrap.reduce((s, a) => s + a.avgWrapSec, 0) / withWrap.length)
    : 0;

  return {
    date: dateStr,
    agents,
    team: { totalCalls, totalPickedUp, totalConversions, avgRingTime, avgPickupPct, avgTalkSec, avgWrapSec },
  };
}

/** Filter KPI data by brand */
export function filterKPIByBrand(agents: KPIAgentDay[], brand: Brand): KPIAgentDay[] {
  switch (brand) {
    case 'jc':
      return agents.filter(a => a.team === 'jc' || a.team === 'blended');
    case 'msc':
      return agents.filter(a => a.team === 'msc' || a.team === 'blended');
    case 'mixed':
      return agents; // everyone
  }
}

/** Get all available dates in the sheet */
export async function getAvailableDates(): Promise<string[]> {
  const all = await fetchAllRows();
  return [...new Set(all.map(r => r.date))].sort();
}

/** Get MTD summary for the current month */
export async function fetchKPIMtdSummary(monthPrefix: string): Promise<{
  totalConversions: number;
  totalCalls: number;
  byAgent: { agent: string; team: string; conversions: number; calls: number; ringTimeSec: number; pickupPct: number; avgWrapSec: number; totalTalkMin: number }[];
  byDate: { date: string; conversions: number; calls: number }[];
}> {
  const all = await fetchAllRows();
  const monthRows = all.filter(r => r.date.startsWith(monthPrefix));

  const agentMap = new Map<string, {
    team: string; conversions: number; calls: number;
    ringSum: number; ringCount: number;
    pickupSum: number; pickupCount: number;
    wrapSum: number; wrapCount: number;
    talkMin: number;
  }>();

  const dateMap = new Map<string, { conversions: number; calls: number }>();

  for (const r of monthRows) {
    // Agent aggregation
    const ae = agentMap.get(r.agent) || {
      team: r.team, conversions: 0, calls: 0,
      ringSum: 0, ringCount: 0, pickupSum: 0, pickupCount: 0,
      wrapSum: 0, wrapCount: 0, talkMin: 0,
    };
    ae.conversions += r.conversions;
    ae.calls += r.callsPickedUp;
    ae.talkMin += r.totalTalkMin;
    if (r.ringTimeSec > 0) { ae.ringSum += r.ringTimeSec * r.callsPickedUp; ae.ringCount += r.callsPickedUp; }
    if (r.pickupPct > 0) { ae.pickupSum += r.pickupPct * r.callsAvailable; ae.pickupCount += r.callsAvailable; }
    if (r.avgWrapSec > 0) { ae.wrapSum += r.avgWrapSec * r.callsPickedUp; ae.wrapCount += r.callsPickedUp; }
    agentMap.set(r.agent, ae);

    // Date aggregation
    const de = dateMap.get(r.date) || { conversions: 0, calls: 0 };
    de.conversions += r.conversions;
    de.calls += r.callsPickedUp;
    dateMap.set(r.date, de);
  }

  const byAgent = [...agentMap.entries()].map(([agent, s]) => ({
    agent,
    team: s.team,
    conversions: s.conversions,
    calls: s.calls,
    ringTimeSec: s.ringCount > 0 ? +(s.ringSum / s.ringCount).toFixed(2) : 0,
    pickupPct: s.pickupCount > 0 ? +(s.pickupSum / s.pickupCount).toFixed(1) : 0,
    avgWrapSec: s.wrapCount > 0 ? Math.round(s.wrapSum / s.wrapCount) : 0,
    totalTalkMin: +s.talkMin.toFixed(1),
  })).sort((a, b) => b.conversions - a.conversions);

  const byDate = [...dateMap.entries()]
    .map(([date, s]) => ({ date, ...s }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalConversions: byAgent.reduce((s, a) => s + a.conversions, 0),
    totalCalls: byAgent.reduce((s, a) => s + a.calls, 0),
    byAgent,
    byDate,
  };
}
