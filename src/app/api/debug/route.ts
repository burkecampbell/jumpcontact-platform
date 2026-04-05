import { NextResponse } from 'next/server';
import { readSheet } from '@/lib/sheets';
import { CONVERSIONS_SHEET_ID } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await readSheet(CONVERSIONS_SHEET_ID, 'A:E');
  // Find rows with timestamps containing /4/2026 (April 2026 in either format)
  const april2026 = rows.filter(r => r[0] && r[0].includes('/4/2026'));
  // Find rows with 4/ at start (month=4 or day=4)
  const starts4 = rows.filter(r => r[0] && r[0].startsWith('4/'));
  // Find rows with 5/4/2026 specifically
  const may4or5apr = rows.filter(r => r[0] && r[0].startsWith('5/4/2026'));
  // Last 30 rows to see the pattern
  const last30 = rows.slice(-30);
  return NextResponse.json({
    totalRows: rows.length,
    header: rows[0],
    april2026_count: april2026.length,
    april2026_sample: april2026.slice(0, 20).map(r => r[0]),
    starts4_count: starts4.length,
    starts4_2026_sample: starts4.filter(r => r[0].includes('2026')).slice(0, 20).map(r => [r[0], r[2], r[3]]),
    may4or5apr_count: may4or5apr.length,
    last30_timestamps: last30.map(r => r[0]),
  });
}
