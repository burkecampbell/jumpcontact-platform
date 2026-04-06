'use client';

import { isJCAgent, capitalize, agentColor, speedGrade } from '@/lib/constants';
import type { DashboardData, PeriodData } from '@/lib/types';
import { Num, Label, Pill } from './primitives';
import { T, Z, G } from './theme';

/**
 * Speed step — prefers Ytica agent-ring-to-pickup speed over CDR ring time.
 *
 * CDR speedSec includes IVR + queue + agent ring (inflated, 10-15s typical).
 * Ytica avgSpeedSec is agent-only pickup time (realistic, 6-9s typical).
 *
 * Priority: yesterday's Ytica blended speed → MTD Ytica avg → CDR fallback.
 */
export function StepSpeed({ period, data, label }: { period: PeriodData; data: DashboardData; label?: string }) {
  // Build a Ytica MTD speed lookup: agent → avgSpeedSec
  const yticaMtd: Record<string, number> = {};
  for (const y of data.mtdRepActivity ?? []) {
    if (y.avgSpeedSec != null && y.avgSpeedSec > 0) {
      yticaMtd[y.agent.toLowerCase()] = y.avgSpeedSec;
    }
  }

  // For each agent, pick best available speed:
  // 1. If yesterday's speedSec looks like Ytica-blended (< 10s), use it
  // 2. Else use Ytica MTD average
  // 3. Else fall back to CDR speed
  const agents = period.repActivity.agents
    .filter(a => isJCAgent(a.agent))
    .map(a => {
      const cdrSpeed = a.speedSec;
      const yticaSpeed = yticaMtd[a.agent.toLowerCase()];
      // Prefer Ytica MTD when CDR looks inflated (>10s) and Ytica is available
      let bestSpeed: number | null = cdrSpeed;
      if (cdrSpeed != null && cdrSpeed > 10 && yticaSpeed != null) {
        bestSpeed = yticaSpeed;
      } else if (cdrSpeed == null && yticaSpeed != null) {
        bestSpeed = yticaSpeed;
      }
      return { ...a, displaySpeed: bestSpeed, source: bestSpeed === yticaSpeed ? 'mtd' : 'yesterday' };
    })
    .filter(a => a.displaySpeed != null && a.displaySpeed > 0)
    .sort((a, b) => a.displaySpeed! - b.displaySpeed!);

  const hitting = agents.filter(a => a.displaySpeed! < 10).length;
  const avg = agents.length > 0
    ? agents.reduce((s, a) => s + a.displaySpeed!, 0) / agents.length
    : 0;
  const usingMtd = agents.some(a => a.source === 'mtd');
  const b = Z('badge');

  return (
    <div>
      <div style={{ marginBottom: G(24) }}>
        <Label>{label ? `${label} \u2014 Speed` : 'Speed'}{usingMtd ? ' (MTD avg)' : ''}</Label>
        <div style={{ marginTop: G(8), display: 'flex', alignItems: 'baseline', gap: G(16), flexWrap: 'wrap' }}>
          <Num>{avg.toFixed(1)}s</Num>
          <Pill color={hitting === agents.length ? T.positive : hitting > 0 ? T.caution : T.negative}>
            {hitting}/{agents.length} under 10s
          </Pill>
        </div>
      </div>
      {/* Speed metrics explainer */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: G(12),
        marginBottom: G(20), padding: `${G(12)}px 0`,
        borderBottom: `1px solid ${T.border}`,
      }}>
        {(() => {
          // Compute team-level numbers for each metric
          const cdrAgents = period.repActivity.agents.filter(a => isJCAgent(a.agent) && a.speedSec != null && a.speedSec > 0);
          const cdrAvg = cdrAgents.length > 0 ? cdrAgents.reduce((s, a) => s + a.speedSec!, 0) / cdrAgents.length : null;

          const yticaAgents = (data.mtdRepActivity ?? []).filter(y => isJCAgent(y.agent) && y.avgSpeedSec != null && y.avgSpeedSec > 0);
          const yticaAvg = yticaAgents.length > 0 ? yticaAgents.reduce((s, y) => s + y.avgSpeedSec!, 0) / yticaAgents.length : null;

          const metrics = [
            { label: 'Ring to Pickup', value: yticaAvg, desc: 'Agent hears ring \u2192 picks up', source: 'Ytica MTD' },
            { label: 'Total Wait', value: cdrAvg, desc: 'Caller dials \u2192 agent answers', source: 'CDR yesterday' },
          ];
          return metrics.map(m => (
            <div key={m.label} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue'),
                fontWeight: 700, color: m.value != null && m.value < 10 ? T.positive : m.value != null && m.value < 14 ? T.caution : T.inkMuted,
              }}>
                {m.value != null ? `${m.value.toFixed(1)}s` : '\u2014'}
              </div>
              <div style={{ fontSize: Z('label'), fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: T.inkSoft, marginTop: G(2) }}>
                {m.label}
              </div>
              <div style={{ fontSize: Z('label') * 0.9, color: T.inkFaint, marginTop: G(1) }}>
                {m.desc}
              </div>
            </div>
          ));
        })()}
      </div>

      {agents.map((a, i) => {
        const s = a.displaySpeed!;
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

      {/* Per-client wait time */}
      {data.clientSpeed && data.clientSpeed.length > 0 && (
        <>
          <div style={{ height: 1, background: T.border, margin: `${G(20)}px 0` }} />
          <Label>Client wait time (caller dials &rarr; agent answers)</Label>
          <div style={{ marginTop: G(10) }}>
            {data.clientSpeed.map(cs => {
              const c = cs.avgSpeed < 10 ? T.positive : cs.avgSpeed < 15 ? T.caution : T.negative;
              return (
                <div key={cs.account} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: `${G(8)}px 0`, borderBottom: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontSize: Z('body'), color: T.inkSoft, flex: 1 }}>{cs.account}</span>
                  <span style={{ fontSize: Z('label'), color: T.inkFaint, marginRight: G(12) }}>
                    {cs.calls} call{cs.calls !== 1 ? 's' : ''}
                  </span>
                  <span style={{
                    fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue') * 0.85,
                    fontWeight: 700, color: c, minWidth: G(50), textAlign: 'right',
                  }}>{cs.avgSpeed.toFixed(1)}s</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
