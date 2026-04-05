'use client';

import type { DashboardData } from '@/lib/types';
import { T, Z, G, getMode } from './theme';

export function MtdStrip({ data }: { data: DashboardData }) {
  const mode = getMode();
  if (mode === 'tv') return null;

  const mtd = data.mtd;
  const pace = mtd.dayOfMonth > 0 ? Math.round(mtd.total / mtd.dayOfMonth) : 0;
  const pct = mtd.goal > 0 ? Math.min((mtd.total / mtd.goal) * 100, 100) : 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: G(16),
      padding: `${G(10)}px ${G(16)}px`,
      background: T.subtle, borderBottom: `1px solid ${T.border}`,
      fontSize: Z('body'), flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: G(8) }}>
        <span style={{ fontSize: Z('label'), fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5, color: T.inkFaint }}>
          MTD
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          fontSize: Z('body') * 1.1, color: T.ink,
        }}>{mtd.total}</span>
      </div>

      {/* Mini progress bar */}
      <div style={{
        flex: mode === 'mobile' ? '1 1 100%' : '0 1 140px', order: mode === 'mobile' ? 1 : 0,
        height: 4, background: T.border, borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 2,
          background: mtd.onTrack ? T.positive : T.caution,
          transition: 'width 0.5s',
        }} />
      </div>

      <span style={{ color: T.inkMuted, fontSize: Z('body') * 0.9 }}>
        {pace}/day &middot; Day {mtd.dayOfMonth}
      </span>

      <span style={{
        fontWeight: 600, fontSize: Z('pill'),
        color: mtd.onTrack ? T.positive : T.caution,
      }}>
        {mtd.onTrack ? `Proj ${mtd.goalPace}` : `Need ${mtd.requiredDailyRate}/day`}
      </span>
    </div>
  );
}
