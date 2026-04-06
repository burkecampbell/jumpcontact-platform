'use client';

import { EXCLUDED_AGENTS, capitalize, agentColor } from '@/lib/constants';
import type { DashboardData } from '@/lib/types';
import { Num, Label, Pill } from './primitives';
import { T, Z, G } from './theme';

function dayName(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
}

export function StepConversions({ data }: { data: DashboardData }) {
  const convByAgent: Record<string, number> = {};
  for (const a of data.yesterday.conversions.byAgent) convByAgent[a.agent.toLowerCase()] = a.count;
  const agents = data.yesterday.repActivity.agents
    .filter(a => !EXCLUDED_AGENTS.includes(a.agent))
    .map(a => {
      const convs = convByAgent[a.agent.toLowerCase()] || 0;
      // CDR can undercount calls (legs expire, pairing misses). Conversions are
      // authoritative — you can't convert without a call, so floor calls at convs.
      const calls = Math.max(a.calls, convs);
      return { ...a, calls, convs };
    })
    .sort((a, b) => b.convs - a.convs);
  const total = data.yesterday.conversions.total;
  const trend = data.trend7d.conversions;
  const prior = trend.length >= 2 ? trend[trend.length - 1] : null;
  const pct = prior ? Math.round(((total - prior) / Math.max(prior, 1)) * 100) : null;
  const b = Z('badge');

  return (
    <div>
      <div style={{ marginBottom: G(24) }}>
        <Label>Conversions &mdash; {dayName(data.yesterdayDate || '')}</Label>
        <div style={{ marginTop: G(8), display: 'flex', alignItems: 'baseline', gap: G(16) }}>
          <Num>{total}</Num>
          {pct !== null && (
            <Pill color={pct >= 0 ? T.positive : T.negative}>
              {pct >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(pct)}%
            </Pill>
          )}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${T.border}` }}>
            {['#', 'Agent', 'Conv', 'Calls', 'Rate', 'Conv/Hr'].map(h => (
              <th key={h} style={{
                padding: `${G(8)}px ${G(10)}px`,
                textAlign: h === '#' || h === 'Agent' ? 'left' : 'right',
                color: T.inkFaint, fontSize: Z('label'),
                textTransform: 'uppercase', letterSpacing: 1.5,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((a, i) => {
            const rate = a.calls > 0 ? Math.round((a.convs / a.calls) * 100) : 0;
            return (
              <tr key={a.agent} style={{
                borderBottom: `1px solid ${T.border}`,
                background: i % 2 ? T.subtle : 'transparent',
              }}>
                <td style={{ padding: G(8) }}>
                  <div style={{
                    width: b, height: b, borderRadius: b / 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: Z('body') * 0.85, fontWeight: 700,
                    background: i < 3 ? T.ink : 'transparent', color: i < 3 ? '#fff' : T.inkFaint,
                    border: i < 3 ? 'none' : `1px solid ${T.border}`,
                  }}>{i + 1}</div>
                </td>
                <td style={{ padding: G(8), fontWeight: 700, fontSize: Z('agentName'), color: agentColor(a.agent) }}>
                  {capitalize(a.agent)}
                </td>
                <td style={{ padding: G(8), textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue'), fontWeight: 700 }}>
                  {a.convs}
                </td>
                <td style={{ padding: G(8), textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: Z('body'), color: T.inkMuted }}>
                  {a.calls}
                </td>
                <td style={{ padding: G(8), textAlign: 'right' }}>
                  <Pill color={rate >= 15 ? T.positive : rate >= 8 ? T.inkMuted : T.caution}>{rate}%</Pill>
                </td>
                <td style={{ padding: G(8), textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: Z('body'), color: T.inkSoft }}>
                  {a.convsPerHour?.toFixed(2) || '\u2014'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ height: 1, background: T.border, margin: `${G(20)}px 0` }} />
      <div style={{ display: 'flex', gap: G(40) }}>
        <div style={{ flex: 1 }}>
          <Label>Top accounts</Label>
          <div style={{ marginTop: G(8) }}>
            {data.yesterday.conversions.byAccount.slice(0, 6).map(a => (
              <div key={a.account} style={{
                display: 'flex', justifyContent: 'space-between', padding: `${G(5)}px 0`,
                borderBottom: `1px solid ${T.border}`, fontSize: Z('body'),
              }}>
                <span style={{ color: T.inkSoft }}>{a.account}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{a.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: G(8), marginBottom: G(8) }}>
            <Label>Missed calls</Label>
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue'),
              fontWeight: 600, color: T.negative,
            }}>{data.yesterday.missedCalls.total}</span>
          </div>
          {data.yesterday.missedCalls.byAccount.slice(0, 5).map(a => (
            <div key={a.account} style={{
              display: 'flex', justifyContent: 'space-between', padding: `${G(4)}px 0`,
              fontSize: Z('body') * 0.9, color: T.inkMuted,
            }}>
              <span>{a.account}</span>
              <span style={{ fontWeight: 600, color: T.negative }}>{a.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
