import forge from 'node-forge';
import { normalizeAgent, TZ, CONVERSIONS_SHEET_ID, YTICA_SHEET_ID, SCHEDULE_SHEET_ID } from './constants';
import type { ScheduleEntry } from './types';

// ── Auth ─────────────────────────────────────────────────────────────

let _cachedToken: string | null = null;
let _tokenExpiry = 0;

async function getAccessToken(): Promise<string | null> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.replace(/\\n/g, '').trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!email || !rawKey) return null;

  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && now < _tokenExpiry - 300) return _cachedToken;

  try {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }));
    const signing = `${header}.${payload}`;

    const privateKey = forge.pki.privateKeyFromPem(rawKey);
    const md = forge.md.sha256.create();
    md.update(signing, 'utf8');
    const sigBytes = privateKey.sign(md);
    const sig = Buffer.from(sigBytes, 'binary').toString('base64url');

    const jwt = `${signing}.${sig}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });

    if (!res.ok) {
      console.error('Token exchange failed:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    _cachedToken = data.access_token ?? null;
    _tokenExpiry = now + (data.expires_in ?? 3600);
    return _cachedToken;
  } catch (err) {
    console.error('getAccessToken error:', err);
    return null;
  }
}

function b64url(str: string): string {
  return Buffer.from(str).toString('base64url');
}

export async function readSheet(sheetId: string, range: string): Promise<string[][]> {
  const token = await getAccessToken();
  if (!token) {
    console.error(`[Sheets] No auth token — check GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY`);
    return [];
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[Sheets] ${res.status} reading ${range} from ${sheetId.slice(0, 8)}…: ${body.slice(0, 200)}`);
    return [];
  }

  const data = await res.json();
  return (data.values as string[][]) || [];
}

// ── Conversions ─────────────────────────────────────────────────────

interface ConversionRow {
  timestamp: Date;
  account: string;
  agent: string;
  hour: number;
}

export async function fetchConversions(dateStr: string): Promise<{
  total: number;
  byAgent: Record<string, number>;
  byAccount: { account: string; count: number }[];
  byHour: number[];
  firstConvByAgent: Record<string, string>;
  lastConvByAgent: Record<string, string>;
}> {
  try {
    const rows = await readSheet(CONVERSIONS_SHEET_ID, 'A:E');
    if (rows.length <= 1) return empty();

    const [yr, mo, dy] = dateStr.split('-').map(Number);

    const parsed: ConversionRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;
      const ts = parseFlexDate(row[0]);
      if (!ts) continue;

      const mst = new Date(ts.toLocaleString('en-US', { timeZone: TZ }));
      if (mst.getFullYear() !== yr || mst.getMonth() + 1 !== mo || mst.getDate() !== dy) continue;

      const agent = normalizeAgent(row[4] || row[3] || '');
      const account = (row[2] || '').trim();
      const hour = mst.getHours();
      parsed.push({ timestamp: ts, account, agent, hour });
    }

    const agentMap: Record<string, number> = {};
    const accountMap: Record<string, number> = {};
    const accountAgentMap: Record<string, Record<string, number>> = {};
    const hourly = new Array(24).fill(0);
    const firstConvTs: Record<string, Date> = {};
    const lastConvTs: Record<string, Date> = {};

    for (const c of parsed) {
      if (c.agent) {
        agentMap[c.agent] = (agentMap[c.agent] || 0) + 1;
        const mst = new Date(c.timestamp.toLocaleString('en-US', { timeZone: TZ }));
        if (!firstConvTs[c.agent] || mst < firstConvTs[c.agent]) firstConvTs[c.agent] = mst;
        if (!lastConvTs[c.agent]  || mst > lastConvTs[c.agent])  lastConvTs[c.agent]  = mst;
      }
      if (c.account) {
        const key = c.account.toLowerCase();
        accountMap[key] = (accountMap[key] || 0) + 1;
        if (c.agent) {
          if (!accountAgentMap[key]) accountAgentMap[key] = {};
          accountAgentMap[key][c.agent] = (accountAgentMap[key][c.agent] || 0) + 1;
        }
      }
      hourly[c.hour]++;
    }

    const fmt = (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const firstConvByAgent = Object.fromEntries(Object.entries(firstConvTs).map(([a, d]) => [a, fmt(d)]));
    const lastConvByAgent  = Object.fromEntries(Object.entries(lastConvTs).map(([a, d])  => [a, fmt(d)]));

    const byAccount = Object.entries(accountMap)
      .map(([account, count]) => {
        const agentCounts = accountAgentMap[account] || {};
        const topAgent = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        return { account, count, topAgent };
      })
      .sort((a, b) => b.count - a.count);

    return { total: parsed.length, byAgent: agentMap, byAccount, byHour: hourly, firstConvByAgent, lastConvByAgent };
  } catch (err) {
    console.error('Conversions fetch error:', err);
    return empty();
  }
}

