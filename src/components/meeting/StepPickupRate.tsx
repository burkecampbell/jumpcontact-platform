'use client';

import { C, capitalize, agentColor } from '@/lib/constants';

const LEADERSHIP = new Set(['rebecca', 'rebecca cramer', 'jose', 'burke']);
import type { DashboardData, PeriodData } from '@/lib/types';
import Card from '../Card';
import Hero from './Hero';
import { TH, TD } from './TableCells';

/** Step 3: Pickup Rate — who's grabbing calls when they ring */
export default function StepPickupRate({ period, label }: { period: PeriodData; label: string; data?: DashboardData }) {
  const agents = period.repActivity.agents;

  // Team totals from TaskRouter
  const totalCreated = agents.reduce((s, a) => s + (a.reservationsCreated ?? 0), 0);
  const totalAccepted = agents.reduce((s, a) => s + (a.reservationsAccepted ?? 0), 0);
  const totalRejected = agents.reduce((s, a) => s + (a.reservationsRejected ?? 0), 0);
  const totalTimedOut = agents.reduce((s, a) => s + (a.reservationsTimedOut ?? 0), 0);
  const teamRate = totalCreated > 0 ? Math.round((totalAccepted / totalCreated) * 1000) / 10 : null;
  const hasData = totalCreated > 0;

  const rateColor = (r: number | undefined) =>
    r == null ? C.sub : r >= 80 ? '#4ade80' : r >= 60 ? '#fbbf24' : '#f87171';

  // Sort by pickup rate descending (agents with data first)
  const sorted = [...agents]
    .filter(a => (a.reservationsCreated ?? 0) > 0)
    .sort((a, b) => (b.pickupRate ?? 0) - (a.pickupRate ?? 0));

  // Best and worst performers
  const best = sorted.length > 0 ? sorted[0] : null;
  const worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>{label}</div>

      {hasData ? (
        <Hero value={teamRate!} sub="% team pickup rate" />
      ) : (
        <div className="text-center py-7 pb-5">
          <div className="font-mono font-extralight text-[88px] leading-none" style={{ color: C.sub }}>—</div>
          <div className="mt-2 text-[13px]" style={{ color: C.sub }}>no pickup data available</div>
        </div>
      )}

      {/* Summary cards */}
      {hasData && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          <Card>
            <div className="text-center">
              <div className="text-lg font-bold font-mono" style={{ color: C.text }}>{totalCreated}</div>
              <div className="text-[9px] uppercase" style={{ color: C.sub }}>Offered</div>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <div className="text-lg font-bold font-mono" style={{ color: '#4ade80' }}>{totalAccepted}</div>
              <div className="text-[9px] uppercase" style={{ color: C.sub }}>Caught</div>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <div className="text-lg font-bold font-mono" style={{ color: '#fbbf24' }}>{totalRejected}</div>
              <div className="text-[9px] uppercase" style={{ color: C.sub }}>Declined</div>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <div className="text-lg font-bold font-mono" style={{ color: '#f87171' }}>{totalTimedOut}</div>
              <div className="text-[9px] uppercase" style={{ color: C.sub }}>Ghost</div>
            </div>
          </Card>
        </div>
      )}

      {/* Callouts */}
      {best && (
        <div className="mb-1.5 px-4 py-2.5 rounded-xl" style={{ background: '#4ade8010', borderLeft: '3px solid #4ade80' }}>
          <span style={{ color: '#4ade80' }}>🏆</span>
          <span className="ml-2 text-sm" style={{ color: C.text }}>
            <strong>{capitalize(best.agent)}</strong> leads with{' '}
            <strong style={{ color: '#4ade80' }}>{best.pickupRate}%</strong> pickup rate
            ({best.reservationsAccepted}/{best.reservationsCreated} calls caught)
          </span>
        </div>
      )}
      {worst && worst.agent !== best?.agent && (worst.pickupRate ?? 100) < 50 && !LEADERSHIP.has(worst.agent.toLowerCase()) && (
        <div className="mb-1.5 px-4 py-2.5 rounded-xl" style={{ background: '#fbbf2410', borderLeft: '3px solid #fbbf24' }}>
          <span style={{ color: '#fbbf24' }}>⚠️</span>
          <span className="ml-2 text-sm" style={{ color: C.text }}>
            <strong>{capitalize(worst.agent)}</strong> at{' '}
            <strong style={{ color: '#fbbf24' }}>{worst.pickupRate}%</strong> — needs improvement
          </span>
        </div>
      )}

      {/* Agent Table */}
      {hasData && (
        <Card padding={false} className="mt-3">
          <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider" style={{ color: C.sub }}>
            Agent Pickup Breakdown
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <TH>#</TH>
                  <TH>Agent</TH>
                  <TH right>Pickup %</TH>
                  <TH right>Caught</TH>
                  <TH right>Offered</TH>
                  <TH right>Declined</TH>
                  <TH right>Ghost</TH>
                </tr>
              </thead>
              <tbody>
                {sorted.map((a, i) => (
                  <tr key={a.agent} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <TD color={i < 3 ? C.cyan : C.sub}>
                      <span className="font-bold">{i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: agentColor(a.agent) }} />
                        <span className="font-semibold">{capitalize(a.agent)}</span>
                      </div>
                    </TD>
                    <TD mono right color={rateColor(a.pickupRate)}>
                      <span className="font-bold">{a.pickupRate != null ? `${a.pickupRate}%` : '—'}</span>
                    </TD>
                    <TD mono right>{a.reservationsAccepted ?? '—'}</TD>
                    <TD mono right color={C.sub}>{a.reservationsCreated ?? '—'}</TD>
                    <TD mono right color={a.declineRate && a.declineRate > 0 ? '#fbbf24' : C.sub}>
                      {a.reservationsRejected ?? 0}
                    </TD>
                    <TD mono right color={a.ghostRate && a.ghostRate > 0 ? '#f87171' : C.sub}>
                      {a.reservationsTimedOut ?? 0}
                    </TD>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-sm py-5" style={{ color: C.sub }}>No pickup data available for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
