import { NextRequest, NextResponse } from 'next/server';
import { fetchCallLegs, pairCallLegs, todayMST } from '@/lib/twilio';
import { capitalize, normalizeAgent } from '@/lib/constants';
import { parseBrand, isAgentForBrand, MSC_ONLY_AGENTS, JC_ONLY_AGENTS, type Brand } from '@/lib/brand';
import { fetchKPIForRange, type KPIAgentDay } from '@/lib/kpi-sheet';
import { fetchYticaRepActivity, fetchYticaMtdActivity, fetchYticaTeamStatsRange, type YticaRepActivity, type YticaTeamStats } from '@/lib/sheets';
import { isMscPhone, getClientBrand } from '@/lib/clients';
import { cached } from '@/lib/cache';
import { fetchCallWrapUp } from '@/lib/call-records';
import type { PairedCall } from '@/lib/types';
import type { AgentCallSummary, CallsSummary } from '@/lib/api-types';

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

/** Convert call time (UTC ISO) to MST date string for KPI lookup */
function callDateMST(isoTime: string): string {
  return new Date(isoTime).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
}

function toRawCall(
  c: PairedCall,
  agentWrapMap?: Map<string, number>,
  perCallWrap?: Map<string, number>,
): RawCall {
  const agentKey = (c.agent || '').toLowerCase();
  const dateKey = c.time ? callDateMST(c.time) : '';
  // Priority: 1) real per-call from Neon  2) KPI daily  3) Ytica MTD
  const wrapUp = perCallWrap?.get(c.id)
    ?? agentWrapMap?.get(`${dateKey}|${agentKey}`)
    ?? agentWrapMap?.get(`mtd|${agentKey}`);
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
    wrapUpSec: wrapUp,
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

/** Is this KPI row for the requested brand? Uses Column C team tags. */
function isKPIForBrand(kpi: KPIAgentDay, brand: Brand): boolean {
  if (brand === 'mixed') return true;
  if (kpi.team === 'blended') return true;
  return kpi.team === brand;
}

/** Parse "H:MM:SS" or "M:SS" time string to minutes */
function parseTimeMins(val: string): number {
  if (!val) return 0;
  const parts = val.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return parseFloat(val) || 0;
}

/**
 * Build agent summaries from KPI Sheet (primary) + Ytica (fallback).
 * CDR is only used to enrich with inbound/outbound direction split.
 */
function buildSheetAgentSummaries(
  kpiRows: KPIAgentDay[],
  yticaDays: (YticaRepActivity | null)[],
  brand: Brand,
  cdrCalls: RawCall[],
): AgentCallSummary[] {
  const map = new Map<string, { calls: number; talkMin: number }>();

  // Primary: KPI sheet — aggregate per-agent across all days in range
  for (const kpi of kpiRows) {
    if (!isKPIForBrand(kpi, brand)) continue;
    const agent = kpi.agent.toLowerCase();
    const entry = map.get(agent) || { calls: 0, talkMin: 0 };
    entry.calls += kpi.callsPickedUp;
    entry.talkMin += kpi.totalTalkMin;
    map.set(agent, entry);
  }

  // Fallback: Ytica daily for agents not in KPI
  for (const ytica of yticaDays) {
    if (!ytica) continue;
    for (const a of ytica.agents) {
      const agent = a.agent.toLowerCase();
      if (map.has(agent)) continue; // KPI takes priority
      if (!isAgentForBrand(agent, brand)) continue;
      const entry = map.get(agent) || { calls: 0, talkMin: 0 };
      entry.calls += a.calls;
      entry.talkMin += a.talkMin;
      map.set(agent, entry);
    }
  }

  // CDR enrichment: per-agent inbound/outbound counts
  const dirByAgent = new Map<string, { inbound: number; outbound: number }>();
  for (const call of cdrCalls) {
    const key = normalizeAgent(call.agent)?.toLowerCase();
    if (!key) continue;
    const entry = dirByAgent.get(key) || { inbound: 0, outbound: 0 };
    if (call.direction === 'inbound') entry.inbound++;
    else entry.outbound++;
    dirByAgent.set(key, entry);
  }

  return [...map.entries()]
    .filter(([, e]) => e.calls > 0)
    .map(([name, e]) => {
      const dir = dirByAgent.get(name) || { inbound: 0, outbound: 0 };
      return {
        agent: capitalize(name),
        calls: e.calls,
        talkMin: +e.talkMin.toFixed(1),
        inbound: dir.inbound,
        outbound: dir.outbound,
      };
    })
    .sort((a, b) => b.calls - a.calls);
}

/** Aggregate Ytica TeamStats across multiple days into a CallsSummary */
function buildTeamSummary(
  teamStats: YticaTeamStats[],
): CallsSummary {
  let totalCalls = 0;
  let totalTalkMin = 0;
  let inbound = 0;
  let outbound = 0;
  for (const ts of teamStats) {
    totalCalls += ts.totalCalls;
    inbound += ts.inbound;
    outbound += ts.outbound;
    if (ts.talkTime) totalTalkMin += parseTimeMins(ts.talkTime);
  }
  return {
    totalCalls,
    totalTalkMin: +totalTalkMin.toFixed(1),
    inbound,
    outbound,
  };
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

    // Build agent wrap-up map: KPI daily → Ytica daily → Ytica MTD fallback
    // Key: "YYYY-MM-DD|agent" for date-specific, "mtd|agent" for fallback
    const agentWrapMap = new Map<string, number>();

    // 1. Primary: KPI sheet (date+agent granularity)
    const kpiRows = await fetchKPIForRange(dates[0], dates[dates.length - 1]).catch(() => [] as KPIAgentDay[]);
    for (const r of kpiRows) {
      if (r.avgWrapSec > 0) {
        agentWrapMap.set(`${r.date}|${r.agent.toLowerCase()}`, r.avgWrapSec);
      }
    }

    // 2. Fallback: Ytica daily data for dates missing KPI wrap-up
    const yticaDays = await Promise.all(
      dates.slice(0, 7).map(d => fetchYticaRepActivity(d).catch(() => null))
    );
    for (let i = 0; i < yticaDays.length; i++) {
      const ytica = yticaDays[i];
      if (!ytica) continue;
      for (const a of ytica.agents) {
        const key = `${dates[i]}|${a.agent.toLowerCase()}`;
        if (!agentWrapMap.has(key) && a.wrapUpSec != null && a.wrapUpSec > 0) {
          agentWrapMap.set(key, a.wrapUpSec);
        }
      }
    }

    // 3. Last resort: Ytica MTD average (not date-specific, but always available)
    const monthPrefix = dates[0].slice(0, 7);
    const yticaMtd = await fetchYticaMtdActivity(monthPrefix).catch(() => []);
    for (const a of yticaMtd) {
      if (a.avgWrapUpSec != null && a.avgWrapUpSec > 0) {
        agentWrapMap.set(`mtd|${a.agent.toLowerCase()}`, a.avgWrapUpSec);
      }
    }

    // 4. Best source: real per-call wrap-up from Neon (TaskRouter events)
    const perCallWrap = await fetchCallWrapUp(dates[0], dates[dates.length - 1]);

    // Convert to RawCall with wrap-up embedded per call
    const brandCalls = brandPaired.map(c => toRawCall(c, agentWrapMap, perCallWrap));

    // Agent summaries from KPI Sheet (primary) + Ytica (fallback), CDR for direction split
    const agents = buildSheetAgentSummaries(kpiRows, yticaDays, brand, brandCalls);

    // Team-level summary from Ytica TeamStats (one sheet read for all dates)
    const teamStats = await fetchYticaTeamStatsRange(dates).catch(() => []);
    const summary = buildTeamSummary(teamStats);

    const total = brandCalls.length;
    const page = brandCalls.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return NextResponse.json({
      calls: page,
      agents,
      summary,
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
