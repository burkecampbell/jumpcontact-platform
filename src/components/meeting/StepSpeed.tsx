'use client';

import { C, fmtSpeed, fmtTalkTime, speedGrade, agentColor } from '@/lib/constants';
import type { PeriodData } from '@/lib/types';
import Card from '../Card';
import Hero from './Hero';
import { TH, TD } from './TableCells';

/** Step 3: Speed to Answer — agent speed rankings with grading */
export default function StepSpeed({ period, label }: { period: PeriodData; label: string }) {
  const sorted = [...period.repActivity.agents].sort((a, b) => {
    if (a.speedSec === null && b.speedSec === null) return 0;
    if (a.speedSec === null) return 1;
    if (b.speedSec === null) return -1;
    return a.speedSec - b.speedSec;
  });
  const avgSec = period.repActivity.avgSpeedSec;
  const teamGrade = speedGrade(avgSec);

  // Speed distribution buckets
  const buckets = { fast: 0, good: 0, ok: 0, slow: 0 };
  for (const a of sorted) {
    if (a.speedSec === null) continue;
    if (a.speedSec < 8) buckets.fast++;
    else if (a.speedSec < 12) buckets.good++;
    else if (a.speedSec < 17) buckets.ok++;
    else buckets.slow++;
  }

  return (
    <div>
      <div className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>{label}</div>
      {avgSec !== null ? (
        <Hero value={Math.round(avgSec)} sub="avg seconds to answer" />
      ) : (
        <div className="text-center py-7 pb-5">
          <div className="font-mono font-extralight text-[88px] leading-none" style={{ color: C.sub }}>—</div>
          <div className="mt-2 text-[13px]" style={{ color: C.sub }}>no speed data yet</div>
        </div>
      )}

      {/* Speed distribution strip */}
      {avgSec !== null && (
        <div className="flex justify-center gap-5 mb-4">
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: teamGrade.color }}>{teamGrade.grade}</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>Team Grade</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: '#4ade80' }}>{buckets.fast}</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>&lt;8s</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: '#38bdf8' }}>{buckets.good}</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>8-12s</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: '#fbbf24' }}>{buckets.ok}</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>12-17s</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: '#f87171' }}>{buckets.slow}</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>17s+</div>
          </div>
        </div>
      )}

      {/* Agent Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <TH>#</TH>
                <TH>Agent</TH>
                <TH right>Avg Speed</TH>
                <TH right>Grade</TH>
                <TH right>Calls</TH>
                <TH right>Talk Time</TH>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a, i) => {
                const { grade, color } = speedGrade(a.speedSec);
                return (
                  <tr key={a.agent} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <TD color={i < 3 ? C.cyan : C.sub}><span className="font-bold">{i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span></TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: agentColor(a.agent) }} />
                        <span className="font-semibold capitalize">{a.agent}</span>
                      </div>
                    </TD>
                    <TD mono right>{fmtSpeed(a.speedSec)}</TD>
                    <TD right>
                      <span className="text-xs font-extrabold px-1.5 py-0.5 rounded" style={{ color, background: `${color}18` }}>{grade}</span>
                    </TD>
                    <TD mono right color={C.sub}>{a.calls}</TD>
                    <TD mono right color={C.sub}>{fmtTalkTime(a.talkMin)}</TD>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={6} className="text-center text-sm py-5" style={{ color: C.sub }}>No speed data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
