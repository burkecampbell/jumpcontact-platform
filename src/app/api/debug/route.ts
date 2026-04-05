import { NextResponse } from 'next/server';
import { readSheet } from '@/lib/sheets';
import { CONVERSIONS_SHEET_ID } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await readSheet(CONVERSIONS_SHEET_ID, 'A:E');
  const last10 = rows.slice(-10);
  const first2 = rows.slice(0, 2);
  return NextResponse.json({
    totalRows: rows.length,
    header: first2,
    last10Rows: last10,
  });
}
