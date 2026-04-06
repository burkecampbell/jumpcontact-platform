'use client';

import { EXCLUDED_AGENTS, capitalize, agentColor, speedGrade } from '@/lib/constants';
import type { DashboardData } from '@/lib/types';
import { Num, Label, Pill } from './primitives';
import { T, Z, G } from './theme';

export function StepSpeed({ data }: { data: DashboardData }) {
  const agents = data.yesterday.repActivity.agents
    .filter(a => !EXCLUDED_AGENTS.includes(a.agent) && a.speedSec != null && a.speedSec > 0)
    .sort((a, b) => a.speedSec! - b.speedSec!);
  const hitting = agents.filter(a => a.speedSec! < 10).length;
  const avg = agents.length > 0 ? agents.reduce((s, a) => s + a.speedSec!, 0) / agents.length : 0;
  const b = Z('badge');
  return (
    <div>
      <div style={{ marginBottom: G(24) }}>
        <Label>Speed</Label>
        <div style={{ marginTop: G(8), display: 'flex', alignItems: 'baseline', gap: G(16), flexWrap: 'wrap' }}>
          <Num>{avg.toFixed(1)}s</Num>
          <Pill color={T.positive}>{hitting}/{agents.length} under 10s</Pill>
        </div>
      </div>
      {agents.map((a, i) => {
        const s = a.speedSec!;
        const c = s < 10 ? T.positive : s < 14 ? T.caution : T.negative;
        const { letter } = speedGrade(s);
        return (
          <div key={a.agent} style={{
            display: 'grid', gridTemplateColumns: `${b}px ${G(90)}px 1fr auto`,
            alignItems: 'center', gap: G(12), padding: `${G(12)}px 0`,
            borderBottom: `1px solid ${T.border}`,
          }}>
            <div style={{
              width: b, height: b, borderRadius: b / 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: Z('body') * 0.85, fontWeight: 700,
              background: i < 3 ? T.ink : 'transparent', color: i < 3 ? '#fff' : T.inkFaint,
              border: i < 3 ? 'none' : `1px solid ${T.border}`,
            }}>{i + 1}</div>
            <div style={{ fontWeight: 600, fontSize: Z('agentName'), color: T.ink }}>{capitalize(a.agent)}</div>
            <div><Pill color={c}>{letter}</Pill></div>
            <div style={{
              fontFamily: "'JetBrains Mono','Consolas',monospace",
              fontSize: Z('agentValue'), fontWeight: 600, color: c, textAlign: 'right',
            }}>{s.toFixed(1)}s</div>
          </div>
        );
      })}
    </div>
  );
}
