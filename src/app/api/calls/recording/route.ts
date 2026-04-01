import { NextRequest, NextResponse } from 'next/server';
import { fetchRecordingSid } from '@/lib/twilio';
import { twilioAuth, twilioAccountSid } from '@/lib/auth/twilio';
import { RECORDING_MAP } from '@/lib/recording-map';

export const dynamic = 'force-dynamic';

/**
 * GET /api/calls/recording?sid=CAxxxx[&key=xxx][&download=1]
 *
 * Looks up the Twilio recording for a given call SID and streams the
 * MP3 audio directly back to the browser.  Replaces the old ops-center
 * proxy with direct Twilio Recording API access.
 */
export async function GET(req: NextRequest) {
  // ── Optional API key gate ────────────────────────────────────────
  const API_KEY = process.env.RECORDING_API_KEY;
  if (API_KEY) {
    const provided =
      req.nextUrl.searchParams.get('key') || req.headers.get('x-api-key');
    if (provided !== API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const callSid = req.nextUrl.searchParams.get('sid');
  const agentSid = req.nextUrl.searchParams.get('agent_sid');
  const download = req.nextUrl.searchParams.get('download') === '1';

  if (!callSid) {
    return NextResponse.json({ error: 'Missing sid parameter' }, { status: 400 });
  }

  const accountSid = twilioAccountSid();
  const auth = twilioAuth();

  try {
    // ── 0a. Fast-path: check static recording map (direct match) ──
    let recordingSid: string | null = RECORDING_MAP[callSid] || null;

    // ── 0b. Static map: resolve parent → child SIDs ─────────────
    //   The static map is keyed by child-leg SID, but the calls API
    //   returns parent SIDs.  Fetch child calls and check each one.
    if (!recordingSid) {
      const childrenUrl =
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json` +
        `?ParentCallSid=${callSid}&PageSize=5`;
      try {
        const childRes = await fetch(childrenUrl, { headers: { Authorization: auth } });
        if (childRes.ok) {
          const childJson = await childRes.json();
          const childCalls: { sid: string }[] = childJson.calls || [];
          for (const child of childCalls) {
            if (RECORDING_MAP[child.sid]) {
              recordingSid = RECORDING_MAP[child.sid];
              break;
            }
          }
        }
      } catch {
        // Swallow – fall through to Twilio API tiers below
      }
    }

    // ── 1. Try the primary (inbound) call SID via Twilio API ────
    if (!recordingSid) {
      recordingSid = await fetchRecordingSid(callSid);
    }

    // ── 2. Try the agent leg SID (recordings often live here) ───
    if (!recordingSid && agentSid) {
      recordingSid = await fetchRecordingFromCall(accountSid, auth, agentSid);
    }

    // ── 3. Fallback: check child calls of inbound leg ───────────
    if (!recordingSid) {
      recordingSid = await fetchRecordingFromChildCalls(accountSid, auth, callSid);
    }

    // ── 4. Fallback: check parent call if inbound has one ───────
    if (!recordingSid) {
      const parentRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
        { headers: { Authorization: auth } },
      );
      if (parentRes.ok) {
        const callData = await parentRes.json();
        if (callData.parent_call_sid) {
          recordingSid = await fetchRecordingFromCall(accountSid, auth, callData.parent_call_sid);
          if (!recordingSid) {
            recordingSid = await fetchRecordingFromChildCalls(accountSid, auth, callData.parent_call_sid);
          }
        }
      }
    }

    if (!recordingSid) {
      return NextResponse.json(
        { error: 'No recording found for this call' },
        { status: 404 },
      );
    }

    // ── 4. Fetch the MP3 audio from Twilio ───────────────────────
    const audioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
    const audioRes = await fetch(audioUrl, {
      headers: { Authorization: auth },
    });

    if (!audioRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch recording audio: ${audioRes.status}` },
        { status: audioRes.status },
      );
    }

    if (!audioRes.body) {
      return NextResponse.json(
        { error: 'No audio body returned from Twilio' },
        { status: 502 },
      );
    }

    // ── 5. Stream audio back to the browser ──────────────────────
    return new NextResponse(audioRes.body as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="recording-${callSid}.mp3"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API /calls/recording]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Fetch the first recording SID directly from a call's recordings endpoint. */
async function fetchRecordingFromCall(
  accountSid: string,
  auth: string,
  callSid: string,
): Promise<string | null> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}/Recordings.json?PageSize=1`;
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) return null;
  const json = await res.json();
  return json.recordings?.[0]?.sid || null;
}

/** Check each child call for a recording, return the first recording SID found. */
async function fetchRecordingFromChildCalls(
  accountSid: string,
  auth: string,
  parentCallSid: string,
): Promise<string | null> {
  const childrenUrl =
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json` +
    `?ParentCallSid=${parentCallSid}&PageSize=5`;
  const childRes = await fetch(childrenUrl, { headers: { Authorization: auth } });
  if (!childRes.ok) return null;
  const childJson = await childRes.json();
  const childCalls: { sid: string }[] = childJson.calls || [];

  for (const child of childCalls) {
    const recSid = await fetchRecordingFromCall(accountSid, auth, child.sid);
    if (recSid) return recSid;
  }

  return null;
}
