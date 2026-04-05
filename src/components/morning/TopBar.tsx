'use client';

import { useState, useMemo } from 'react';
import type { DashboardData } from '@/lib/types';
import type { Insight } from './insights';
import { generateInsights } from './insights';
import { buildSlackRecap } from './slack-recap';
import { InsightsBanner } from './InsightsBanner';
import { T, Z, G, getMode, type LayoutMode } from './theme';

function dayName(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
}

interface Props {
  data: DashboardData;
  mode: LayoutMode;
}

export function TopBar({ data, mode }: Props) {
  const [copied, setCopied] = useState(false);
  const insights = useMemo(() => generateInsights(data), [data]);

  if (mode === 'tv') return null;

  const todayFull = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Edmonton' });
  const todayDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Edmonton' });
  const pulledAt = data.pulledAt
    ? new Date(data.pulledAt).toLocaleTimeString('en-US', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit', hour12: true })
    : '';

  const copySlack = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    navigator.clipboard.writeText(buildSlackRecap(data, baseUrl));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const compact = mode === 'mobile';

  return (
    <div style={{
      borderBottom: `1px solid ${T.border}`, background: T.surface,
      padding: compact ? `${G(12)}px ${G(16)}px` : `${G(14)}px ${G(24)}px`,
    }}>
      {/* Row 1: brand + date + controls */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: G(12), flexWrap: compact ? 'wrap' : 'nowrap',
      }}>
        {/* Left: title */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: Z('sub'), fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: 3, color: T.inkFaint,
          }}>Jump Contact</div>
          <h1 style={{
            fontSize: compact ? Z('stepTitle') : Z('heading'), fontWeight: 800,
            margin: `${G(2)}px 0 0`, letterSpacing: -0.8, color: T.ink, lineHeight: 1.15,
          }}>{todayFull} Morning</h1>
        </div>

        {/* Center: insight (desktop only) */}
        {!compact && insights.length > 0 && (
          <div style={{ flex: '1 1 0', minWidth: 0, maxWidth: 400 }}>
            <InsightsBanner insights={insights} />
          </div>
        )}

        {/* Right: meta + actions */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: G(10), flexShrink: 0,
        }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: Z('date'), color: T.inkMuted }}>{todayDate}</div>
            <div style={{ fontSize: Z('date') * 0.9, color: T.inkFaint }}>
              Reviewing {dayName(data.yesterdayDate || '')}
            </div>
            {pulledAt && <div style={{ fontSize: Z('sub'), color: T.inkFaint }}>Pulled {pulledAt}</div>}
          </div>

          {/* Copy Slack button */}
          <button onClick={copySlack} style={{
            padding: `${G(8)}px ${G(14)}px`, borderRadius: 8,
            border: `1px solid ${copied ? T.positive : T.border}`,
            background: copied ? T.positive + '10' : T.surface,
            color: copied ? T.positive : T.ink,
            fontSize: Z('button') * 0.85, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            whiteSpace: 'nowrap', transition: 'all 0.2s',
          }}>
            {copied ? '\u2713 Copied' : 'Copy Recap'}
          </button>

          {/* Mode switcher */}
          <div style={{ display: 'flex', gap: G(2) }}>
            {(['mobile', 'auto', 'tv'] as LayoutMode[]).map(m => (
              <a key={m} href={`/morning${m === 'auto' ? '' : `?mode=${m}`}`} style={{
                padding: `${G(4)}px ${G(10)}px`, borderRadius: 6,
                fontSize: Z('sub'), fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: 1, textDecoration: 'none',
                background: mode === m ? T.ink : 'transparent',
                color: mode === m ? '#fff' : T.inkFaint,
                border: `1px solid ${mode === m ? T.ink : T.border}`,
              }}>
                {m === 'tv' ? '16:9' : m === 'mobile' ? 'M' : 'D'}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: insights on mobile */}
      {compact && insights.length > 0 && (
        <div style={{ marginTop: G(10) }}>
          <InsightsBanner insights={insights} />
        </div>
      )}
    </div>
  );
}
