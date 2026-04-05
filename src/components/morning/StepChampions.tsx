'use client';

import { capitalize, agentColor } from '@/lib/constants';
import type { MonthChampions } from '@/lib/types';
import { Num, Label } from './primitives';
import { T, Z, G } from './theme';

function fmtMin(m: number) {
  return m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`;
}

export function StepChampions({ champions }: { champions: MonthChampions }) {
  const items = [
    { icon: '\uD83C\uDFC6', title: 'Most Conversions', ...champions.mostConversions, sfx: '', accent: T.gold },
    { icon: '\uD83D\uDCDE', title: 'Most Calls (last day)', ...champions.mostCalls, sfx: '', accent: T.ink },
    { icon: '\u26A1', title: 'Fastest Speed (last day)', ...champions.fastestSpeed, sfx: 's', accent: T.positive },
    { icon: '\uD83D\uDDE3\uFE0F', title: 'Most Talk Time (last day)', ...champions.mostTalkTime, sfx: 'm', accent: T.ink },
    { icon: '\uD83C\uDFAF', title: 'Best Conv/Day', ...champions.bestConvRate, sfx: '', accent: T.caution },
  ];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: G(12), marginBottom: G(24) }}>
        <span style={{ fontSize: Z('hero') * 0.6 }}>{'\uD83C\uDFC6'}</span>
        <div>
          <Num el="stepTitle">{champions.month}</Num>
          <Label>Champions</Label>
        </div>
      </div>
      {items.map(c => (
        <div key={c.title} style={{
          display: 'grid', gridTemplateColumns: `${G(40)}px 1fr auto`,
          alignItems: 'center', gap: G(12), padding: `${G(14)}px 0`,
          borderBottom: `1px solid ${T.border}`,
        }}>
          <div style={{ fontSize: Z('agentValue'), textAlign: 'center' }}>{c.icon}</div>
          <div>
            <div style={{ fontSize: Z('label'), color: T.inkFaint, textTransform: 'uppercase', letterSpacing: 1 }}>
              {c.title}
            </div>
            <div style={{ fontSize: Z('agentName'), fontWeight: 700, color: agentColor(c.agent) }}>
              {capitalize(c.agent)}
            </div>
            {c.runnerUp && (
              <div style={{ fontSize: Z('body') * 0.85, color: T.inkMuted }}>
                Runner-up: {capitalize(c.runnerUp)} ({c.runnerUpValue}{c.sfx})
              </div>
            )}
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono','Consolas',monospace",
            fontSize: Z('agentValue'), fontWeight: 700, color: c.accent,
          }}>
            {typeof c.value === 'number' && c.sfx === 'm' ? fmtMin(c.value) : c.value}
            {c.sfx !== 'm' ? c.sfx : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
