'use client';

import { C, fmtTalkTime, agentColor } from '@/lib/constants';
import type { PeriodData } from '@/lib/types';
import Card from '../Card';
import Hero from './Hero';
import { TH, TD } from './TableCells';

/** Step 2: Talk Time — agent talk time rankings */
export default function StepTalkTime({ period, label }: { period: PeriodData; label: string }) {
  const agents = [...period.repActivity.agents].sort((a, b) => b.talkMin - a.talkMin);
  const totalMin = agents.reduce((s, a) => s + a.talkMin, 0);
  const totalCalls = agents.reduce((s, a) => s + a.calls, 0);

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>{label}</div>
      <Hero value={Math.round(totalMin / 60)} sub="hours total talk time" color={C.text} />

      {/* Summary strip */}
      <div className="flex justify-center gap-6 mb-4">
        <div className="text-center">
          <div className="text-lg font-bold font-mono" style={{ color: C.text }}>{fmtTalkTime(totalMin)}</div>
          <div className="text-[10px] uppercase" style={{ color: C.sub }}>Total Talk</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold font-mono" style={{ color: C.text }}>{totalCalls > 0 ? fmtTalkTime(totalMin / totalCalls) : '—'}</div>
          <div className="text-[10px] uppercase" style={{ color: C.sub }}>Avg / Call</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold font-mono" style={{ color: C.text }}>{agents.length}</div>
          <div className="text-[10px] uppercase" style={{ color: C.sub }}>Agents</div>
        </div>
      </div>

      {/* Agent Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <TH>#</TH>
                <TH>Agent</TH>
                <TH right>Talk Time</TH>
                <TH right>Avg / Call</TH>
                <TH right>Calls</TH>
                <TH right>Avg Wrap</TH>
              </tr>
            </thead>
            <tbody>
              {agents.map((a, i) => {
                const avgPerCall = a.calls > 0 ? a.talkMin / a.calls : 0;
                return (
                  <tr key={a.agent} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <TD color={i < 3 ? C.cyan : C.sub}><span className="font-bold">{i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span></TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: agentColor(a.agent) }} />
                        <span className="font-semibold capitalize">{a.agent}</span>
                      </div>
                    </TD>
                    <TD mono right>{fmtTalkTime(a.talkMin)}</TD>
                    <TD mono right color={C.sub}>{a.calls > 0 ? fmtTalkTime(avgPerCall) : '—'}</TD>
                    <TD mono right color={C.sub}>{a.calls}</TD>
                    <TD mono right color={C.sub}>{a.wrapUpSec != null ? `${Math.round(a.wrapUpSec)}s` : '—'}</TD>
                  </tr>
                );
              })}
              {agents.length === 0 && (
                <tr><td colSpan={6} className="text-center text-sm py-5" style={{ color: C.sub }}>No talk time data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
