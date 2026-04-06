'use client';

import type { PeriodData } from '@/lib/types';
import { Num, Label, AgentBar } from './primitives';
import { G } from './theme';

export function StepCalls({ period, label }: { period: PeriodData; label?: string }) {
  const agents = [...period.repActivity.agents]
    .sort((a, b) => b.calls - a.calls);
  const agentSum = agents.reduce((s, a) => s + a.calls, 0);
  const total = Math.max(period.answeredCalls ?? 0, agentSum);
  return (
    <div>
      <div style={{ marginBottom: G(24) }}>
        <Label>{label ? `${label} \u2014 Calls answered` : 'Total calls answered'}</Label>
        <div style={{ marginTop: G(8) }}><Num>{total}</Num></div>
      </div>
      {agents.map((a, i) => (
        <AgentBar key={a.agent} rank={i} name={a.agent} value={a.calls} max={agents[0]?.calls || 1} />
      ))}
    </div>
  );
}
