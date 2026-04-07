import { NextResponse } from 'next/server';
import { readSheet } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

const KPI_SHEET_ID = process.env.MSC_KPI_SHEET_ID || '15d--jXhaWvWk_QuMJcsxV1Oirlc7bjtieS1p4ClZnec';

export async function GET() {
  try {
    // Get tab names
    const agents = await readSheet(KPI_SHEET_ID, 'Agents!A1:R5');
    const headers = agents[0] || [];
    const sampleRows = agents.slice(1, 5);

    // Count total rows
    const allDates = await readSheet(KPI_SHEET_ID, 'Agents!A:A');

    return NextResponse.json({
      ok: true,
      sheetId: KPI_SHEET_ID,
      headers,
      columnCount: headers.length,
      totalRows: allDates.length,
      sample: sampleRows.map(r => ({
        date: r[0],
        agent: r[1],
        team: r[2],
        conversions: r[3],
        tickets: r[4],
        ringTimeSec: r[5],
        callsAvail: r[6],
        pickedUp: r[7],
        pickupPct: r[8],
        convRate: r[9],
        avgTalk: r[10],
        avgHold: r[11],
        avgWrap: r[12],
      })),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
