import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const OPS_CENTER = process.env.NEXT_PUBLIC_OPS_CENTER_URL || 'https://main.d2t3zyuv8zobb7.amplifyapp.com';

/**
 * GET /api/calls/recording?sid=CAxxxx[&key=xxx][&download=1]
 *
 * Proxies recording audio through ops-center → Twilio.
 * Zero credentials — ops-center owns the Twilio auth.
 *
 * Ops-center endpoint: GET /api/calls/recording?sid=CAxxxx
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

  try {
    // Proxy to ops-center recording endpoint (handles callSid → recordingSid → audio stream)
    const opsUrl = `${OPS_CENTER}/api/calls/recording?sid=${callSid}`;
    const audioRes = await fetch(opsUrl);

    if (!audioRes.ok) {
      const errText = await audioRes.text().catch(() => `HTTP ${audioRes.status}`);
      return NextResponse.json(
        { error: errText || `Recording fetch failed: ${audioRes.status}` },
        { status: audioRes.status },
      );
    }

    if (!audioRes.body) {
      return NextResponse.json({ error: 'No audio body returned' }, { status: 502 });
    }

    return new NextResponse(audioRes.body as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': audioRes.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="recording-${callSid}.mp3"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API /calls/recording → ops-center]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
