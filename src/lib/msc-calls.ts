/**
 * MSC Client Calls — Google Sheet data source
 *
 * Sheet: "DATA - CLIENTCALLS MSC ALL FORMS RECORDED INFO"
 * ID: YOUR_SHEET_ID
 *
 * Columns:
 *   A: Date           — "8/1/2025 6:39:00" format
 *   B: Name           — Caller name
 *   C: Phone          — Phone number
 *   D: Disposition     — "No Answer/Voicemail", "Agent Handled", "Booked/Rescheduled", "Solicitation/Email"
 *   E: TAG            — Classification tag
 *   F: Notes          — Call notes
 *   G: Email          — Caller email
 *   H: Action Type    — "Inbound" or "Outbound"
 *   I: Agent          — MSC agent name (Bruna, Daniel, Sean, etc.)
 *   J: Is This a Conversion — "YES - this is a conversion" / "NO - this is NOT a conversion"
 *   K: Account        — Client name (Bella NYC Aesthetics, Cunningham Clinic, etc.)
 *   L: Did you collect — Data collection field
 *   M: New Patient/Existing — "New Patient/Client", "Existing Patient/Client", "Other"
 *   N: Lead Conversion — Lead attribution
 *   O: # of Calls     — Call count
 */

import { MSC_CALLS_SHEET_ID, normalizeAgent, TZ } from './constants';
import { cached } from './cache';

// Re-use the sheets reader from sheets.ts
let _readSheet: ((sheetId: string, range: string) => Promise<string[][]>) | null = null;

async function getReadSheet() {
  if (_readSheet) return _readSheet;
  const { readSheet } = await import('./sheets');
  _readSheet = readSheet;
  return readSheet;
}

// ── Types ──────────────────────────────────────────────────────────────

export interface MSCCallRecord {
  date: string;       // ISO date string
  time: string;       // Original timestamp
  name: string;       // Caller name
  phone: string;      // Phone number
  disposition: string; // No Answer, Agent Handled, Booked/Rescheduled, etc.
  tag: string;
  notes: string;
  actionType: 'inbound' | 'outbound';
  agent: string;      // Normalized agent name
  isConversion: boolean;
  account: string;    // MSC client name
  patientType: string; // New Patient, Existing, Other
}

export interface MSCDailySummary {
  date: string;
  totalCalls: number;
  inbound: number;
  outbound: number;
  conversions: number;
  noAnswer: number;
  agentHandled: number;
  booked: number;
  byAgent: Record<string, { calls: number; conversions: number }>;
  byAccount: Record<string, { calls: number; conversions: number }>;
}

// ── Parsing ────────────────────────────────────────────────────────────

function parseDate(raw: string): { dateStr: string; iso: string } | null {
  if (!raw) return null;
  try {
    // Format: "8/1/2025 6:39:00" or "8/1/2025 6:39:00 AM"
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
    return { dateStr, iso: d.toISOString() };
  } catch {
    return null;
  }
}

function parseRow(row: string[]): MSCCallRecord | null {
  const parsed = parseDate(row[0]);
  if (!parsed) return null;

  const agent = normalizeAgent((row[8] || '').trim());
  const convText = (row[9] || '').toLowerCase();
  const isConversion = convText.includes('yes');
  const actionRaw = (row[7] || '').toLowerCase();
  const actionType = actionRaw.includes('outbound') ? 'outbound' as const : 'inbound' as const;

  return {
    date: parsed.dateStr,
    time: parsed.iso,
    name: (row[1] || '').trim(),
    phone: (row[2] || '').trim(),
    disposition: (row[3] || '').trim(),
    tag: (row[4] || '').trim(),
    notes: (row[5] || '').trim(),
    actionType,
    agent: agent || (row[8] || '').trim().toLowerCase(),
    isConversion,
    account: (row[10] || '').trim(),
    patientType: (row[12] || '').trim(),
  };
}

