import { NextResponse } from 'next/server';
import { isJCAccount, MSC_ONLY_AGENTS, ACTIVE_AGENTS } from '@/lib/constants';
import type { DashboardData, PeriodData, AcctStat } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const OPS_CENTER = process.env.NEXT_PUBLIC_OPS_CENTER_URL || 'https://main.d2t3zyuv8zobb7.amplifyapp.com';

/** JC agents (lowercase). Jose takes calls but NEVER counts for conversions. */
const JC_AGENTS = new Set(ACTIVE_AGENTS.map(a => a.toLowerCase()));

function isJCAgent(name: string): boolean {
  return JC_AGENTS.has(name.toLowerCase());
}

/** Filter a byAccount array to JC-only accounts */
function filterAccounts(accounts: AcctStat[]): AcctStat[] {
  return accounts.filter(a => isJCAccount(a.account));
}

/** Filter a PeriodData to strip MSC accounts and MSC-only agents */
function filterPeriod(p: PeriodData): PeriodData {
  const filteredMissedAccounts = filterAccounts(p.missedCalls?.byAccount ?? []);
  const filteredConvAccounts = filterAccounts(p.conversions?.byAccount ?? []);
  const filteredAgents = (p.repActivity?.agents ?? []).filter(a => !MSC_ONLY_AGENTS.has(a.agent.toLowerCase()));
  const filteredOutbound = (p.repActivity?.outbound ?? []).filter(a => !MSC_ONLY_AGENTS.has(a.agent.toLowerCase()));

  return {
    ...p,
    conversions: {
      ...p.conversions,
      byAccount: filteredConvAccounts,
      total: filteredConvAccounts.reduce((s, a) => s + a.count, 0) || p.conversions?.total || 0,
    },
    missedCalls: {
      ...p.missedCalls,
      byAccount: filteredMissedAccounts,
      total: filteredMissedAccounts.reduce((s, a) => s + a.count, 0),
    },
    repActivity: {
      ...p.repActivity,
      agents: filteredAgents,
      outbound: filteredOutbound,
    },
  };
}

export async function GET() {
  try {
    const res = await fetch(`${OPS_CENTER}/api/live`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`ops-center returned ${res.status}`);
    const data: DashboardData = await res.json();

    // ── Filter MSC data out of JC dashboard ──────────────────────────
    if (data.today)     data.today     = { ...data.today, ...filterPeriod(data.today) } as DashboardData['today'];
    if (data.yesterday) data.yesterday = filterPeriod(data.yesterday);

    // Filter recentCalls to JC agents only
    if (data.recentCalls) {
      data.recentCalls = data.recentCalls.filter(c =>
        !c.agent || isJCAgent(c.agent)
      );
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API /data → ops-center]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
