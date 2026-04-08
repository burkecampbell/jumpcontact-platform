import { NextRequest, NextResponse } from 'next/server';
import { fetchCallLegs, pairCallLegs, todayMST } from '@/lib/twilio';
import { ACTIVE_AGENTS, capitalize, normalizeAgent } from '@/lib/constants';
import { parseBrand, isAgentForBrand, MSC_ONLY_AGENTS, JC_ONLY_AGENTS, type Brand } from '@/lib/brand';
import { fetchKPIForRange, type KPIAgentDay } from '@/lib/kpi-sheet';
import { isMscPhone, getClientBrand } from '@/lib/clients';
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
  ringTime?: number;
  totalDuration?: number;
  wrapUpSec?: number;
}

interface AgentCallSummary {
  agent: string;
  calls: number;
  talkMin: number;
}

/** Convert call time (UTC ISO) to MST date string for KPI lookup */
function callDateMST(isoTime: string): string {
  return new Date(isoTime).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
}

function toRawCall(c: PairedCall, agentWrapMap?: Map<string, number>): RawCall {
  const agentKey = (c.agent || '').toLowerCase();
  const dateKey = c.time ? callDateMST(c.time) : '';
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
    ringTime: c.ringTime > 0 ? c.ringTime : undefined,
    totalDuration: c.totalDuration > 0 ? c.totalDuration : undefined,
    wrapUpSec: agentWrapMap?.get(`${dateKey}|${agentKey}`),
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

/** Fetch and cache paired calls for a single date (keep PairedCall for trunk-based filtering) */
async function fetchDayPaired(date: string, today: string): Promise<PairedCall[]> {
  const isToday = date === today;
  const ttl = isToday ? 30_000 : 3_600_000;
  const cacheKey = `calls:${date}`;
  return cached<PairedCall[]>(cacheKey, ttl, async () => {
    const legs = await fetchCallLegs(date);
    return pairCallLegs(legs);
  });
}

/** Determine if a PairedCall belongs to the given brand.
 *
 *  Both agent brand AND client/trunk brand must agree.  If either one
 *  is definitively the wrong brand, the call is excluded.
 *
 *  This handles two real scenarios:
 *  - MSC agent answers JC overflow call → excluded from JC (agent is MSC)
 *  - JC agent answers MSC overflow call → excluded from MSC (agent is JC)
 *  - Blended agent (wendy/sara) → decided by client/trunk brand only */
function isCallForBrand(call: PairedCall, brand: Brand): boolean {
  if (brand === 'mixed') return true;

  // Agent brand check — MSC-only / JC-only agents are definitive
  const agent = normalizeAgent(call.agent || '');
  if (agent) {
    const lower = agent.toLowerCase();
    if (MSC_ONLY_AGENTS.has(lower)) return brand === 'msc';
    if (JC_ONLY_AGENTS.has(lower)) return brand === 'jc';
    // Blended agent — fall through to client/trunk
  }

  // Client name brand
  if (call.client) {
    const clientBrand = getClientBrand(call.client);
    if (clientBrand) return clientBrand === brand;
  }

  // Trunk phone number
  const trunk = call.direction === 'inbound' ? call.to : call.from;
  if (trunk?.startsWith('+')) {
    const trunkIsMsc = isMscPhone(trunk);
    return brand === 'msc' ? trunkIsMsc : !trunkIsMsc;
  }

  // No agent, no client, no trunk — include in JC by default
  return brand === 'jc';
}

function buildAgentSummaries(calls: RawCall[], brand: Brand): AgentCallSummary[] {
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
    let entry = map.get(key);
    if (!entry) {
      // Agent not seeded (blended or new) — add them
      if (!isAgentForBrand(key, brand)) continue;
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

    // Cap at 90 days to prevent abuse
    const dates = dateRange(from, to);
    if (dates.length > 90) {
      return NextResponse.json(
        { error: 'Date range cannot exceed 90 days' },
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

    // Fetch all days in parallel, each individually cached as PairedCall[]
    const dayResults = await Promise.all(
      dates.map(d => fetchDayPaired(d, today)),
    );
    const allPaired = dayResults.flat();
    // Sort newest first across all days
    allPaired.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    // Only show calls with a known client and a caller phone number
    const clientPaired = allPaired.filter(c => c.client && c.from);

    // Filter by brand using trunk phone number (the source of truth)
    const brand = parseBrand(searchParams.get('brand'));
    const brandPaired = clientPaired.filter(c => isCallForBrand(c, brand));

    // Build agent wrap-up map from KPI sheet BEFORE converting calls
    // Key: "YYYY-MM-DD|agent" so each call gets its own date's wrap-up
    const kpiRows = await fetchKPIForRange(dates[0], dates[dates.length - 1]).catch(() => [] as KPIAgentDay[]);
    const agentWrapMap = new Map<string, number>();
    for (const r of kpiRows) {
      if (r.avgWrapSec > 0) {
        agentWrapMap.set(`${r.date}|${r.agent.toLowerCase()}`, r.avgWrapSec);
      }
    }

    // Convert to RawCall with wrap-up embedded per call
    const brandCalls = brandPaired.map(c => toRawCall(c, agentWrapMap));

    const agents = buildAgentSummaries(brandCalls, brand);
    const total = brandCalls.length;
    const page = brandCalls.slice(offset, offset + limit);
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
