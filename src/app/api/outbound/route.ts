import { NextResponse } from 'next/server';
import { cached } from '@/lib/cache';
import {
  fetchCallsForOwners,
  fetchDealsForOwners,
  fetchPipelines,
  fetchRecentActivity,
  getHubSpotTeam,
  todayMST,
} from '@/lib/hubspot';
import type { OutboundDashboardData, OutboundAgentStats } from '@/lib/outbound-types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await cached('outbound', 60_000, fetchOutboundData);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch outbound data', details: String(err) },
      { status: 500 },
    );
  }
}

async function fetchOutboundData(): Promise<OutboundDashboardData> {
  const today = todayMST();
  const team = await getHubSpotTeam();
  const allOwnerIds = team.map(o => o.ownerId);

  // Sequential fetches with pauses to stay within HubSpot's per-second rate limit.
  // Cached at 60s so this only runs once per minute.
  const pipelines = await fetchPipelines();
  const calls = await fetchCallsForOwners(allOwnerIds, today);
  await new Promise(r => setTimeout(r, 400));
  const deals = await fetchDealsForOwners(allOwnerIds);
  await new Promise(r => setTimeout(r, 400));
  const activityFeed = await fetchRecentActivity(allOwnerIds, 50);

  // Build pipeline stage lookup for deal label resolution
  const stageMap = new Map<string, string>();
  const pipelineMap = new Map<string, string>();
  for (const p of pipelines) {
    pipelineMap.set(p.id, p.label);
    for (const s of p.stages) {
      stageMap.set(s.id, s.label);
    }
  }

  // Resolve deal stage/pipeline labels
  const resolvedDeals = deals.map(d => ({
    ...d,
    stageLabel: stageMap.get(d.stage) || d.stage,
    pipelineLabel: pipelineMap.get(d.pipelineId) || d.pipelineId,
  }));

  // Compute per-agent stats
  const agents: OutboundAgentStats[] = team.map(owner => {
    const agentCalls = calls.filter(c => c.ownerKey === owner.key);
    const connected = agentCalls.filter(c =>
      c.status === 'COMPLETED' && c.durationMs > 30_000,
    ).length;
    const noAnswer = agentCalls.filter(c =>
      c.status === 'NO_ANSWER' || (c.status === 'COMPLETED' && c.durationMs <= 30_000),
    ).length;
    const totalDurationMs = agentCalls.reduce((sum, c) => sum + c.durationMs, 0);
    const agentDeals = resolvedDeals.filter(d => d.ownerKey === owner.key);

    return {
      key: owner.key,
      name: owner.name,
      ownerId: owner.ownerId,
      totalCalls: agentCalls.length,
      connected,
      noAnswer,
      totalDurationMs,
      avgDurationMs: agentCalls.length > 0 ? Math.round(totalDurationMs / agentCalls.length) : 0,
      connectRate: agentCalls.length > 0 ? Math.round((connected / agentCalls.length) * 100) : 0,
      deals: agentDeals.length,
      tasks: { open: 0, completed: 0 },
    };
  });

  // Team totals
  const teamTotals = {
    totalCalls: agents.reduce((s, a) => s + a.totalCalls, 0),
    connected: agents.reduce((s, a) => s + a.connected, 0),
    noAnswer: agents.reduce((s, a) => s + a.noAnswer, 0),
    totalDurationMs: agents.reduce((s, a) => s + a.totalDurationMs, 0),
  };

  return {
    agents,
    deals: resolvedDeals,
    pipelines,
    activityFeed,
    teamTotals,
    pulledAt: new Date().toISOString(),
  };
}
