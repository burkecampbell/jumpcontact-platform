import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dailySnapshots } from '@/lib/db/schema';
import { sql, and, gte, lte, eq, asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/snapshots?from=2026-01-01&to=2026-04-02&brand=mixed
 *
 * Returns immutable daily snapshot data for trend charts.
 * This replaces mutable Google Sheets as the source for historical views.
 *
 * Query params:
 *   from  — start date inclusive (default: 30 days ago)
 *   to    — end date inclusive (default: today)
 *   brand — "mixed" | "jc" | "msc" (default: "mixed")
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const brand = params.get('brand') || 'mixed';

    // Default range: last 30 days
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);
    const fromDate = params.get('from') || defaultFrom.toISOString().slice(0, 10);
    const toDate = params.get('to') || now.toISOString().slice(0, 10);

    // Validate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
    }
    if (!['mixed', 'jc', 'msc'].includes(brand)) {
      return NextResponse.json({ error: 'Invalid brand. Use mixed, jc, or msc.' }, { status: 400 });
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(dailySnapshots)
      .where(
        and(
          eq(dailySnapshots.brand, brand),
          gte(dailySnapshots.date, fromDate),
          lte(dailySnapshots.date, toDate),
        )
      )
      .orderBy(asc(dailySnapshots.date));

    const res = NextResponse.json({
      brand,
      from: fromDate,
      to: toDate,
      count: rows.length,
      snapshots: rows.map(r => ({
        date: r.date,
        brand: r.brand,
        answeredCalls: r.answeredCalls,
        missedCalls: r.missedCalls,
        totalCalls: r.totalCalls,
        conversions: r.conversions,
        avgSpeedSec: r.avgSpeedSec,
        avgWrapSec: r.avgWrapSec,
        agentCount: r.agentCount,
        agentData: r.agentData,
        reconciliation: r.reconciliation,
        frozenAt: r.createdAt,
      })),
      pulledAt: new Date().toISOString(),
    });
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res;
  } catch (err) {
    console.error('[snapshots] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
