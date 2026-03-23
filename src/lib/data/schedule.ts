/**
 * Agent schedule from Google Sheets.
 * Source: Schedule spreadsheet (Sheet1!A:H)
 *
 * Sheet format:
 *   Row 1 = headers: Agent | Sun | Mon | Tue | Wed | Thu | Fri | Sat
 *   Cells: "8a-5p" (time range), "OFF" or empty (no shift)
 *
 * Returns net hours per day (1-hour lunch deducted when gross > 6hrs).
 * Cache: 1 hour — schedule changes at most once per day.
 * Fallback: hardcoded AGENT_SCHEDULE from constants.ts on any error.
 */
import { getSheets } from '../auth/google';
import { cached } from '../cache';
import { SCHEDULE_SHEET_ID, AGENT_SCHEDULE, normalizeAgent } from '../constants';
import type { AgentSchedule } from '../types';

// ── Time Range Parsing ───────────────────────────────────────────────────────

/** Convert "8a" or "5p" → 24-hour number. Returns NaN on bad input. */
function parseHour(token: string): number {
  const t = token.trim().toLowerCase();
  const m = t.match(/^(\d{1,2})(a|p)$/);
  if (!m) return NaN;
  let h = parseInt(m[1], 10);
  if (m[2] === 'a' && h === 12) h = 0;
  if (m[2] === 'p' && h !== 12) h += 12;
  return h;
}

/**
 * "8a-5p" → net hours (gross minus 1hr lunch when gross > 6).
 * "OFF", empty, or unparseable → 0.
 */
export function parseTimeRange(cell: string): number {
  if (!cell || cell.trim().toUpperCase() === 'OFF') return 0;
  const parts = cell.trim().split('-');
  if (parts.length !== 2) return 0;
  const start = parseHour(parts[0]);
  const end   = parseHour(parts[1]);
  if (isNaN(start) || isNaN(end)) return 0;
  const gross = end > start ? end - start : (24 - start + end);
  return gross > 6 ? gross - 1 : gross;
}

// ── Schedule Fetcher ─────────────────────────────────────────────────────────

export async function fetchSchedule(): Promise<AgentSchedule> {
  return cached('schedule', 3_600_000, async () => {
    try {
      const sheets = getSheets();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SCHEDULE_SHEET_ID,
        range: 'Sheet1!A:H',
      });
      const rows = (res.data.values || []).slice(1); // skip header row
      const schedule: AgentSchedule = {};
      for (const row of rows) {
        const rawName = (row[0] || '').toString().trim();
        if (!rawName) continue;
        const agent = normalizeAgent(rawName).toLowerCase();
        // Columns B–H = Sun through Sat (indices 1–7)
        schedule[agent] = [
          parseTimeRange(row[1] || ''),
          parseTimeRange(row[2] || ''),
          parseTimeRange(row[3] || ''),
          parseTimeRange(row[4] || ''),
          parseTimeRange(row[5] || ''),
          parseTimeRange(row[6] || ''),
          parseTimeRange(row[7] || ''),
        ];
      }
      return schedule;
    } catch (err) {
      console.error('Schedule fetch failed, using fallback:', err);
      return AGENT_SCHEDULE;
    }
  });
}

// ── Schedule Helpers ─────────────────────────────────────────────────────────

/** Get net scheduled hours for an agent on a specific date. */
export function getScheduledHoursFromSchedule(
  schedule: AgentSchedule,
  agent: string,
  date: Date,
): number {
  const key = agent.toLowerCase();
  return schedule[key]?.[date.getDay()] ?? 0;
}

/** Total agent-hours of coverage for a given day (all agents combined). */
export function getTotalCoverage(schedule: AgentSchedule, date: Date): number {
  const dow = date.getDay();
  return Object.values(schedule).reduce((sum, week) => sum + (week[dow] ?? 0), 0);
}
