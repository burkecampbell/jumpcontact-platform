'use client';

import type { PeriodData } from '@/lib/types';
import { Num, Label, AgentBar } from './primitives';
import { G } from './theme';

function fmtMin(m: number) {
  return `${Math.round(m)}m`;
}

export function StepTalk({ period, label }: { period: PeriodData; label?: string }) {
  const agents = [...period.repActivity.agents]
    .sort((a, b) => b.talkMin - a.talkMin);
  return (
    <div>
      <div style={{ marginBottom: G(24) }}>
        <Label>{label ? `${label} \u2014 Talk time` : 'Total team talk time'}</Label>
        <div style={{ marginTop: G(8) }}>
          <Num>{fmtMin(agents.reduce((s, a) => s + a.talkMin, 0))}</Num>
        </div>
      </div>
      {agents.map((a, i) => (
        <AgentBar key={a.agent} rank={i} name={a.agent} value={fmtMin(a.talkMin)} max={agents[0]?.talkMin || 1} />
      ))}
    </div>
  );
}
