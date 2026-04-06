'use client';

import { EXCLUDED_AGENTS } from '@/lib/constants';
import type { DashboardData } from '@/lib/types';
import { Num, Label, AgentBar } from './primitives';
import { G } from './theme';

export function StepCalls({ data }: { data: DashboardData }) {
  const agents = data.yesterday.repActivity.agents
    .filter(a => !EXCLUDED_AGENTS.includes(a.agent))
    .sort((a, b) => b.calls - a.calls);
  const agentSum = agents.reduce((s, a) => s + a.calls, 0);
  const total = Math.max(data.yesterday.answeredCalls ?? 0, agentSum);
  return (
    <div>
      <div style={{ marginBottom: G(24) }}>
        <Label>Total calls answered</Label>
        <div style={{ marginTop: G(8) }}><Num>{total}</Num></div>
      </div>
      {agents.map((a, i) => (
        <AgentBar key={a.agent} rank={i} name={a.agent} value={a.calls} max={agents[0]?.calls || 1} />
      ))}
    </div>
  );
}