function empty() {
  return { total: 0, byAgent: {}, byAccount: [], byHour: new Array(24).fill(0), firstConvByAgent: {}, lastConvByAgent: {} };
}

// ── Multi-date Conversions ──────────────────────────────────────────

export async function fetchConversionsForDates(dates: string[]): Promise<Map<string, {
  total: number;
  byAgent: Record<string, number>;
  byAccount: { account: string; count: number }[];
  byHour: number[];
}>> {
  const dateSet = new Set(dates);
  type Entry = { total: number; byAgent: Record<string, number>; _acct: Record<string, number>; _acctAgent: Record<string, Record<string, number>>; byHour: number[] };
  const result = new Map<string, Entry>();
  for (const d of dates) result.set(d, { total: 0, byAgent: {}, _acct: {}, _acctAgent: {}, byHour: new Array(24).fill(0) });

  try {
    const rows = await readSheet(CONVERSIONS_SHEET_ID, 'A:E');
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;
      const ts = parseFlexDate(row[0]);
      if (!ts) continue;
      const mst = new Date(ts.toLocaleString('en-US', { timeZone: TZ }));
      const yr = mst.getFullYear();
      const mo = String(mst.getMonth() + 1).padStart(2, '0');
      const dy = String(mst.getDate()).padStart(2, '0');
      const dateStr = `${yr}-${mo}-${dy}`;
      if (!dateSet.has(dateStr)) continue;
      const entry = result.get(dateStr)!;
      const agent = normalizeAgent(row[4] || row[3] || '');
      const account = (row[2] || '').trim().toLowerCase();
      entry.total++;
      if (agent) entry.byAgent[agent] = (entry.byAgent[agent] || 0) + 1;
      if (account) {
        entry._acct[account] = (entry._acct[account] || 0) + 1;
        if (agent) {
          if (!entry._acctAgent[account]) entry._acctAgent[account] = {};
          entry._acctAgent[account][agent] = (entry._acctAgent[account][agent] || 0) + 1;
        }
      }
      entry.byHour[mst.getHours()]++;
    }
  } catch (err) {
    console.error('fetchConversionsForDates error:', err);
  }

  const final = new Map<string, { total: number; byAgent: Record<string, number>; byAccount: { account: string; count: number }[]; byHour: number[] }>();
  for (const [date, e] of result) {
    final.set(date, {
      total: e.total,
      byAgent: e.byAgent,
      byAccount: Object.entries(e._acct).map(([account, count]) => {
        const agentCounts = e._acctAgent[account] || {};
        const topAgent = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        return { account, count, topAgent, agentBreakdown: Object.keys(agentCounts).length > 0 ? agentCounts : undefined };
      }).sort((a, b) => b.count - a.count),
      byHour: e.byHour,
    });
  }
  return final;
}

// ── YTD ─────────────────────────────────────────────────────────────

export async function fetchYTD(year: number): Promise<{
  total: number;
  byMonth: { month: string; conversions: number }[];
}> {
  try {
    const rows = await readSheet(CONVERSIONS_SHEET_ID, 'A:E');
    if (rows.length <= 1) return { total: 0, byMonth: [] };
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthMap: Record<number, number> = {};
    let total = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;
      const ts = parseFlexDate(row[0]);
      if (!ts) continue;
      const mst = new Date(ts.toLocaleString('en-US', { timeZone: TZ }));
      if (mst.getFullYear() !== year) continue;
      const mo = mst.getMonth() + 1;
      monthMap[mo] = (monthMap[mo] || 0) + 1;
      total++;
    }
    const currentMonth = new Date().getMonth() + 1;
    const byMonth = MONTH_NAMES
      .map((month, i) => ({ month, conversions: monthMap[i + 1] || 0, idx: i + 1 }))
      .filter(m => m.idx <= currentMonth)
      .map(({ month, conversions }) => ({ month, conversions }));
    return { total, byMonth };
  } catch (err) {
    console.error('fetchYTD error:', err);
    return { total: 0, byMonth: [] };
  }
}

// ── Schedule ────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

import scheduleJson from '../data/schedule-fallback.json';

