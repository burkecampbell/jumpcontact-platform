'use client';

import { C, fmtTalkTime, fmtSpeed, agentColor, isIbrahim } from '@/lib/constants';
import type { PeriodData, DashboardData } from '@/lib/types';
import Card from '../Card';
import Hero from './Hero';
import { TH, TD } from './TableCells';

interface StepCallsProps {
  period: PeriodData;
  label: string;
  data: DashboardData;
}

/** Step 1: Calls + Talk Time + Missed — everything about call volume in one step */
export default function StepCalls({ period, label, data }: StepCallsProps) {
  const agents = period.repActivity.agents;
  const agentSum = agents.reduce((s, a) => s + a.calls, 0);
  const total = period.answeredCalls ?? agentSum;
  const totalTalk = agents.reduce((s, a) => s + a.talkMin, 0);
  const totalCalls = agents.reduce((s, a) => s + a.calls, 0);
  const avgTalkPerCall = totalCalls > 0 ? totalTalk / totalCalls : 0;
  const missed = period.missedCalls;

  // MTD call count — sum agent calls from mtd data
  const mtdConvs = data.mtd?.total ?? 0;
  const ytdConvs = data.ytd?.total ?? 0;

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>{label}</div>
      <Hero value={total} sub="calls answered" />

      {/* Summary strip — 2 rows of 3 */}
      <div className="grid grid-cols-3 gap-2 mb-1.5">
        <Card>
          <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>Total Talk</div>
          <div className="text-lg font-bold font-mono" style={{ color: C.text }}>{fmtTalkTime(totalTalk)}</div>
        </Card>
        <Card>
          <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>Avg / Call</div>
          <div className="text-lg font-bold font-mono" style={{ color: C.text }}>{fmtTalkTime(avgTalkPerCall)}</div>
        </Card>
        <Card>
          <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>Agents</div>
          <div className="text-lg font-bold font-mono" style={{ color: C.text }}>{agents.length}</div>
        </Card>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Card>
          <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.pink }}>Missed</div>
          <div className="text-lg font-bold font-mono" style={{ color: C.pink }}>{missed.total}</div>
        </Card>
        <Card>
          <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>MTD Convs</div>
          <div className="text-lg font-bold font-mono" style={{ color: C.cyan }}>{mtdConvs}</div>
        </Card>
        <Card>
          <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>YTD Convs</div>
          <div className="text-lg font-bold font-mono" style={{ color: C.text }}>{ytdConvs}</div>
        </Card>
      </div>

      {/* Agent Table — merged calls + talk time columns */}
      <Card padding={false} className="mb-3">
        <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider" style={{ color: C.sub }}>Agent Performance</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <TH>#</TH>
                <TH>Agent</TH>
                <TH right>Calls</TH>
                <TH right>Talk Time</TH>
                <TH right>Avg/Call</TH>
                <TH right>Hrs</TH>
                <TH right>Calls/Hr</TH>
                <TH right>Speed</TH>
                <TH right>Wrap</TH>
              </tr>
            </thead>
            <tbody>
              {agents.map((a, i) => {
                const callsPerHr = a.hoursScheduled > 0 ? (a.calls / a.hoursScheduled).toFixed(1) : '—';
                const avgPerCall = a.calls > 0 ? a.talkMin / a.calls : 0;
                return (
                <tr key={a.agent} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                  <TD color={i < 3 ? C.cyan : C.sub}><span className="font-bold">{i < 3 ? ['\u{1F947}','\u{1F948}','\u{1F949}'][i] : i + 1}</span></TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: agentColor(a.agent) }} />
                      <span className="font-semibold capitalize">{a.agent}</span>
                    </div>
                  </TD>
                  <TD mono right>{a.calls}</TD>
                  <TD mono right>{fmtTalkTime(a.talkMin)}</TD>
                  <TD mono right color={C.sub}>{a.calls > 0 ? fmtTalkTime(avgPerCall) : '—'}</TD>
                  <TD mono right color={C.sub}>{a.hoursScheduled > 0 ? a.hoursScheduled : '—'}</TD>
                  <TD mono right color={callsPerHr !== '—' && parseFloat(callsPerHr) >= 3 ? '#4ade80' : C.sub}>{callsPerHr}</TD>
                  <TD mono right>{fmtSpeed(a.speedSec)}</TD>
                  <TD mono right color={C.sub}>{a.wrapUpSec != null ? `${Math.round(a.wrapUpSec)}s` : '—'}</TD>
                </tr>
                );
              })}
              {agents.length === 0 && (
                <tr><td colSpan={9} className="text-center text-sm py-5" style={{ color: C.sub }}>No call data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Missed Calls — what went wrong */}
      {missed.total > 0 && (
        <Card>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.pink }}>
            Missed Calls — {missed.total} total
          </div>
          <div className="text-[12px] mb-3" style={{ color: C.sub }}>What went wrong? Which accounts did we fail?</div>
          {missed.byAccount.filter(a => !isIbrahim(a.account)).slice(0, 8).map((a, i) => (
            <div key={a.account} className="flex justify-between items-center py-1.5" style={{ borderBottom: i < 7 ? `1px solid ${C.border}` : 'none' }}>
              <span className="text-[13px] truncate mr-2" style={{ color: C.text }}>{a.account}</span>
              <span className="font-bold text-[13px] font-mono shrink-0" style={{ color: C.pink }}>{a.count}</span>
            </div>
          ))}
          {missed.byAccount.length === 0 && <p className="text-center text-[13px] py-3" style={{ color: C.sub }}>No breakdown available</p>}
        </Card>
      )}
    </div>
  );
}
