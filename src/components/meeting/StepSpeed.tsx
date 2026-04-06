'use client';

import { C, fmtSpeed, fmtTalkTime, speedGrade, agentColor, isJCAgent } from '@/lib/constants';
import type { DashboardData, PeriodData } from '@/lib/types';
import Card from '../Card';
import Hero from './Hero';
import { TH, TD } from './TableCells';

/** Step 2: Speed + Pickup Rate — how fast we answer and how many we catch */
export default function StepSpeed({ period, label, data }: { period: PeriodData; label: string; data?: DashboardData }) {
  // Build Ytica MTD speed lookup for fallback
  const yticaMtd: Record<string, number> = {};
  for (const y of data?.mtdRepActivity ?? []) {
    if (y.avgSpeedSec != null && y.avgSpeedSec > 0) {
      yticaMtd[y.agent.toLowerCase()] = y.avgSpeedSec;
    }
  }

  // For each agent, pick best speed: Ytica when CDR looks inflated (>10s)
  const agents = period.repActivity.agents
    .filter(a => isJCAgent(a.agent))
    .map(a => {
      const cdrSpeed = a.speedSec;
      const yticaSpeed = yticaMtd[a.agent.toLowerCase()];
      let bestSpeed: number | null = cdrSpeed;
      if (cdrSpeed != null && cdrSpeed > 10 && yticaSpeed != null) {
        bestSpeed = yticaSpeed;
      } else if (cdrSpeed == null && yticaSpeed != null) {
        bestSpeed = yticaSpeed;
      }
      return { ...a, displaySpeed: bestSpeed };
    });

  const sorted = [...agents].sort((a, b) => {
    if (a.displaySpeed === null && b.displaySpeed === null) return 0;
    if (a.displaySpeed === null) return 1;
    if (b.displaySpeed === null) return -1;
    return a.displaySpeed - b.displaySpeed;
  });

  const withSpeed = sorted.filter(a => a.displaySpeed != null && a.displaySpeed > 0);
  const avgSec = withSpeed.length > 0
    ? withSpeed.reduce((s, a) => s + a.displaySpeed!, 0) / withSpeed.length
    : period.repActivity.avgSpeedSec;
  const teamGrade = speedGrade(avgSec);

  // Speed distribution buckets
  const buckets = { fast: 0, good: 0, ok: 0, slow: 0 };
  for (const a of sorted) {
    if (a.displaySpeed === null) continue;
    if (a.displaySpeed < 8) buckets.fast++;
    else if (a.displaySpeed < 12) buckets.good++;
    else if (a.displaySpeed < 17) buckets.ok++;
    else buckets.slow++;
  }

  // Team-level pickup rate from TaskRouter reservations
  const totalResCreated = sorted.reduce((s, a) => s + (a.reservationsCreated ?? 0), 0);
  const totalResAccepted = sorted.reduce((s, a) => s + (a.reservationsAccepted ?? 0), 0);
  const teamPickupRate = totalResCreated > 0 ? Math.round((totalResAccepted / totalResCreated) * 1000) / 10 : null;
  const pickupColor = teamPickupRate != null
    ? teamPickupRate >= 80 ? '#4ade80' : teamPickupRate >= 60 ? '#fbbf24' : '#f87171'
    : C.sub;

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>{label}</div>
      {avgSec !== null ? (
        <Hero value={Math.round(avgSec * 10) / 10} sub="avg seconds to answer" />
      ) : (
        <div className="text-center py-7 pb-5">
          <div className="font-mono font-extralight text-[88px] leading-none" style={{ color: C.sub }}>—</div>
          <div className="mt-2 text-[13px]" style={{ color: C.sub }}>no speed data yet</div>
        </div>
      )}

      {/* Speed + Pickup summary strip */}
      <div className="grid grid-cols-3 gap-2 mb-1.5">
        <Card>
          <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>Team Grade</div>
          <div className="text-lg font-bold" style={{ color: teamGrade.color }}>{teamGrade.grade}</div>
        </Card>
        <Card>
          <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>Pickup Rate</div>
          <div className="text-lg font-bold font-mono" style={{ color: pickupColor }}>
            {teamPickupRate != null ? `${teamPickupRate}%` : '—'}
          </div>
        </Card>
        <Card>
          <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: C.sub }}>Fastest</div>
          <div className="text-lg font-bold font-mono" style={{ color: '#4ade80' }}>
            {sorted.length > 0 && sorted[0].displaySpeed != null ? fmtSpeed(sorted[0].displaySpeed) : '—'}
          </div>
        </Card>
      </div>

      {/* Speed distribution buckets */}
      {avgSec !== null && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: '<8s (Fast)', count: buckets.fast, color: '#4ade80' },
            { label: '8-12s (Good)', count: buckets.good, color: '#38bdf8' },
            { label: '12-17s (OK)', count: buckets.ok, color: '#fbbf24' },
            { label: '17s+ (Slow)', count: buckets.slow, color: '#f87171' },
          ].map(b => (
            <Card key={b.label}>
              <div className="text-center">
                <div className="text-lg font-bold font-mono" style={{ color: b.color }}>{b.count}</div>
                <div className="text-[9px] uppercase" style={{ color: C.sub }}>{b.label}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pickup Rate explainer */}
      {teamPickupRate != null && (
        <div className="mb-3 px-3 py-2 rounded-lg text-[12px]" style={{ background: 'rgba(62,165,195,0.08)', color: C.sub }}>
          <strong style={{ color: C.text }}>Pickup Rate</strong> = calls accepted / calls offered via TaskRouter.
          Team caught <strong style={{ color: pickupColor }}>{totalResAccepted}</strong> of <strong style={{ color: C.text }}>{totalResCreated}</strong> offered calls.
        </div>
      )}

      {/* Agent Table — expanded with pickup rate */}
      <Card padding={false}>
        <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider" style={{ color: C.sub }}>Agent Speed & Pickup</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <TH>#</TH>
                <TH>Agent</TH>
                <TH right>Speed</TH>
                <TH right>Grade</TH>
                <TH right>Pickup %</TH>
                <TH right>Caught</TH>
                <TH right>Offered</TH>
                <TH right>Calls</TH>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a, i) => {
                const { grade, color } = speedGrade(a.displaySpeed);
                const pickup = a.pickupRate;
                const pColor = pickup != null
                  ? pickup >= 80 ? '#4ade80' : pickup >= 60 ? '#fbbf24' : '#f87171'
                  : C.sub;
                return (
                  <tr key={a.agent} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <TD color={i < 3 ? C.cyan : C.sub}><span className="font-bold">{i < 3 ? ['\u{1F947}','\u{1F948}','\u{1F949}'][i] : i + 1}</span></TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: agentColor(a.agent) }} />
                        <span className="font-semibold capitalize">{a.agent}</span>
                      </div>
                    </TD>
                    <TD mono right>{fmtSpeed(a.displaySpeed)}</TD>
                    <TD right>
                      <span className="text-xs font-extrabold px-1.5 py-0.5 rounded" style={{ color, background: `${color}18` }}>{grade}</span>
                    </TD>
                    <TD mono right color={pColor}>
                      {pickup != null ? `${pickup}%` : '—'}
                    </TD>
                    <TD mono right color={C.sub}>{a.reservationsAccepted ?? '—'}</TD>
                    <TD mono right color={C.sub}>{a.reservationsCreated ?? '—'}</TD>
                    <TD mono right color={C.sub}>{a.calls}</TD>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={8} className="text-center text-sm py-5" style={{ color: C.sub }}>No speed data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