export async function fetchSchedule(): Promise<ScheduleEntry[]> {
  try {
    // Columns: A=Agent, B-H=Sun-Sat shifts, I=Lunch Time, J=Lunch Mins
    const rows = await readSheet(SCHEDULE_SHEET_ID, 'A:J');
    if (rows.length <= 1) return fallbackSchedule();

    const entries: ScheduleEntry[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;
      const name = normalizeAgent(row[0]);
      if (!name || name === 'lunch' || name === 'break' || name === 'agent') continue;

      // Parse lunch from columns I and J
      const rawLunch = (row[8] || '').trim();
      const lunchTime = rawLunch && !/off|n\/a|^-?$/i.test(rawLunch) ? rawLunch : null;
      const lunchMins = parseInt(row[9]) || (lunchTime ? 60 : 0); // default 60 if lunch time set but no duration

      const schedule: Record<string, string> = {};
      let totalHrs = 0;
      for (let d = 0; d < 7; d++) {
        const val = (row[d + 1] || 'OFF').trim();
        schedule[DAY_NAMES[d]] = val;
        const gross = parseGrossShiftHours(val);
        // Deduct lunch only for days with a shift (not OFF)
        const net = gross > 0 ? Math.max(gross - lunchMins / 60, 0) : 0;
        totalHrs += net;
      }
      entries.push({ name, schedule, hrsPerWeek: totalHrs, lunchTime, lunchMins });
    }
    return entries.length > 0 ? entries : fallbackSchedule();
  } catch {
    return fallbackSchedule();
  }
}

/** Get NET productive hours for an agent on a given day (gross shift minus lunch). */
export function getScheduledHours(schedule: ScheduleEntry[], agent: string, date: Date): number {
  const dayName = DAY_NAMES[date.getDay()];
  const entry = schedule.find(s => s.name === normalizeAgent(agent));
  if (!entry) return 8;
  const shift = entry.schedule[dayName] || 'OFF';
  const gross = parseGrossShiftHours(shift);
  if (gross <= 0) return 0;
  // Deduct lunch from the sheet (column J). If no lunch data, deduct 1hr for shifts > 6hrs.
  const lunchDeduction = entry.lunchMins > 0 ? entry.lunchMins / 60 : (gross > 6 ? 1 : 0);
  return Math.max(gross - lunchDeduction, 0);
}

/** Parse GROSS shift hours from a shift range string. No lunch deduction. */
function parseGrossShiftHours(shift: string): number {
  if (!shift || shift === 'OFF' || shift === '-') return 0;
  const segments = shift.split(/[,\/]/).map(s => s.trim());
  let total = 0;
  for (const seg of segments) {
    const match = seg.match(/(\d{1,2})\s*(a|p)m?\s*[-–]\s*(\d{1,2})\s*(a|p)m?/i);
    if (!match) continue;
    let start = parseInt(match[1]);
    const startP = (match[2] || '').toLowerCase();
    let end = parseInt(match[3]);
    const endP = (match[4] || '').toLowerCase();
    if (startP === 'p' && start !== 12) start += 12;
    if (startP === 'a' && start === 12) start = 0;
    if (endP === 'p' && end !== 12) end += 12;
    if (endP === 'a' && end === 12) end = 0;
    if (end <= start) end += 24;
    total += end - start;
  }
  return total;
}

function fallbackSchedule(): ScheduleEntry[] {
  return (scheduleJson as { agents: Array<{ name: string; schedule: Record<string, string>; hrsPerWeek: number }> }).agents.map(a => ({
    name: normalizeAgent(a.name.split(' ')[0]),
    schedule: a.schedule,
    hrsPerWeek: a.hrsPerWeek,
    lunchTime: null,
    lunchMins: 60, // fallback: 1hr lunch (old behavior)
  }));
}

// ── Date Parsing ────────────────────────────────────────────────────

/** Convert a naive ISO string (no tz) into a proper Date treating it as MST/MDT */
function mstToDate(iso: string): Date {
  // Parse as explicit UTC so the result is deterministic regardless of server TZ
  const asUTC = new Date(iso + 'Z');
  if (isNaN(asUTC.getTime())) return asUTC; // propagate NaN
  // Compute the MST/MDT offset for this instant (handles DST automatically)
  const utcParts = new Date(asUTC.toLocaleString('en-US', { timeZone: 'UTC' }));
  const mstParts = new Date(asUTC.toLocaleString('en-US', { timeZone: TZ }));
  const offsetMs = utcParts.getTime() - mstParts.getTime(); // +6h MDT or +7h MST
  // Sheet wrote this time in MST, so actual UTC = naive + offset
  return new Date(asUTC.getTime() + offsetMs);
}

