import { NextRequest, NextResponse } from 'next/server';
import { twilioAuth, fetchCallsForDate, extractRecentCalls } from '@/lib/getDashboard';
import type { RawCall } from '@/lib/getDashboard';
import { ACTIVE_AGENTS, decodeAgent, capitalize } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get('date');
  const date = dateParam ? new Date(dateParam + 'T00:00:00') : new Date();

  const auth = twilioAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Twilio credentials missing' }, { status: 500 });
  }

  try {
    const raw = await fetchCallsForDate(date, auth);
    const calls: RawCall[] = extractRecentCalls(raw, 999);

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
