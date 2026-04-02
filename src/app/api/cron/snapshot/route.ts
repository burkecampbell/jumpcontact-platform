import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dailySnapshots } from '@/lib/db/schema';
import { TZ } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/cron/snapshot
 *
 * Runs daily at 7am MST via Vercel Cron.
 * Fetches yesterday's finalized data for all three brands (mixed, jc, msc)
 * from /api/data and freezes them into Postgres as immutable snapshots.
 *
 * Idempotent: uses upsert by (date, brand) composite key.
 * Secured: requires CRON_SECRET header or ?secret= param.
 */
export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  const provided = authHeader?.replace('Bearer ', '') || querySecret;

  if (provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Determine yesterday's date in MST ─────────────────────────
  const now = new Date();
  const mstStr = now.toLocaleString('en-US', { timeZone: TZ });
  const mstNow = new Date(mstStr);
  mstNow.setDate(mstNow.getDate() - 1);
  const yesterday = `${mstNow.getFullYear()}-${String(mstNow.getMonth() + 1).padStart(2, '0')}-${String(mstNow.getDate()).padStart(2, '0')}`;

  // Allow override for backfill/testing
  const dateOverride = request.nextUrl.searchParams.get('date');
  const targetDate = dateOverride || yesterday;

  // ── Fetch data for all three brands ───────────────────────────
  const baseUrl = request.nextUrl.origin;
  const brands = ['mixed', 'jc', 'msc'] as const;
  const results: { brand: string; success: boolean; error?: string }[] = [];

  const db = getDb();

  for (const brand of brands) {
    try {
      const url = `${baseUrl}/api/data?brand=${brand}`;
      const res = await fetch(url, {
        headers: { Cookie: request.headers.get('cookie') || '' },
      });

      if (!res.ok) {
        results.push({ brand, success: false, error: `API returned ${res.status}` });
        continue;
      }

      const data = await res.json();

      // Extract yesterday's data from the response
      const period = data.yesterday || data.today;
      if (!period) {
        results.push({ brand, success: false, error: 'No period data in response' });
        continue;
      }

      // Build agent breakdown
      const agentData = (period.repActivity?.agents || []).map((a: Record<string, unknown>) => ({
        agent: a.agent,
        calls: a.calls,
        conversions: a.conversions,
        talkMin: a.talkMin,
        speedSec: a.speedSec,
        wrapUpSec: a.wrapUpSec,
      }));

      // Build reconciliation data
      const reconciliation = {
        yticaTotal: period.teamStats?.totalCalls ?? null,
        cdrAnswered: period.answeredCalls ?? null,
        cdrMissed: period.missedCalls?.total ?? null,
        agentSumCalls: agentData.reduce((s: number, a: { calls: number }) => s + a.calls, 0),
        conversionTotal: period.conversions?.total ?? 0,
        source: period.teamStats ? 'ytica+cdr' : 'cdr-only',
      };

      const id = `${targetDate}_${brand}`;
      const row = {
        id,
        date: targetDate,
        brand,
        answeredCalls: period.answeredCalls ?? period.repActivity?.agents?.reduce((s: number, a: { calls: number }) => s + a.calls, 0) ?? 0,
        missedCalls: period.missedCalls?.total ?? 0,
        totalCalls: period.totalCalls ?? (reconciliation.agentSumCalls + (period.missedCalls?.total ?? 0)),
        conversions: period.conversions?.total ?? 0,
        avgSpeedSec: period.teamAvgSpeed ?? period.repActivity?.avgSpeedSec ?? null,
        avgWrapSec: agentData.length > 0
          ? Math.round(agentData.reduce((s: number, a: { wrapUpSec: number | null }) => s + (a.wrapUpSec ?? 0), 0) / agentData.filter((a: { wrapUpSec: number | null }) => a.wrapUpSec !== null).length * 10) / 10 || null
          : null,
        agentCount: agentData.length,
        agentData,
        reconciliation,
      };

      // Upsert — idempotent by date+brand
      await db.insert(dailySnapshots).values(row).onConflictDoNothing();

      results.push({ brand, success: true });
    } catch (err) {
      results.push({ brand, success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const allSuccess = results.every(r => r.success);
  return NextResponse.json({
    date: targetDate,
    results,
    status: allSuccess ? 'complete' : 'partial',
  }, { status: allSuccess ? 200 : 207 });
}

// Also support GET for manual testing via browser
export async function GET(request: NextRequest) {
  return POST(request);
}
