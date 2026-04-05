'use client';

import { EXCLUDED_AGENTS } from '@/lib/constants';
import type { DashboardData } from '@/lib/types';
import { Num, Label, AgentBar } from './primitives';
import { T, Z, G } from './theme';

export function StepMTD({ data }: { data: DashboardData }) {
  const mtd = data.mtd;
  const pace = mtd.dayOfMonth > 0 ? Math.round(mtd.total / mtd.dayOfMonth) : 0;
  return (
    <div>
      <div style={{ marginBottom: G(24) }}>
        <Label>Month to date &mdash; day {mtd.dayOfMonth}</Label>
        <div style={{ marginTop: G(8), display: 'flex', alignItems: 'baseline', gap: G(16) }}>
          <Num>{mtd.total}</Num>
          <span style={{ fontSize: Z('body'), color: T.inkMuted }}>{pace}/day pace</span>
        </div>
      </div>
      {mtd.byAgent
        .filter(a => !EXCLUDED_AGENTS.includes(a.agent))
        .sort((a, b) => b.count - a.count)
        .map((a, i) => (
          <AgentBar key={a.agent} rank={i} name={a.agent} value={a.count} max={mtd.byAgent[0]?.count || 1} />
        ))}
      <div style={{ height: 1, background: T.border, margin: `${G(20)}px 0` }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: G(16), textAlign: 'center' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue'), fontWeight: 600 }}>
            {mtd.goalPace}
          </div>
          <Label>Projected</Label>
        </div>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue'), fontWeight: 600 }}>
            {mtd.goal}
          </div>
          <Label>Goal</Label>
        </div>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue'), fontWeight: 600,
            color: mtd.onTrack ? T.positive : T.negative,
          }}>{mtd.requiredDailyRate}</div>
          <Label>Needed/Day</Label>
        </div>
      </div>
    </div>
  );
}
