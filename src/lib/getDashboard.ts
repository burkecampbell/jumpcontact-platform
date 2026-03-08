// ── JumpContact Platform — Data Layer ────────────────────────────────────────
// Canonical data fetcher. Imports shared constants/helpers from constants.ts.
// Sources: Google Sheets (Conversions, Missed Calls, Ytica) + Twilio (CDR, TaskRouter)

import { google } from 'googleapis';
import {
  ACTIVE_AGENTS,
  OUTBOUND_AGENTS,
  EXCLUDED_AGENTS_LOWER,
  CONVERSIONS_SHEET_ID,
  MISSED_CALLS_SHEET_ID,
  MISSED_CALLS_TAB,
  YTICA_SHEET_ID,
  normalizeAgent,
  decodeAgent,
  isJCAccount,
  isIbrahim,
  parseHMS,
  isMonday,
  capitalize,
} from './constants';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentStat { agent: string; count: number }
export interface AcctStat  { account: string; count: number }
export interface RepAgent  {
  agent: string;
  calls: number;
  talkMin: number;
  speedSec: number | null;
  wrapUpSec: number | null;
}
export interface OutboundAgent { agent: string; callsMade: number; talkMin: number }
export interface MissedData { total: number; jcTotal: number; ibrahimCount: number; byAccount: AcctStat[] }
export interface ConvPeriod { total: number; byAgent: AgentStat[]; byAccount: AcctStat[]; hourly?: number[] }

export interface RawCall {
  time: string;
  agent: string;
  phone: string;
  duration: number;
  direction: 'inbound' | 'outbound';
}

export interface PeriodData {
  conversions: ConvPeriod;
  missedCalls: MissedData;
  repActivity: { agents: RepAgent[]; outbound: OutboundAgent[]; avgSpeedSec: number | null };
}

export interface DashboardData {
  date: string;
  yesterdayDate: string;
  pulledAt: string;
  today: PeriodData;
  yesterday: PeriodData;
  mtd: ConvPeriod;
  recentCalls: RawCall[];
  weekend?: { friday: PeriodData; saturday: PeriodData; sunday: PeriodData };
}

// ── Google Sheets Auth ───────────────────────────────────────────────────────

const WORKSPACE_SID = process.env.TWILIO_WORKSPACE_SID || '';

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseConvTimestamp(ts: string): Date | null {
  if (!ts) return null;
  const parts = ts.trim().split(' ');
  const dateParts = parts[0].split('/');
  if (dateParts.length < 3) return null;
  const day   = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10);
  const year  = parseInt(dateParts[2], 10);
  if (!day || !month || !year) return null;
  let hour = 0, minute = 0;
  if (parts[1]) {
    const tp = parts[1].split(':');
    hour   = parseInt(tp[0], 10) || 0;
    minute = parseInt(tp[1], 10) || 0;
  }
  return new Date(year, month - 1, day, hour, minute);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function toAgentList(map: Record<string, number>): AgentStat[] {
  return Object.entries(map)
    .filter(([agent]) => !EXCLUDED_AGENTS_LOWER.includes(agent.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
    .map(([agent, count]) => ({ agent, count }));
}

function buildAccountMap(rows: { account: string }[]): AcctStat[] {
  const keys: Record<string, { display: string; count: number }> = {};
  for (const r of rows) {
    if (!r.account) continue;
    const k = r.account.toLowerCase();
    if (!keys[k]) keys[k] = { display: r.account, count: 0 };
    keys[k].count++;
  }
  return Object.values(keys)
    .sort((a, b) => b.count - a.count)
    .map(({ display, count }) => ({ account: display, count }));
}

function dateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function nextDayStr(d: Date): string {
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  return dateStr(next);
}

export function twilioAuth(): string | null {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

// ── SOURCE 1: CONVERSIONS ────────────────────────────────────────────────────

export async function getConversions(
  sheets: ReturnType<typeof getSheets>,
  dates: Date[],
  monthRef: Date,
) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONVERSIONS_SHEET_ID,
    range: 'Sheet1!A:D',
  });
  const rows = (res.data.values || []).slice(1);

  interface Conv { date: Date; agent: string; account: string; hour: number }
  const all: Conv[] = rows
    .map(row => {
      const d = parseConvTimestamp(row[0] || '');
      if (!d) return null;
      const agent = normalizeAgent(row[3] || '');
      if (!agent) return null;
      const account = (row[2] || '').trim();
      return { date: d, agent, account, hour: d.getHours() };
    })
    .filter((r): r is Conv => r !== null);

  // Build per-date buckets
  const byDate: Record<string, Conv[]> = {};
  for (const d of dates) {
    const key = dateStr(d);
    byDate[key] = all.filter(c => isSameDay(c.date, d));
  }

  // MTD
  const mtdRows = all.filter(c => isSameMonth(c.date, monthRef));
  const mtdMap: Record<string, number> = {};
  mtdRows.forEach(c => { mtdMap[c.agent] = (mtdMap[c.agent] || 0) + 1; });

  function buildPeriod(convs: Conv[]): ConvPeriod {
    const agentMap: Record<string, number> = {};
    const hourly = new Array(24).fill(0);
    convs.forEach(c => {
      agentMap[c.agent] = (agentMap[c.agent] || 0) + 1;
      hourly[c.hour]++;
    });
    return {
      total: convs.length,
      byAgent: toAgentList(agentMap),
      byAccount: buildAccountMap(convs),
      hourly,
    };
  }

  const periods: Record<string, ConvPeriod> = {};
  for (const [key, convs] of Object.entries(byDate)) {
    periods[key] = buildPeriod(convs);
  }

  return {
    periods,
    mtd: {
      total: mtdRows.length,
      byAgent: toAgentList(mtdMap),
      byAccount: buildAccountMap(mtdRows),
    },
  };
}

