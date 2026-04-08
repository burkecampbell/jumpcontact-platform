'use client';

import { ratingTier, ratingDelta } from '@/lib/ratings';

interface OvrBadgeProps {
  ovr: number;
  baselineOvr?: number;
  size?: 'sm' | 'md' | 'lg';
  showTrend?: boolean;
}

export default function OvrBadge({ ovr, baselineOvr, size = 'md', showTrend = true }: OvrBadgeProps) {
  if (ovr <= 0) return <span className="text-xs font-mono" style={{ color: '#4b5563' }}>—</span>;

  const tier = ratingTier(ovr);
  const trend = baselineOvr != null && baselineOvr > 0 ? ratingDelta(ovr, baselineOvr) : null;

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5 min-w-[28px]',
    md: 'text-xs px-2 py-0.5 min-w-[32px]',
    lg: 'text-sm px-2.5 py-1 min-w-[38px]',
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      <span
        className={`${sizeClasses[size]} rounded font-mono font-bold text-center inline-block`}
        style={{
          background: tier.bg,
          color: tier.color,
          border: `1px solid ${tier.color}33`,
        }}
      >
        {ovr}
      </span>
      {showTrend && trend && trend.direction !== 'same' && (
        <span
          className="text-[9px] font-bold"
          style={{ color: trend.direction === 'up' ? '#4ade80' : '#f87171' }}
        >
          {trend.direction === 'up' ? '▲' : '▼'}
        </span>
      )}
    </span>
  );
}
