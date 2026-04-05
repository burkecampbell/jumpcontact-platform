'use client';

import { T, Z, G, getMode } from './theme';

export interface StepDef {
  key: string;
  label: string;
  num: string;
}

interface Props {
  steps: StepDef[];
  current: number;
  onSelect: (i: number) => void;
  autoPlay: boolean;
  onToggleAutoPlay: () => void;
}

export function Sidebar({ steps, current, onSelect, autoPlay, onToggleAutoPlay }: Props) {
  const mode = getMode();

  // ── TV mode: minimal dots on left edge ───────────────────────────
  if (mode === 'tv') {
    return (
      <div style={{
        position: 'fixed', left: G(12), top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: G(8), zIndex: 60,
      }}>
        {steps.map((s, i) => (
          <div key={s.key} onClick={() => onSelect(i)} style={{
            width: Z('dot') * 1.5, height: Z('dot') * 1.5, borderRadius: '50%',
            cursor: 'pointer', transition: 'all 0.2s',
            background: i === current ? T.ink : T.border,
            opacity: i === current ? 1 : 0.5,
          }} />
        ))}
      </div>
    );
  }

  // ── Mobile: bottom pill bar ──────────────────────────────────────
  if (mode === 'mobile') {
    return (
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
        background: T.surface, borderTop: `1px solid ${T.border}`,
        padding: `${G(8)}px ${G(12)}px`, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', gap: G(4),
      }}>
        <button onClick={() => current > 0 && onSelect(current - 1)} style={{
          padding: `${G(8)}px`, border: 'none', background: 'transparent',
          color: current === 0 ? T.inkFaint : T.ink, fontSize: Z('button'),
          cursor: current === 0 ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>&larr;</button>
        <div style={{ display: 'flex', gap: G(6), alignItems: 'center' }}>
          {steps.map((s, i) => (
            <div key={s.key} onClick={() => onSelect(i)} style={{
              width: i === current ? G(20) : Z('dot'),
              height: Z('dot'), borderRadius: Z('dot') / 2,
              cursor: 'pointer', transition: 'all 0.2s',
              background: i === current ? T.ink : T.border,
            }} />
          ))}
        </div>
        <button onClick={() => current < steps.length - 1 && onSelect(current + 1)} style={{
          padding: `${G(8)}px`, border: 'none', background: 'transparent',
          color: current === steps.length - 1 ? T.inkFaint : T.ink, fontSize: Z('button'),
          cursor: current === steps.length - 1 ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>&rarr;</button>
      </div>
    );
  }

  // ── Desktop: left sidebar ────────────────────────────────────────
  return (
    <div style={{
      width: 200, flexShrink: 0, borderRight: `1px solid ${T.border}`,
      padding: `${G(16)}px 0`, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', height: '100%',
    }}>
      <div>
        {steps.map((s, i) => {
          const active = i === current;
          return (
            <button key={s.key} onClick={() => onSelect(i)} style={{
              display: 'flex', alignItems: 'center', gap: G(10), width: '100%',
              padding: `${G(10)}px ${G(16)}px`, border: 'none', cursor: 'pointer',
              background: active ? T.subtle : 'transparent',
              borderLeft: active ? `3px solid ${T.ink}` : '3px solid transparent',
              transition: 'all 0.15s',
            }}>
              <span style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: Z('label'),
                fontWeight: 700, color: active ? T.ink : T.inkFaint,
                minWidth: G(20),
              }}>{s.num}</span>
              <span style={{
                fontSize: Z('body') * 0.9, fontWeight: active ? 700 : 500,
                color: active ? T.ink : T.inkMuted,
              }}>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer controls */}
      <div style={{ padding: `${G(12)}px ${G(16)}px`, borderTop: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => current > 0 && onSelect(current - 1)} style={{
            padding: `${G(8)}px ${G(12)}px`, borderRadius: 6,
            border: `1px solid ${T.border}`, background: T.surface,
            color: current === 0 ? T.inkFaint : T.ink,
            fontSize: Z('button') * 0.85, cursor: current === 0 ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}>&larr;</button>
          <button onClick={onToggleAutoPlay} title={autoPlay ? 'Pause (P)' : 'Auto-play (P)'} style={{
            padding: `${G(6)}px ${G(10)}px`, borderRadius: 6,
            fontSize: Z('sub'), fontWeight: 700,
            border: `1px solid ${autoPlay ? T.ink : T.border}`,
            background: autoPlay ? T.ink + '15' : 'transparent',
            color: autoPlay ? T.ink : T.inkFaint, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>{autoPlay ? '\u25AE\u25AE' : '\u25B6'}</button>
          <button onClick={() => current < steps.length - 1 && onSelect(current + 1)} style={{
            padding: `${G(8)}px ${G(12)}px`, borderRadius: 6,
            border: current === steps.length - 1 ? `1px solid ${T.border}` : 'none',
            background: current === steps.length - 1 ? T.surface : T.ink,
            color: current === steps.length - 1 ? T.inkFaint : '#fff',
            fontSize: Z('button') * 0.85,
            cursor: current === steps.length - 1 ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}>&rarr;</button>
        </div>
        <div style={{
          display: 'flex', gap: 2, marginTop: G(10),
        }}>
          {steps.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 1.5, background: i <= current ? T.ink : T.border, transition: 'background 0.2s' }} />
          ))}
        </div>
      </div>
    </div>
  );
}
