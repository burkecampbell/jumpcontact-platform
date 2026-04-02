import { NextRequest, NextResponse } from 'next/server';
import { twilioAuth, twilioAccountSid } from '@/lib/auth/twilio';
import { todayMST } from '@/lib/twilio';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/sync-recordings
 *
 * Fetches recent Twilio recordings (last 24h) and returns new CA→RE pairs
 * that aren't in the static recording map yet.
 *
 * Triggered nightly by Vercel Cron.  The static recording-map.ts file is
 * regenerated from the accumulated pairs via a build-time script.
 *
 * For now, this endpoint caches new pairs in-memory so the recording proxy
 * can find them without hitting Twilio's API on every playback request.
 */

// In-memory store for recently discovered recording pairs.
// Survives across warm-function invocations (~5-15 min on Vercel).
const recentPairs = new Map<string, string>();

/** Exported so the recording proxy can check new pairs before hitting Twilio. */
export function getRecentPair(callSid: string): string | undefined {
  return recentPairs.get(callSid);
}

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const accountSid = twilioAccountSid();
  const auth = twilioAuth();

  try {
    // Fetch recordings from the last 24 hours
    const yesterday = addDays(todayMST(), -1);
    const url =
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings.json` +
      `?DateCreated>=${yesterday}&PageSize=500`;

    const pairs: Record<string, string> = {};
    let pageUrl: string | null = url;
    let totalFetched = 0;

    while (pageUrl) {
      const res: Response = await fetch(pageUrl, { headers: { Authorization: auth } });
      if (!res.ok) {
        throw new Error(`Twilio Recordings API ${res.status}: ${await res.text()}`);
      }
      const json: { recordings?: { call_sid: string; sid: string }[]; next_page_uri?: string } = await res.json();

      for (const rec of json.recordings || []) {
        const callSid: string = rec.call_sid;
        const recSid: string = rec.sid;
        if (callSid && recSid) {
          pairs[callSid] = recSid;
          recentPairs.set(callSid, recSid);
          totalFetched++;
        }
      }

      pageUrl = json.next_page_uri
        ? `https://api.twilio.com${json.next_page_uri}`
        : null;
    }

    return NextResponse.json({
      ok: true,
      date: todayMST(),
      newPairs: Object.keys(pairs).length,
      totalFetched,
      cachedTotal: recentPairs.size,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[cron/sync-recordings]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
