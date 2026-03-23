/**
 * Missed calls data from Google Sheets.
 * Source: Missed Calls spreadsheet
 */
import {
  MISSED_CALLS_SHEET_ID,
  MISSED_CALLS_TAB,
  isJCAccount,
  isIbrahim,
} from '../constants';
import { getSheets } from '../auth/google';
import type { MissedData } from '../types';

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