function parseFlexDate(s: string): Date | null {
  const parts = s.trim().split(/[\s,]+/);
  const datePart = parts[0];
  const timePart = parts[1] || '12:00';
  if (datePart.includes('-') && datePart.length === 10) {
    return mstToDate(`${datePart}T${timePart}`);
  }
  const slash = datePart.split('/');
  if (slash.length >= 3) {
    const a = parseInt(slash[0]);
    const b = parseInt(slash[1]);
    const y = parseInt(slash[2]);
    const year = y < 100 ? 2000 + y : y;
    if (a > 12) return mstToDate(`${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}T${timePart}`);
    if (b > 12) return mstToDate(`${year}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}T${timePart}`);
    if (a === b) return mstToDate(`${year}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}T${timePart}`);
    // Ambiguous: both a and b are ≤ 12 and different.
    // The conversions sheet has TWO data sources writing different formats
    // (M/D/Y and D/M/Y). Pick the interpretation closest to today that
    // isn't in the future.
    const mdy = mstToDate(`${year}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}T${timePart}`);
    const dmy = mstToDate(`${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}T${timePart}`);
    const now = Date.now();
    const mdyDist = mdy.getTime() <= now ? now - mdy.getTime() : Infinity;
    const dmyDist = dmy.getTime() <= now ? now - dmy.getTime() : Infinity;
    return mdyDist <= dmyDist ? mdy : dmy;
  }
  return null;
}

// ── Ytica Daily Data ──────────────────────────────────────────────────

const JUMP_AGENTS = new Set([
  // JC agents
  'omar', 'burke', 'ian', 'danny', 'chris', 'george', 'william',
  // MSC agents
  'anthony', 'richard', 'francis', 'natalie', 'rebecca', 'sofia', 'desi', 'sue',
  // Blended (work both JC and MSC)
  'wendy', 'sara', 'jose',
]);

export interface YticaAgent {
  agent: string;
  calls: number;
  talkMin: number;
  speedSec: number | null;
  wrapUpSec: number | null;
  avgHandlingMin: number | null;
  inboundConversations: number;
  holdTimeSec: number | null;
}

export interface YticaRepActivity {
  agents: YticaAgent[];
  avgSpeedSec: number | null;
  source: 'ytica';
}

function parseTimeMins(val: string): number {
  if (!val) return 0;
  const parts = val.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return parseFloat(val) || 0;
}

