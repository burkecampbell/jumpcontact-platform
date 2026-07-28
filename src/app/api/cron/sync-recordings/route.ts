import { NextRequest, NextResponse } from 'next/server';
import { twilioAuth, twilioAccountSid } from '@/lib/auth/twilio';
import { getDb } from '@/lib/db';
import { callRecords } from '@/lib/db/schema';
import { sql, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface TwilioRecording {
  sid: string;
  call_sid: string;
  duration: string;
  date_created: string;
}

interface TwilioRecordingsPage {
  recordings?: TwilioRecording[];
  next_page_uri?: string;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountSid = twilioAccountSid();
  const auth = twilioAuth();

  try {
    // Fetch recordings from the last 48 hours
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const sinceStr = since.toISOString().slice(0, 10);
    const baseUrl =
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings.json` +
      `?DateCreated>=${sinceStr}&PageSize=500`;

    const recordings: TwilioRecording[] = [];
    let pageUrl: string | null = baseUrl;

    while (pageUrl) {
      const res = await fetch(pageUrl, { headers: { Authorization: auth } });
      if (!res.ok) throw new Error(`Twilio Recordings API ${res.status}: ${await res.text()}`);
      const json: TwilioRecordingsPage = await res.json();
      for (const rec of json.recordings || []) {
        if (rec.call_sid && rec.sid) recordings.push(rec);
      }
      pageUrl = json.next_page_uri
        ? `https://api.twilio.com${json.next_page_uri}`
        : null;
    }

    // Build lookup: call_sid → recording
    const byCallSid = new Map<string, TwilioRecording>();
    for (const rec of recordings) {
      const existing = byCallSid.get(rec.call_sid);
      if (!existing || parseInt(rec.duration) > parseInt(existing.duration)) {
        byCallSid.set(rec.call_sid, rec);
      }
    }

    const db = getDb();

    // Step 1: Direct match — call_sid exists in call_records
    let directMatches = 0;
    const directChunks = [...byCallSid.entries()];
    for (let i = 0; i < directChunks.length; i += 50) {
      const chunk = directChunks.slice(i, i + 50);
      const sids = chunk.map(([sid]) => sid);
      const recs = chunk.map(([, rec]) => rec);

      for (let j = 0; j < sids.length; j++) {
        const result = await db.update(callRecords)
          .set({
            recordingSid: recs[j].sid,
            recordingDurSec: parseInt(recs[j].duration) || 0,
          })
          .where(sql`${callRecords.callSid} = ${sids[j]} AND ${callRecords.recordingSid} IS NULL`)
          .returning({ callSid: callRecords.callSid });

        if (result.length > 0) directMatches++;
      }
    }

    // Step 2: For recordings that didn't match by call_sid, try matching
    // via child calls (Flex puts recordings on conference participant legs,
    // not the parent call). Look up each unmatched recording's parent_call_sid.
    const unmatchedRecs = recordings.filter(rec => {
      const matched = byCallSid.get(rec.call_sid);
      return matched?.sid === rec.sid;
    });

    let parentMatches = 0;
    for (const rec of unmatchedRecs) {
      const callUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${rec.call_sid}.json`;
      try {
        const callRes = await fetch(callUrl, { headers: { Authorization: auth } });
        if (!callRes.ok) continue;
        const callData = await callRes.json();
        const parentSid = callData.parent_call_sid;
        if (!parentSid) continue;

        const result = await db.update(callRecords)
          .set({
            recordingSid: rec.sid,
            recordingDurSec: parseInt(rec.duration) || 0,
          })
          .where(sql`${callRecords.callSid} = ${parentSid} AND ${callRecords.recordingSid} IS NULL`)
          .returning({ callSid: callRecords.callSid });

        if (result.length > 0) parentMatches++;
      } catch {
        // Skip individual lookup failures
      }
    }

    // Step 3: Conference recording fallback — check unmatched call_records
    // and search for conference recordings by duration similarity
    const nullRows = await db.select({
      callSid: callRecords.callSid,
      talkSec: callRecords.talkSec,
      date: callRecords.date,
      conferenceSid: callRecords.conferenceSid,
    })
      .from(callRecords)
      .where(sql`${callRecords.recordingSid} IS NULL AND ${callRecords.date} >= ${sinceStr}`)
      .limit(200);

    let confMatches = 0;
    for (const row of nullRows) {
      if (!row.conferenceSid) continue;
      const confRecUrl =
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}` +
        `/Conferences/${row.conferenceSid}/Recordings.json?PageSize=1`;
      try {
        const confRes = await fetch(confRecUrl, { headers: { Authorization: auth } });
        if (!confRes.ok) continue;
        const confJson = await confRes.json();
        const confRec = confJson.recordings?.[0];
        if (!confRec?.sid) continue;

        const recDur = parseInt(confRec.duration) || 0;
        const talkSec = row.talkSec || 0;
        if (talkSec > 0 && Math.abs(recDur - talkSec) > 30) continue;

        await db.update(callRecords)
          .set({
            recordingSid: confRec.sid,
            recordingDurSec: recDur,
          })
          .where(eq(callRecords.callSid, row.callSid));

        confMatches++;
      } catch {
        // Skip individual conference lookup failures
      }
    }

    const stats = {
      ok: true,
      recordingsFetched: recordings.length,
      directMatches,
      parentMatches,
      confMatches,
      totalSynced: directMatches + parentMatches + confMatches,
      nullRowsChecked: nullRows.length,
    };

    console.log('[sync-recordings]', JSON.stringify(stats));
    return NextResponse.json(stats);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[cron/sync-recordings]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