// ── Fetchers ───────────────────────────────────────────────────────────

/** Fetch all MSC call records for a date range */
export async function fetchMSCCalls(from: string, to: string): Promise<MSCCallRecord[]> {
  return cached(`msc-calls:${from}:${to}`, 300_000, async () => {
    const read = await getReadSheet();
    // Read columns A through O
    const rows = await read(MSC_CALLS_SHEET_ID, 'Sheet1!A:O');
    if (rows.length < 2) return [];

    const records: MSCCallRecord[] = [];
    for (const row of rows.slice(1)) { // skip header
      const record = parseRow(row);
      if (!record) continue;
      if (record.date >= from && record.date <= to) {
        records.push(record);
      }
    }

    // Sort newest first
    records.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return records;
  });
}

/** Fetch daily summary for a specific date */
export async function fetchMSCDailySummary(dateStr: string): Promise<MSCDailySummary> {
  const calls = await fetchMSCCalls(dateStr, dateStr);

  const byAgent: Record<string, { calls: number; conversions: number }> = {};
  const byAccount: Record<string, { calls: number; conversions: number }> = {};
  let inbound = 0, outbound = 0, conversions = 0, noAnswer = 0, agentHandled = 0, booked = 0;

  for (const c of calls) {
    // Direction
    if (c.actionType === 'inbound') inbound++;
    else outbound++;

    // Conversions
    if (c.isConversion) conversions++;

    // Disposition
    const disp = c.disposition.toLowerCase();
    if (disp.includes('no answer') || disp.includes('voicemail')) noAnswer++;
    else if (disp.includes('agent handled')) agentHandled++;
    else if (disp.includes('booked') || disp.includes('reschedule')) booked++;

    // By agent
    if (c.agent) {
      const ae = byAgent[c.agent] || { calls: 0, conversions: 0 };
      ae.calls++;
      if (c.isConversion) ae.conversions++;
      byAgent[c.agent] = ae;
    }

    // By account
    if (c.account) {
      const ac = byAccount[c.account] || { calls: 0, conversions: 0 };
      ac.calls++;
      if (c.isConversion) ac.conversions++;
      byAccount[c.account] = ac;
    }
  }

  return {
    date: dateStr,
    totalCalls: calls.length,
    inbound,
    outbound,
    conversions,
    noAnswer,
    agentHandled,
    booked,
    byAgent,
    byAccount,
  };
}

/** Fetch MTD summary */
export async function fetchMSCMtdSummary(monthPrefix: string): Promise<{
  total: number;
  conversions: number;
  byAgent: { agent: string; calls: number; conversions: number }[];
  byAccount: { account: string; calls: number; conversions: number }[];
}> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const from = monthPrefix + '-01';
  const to = today > from ? today : from;

  const calls = await fetchMSCCalls(from, to);

  const agentMap = new Map<string, { calls: number; conversions: number }>();
  const acctMap = new Map<string, { calls: number; conversions: number }>();
  let conversions = 0;

  for (const c of calls) {
    if (c.isConversion) conversions++;

    if (c.agent) {
      const ae = agentMap.get(c.agent) || { calls: 0, conversions: 0 };
      ae.calls++;
      if (c.isConversion) ae.conversions++;
      agentMap.set(c.agent, ae);
    }

    if (c.account) {
      const ac = acctMap.get(c.account) || { calls: 0, conversions: 0 };
      ac.calls++;
      if (c.isConversion) ac.conversions++;
      acctMap.set(c.account, ac);
    }
  }

  return {
    total: calls.length,
    conversions,
    byAgent: [...agentMap.entries()]
      .map(([agent, s]) => ({ agent, ...s }))
      .sort((a, b) => b.conversions - a.conversions),
    byAccount: [...acctMap.entries()]
      .map(([account, s]) => ({ account, ...s }))
      .sort((a, b) => b.conversions - a.conversions),
  };
}
