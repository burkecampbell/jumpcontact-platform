'use client';

import { C, agentColor, isIbrahim } from '@/lib/constants';
import type { PeriodData } from '@/lib/types';
import Card from '../Card';
import Hero from './Hero';
import { TH, TD } from './TableCells';
import { generateCallouts } from './callouts';

/** Step 4: Conversions — agent breakdown, accounts, missed calls, hourly chart */
export default function StepConversions({ period, label }: { period: PeriodData; label: string }) {
  const convAgents = period.conversions.byAgent;
  const convAccounts = period.conversions.byAccount;
  const missed = period.missedCalls;
  const jcMissed = missed.total;
  const repAgents = period.repActivity.agents;
  const callouts = generateCallouts(period);
  const convRate = period.conversionRate;

  // Peak hour
  const hourly = period.conversions.hourly;
  let peakHour = -1;
  let peakCount = 0;
  if (hourly) {
    hourly.forEach((v, h) => { if (v > peakCount) { peakCount = v; peakHour = h; } });
  }
  const fmtHour = (h: number) => {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  };

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>{label}</div>
      <Hero value={period.conversions.total} sub="conversions" />

      {/* Summary strip */}
      <div className="flex justify-center gap-6 mb-4">
        <div className="text-center">
          <div className="text-lg font-bold font-mono" style={{ color: C.text }}>{convRate != null ? `${convRate}%` : '—'}</div>
          <div className="text-[10px] uppercase" style={{ color: C.sub }}>Conv Rate</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold font-mono" style={{ color: C.pink }}>{jcMissed}</div>
          <div className="text-[10px] uppercase" style={{ color: C.sub }}>Missed (JC)</div>
        </div>
        {peakHour >= 0 && peakCount > 0 && (
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: C.cyan }}>{fmtHour(peakHour)}</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>Peak ({peakCount})</div>
          </div>
        )}
      </div>

      {/* Callouts */}
      {callouts.length > 0 && (
        <div className="mb-4 space-y-2">
          {callouts.map((c, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(62,165,195,0.08)' }}>
              <span>{c.emoji}</span>
              <span style={{ color: C.text }}>{c.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Agent Table with Conv Rate */}
      <Card padding={false} className="mb-3">
        <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider" style={{ color: C.sub }}>Agent Breakdown</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <TH>#</TH>
                <TH>Agent</TH>
                <TH right>Conv</TH>
                <TH right>Calls</TH>
                <TH right>Rate</TH>
                <TH right>Conv/Hr</TH>
              </tr>
            </thead>
            <tbody>
              {convAgents.map((a, i) => {
                const rep = repAgents.find(r => r.agent.toLowerCase() === a.agent.toLowerCase());
                const calls = rep?.calls ?? 0;
                const rate = calls > 0 ? ((a.count / calls) * 100).toFixed(1) : '—';
                const convPerHr = rep?.convsPerHour != null ? rep.convsPerHour.toFixed(1) : (rep?.hoursScheduled && rep.hoursScheduled > 0 ? (a.count / rep.hoursScheduled).toFixed(1) : '—');
                return (
                  <tr key={a.agent} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <TD color={i < 3 ? C.cyan : C.sub}><span className="font-bold">{i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span></TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: agentColor(a.agent) }} />
                        <span className="font-semibold capitalize">{a.agent}</span>
                      </div>
                    </TD>
                    <TD mono right>{a.count}</TD>
                    <TD mono right color={C.sub}>{calls}</TD>
                    <TD mono right color={rate !== '—' && parseFloat(rate as string) >= 10 ? '#4ade80' : C.sub}>
                      {rate !== '—' ? `${rate}%` : '—'}
                    </TD>
                    <TD mono right color={convPerHr !== '—' && parseFloat(convPerHr) >= 1 ? C.lime : C.sub}>
                      {convPerHr}
                    </TD>
                  </tr>
                );
              })}
              {convAgents.length === 0 && (
                <tr><td colSpan={6} className="text-center text-sm py-5" style={{ color: C.sub }}>No conversions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Accounts + Missed side by side */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.sub }}>Top Accounts</div>
          {convAccounts.slice(0, 8).map((a, i) => (
            <div key={a.account} className="flex justify-between items-center py-1.5" style={{ borderBottom: i < Math.min(convAccounts.length, 8) - 1 ? `1px solid ${C.border}` : 'none' }}>
              <span className="text-[13px] truncate mr-2" style={{ color: C.text }}>{a.account}</span>
              <span className="font-bold text-[13px] shrink-0" style={{ color: C.cyan }}>{a.count}</span>
            </div>
          ))}
          {convAccounts.length === 0 && <p className="text-center text-[13px] py-3" style={{ color: C.sub }}>No data</p>}
        </Card>

        <Card>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.sub }}>
            Missed Calls <span style={{ color: C.pink }}>{jcMissed}</span>
          </div>
          {missed.byAccount.filter(a => !isIbrahim(a.account)).slice(0, 8).map((a, i) => (
            <div key={a.account} className="flex justify-between items-center py-1.5" style={{ borderBottom: i < 7 ? `1px solid ${C.border}` : 'none' }}>
              <span className="text-[13px] truncate mr-2" style={{ color: C.text }}>{a.account}</span>
              <span className="font-bold text-[13px] shrink-0" style={{ color: C.pink }}>{a.count}</span>
            </div>
          ))}
          {/* Ibrahim Law separate count removed — unified contract uses total */}
          {missed.byAccount.length === 0 && <p className="text-center text-[13px] py-3" style={{ color: C.sub }}>None — great job!</p>}
        </Card>
      </div>

      {/* Hourly Distribution */}
      {hourly && (
        <Card className="mt-3">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.sub }}>Hourly Distribution</div>
          <div className="flex items-end gap-[2px] h-20">
            {hourly.slice(6, 22).map((v, i) => {
              const maxH = Math.max(...(hourly.slice(6, 22) || [1]), 1);
              const h = v > 0 ? Math.max((v / maxH) * 100, 8) : 0;
              const hour = i + 6;
              const isPeak = hour === peakHour;
              return (
                <div key={i} className="flex-1 flex flex-col items-center relative group">
                  {v > 0 && (
                    <span className="text-[9px] font-mono mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: C.text }}>{v}</span>
                  )}
                  <div className="w-full rounded-sm transition-all duration-500" style={{ height: `${h}%`, background: isPeak ? C.lime : v > 0 ? C.cyan : C.border, minHeight: v > 0 ? '4px' : '0' }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px]" style={{ color: C.sub }}>6a</span>
            <span className="text-[10px]" style={{ color: C.sub }}>12p</span>
            <span className="text-[10px]" style={{ color: C.sub }}>6p</span>
            <span className="text-[10px]" style={{ color: C.sub }}>10p</span>
          </div>
        </Card>
      )}
    </div>
  );
}
