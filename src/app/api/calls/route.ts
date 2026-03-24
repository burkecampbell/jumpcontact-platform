import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_AGENTS, capitalize } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const OPS_CENTER = process.env.NEXT_PUBLIC_OPS_CENTER_URL || 'https://main.d2t3zyuv8zobb7.amplifyapp.com';

/**
 * Ops-center PairedCall shape (source of truth: operations-center/src/lib/types.ts)
 */
interface PairedCall {
  id: string;
  time: string;
  agent: string;
  from: string;
  to: string;
  client: string;
  direction: 'inbound' | 'outbound';
  duration: number;
  totalDuration: number;
  ringTime: number;
  status: string;
  recordingSid?: string;
  agentLegSid?: string;
}

/**
 * GET /api/calls?date=YYYY-MM-DD&limit=50&offset=0
 *
 * Proxies to ops-center /api/calls, transforms PairedCall → RawCall,
 * builds per-agent summary, and paginates.
 *
 * Zero credentials — ops-center owns all Twilio/Sheets access.
 */
export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get('date');
  const limit  = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit'))  || 50, 1), 500);
  const offset = Math.max(Number(req.nextUrl.searchParams.get('offset')) || 0, 0);

  // Build ops-center URL — fetch all calls for the date (we paginate locally for agent summary)
  const opsUrl = new URL(`${OPS_CENTER}/api/calls`);
  if (dateParam) opsUrl.searchParams.set('date', dateParam);
  opsUrl.searchParams.set('limit', '1000');

  try {
    const res = await fetch(opsUrl.toString(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`ops-center returned ${res.status}`);

    const data = await res.json() as {
      calls: PairedCall[];
      total: number;
      hasMore: boolean;
      pulledAt: string;
    };

    // Transform PairedCall → RawCall format expected by components
    const recKey = process.env.RECORDING_API_KEY;
    const keySuffix = recKey ? `&key=${recKey}` : '';

    const allCalls = data.calls.map(c => ({
      time: c.time,
      agent: c.agent,
      phone: c.direction === 'inbound' ? c.from : c.to,
      duration: c.duration,
      direction: c.direction,
      callSid: c.id,
      account: c.client || undefined,
      recordingUrl: c.recordingSid
        ? `/api/calls/recording?sid=${c.id}${keySuffix}`
        : undefined,
    }));

    // Build per-agent summary from ALL calls (before pagination)
    const agentMap: Record<string, { calls: number; talkSec: number }> = {};
    for (const c of allCalls) {
      const key = c.agent.toLowerCase();
      if (!ACTIVE_AGENTS.includes(key)) continue;
      if (!agentMap[key]) agentMap[key] = { calls: 0, talkSec: 0 };
      agentMap[key].calls++;
      agentMap[key].talkSec += c.duration;
    }

    const agents = Object.entries(agentMap)
      .sort((a, b) => b[1].calls - a[1].calls)
      .map(([name, s]) => ({
        agent: capitalize(name),
        calls: s.calls,
        talkMin: +(s.talkSec / 60).toFixed(1),
      }));

    // Paginate
    const total = allCalls.length;
    const page  = allCalls.slice(offset, offset + limit);

    return NextResponse.json({
      calls:    page,
      agents,
      pulledAt: data.pulledAt,
      total,
      hasMore:  offset + limit < total,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API /calls → ops-center]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
