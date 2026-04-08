import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { callRecords } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/backfill-calls
 *
 * Accepts the JSON format from recordings_scraper.py and upserts into
 * the call_records Neon table. Idempotent (keyed on call_sid).
 *
 * Body: { calls: [ { call_sid, task_sid, ... } ] }
 * Secured via CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('x-cron-secret') ||
    request.nextUrl.searchParams.get('secret');
  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const calls = body.calls;
    if (!Array.isArray(calls)) {
      return NextResponse.json({ error: 'Expected { calls: [...] }' }, { status: 400 });
    }

    const db = getDb();
    let inserted = 0;
    let skipped = 0;

    // Batch upsert in chunks of 100
    for (let i = 0; i < calls.length; i += 100) {
      const chunk = calls.slice(i, i + 100);
      const values = chunk
        .filter((c: Record<string, unknown>) => c.call_sid)
        .map((c: Record<string, unknown>) => ({
          callSid:          String(c.call_sid),
          taskSid:          String(c.task_sid || ''),
          conferenceSid:    c.conference_sid ? String(c.conference_sid) : null,
          date:             String(c.date || ''),
          timeUtc:          c.time_utc ? String(c.time_utc) : null,
          createdAt:        String(c.created_at || ''),
          client:           c.client ? String(c.client) : null,
          agent:            c.agent ? String(c.agent).toLowerCase() : null,
          agentEmail:       c.agent_email ? String(c.agent_email) : null,
          queueSec:         typeof c.queue_seconds === 'number' ? c.queue_seconds as number : null,
          talkSec:          typeof c.talk_seconds === 'number' ? c.talk_seconds as number : null,
          wrapUpSec:        typeof c.wrap_up_seconds === 'number' ? c.wrap_up_seconds as number : null,
          billableWrapSec:  typeof c.billable_wrap_up_seconds === 'number' ? c.billable_wrap_up_seconds as number : null,
          totalBillableSec: typeof c.total_billable_seconds === 'number' ? c.total_billable_seconds as number : null,
          recordingSid:     c.recording_sid ? String(c.recording_sid) : null,
          recordingDurSec:  typeof c.recording_duration_sec === 'number' ? c.recording_duration_sec as number : null,
        }));

      if (values.length > 0) {
        await db.insert(callRecords).values(values)
          .onConflictDoNothing({ target: callRecords.callSid });
        inserted += values.length;
      }
      skipped += chunk.length - values.length;
    }

    return NextResponse.json({
      ok: true,
      total: calls.length,
      inserted,
      skipped,
    });
  } catch (err) {
    console.error('Backfill error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
