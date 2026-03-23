import { NextRequest, NextResponse } from 'next/server';
import { twilioAuth } from '@/lib/getDashboard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/calls/recording?sid=CAxxxx[&key=xxx]
 * Proxy for Twilio call recordings — streams MP3 audio to the browser.
 * Looks up recordings by CallSid, then streams the audio.
 *
 * When RECORDING_API_KEY env var is set, requires `?key=xxx` query param
 * or `X-API-Key` header to authenticate. When unset, open access (current behavior).
 */
export async function GET(req: NextRequest) {
  // Optional API key gate — only active when RECORDING_API_KEY is configured
  const API_KEY = process.env.RECORDING_API_KEY;
  if (API_KEY) {
    const provided = req.nextUrl.searchParams.get('key') || req.headers.get('x-api-key');
    if (provided !== API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const callSid = req.nextUrl.searchParams.get('sid');
  const download = req.nextUrl.searchParams.get('download') === '1';
  if (!callSid) {
    return NextResponse.json({ error: 'Missing sid parameter' }, { status: 400 });
  }

  const auth = twilioAuth();
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!auth || !sid) {
    return NextResponse.json({ error: 'Twilio credentials missing' }, { status: 500 });
  }

  try {
    // Fetch recordings for this call
    const recUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}/Recordings.json`;
    const recRes = await fetch(recUrl, { headers: { Authorization: auth } });
    if (!recRes.ok) {
      return NextResponse.json({ error: `Twilio API error: ${recRes.status}` }, { status: 502 });
    }

    const recData = await recRes.json() as { recordings?: { sid: string }[] };
    if (!recData.recordings || recData.recordings.length === 0) {
      return NextResponse.json({ error: 'No recording found for this call' }, { status: 404 });
    }

    const recordingSid = recData.recordings[0].sid;
    const audioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings/${recordingSid}.mp3`;

    // Stream the audio through
    const audioRes = await fetch(audioUrl, { headers: { Authorization: auth } });
    if (!audioRes.ok || !audioRes.body) {
      return NextResponse.json({ error: 'Failed to fetch audio' }, { status: 502 });
    }

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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