// ── SOURCE 2: MISSED CALLS ──────────────────────────────────────────────────

export async function getMissedCalls(
  sheets: ReturnType<typeof getSheets>,
  date: Date,
): Promise<MissedData> {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateSlash = `${mm}/${dd}`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: MISSED_CALLS_SHEET_ID,
    range: `${MISSED_CALLS_TAB}!A:H`,
  });
  const rows = (res.data.values || []).slice(1);
  const dateRows = rows.filter(row => (row[0] || '').trim().startsWith(dateSlash));

  let jcTotal = 0;
  let ibrahimCount = 0;
  const byAccountMap: Record<string, number> = {};
  for (const row of dateRows) {
    const acct = (row[3] || 'Unknown').trim();
    if (!isJCAccount(acct)) continue;
    jcTotal++;
    if (isIbrahim(acct)) ibrahimCount++;
    byAccountMap[acct] = (byAccountMap[acct] || 0) + 1;
  }

  const byAccount = Object.entries(byAccountMap)
    .sort((a, b) => b[1] - a[1])
    .map(([account, count]) => ({ account, count }));

  return { total: dateRows.length, jcTotal, ibrahimCount, byAccount };
}

// ── SOURCE 3: YTICA SPEED STATS ─────────────────────────────────────────────

export async function getYticaSpeedStats(
  sheets: ReturnType<typeof getSheets>,
  date: Date,
): Promise<{ speedMap: Record<string, number>; avgSpeedSec: number | null }> {
  try {
    const target = dateStr(date);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: YTICA_SHEET_ID,
      range: 'Sheet1!A:I',
    });
    const rows = (res.data.values || []).slice(1);

    const dayRows = rows.filter(row => {
      const cell = (row[0] || '').trim();
      if (cell.startsWith(target)) return true;
      const parts = cell.split('/');
      if (parts.length === 3) {
        const m = parts[0].padStart(2, '0');
        const d = parts[1].padStart(2, '0');
        const y = parts[2].split('T')[0];
        return `${y}-${m}-${d}` === target;
      }
      return false;
    });

    const speedMap: Record<string, number> = {};
    let totalSpeed = 0, count = 0;
    for (const row of dayRows) {
      const agentRaw = (row[1] || '').trim().toLowerCase();
      const hms      = (row[5] || '').trim();
      if (!agentRaw || !hms) continue;
      const secs = parseHMS(hms);
      if (!secs) continue;
      speedMap[agentRaw] = secs;
      totalSpeed += secs;
      count++;
    }
    const avgSpeedSec = count > 0 ? parseFloat((totalSpeed / count).toFixed(1)) : null;
    return { speedMap, avgSpeedSec };
  } catch {
    return { speedMap: {}, avgSpeedSec: null };
  }
}

// ── SOURCE 3b: TWILIO WORKER SPEED/WRAPUP ───────────────────────────────────

