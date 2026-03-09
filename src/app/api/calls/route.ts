import { NextRequest, NextResponse } from 'next/server';
import { twilioAuth, fetchCallsForDate, extractRecentCalls } from '@/lib/getDashboard';
import type { RawCall, TwilioCall } from '@/lib/getDashboard';
import { ACTIVE_AGENTS, capitalize } from '@/lib/constants';
import clientsData from '@/data/clients.json';

export const dynamic = 'force-dynamic';

/**
 * Fetch all recordings for a date from Twilio and return a Set of CallSids that have recordings.
 */
async function fetchRecordingSids(date: Date, auth: string): Promise<Set<string>> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const ds = date.toISOString().slice(0, 10);
  const sids = new Set<string>();

  let url: string | null =
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings.json?DateCreated=${ds}&PageSize=1000`;

  while (url) {
    try {
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (!res.ok) break;
      const data = await res.json() as {
        recordings?: { call_sid: string }[];
        next_page_uri?: string;
      };
      if (data.recordings) {
        for (const r of data.recordings) sids.add(r.call_sid);
      }
      url = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null;
    } catch {
      break;
    }
  }
  return sids;
}

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get('date');
  const date = dateParam
    ? new Date(dateParam + 'T00:00:00')
    : new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));

  const auth = twilioAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Twilio credentials missing' }, { status: 500 });
  }

  try {
    const raw = await fetchCallsForDate(date, auth);
    const calls: RawCall[] = extractRecentCalls(raw, 999);

    // Build customer-phone → client/account mapping from raw Twilio data
    const twilioNumbers = new Map<string, string>(
      Object.entries((clientsData as { clients: Record<string, string> }).clients),
    );
    const customerToClient = new Map<string, string>();
    for (const c of raw as TwilioCall[]) {
      const toClient = twilioNumbers.get(c.to);
      const fromClient = twilioNumbers.get(c.from);
      if (toClient) customerToClient.set(c.from, toClient);   // inbound: to=Twilio#, from=customer
      if (fromClient) customerToClient.set(c.to, fromClient);  // outbound: from=Twilio#, to=customer
    }
    for (const call of calls) {
      call.account = customerToClient.get(call.phone);
    }

    // Only fetch recordings if we have calls (skip empty days)
    let recordingSids = new Set<string>();
    if (calls.length > 0) {
      recordingSids = await fetchRecordingSids(date, auth);
    }

    // Annotate calls with recording availability
    for (const call of calls) {
      if (call.callSid && recordingSids.has(call.callSid)) {
        call.recordingUrl = `/api/calls/recording?sid=${call.callSid}`;
      }
    }

    // Build per-agent summary
    const agentMap: Record<string, { calls: number; talkSec: number }> = {};
    for (const c of calls) {
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

    return NextResponse.json({
      calls,
      agents,
      pulledAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
