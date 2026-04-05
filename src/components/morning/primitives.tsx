'use client';

import { capitalize, agentColor, speedGrade } from '@/lib/constants';
import { useTextWidth } from '@/hooks/usePretext';
import { useSpringValue } from '@/hooks/useSpringValue';
import { T, Z, G } from './theme';

// ── Num — hero/large numeric display ───────────────────────────────
// Uses Pretext to measure exact text width, then spring-animates the
// container so value changes (e.g. 99→100) transition smoothly.
export function Num({ children, el = 'hero' }: { children: React.ReactNode; el?: string }) {
  const text = String(children ?? '');
  const fontSize = Z(el);
  const font = `200 ${fontSize}px 'JetBrains Mono', Consolas, monospace`;
  const measuredWidth = useTextWidth(text, font);
  const springWidth = useSpringValue(measuredWidth || 0, 200, 24);
  const hasWidth = measuredWidth > 0;

  return (
    <span style={{
      display: 'inline-block',
      width: hasWidth ? Math.ceil(springWidth) + 2 : 'auto',
      fontSize, fontWeight: 200, color: T.ink, lineHeight: 1,
      fontFamily: "'JetBrains Mono','Consolas',monospace",
      fontVariantNumeric: 'tabular-nums', letterSpacing: -1,
      transition: hasWidth ? undefined : 'width 0.2s',
      overflow: 'hidden',
    }}>
      {children}
    </span>
  );
}

// ── Label — uppercase small label ──────────────────────────────────
export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: Z('label'), fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: 2, color: T.inkFaint,
    }}>
      {children}
    </div>
  );
}

// ── Pill — inline badge with tinted bg ─────────────────────────────
export function Pill({ children, color = T.inkMuted }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: Z('pill'), fontWeight: 600, color,
      background: color + '0d', border: `1px solid ${color}22`,
      padding: `${G(4)}px ${G(10)}px`, borderRadius: 20,
    }}>
      {children}
    </span>
  );
}

// ── AgentBar — ranked horizontal bar with name + value ─────────────
export function AgentBar({ rank, name, value, max, suffix = '' }: {
  rank: number; name: string; value: number | string; max: number; suffix?: string;
}) {
  const numVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
  const pct = max > 0 ? Math.max((numVal / max) * 100, 3) : 3;
  const top3 = rank < 3;
  const b = Z('badge');
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `${b}px ${G(90)}px 1fr auto`,
      alignItems: 'center', gap: G(12), padding: `${G(12)}px 0`,
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{
        width: b, height: b, borderRadius: b / 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Z('body') * 0.85, fontWeight: 700,
        background: top3 ? T.ink : 'transparent', color: top3 ? '#fff' : T.inkFaint,
        border: top3 ? 'none' : `1px solid ${T.border}`,
      }}>{rank + 1}</div>
      <div style={{ fontWeight: 600, fontSize: Z('agentName'), color: T.ink }}>
        {capitalize(name)}
      </div>
      <div style={{ position: 'relative', height: Z('bar'), background: T.subtle, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: agentColor(name), opacity: 0.8 }} />
      </div>
      <div style={{ textAlign: 'right', minWidth: G(60) }}>
        <span style={{
          fontFamily: "'JetBrains Mono','Consolas',monospace",
          fontSize: Z('agentValue'), fontWeight: 600, color: T.ink,
        }}>{value}</span>
        {suffix && <span style={{ fontSize: Z('label'), color: T.inkFaint, marginLeft: 2 }}>{suffix}</span>}
      </div>
    </div>
  );
}