async function getWorkerSpeedStats(
  ds: string,
  auth: string,
): Promise<Record<string, { speedSec: number; wrapUpSec: number }>> {
  try {
    const workersRes = await fetch(
      `https://taskrouter.twilio.com/v1/Workspaces/${WORKSPACE_SID}/Workers?PageSize=100`,
      { headers: { Authorization: auth } },
    );
    const workersData = await workersRes.json() as {
      workers?: Array<{ sid: string; friendly_name: string }>;
    };
    const workers = workersData.workers || [];
    const results = await Promise.allSettled(
      workers.map(async w => {
        const statsRes = await fetch(
          `https://taskrouter.twilio.com/v1/Workspaces/${WORKSPACE_SID}/Workers/${w.sid}/Statistics?StartDate=${ds}&EndDate=${ds}`,
          { headers: { Authorization: auth } },
        );
        const statsData = await statsRes.json() as {
          cumulative?: { avg_task_acceptance_time?: number; avg_task_cleanup_time?: number };
        };
        const speedSec  = Math.round(statsData?.cumulative?.avg_task_acceptance_time || 0);
        const wrapUpSec = Math.round(statsData?.cumulative?.avg_task_cleanup_time   || 0);
        if (!speedSec && !wrapUpSec) return null;
        const rawName = w.friendly_name.split('@')[0].toLowerCase();
        return { agent: rawName, speedSec, wrapUpSec };
      }),
    );
    const map: Record<string, { speedSec: number; wrapUpSec: number }> = {};
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        map[r.value.agent] = { speedSec: r.value.speedSec, wrapUpSec: r.value.wrapUpSec };
      }
    }
    return map;
  } catch {
    return {};
  }
}

// ── SOURCE 4: TWILIO REP ACTIVITY ───────────────────────────────────────────

export interface TwilioCall { to: string; from: string; duration: string; start_time: string; status: string }

