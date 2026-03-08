'use client';

import { agentColor } from '@/lib/constants';

interface Props {
  rank: number;
  agent: string;
  value: number;
  maxValue: number;
  formatValue?: (v: number) => string;
  color?: string;
  suffix?: string;
  badge?: { label: string; color: string };
}

export default function AgentRankingRow({
  rank, agent, value, maxValue, formatValue, color, suffix, badge,
}: Props) {
  const agentClr = color || agentColor(agent);
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 0;
  const display = formatValue ? formatValue(value) : String(value);
  const top3 = rank <= 3;

  return (
    <div className="flex items-center gap-3 py-1.5">
      {/* Rank circle */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{
          background: top3 ? '#0A0E1A' : 'transparent',
          border: top3 ? `2px solid ${agentClr}` : '2px solid rgba(139,146,168,0.3)',
          color: top3 ? agentClr : '#8B92A8',
        }}
      >
        {rank}
      </div>

      {/* Agent name with color dot */}
      <div className="flex items-center gap-1.5 w-20 shrink-0">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: agentClr }} />
        <span className="text-sm font-medium truncate" style={{ color: '#f1f5f9' }}>
          {agent}
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(139,146,168,0.15)' }}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: agentClr }}
        />
      </div>

      {/* Value */}
      <span className="text-sm font-mono w-16 text-right shrink-0" style={{ color: '#f1f5f9' }}>
        {display}{suffix || ''}
      </span>

      {/* Optional badge */}
      {badge && (
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{ background: badge.color + '22', color: badge.color }}
        >
          {badge.label}
        </span>
      )}
    </div>
  );
}
