import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { callRecords } from '@/lib/db/schema';
import { twilioAuth, WORKSPACE_SID } from '@/lib/auth/twilio';
import { normalizeAgent } from '@/lib/constants';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — scanning events takes time

const WRAPUP_BILLING_CAP = 90;
const EVENT_TYPES = [
  'task.created',
  'reservation.accepted',
  'reservation.wrapup',
  'reservation.completed',
] as const;

interface TaskData {
  call_sid?: string;
  client?: string;
  created_at?: string;
  worker?: string;
  accepted_task_age?: number;
  wrapup_task_age?: number;
  completed_task_age?: number;
}

/**
 * POST /api/cron/sync-call-records
 *
 * Scrapes TaskRouter events for the last 2 days (overlap ensures no gaps)
 * and upserts per-call wrap-up data into Neon.
 *
 * Run every 4 hours via Vercel Cron. TaskRouter keeps 14 days of events,
 * so even if the cron misses a few runs, no data is lost.
 *
 * Also prunes records older than 75 days to keep the table lean.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('x-cron-secret') ||
    request.nextUrl.searchParams.get('secret');
  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authHeader = twilioAuth();
  const minutesBack = 2 * 24 * 60; // 2 days overlap

  try {
    // ── Step 1: Scan TaskRouter events ──
    const tasks = new Map<string, TaskData>();

    for (const eventType of EVENT_TYPES) {
      let url: string | null =
        `https://taskrouter.twilio.com/v1/Workspaces/${WORKSPACE_SID}/Events?Minutes=${minutesBack}&EventType=${eventType}&PageSize=100`;

      while (url) {
        const res: Response = await fetch(url, {
          headers: { Authorization: authHeader },
        });
        if (!res.ok) break;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await res.json() as any;

        for (const event of (data.events || []) as any[]) {
          const ed = typeof event.event_data === 'string'
            ? JSON.parse(event.event_data) : (event.event_data || {});
          const taskSid = ed.task_sid as string | undefined;
          if (!taskSid) continue;

          const entry = tasks.get(taskSid) || {};
          tasks.set(taskSid, entry);

          if (eventType === 'task.created') {
            const attrs = typeof ed.task_attributes === 'string'
              ? JSON.parse(ed.task_attributes) : (ed.task_attributes || {});
            entry.call_sid = attrs.call_sid || '';
            entry.client = attrs.project || '';
            entry.created_at = event.event_date || '';
          } else if (eventType === 'reservation.accepted') {
            entry.accepted_task_age = parseInt(ed.task_age) || undefined;
            entry.worker = ed.worker_name || '';
          } else if (eventType === 'reservation.wrapup') {
            entry.wrapup_task_age = parseInt(ed.task_age) || undefined;
            if (!entry.worker) entry.worker = ed.worker_name || '';
          } else if (eventType === 'reservation.completed') {
            entry.completed_task_age = parseInt(ed.task_age) || undefined;
          }
        }

        url = data.meta?.next_page_url || null;
      }
    }

    // ── Step 2: Assemble complete records ──
    const records: Array<typeof callRecords.$inferInsert> = [];

    for (const [taskSid, t] of tasks) {
      if (!t.call_sid || t.accepted_task_age == null ||
          t.wrapup_task_age == null || t.completed_task_age == null) continue;

      const talkSec = Math.max(t.wrapup_task_age - t.accepted_task_age, 0);
      const wrapSec = Math.max(t.completed_task_age - t.wrapup_task_age, 0);
      const billableWrap = Math.min(wrapSec, WRAPUP_BILLING_CAP);
      const agentEmail = (t.worker || '').trim();
      const agentName = normalizeAgent(agentEmail.split('@')[0] || '');

      let date = '';
      let timeUtc = '';
      if (t.created_at) {
        try {
          const dt = new Date(t.created_at);
          date = dt.toISOString().slice(0, 10);
          timeUtc = dt.toISOString().slice(11, 19);
        } catch { /* ignore */ }
      }

      records.push({
        callSid: t.call_sid,
        taskSid,
        conferenceSid: null,
        date,
        timeUtc,
        createdAt: t.created_at || '',
        client: t.client || null,
        agent: agentName || null,
        agentEmail: agentEmail || null,
        queueSec: t.accepted_task_age,
        talkSec,
        wrapUpSec: wrapSec,
        billableWrapSec: billableWrap,
        totalBillableSec: talkSec + billableWrap,
        recordingSid: null,
        recordingDurSec: null,
      });
    }

    // ── Step 3: Upsert to Neon ──
    const db = getDb();
    let upserted = 0;

    for (let i = 0; i < records.length; i += 100) {
      const chunk = records.slice(i, i + 100);
      await db.insert(callRecords).values(chunk)
        .onConflictDoUpdate({
          target: callRecords.callSid,
          set: {
            wrapUpSec: sql`excluded.wrap_up_sec`,
            talkSec: sql`excluded.talk_sec`,
            queueSec: sql`excluded.queue_sec`,
            agent: sql`excluded.agent`,
            client: sql`excluded.client`,
            scrapedAt: sql`now()`,
          },
        });
      upserted += chunk.length;
    }

    // ── Step 4: Prune old records (75 days) ──
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 75);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    await db.delete(callRecords).where(sql`${callRecords.date} < ${cutoffStr}`);

    return NextResponse.json({
      ok: true,
      tasksScanned: tasks.size,
      completeRecords: records.length,
      upserted,
      prunedBefore: cutoffStr,
    });
  } catch (err) {
    console.error('sync-call-records error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}
