'use client';

import { C, fmtTalkTime, fmtSpeed, agentColor } from '@/lib/constants';
import type { PeriodData } from '@/lib/types';
import Card from '../Card';
import Hero from './Hero';
import { TH, TD } from './TableCells';

/** Step 1: Calls Answered — agent performance table */
export default function StepCalls({ period, label }: { period: PeriodData; label: string }) {
  const agents = period.repActivity.agents;
  const total = agents.reduce((s, a) => s + a.calls, 0);
  const totalTalk = agents.reduce((s, a) => s + a.talkMin, 0);

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>{label}</div>
      <Hero value={total} sub="calls answered" />

      {/* Summary strip */}
      <div className="flex justify-center gap-6 mb-4">
        <div className="text-center">
          <div className="text-lg font-bold font-mono" style={{ color: C.text }}>{total}</div>
          <div className="text-[10px] uppercase" style={{ color: C.sub }}>Total Calls</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold font-mono" style={{ color: C.text }}>{fmtTalkTime(totalTalk)}</div>
          <div className="text-[10px] uppercase" style={{ color: C.sub }}>Total Talk</div>
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
                <TH right>Calls</TH>
                <TH right>Hrs</TH>
                <TH right>Calls/Hr</TH>
                <TH right>Talk Time</TH>
                <TH right>Avg Speed</TH>
                <TH right>Avg Wrap</TH>
              </tr>
            </thead>
            <tbody>
              {agents.map((a, i) => {
                const callsPerHr = a.hoursScheduled > 0 ? (a.calls / a.hoursScheduled).toFixed(1) : '—';
                return (
                <tr key={a.agent} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                  <TD color={i < 3 ? C.cyan : C.sub}><span className="font-bold">{i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span></TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: agentColor(a.agent) }} />
                      <span className="font-semibold capitalize">{a.agent}</span>
                    </div>
                  </TD>
                  <TD mono right>{a.calls}</TD>
                  <TD mono right color={C.sub}>{a.hoursScheduled > 0 ? a.hoursScheduled : '—'}</TD>
                  <TD mono right color={callsPerHr !== '—' && parseFloat(callsPerHr) >= 3 ? '#4ade80' : C.sub}>{callsPerHr}</TD>
                  <TD mono right>{fmtTalkTime(a.talkMin)}</TD>
                  <TD mono right>{fmtSpeed(a.speedSec)}</TD>
                  <TD mono right color={C.sub}>{a.wrapUpSec != null ? `${Math.round(a.wrapUpSec)}s` : '—'}</TD>
                </tr>
                );
              })}
              {agents.length === 0 && (
                <tr><td colSpan={8} className="text-center text-sm py-5" style={{ color: C.sub }}>No call data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
