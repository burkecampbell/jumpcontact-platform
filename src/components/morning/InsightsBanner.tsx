'use client';

import { useState, useEffect } from 'react';
import type { Insight } from './insights';
import { T, Z, G, getMode } from './theme';

const TONE_COLORS: Record<Insight['tone'], string> = {
  positive: T.positive,
  caution: T.caution,
  neutral: T.inkMuted,
};

export function InsightsBanner({ insights }: { insights: Insight[] }) {
  const [idx, setIdx] = useState(0);
  const mode = getMode();

  useEffect(() => {
    if (insights.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % insights.length), 5000);
    return () => clearInterval(t);
  }, [insights.length]);

  if (insights.length === 0 || mode === 'tv') return null;

  const insight = insights[idx % insights.length];
  const color = TONE_COLORS[insight.tone];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: G(8),
      padding: `${G(6)}px ${G(12)}px`, borderRadius: 8,
      background: color + '08', border: `1px solid ${color}18`,
      fontSize: Z('body') * 0.9, color,
      transition: 'opacity 0.3s',
      minWidth: 0, overflow: 'hidden',
    }}>
      <span style={{ flexShrink: 0 }}>{insight.icon}</span>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
        {insight.text}
      </span>
      {insights.length > 1 && (
        <span style={{ flexShrink: 0, fontSize: Z('label'), color: T.inkFaint, marginLeft: 'auto' }}>
          {idx + 1}/{insights.length}
        </span>
      )}
    </div>
  );
}
