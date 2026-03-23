import { NextRequest, NextResponse } from 'next/server';
import { twilioAuth, fetchCallsForDate, extractRecentCalls } from '@/lib/getDashboard';
import type { RawCall, TwilioCall } from '@/lib/getDashboard';
import { fetchRecordingSids } from '@/lib/data/recordings';
import { ACTIVE_AGENTS, capitalize } from '@/lib/constants';
import { cached } from '@/lib/cache';
import clientsData from '@/data/clients.json';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get('date');
  const date = dateParam
    ? new Date(dateParam + 'T00:00:00')
    : new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));

  // Pagination params (default: first 50 calls)
  const limit  = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit'))  || 50, 1), 500);
  const offset = Math.max(Number(req.nextUrl.searchParams.get('offset')) || 0, 0);

  const auth = twilioAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Twilio credentials missing' }, { status: 500 });
  }

  try {
    const ds = date.toISOString().slice(0, 10);
    const raw = await cached(`calls:${ds}`, 30_000, () => fetchCallsForDate(date, auth));
    const allCalls: RawCall[] = extractRecentCalls(raw, 999);

    // Build customer-phone → client/account mapping (JC clients only, exclude MSC)
    const cData = clientsData as { clients: Record<string, string>; brands?: Record<string, string> };
    const mscPhones = new Set(
      Object.entries(cData.brands || {}).filter(([, b]) => b === 'msc').map(([p]) => p),
    );
    const twilioNumbers = new Map<string, string>(
      Object.entries(cData.clients).filter(([phone]) => !mscPhones.has(phone)),
    );
    const customerToClient = new Map<string, string>();
    for (const c of raw as TwilioCall[]) {
      const toClient = twilioNumbers.get(c.to);
      const fromClient = twilioNumbers.get(c.from);
      if (toClient) customerToClient.set(c.from, toClient);   // inbound: to=Twilio#, from=customer
      if (fromClient) customerToClient.set(c.to, fromClient);  // outbound: from=Twilio#, to=customer
    }
    for (const call of allCalls) {
      // phone may be a Twilio# (inbound Flex) or customer# (outbound)
      call.account = twilioNumbers.get(call.phone) || customerToClient.get(call.phone);
    }

    // Only fetch recordings if we have calls (skip empty days)
    let recordingSids = new Set<string>();
    if (allCalls.length > 0) {
      recordingSids = await cached(`recordings:${ds}`, 300_000, () => fetchRecordingSids(date, auth));
    }

    // Annotate calls with recording availability
    const recKey = process.env.RECORDING_API_KEY;
    const keySuffix = recKey ? `&key=${recKey}` : '';
    for (const call of allCalls) {
      if (call.callSid && recordingSids.has(call.callSid)) {
        call.recordingUrl = `/api/calls/recording?sid=${call.callSid}${keySuffix}`;
      }
    }

    // Build per-agent summary (from ALL calls, not paginated subset)
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
      pulledAt: new Date().toISOString(),
      total,
      hasMore:  offset + limit < total,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
