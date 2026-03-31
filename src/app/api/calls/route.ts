import { NextRequest, NextResponse } from 'next/server';
import { fetchCallLegs, pairCallLegs, todayMST } from '@/lib/twilio';
import { ACTIVE_AGENTS, capitalize, normalizeAgent } from '@/lib/constants';
import { cached } from '@/lib/cache';
import type { PairedCall } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RawCall {
  time: string;
  agent: string;
  phone: string;
  duration: number;
  direction: 'inbound' | 'outbound';
  callSid?: string;
  recordingUrl?: string;
  account?: string;
}

interface AgentCallSummary {
  agent: string;
  calls: number;
  talkMin: number;
}

function toRawCall(c: PairedCall): RawCall {
  return {
    time: c.time,
    agent: c.agent,
    phone: c.direction === 'inbound' ? c.from : c.to,
    duration: c.duration,
    direction: c.direction,
    callSid: c.id,
    account: c.client || undefined,
    recordingUrl: c.agentLegSid
      ? `/api/calls/recording?sid=${c.id}&agent_sid=${c.agentLegSid}`
      : undefined,
  };
}

function buildAgentSummaries(calls: RawCall[]): AgentCallSummary[] {
  const map = new Map<string, { calls: number; talkSec: number }>();

  for (const name of ACTIVE_AGENTS) {
    map.set(name, { calls: 0, talkSec: 0 });
  }

  for (const call of calls) {
    const key = normalizeAgent(call.agent);
    if (!key) continue;
    const entry = map.get(key);
    if (entry) {
      entry.calls += 1;
      entry.talkSec += call.duration;
    }
  }

  return ACTIVE_AGENTS.map((name) => {
    const entry = map.get(name)!;
    return {
      agent: capitalize(name),
      calls: entry.calls,
      talkMin: +(entry.talkSec / 60).toFixed(1),
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const today = todayMST();
    const date = searchParams.get('date') || today;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') || '50') || 50, 1),
      500,
    );
    const offset = Math.max(
      parseInt(searchParams.get('offset') || '0') || 0,
      0,
    );

    const isToday = date === today;
    const ttl = isToday ? 30_000 : 3_600_000;
    const cacheKey = `calls:${date}`;

    const allCalls = await cached<RawCall[]>(cacheKey, ttl, async () => {
      const legs = await fetchCallLegs(date);
      const paired = pairCallLegs(legs);
      return paired.map(toRawCall);
    });

    const agents = buildAgentSummaries(allCalls);
    const total = allCalls.length;
    const page = allCalls.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return NextResponse.json({
      calls: page,
      agents,
      pulledAt: new Date().toISOString(),
      total,
      hasMore,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/calls] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