function parseTimeSec(val: string): number | null {
  if (!val) return null;
  const parts = val.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

export async function fetchYticaRepActivity(dateStr: string): Promise<YticaRepActivity | null> {
  try {
    // Sheet1 is populated by the ytica-email-parser Apps Script.
    // Columns: A=Date, B=Agent, C=Total Talk Time, D=Avg Ring Time,
    //          E=Avg Talk Time, F=Avg Speed to Answer,
    //          G=Call Conversations, H=Avg Wrap Up Time, I=Schedule Activity
    const rows = await readSheet(YTICA_SHEET_ID, 'Sheet1!A:I');
    if (rows.length < 2) return null;

    const dateRows = rows.slice(1).filter(row => (row[0] || '').trim() === dateStr);
    if (dateRows.length === 0) return null;

    const agents: YticaAgent[] = [];
    for (const row of dateRows) {
      const agent = normalizeAgent((row[1] || '').trim());
      if (!agent || !JUMP_AGENTS.has(agent)) continue;

      agents.push({
        agent,
        calls: parseInt(row[6]) || 0,           // G: Call Conversations
        talkMin: +parseTimeMins(row[2]).toFixed(1), // C: Total Talk Time
        speedSec: parseTimeSec(row[3]),           // D: Avg Ring Time (agent pickup speed)
        wrapUpSec: parseTimeSec(row[7]),           // H: Avg Wrap Up Time
        avgHandlingMin: null,
        inboundConversations: 0,
        holdTimeSec: null,
      });
    }

    agents.sort((a, b) => (a.speedSec || 999) - (b.speedSec || 999));

    const speedVals = agents.filter(a => a.speedSec).map(a => a.speedSec!);
    const avgSpeedSec = speedVals.length > 0
      ? +(speedVals.reduce((s, v) => s + v, 0) / speedVals.length).toFixed(1)
      : null;

    return { agents, avgSpeedSec, source: 'ytica' };
  } catch (e) {
    console.warn('Ytica RepActivity fetch failed:', (e as Error).message);
    return null;
  }
}

// ── Ytica MTD Activity (aggregate per agent for the month) ─────────

export interface YticaMtdAgent {
  agent: string;
  totalCalls: number;
  totalTalkMin: number;
  avgSpeedSec: number | null;
  avgWrapUpSec: number | null;
}

/**
 * Aggregate Ytica daily rows for the current month into per-agent totals.
 * Speed and wrap-up are call-weighted averages across days.
 * @param monthPrefix e.g. "2026-04"
 */
export async function fetchYticaMtdActivity(monthPrefix: string): Promise<YticaMtdAgent[]> {
  try {
    const rows = await readSheet(YTICA_SHEET_ID, 'Sheet1!A:I');
    if (rows.length < 2) return [];

    const monthRows = rows.slice(1).filter(row => (row[0] || '').trim().startsWith(monthPrefix));
    if (monthRows.length === 0) return [];

    const agentMap = new Map<string, {
      calls: number; talkMin: number;
      speedSum: number; speedCount: number;
      wrapSum: number; wrapCount: number;
    }>();

    for (const row of monthRows) {
      const agent = normalizeAgent((row[1] || '').trim());
      if (!agent || !JUMP_AGENTS.has(agent)) continue;

      const calls = parseInt(row[6]) || 0;
      const talkMin = parseTimeMins(row[2]);
      const speedSec = parseTimeSec(row[3]);  // D: Avg Ring Time (agent pickup speed)
      const wrapUpSec = parseTimeSec(row[7]);

      const entry = agentMap.get(agent) || { calls: 0, talkMin: 0, speedSum: 0, speedCount: 0, wrapSum: 0, wrapCount: 0 };
      entry.calls += calls;
      entry.talkMin += talkMin;
      if (speedSec !== null && calls > 0) {
        entry.speedSum += speedSec * calls;
        entry.speedCount += calls;
      }
      if (wrapUpSec !== null && calls > 0) {
        entry.wrapSum += wrapUpSec * calls;
        entry.wrapCount += calls;
      }
      agentMap.set(agent, entry);
    }

    const result: YticaMtdAgent[] = [];
    for (const [agent, d] of agentMap) {
      result.push({
        agent,
        totalCalls: d.calls,
        totalTalkMin: Math.round(d.talkMin * 10) / 10,
        avgSpeedSec: d.speedCount > 0 ? Math.round((d.speedSum / d.speedCount) * 10) / 10 : null,
        avgWrapUpSec: d.wrapCount > 0 ? Math.round((d.wrapSum / d.wrapCount) * 10) / 10 : null,
      });
    }

    return result.sort((a, b) => b.totalCalls - a.totalCalls);
  } catch (e) {
    console.warn('Ytica MTD Activity fetch failed:', (e as Error).message);
    return [];
  }
}

export interface YticaTeamStats {
  totalCalls: number;
  inbound: number;
  outbound: number;
  talkTime: string;
  avgTalk: string;
  missed: number;
  missedOver15: number;
  missedPct: string;
}

export async function fetchYticaTeamStats(dateStr: string): Promise<YticaTeamStats | null> {
  try {
    const rows = await readSheet(YTICA_SHEET_ID, 'TeamStats!A:M');
    if (rows.length < 2) return null;

    const dateRow = rows.slice(1).find(row => (row[0] || '').trim() === dateStr);
    if (!dateRow) return null;

    return {
      totalCalls: parseInt(dateRow[2]) || 0,
      inbound: parseInt(dateRow[3]) || 0,
      outbound: parseInt(dateRow[4]) || 0,
      talkTime: dateRow[5] || '',
      avgTalk: dateRow[6] || '',
      missed: parseInt(dateRow[10]) || 0,
      missedOver15: parseInt(dateRow[11]) || 0,
      missedPct: dateRow[12] || '',
    };
  } catch (e) {
    console.warn('Ytica TeamStats fetch failed:', (e as Error).message);
    return null;
  }
}

/** Fetch Ytica TeamStats for multiple dates in one sheet read */
export async function fetchYticaTeamStatsRange(dates: string[]): Promise<YticaTeamStats[]> {
  try {
    const rows = await readSheet(YTICA_SHEET_ID, 'TeamStats!A:M');
    if (rows.length < 2) return [];
    const dateSet = new Set(dates);
    return rows.slice(1)
      .filter(row => dateSet.has((row[0] || '').trim()))
      .map(row => ({
        totalCalls: parseInt(row[2]) || 0,
        inbound: parseInt(row[3]) || 0,
        outbound: parseInt(row[4]) || 0,
        talkTime: row[5] || '',
        avgTalk: row[6] || '',
        missed: parseInt(row[10]) || 0,
        missedOver15: parseInt(row[11]) || 0,
        missedPct: row[12] || '',
      }));
  } catch (e) {
    console.warn('Ytica TeamStats range fetch failed:', (e as Error).message);
    return [];
  }
}
