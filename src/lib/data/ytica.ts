/**
 * Ytica speed stats from Google Sheets.
 * Source: Ytica spreadsheet (Sheet1!A:I)
 */
import { YTICA_SHEET_ID, parseHMS } from '../constants';
import { getSheets } from '../auth/google';
import { dateStr } from './conversions';

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
