import { NextRequest, NextResponse } from 'next/server';
import { fetchCallLegs, pairCallLegs, todayMST } from '@/lib/twilio';
import { ACTIVE_AGENTS, capitalize, normalizeAgent } from '@/lib/constants';
import { parseBrand, isAgentForBrand } from '@/lib/brand';
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
  agentLegSid?: string;
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
    agentLegSid: c.agentLegSid,
    recordingUrl: c.id
      ? `/api/calls/recording?sid=${c.id}${c.agentLegSid ? `&agent_sid=${c.agentLegSid}` : ''}`
      : undefined,
    account: c.client || undefined,
  };
}

/** Generate array of YYYY-MM-DD strings from `from` to `to` inclusive */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const d = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/** Fetch and cache calls for a single date */
async function fetchDayCalls(date: string, today: string): Promise<RawCall[]> {
  const isToday = date === today;
  const ttl = isToday ? 30_000 : 3_600_000;
  const cacheKey = `calls:${date}`;
  return cached<RawCall[]>(cacheKey, ttl, async () => {
    const legs = await fetchCallLegs(date);
    const paired = pairCallLegs(legs);
    return paired.map(toRawCall);
  });
}

function buildAgentSummaries(calls: RawCall[], brand: ReturnType<typeof parseBrand>): AgentCallSummary[] {
  const map = new Map<string, { calls: number; talkSec: number }>();

  // Seed with brand-appropriate agents
  for (const name of ACTIVE_AGENTS) {
    if (isAgentForBrand(name, brand)) {
      map.set(name, { calls: 0, talkSec: 0 });
    }
  }

  for (const call of calls) {
    const key = normalizeAgent(call.agent);
    if (!key) continue;
    // For mixed, allow any agent; otherwise check brand membership
    if (!isAgentForBrand(key, brand)) continue;
    let entry = map.get(key);
    if (!entry) {
      entry = { calls: 0, talkSec: 0 };
      map.set(key, entry);
    }
    entry.calls += 1;
    entry.talkSec += call.duration;
  }

  return [...map.entries()]
    .map(([name, entry]) => ({
      agent: capitalize(name),
      calls: entry.calls,
      talkMin: +(entry.talkSec / 60).toFixed(1),
    }))
    .sort((a, b) => b.calls - a.calls);
}

/**
 * GET /api/calls?date=YYYY-MM-DD                    — single day (legacy)
 * GET /api/calls?from=YYYY-MM-DD&to=YYYY-MM-DD      — date range (max 31 days)
 * Both support &limit=500&offset=0 for pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const today = todayMST();

    // Support both single-date and range queries
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const dateParam = searchParams.get('date');

    let from: string;
    let to: string;

    if (fromParam && toParam) {
      from = fromParam;
      to = toParam;
    } else {
      const date = dateParam || today;
      from = date;
      to = date;
    }

    // Cap at 31 days to prevent abuse
    const dates = dateRange(from, to);
    if (dates.length > 31) {
      return NextResponse.json(
        { error: 'Date range cannot exceed 31 days' },
        { status: 400 },
      );
    }

    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') || '500') || 500, 1),
      2000,
    );
    const offset = Math.max(
      parseInt(searchParams.get('offset') || '0') || 0,
      0,
    );

    // Fetch all days in parallel, each individually cached
    const dayResults = await Promise.all(
      dates.map(d => fetchDayCalls(d, today)),
    );
    const allCalls = dayResults.flat();
    // Sort newest first across all days
    allCalls.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    const brand = parseBrand(searchParams.get('brand'));
    const agents = buildAgentSummaries(allCalls, brand);
    const total = allCalls.length;
    const page = allCalls.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return NextResponse.json({
      calls: page,
      agents,
      pulledAt: new Date().toISOString(),
      total,
      hasMore,
      dateRange: { from, to },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/calls] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
