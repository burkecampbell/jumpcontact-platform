/**
 * Conversions data from Google Sheets.
 * Source: Conversions spreadsheet (Sheet1!A:D)
 */
import {
  EXCLUDED_AGENTS_LOWER,
  CONVERSIONS_SHEET_ID,
  normalizeAgent,
} from '../constants';
import { getSheets } from '../auth/google';
import type { AgentStat, AcctStat, ConvPeriod } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function parseConvTimestamp(ts: string): Date | null {
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

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function toAgentList(map: Record<string, number>): AgentStat[] {
  return Object.entries(map)
    .filter(([agent]) => !EXCLUDED_AGENTS_LOWER.includes(agent.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
    .map(([agent, count]) => ({ agent, count }));
}

export function buildAccountMap(rows: { account: string }[]): AcctStat[] {
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

export function dateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function nextDayStr(d: Date): string {
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  return dateStr(next);
}

// ── Main ─────────────────────────────────────────────────────────────────────

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
  const mtdAgentDaily: Record<string, Record<string, number>> = {};
  const mtdDailyMap: Record<string, number> = {};
  mtdRows.forEach(c => {
    mtdMap[c.agent] = (mtdMap[c.agent] || 0) + 1;
    const dayKey = dateStr(c.date);
    mtdDailyMap[dayKey] = (mtdDailyMap[dayKey] || 0) + 1;
    const agentLower = c.agent.toLowerCase();
    if (!mtdAgentDaily[agentLower]) mtdAgentDaily[agentLower] = {};
    mtdAgentDaily[agentLower][dayKey] = (mtdAgentDaily[agentLower][dayKey] || 0) + 1;
  });

  const mtdDaily = Object.entries(mtdDailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));

  const mtdByAgent = toAgentList(mtdMap).map(a => ({
    ...a,
    daily: mtdAgentDaily[a.agent.toLowerCase()] || {},
  }));

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
      byAgent: mtdByAgent,
      byAccount: buildAccountMap(mtdRows),
      mtdDaily,
    },
  };
}