export async function fetchCallsForDate(date: Date, auth: string): Promise<TwilioCall[]> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const ds  = dateStr(date);
  const nds = nextDayStr(date);
  const calls: TwilioCall[] = [];
  let url: string | null =
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json?StartTime>=${ds}&StartTime<${nds}&PageSize=1000`;
  while (url) {
    const res  = await fetch(url, { headers: { Authorization: auth } });
    const data = await res.json() as { calls?: TwilioCall[]; next_page_uri?: string };
    if (data.calls) calls.push(...data.calls);
    url = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null;
  }
  return calls;
}

function buildRepActivity(
  calls: TwilioCall[],
  speedMap: Record<string, number>,
  avgSpeedSec: number | null,
  workerStats: Record<string, { speedSec: number; wrapUpSec: number }>,
) {
  const inboundMap: Record<string, { calls: number; durationSec: number }> = {};
  for (const call of calls) {
    const raw = decodeAgent(call.to || '');
    if (!raw || !ACTIVE_AGENTS.includes(raw)) continue;
    const agent = capitalize(raw === 'jose' || raw === 'daniel' ? 'danny' : raw);
    if (!inboundMap[agent]) inboundMap[agent] = { calls: 0, durationSec: 0 };
    inboundMap[agent].calls++;
    inboundMap[agent].durationSec += parseInt(call.duration) || 0;
  }

  const outboundMap: Record<string, { calls: number; durationSec: number }> = {};
  for (const call of calls) {
    const raw = decodeAgent(call.from || '');
    if (!raw || !OUTBOUND_AGENTS.includes(raw)) continue;
    const agent = capitalize(raw);
    if (!outboundMap[agent]) outboundMap[agent] = { calls: 0, durationSec: 0 };
    outboundMap[agent].calls++;
    outboundMap[agent].durationSec += parseInt(call.duration) || 0;
  }

  const agents: RepAgent[] = Object.entries(inboundMap)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([agent, s]) => {
      const rawName    = agent.toLowerCase();
      const lookupKeys = rawName === 'danny' ? ['danny', 'jose', 'daniel'] : [rawName];
      const speedSec   = lookupKeys.map(k => speedMap[k]).find(v => v != null) ?? null;
      const wrapUpSec  = lookupKeys.map(k => workerStats[k]?.wrapUpSec).find(v => v != null && v > 0) ?? null;
      return { agent, calls: s.calls, talkMin: +(s.durationSec / 60).toFixed(1), speedSec, wrapUpSec };
    });

  const outbound: OutboundAgent[] = Object.entries(outboundMap)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([agent, s]) => ({
      agent,
      callsMade: s.calls,
      talkMin: +(s.durationSec / 60).toFixed(1),
    }));

  return { agents, outbound, avgSpeedSec };
}

export function extractRecentCalls(calls: TwilioCall[], limit = 20): RawCall[] {
  const sorted = [...calls]
    .filter(c => c.status === 'completed')
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
    .slice(0, limit);

  return sorted.map(c => {
    const toAgent   = decodeAgent(c.to || '');
    const fromAgent = decodeAgent(c.from || '');
    const isInbound = !!toAgent && ACTIVE_AGENTS.includes(toAgent);
    return {
      time: c.start_time,
      agent: capitalize(isInbound ? (toAgent || '') : (fromAgent || 'unknown')),
      phone: isInbound ? c.from : c.to,
      duration: parseInt(c.duration) || 0,
      direction: isInbound ? 'inbound' as const : 'outbound' as const,
    };
  }).filter(c => c.agent && c.agent !== 'Unknown');
}

// ── Build period data for a single date ─────────────────────────────────────

async function buildPeriodData(
  date: Date,
  sheets: ReturnType<typeof getSheets>,
  convPeriod: ConvPeriod,
  auth: string | null,
): Promise<{ period: PeriodData; calls: TwilioCall[] }> {
  const [missed, speed] = await Promise.all([
    getMissedCalls(sheets, date),
    getYticaSpeedStats(sheets, date),
  ]);

  let repActivity = { agents: [] as RepAgent[], outbound: [] as OutboundAgent[], avgSpeedSec: speed.avgSpeedSec };
  let calls: TwilioCall[] = [];

  if (auth) {
    const ds = dateStr(date);
    const [fetchedCalls, workerStats] = await Promise.all([
      fetchCallsForDate(date, auth),
      getWorkerSpeedStats(ds, auth),
    ]);
    calls = fetchedCalls;
    repActivity = buildRepActivity(calls, speed.speedMap, speed.avgSpeedSec, workerStats);
  }

  return {
    period: { conversions: convPeriod, missedCalls: missed, repActivity },
    calls,
  };
}

// ── MAIN EXPORT ─────────────────────────────────────────────────────────────

export async function getDashboardData(): Promise<DashboardData> {
  const now       = new Date();
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const monday = isMonday();
  const sheets = getSheets();
  const auth   = twilioAuth();

  // Determine which dates we need
  const datesToFetch = [today, yesterday];
  let friday: Date | undefined, saturday: Date | undefined, sunday: Date | undefined;
  if (monday) {
    friday   = new Date(today); friday.setDate(friday.getDate() - 3);
    saturday = new Date(today); saturday.setDate(saturday.getDate() - 2);
    sunday   = new Date(today); sunday.setDate(sunday.getDate() - 1);
    datesToFetch.push(friday, saturday, sunday);
  }

  // Fetch all conversions in one Sheets call
  const convResult = await getConversions(sheets, datesToFetch, today);

  const todayKey     = dateStr(today);
  const yesterdayKey = dateStr(yesterday);
  const todayConv     = convResult.periods[todayKey]     || { total: 0, byAgent: [], byAccount: [], hourly: new Array(24).fill(0) };
  const yesterdayConv = convResult.periods[yesterdayKey]  || { total: 0, byAgent: [], byAccount: [], hourly: new Array(24).fill(0) };

  // Build today + yesterday in parallel
  const [todayResult, yesterdayResult] = await Promise.all([
    buildPeriodData(today, sheets, todayConv, auth),
    buildPeriodData(yesterday, sheets, yesterdayConv, auth),
  ]);

  const recentCalls = extractRecentCalls(todayResult.calls, 20);

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const result: DashboardData = {
    date:          fmtDate(today),
    yesterdayDate: fmtDate(yesterday),
    pulledAt:      new Date().toISOString(),
    today:         todayResult.period,
    yesterday:     yesterdayResult.period,
    mtd:           convResult.mtd,
    recentCalls,
  };

  // Monday: build weekend data
  if (monday && friday && saturday && sunday) {
    const friKey = dateStr(friday);
    const satKey = dateStr(saturday);
    const sunKey = dateStr(sunday);

    const [friResult, satResult, sunResult] = await Promise.all([
      buildPeriodData(friday, sheets,
        convResult.periods[friKey] || { total: 0, byAgent: [], byAccount: [], hourly: new Array(24).fill(0) }, auth),
      buildPeriodData(saturday, sheets,
        convResult.periods[satKey] || { total: 0, byAgent: [], byAccount: [], hourly: new Array(24).fill(0) }, auth),
      buildPeriodData(sunday, sheets,
        convResult.periods[sunKey] || { total: 0, byAgent: [], byAccount: [], hourly: new Array(24).fill(0) }, auth),
    ]);

    result.weekend = {
      friday:   friResult.period,
      saturday: satResult.period,
      sunday:   sunResult.period,
    };
  }

  return result;
}
