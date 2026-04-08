import Card from './Card';
import { C } from '@/lib/constants';

interface KPIProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  delta?: number | null;
  suffix?: string;
  badge?: { label: string; color: string };
  inverse?: boolean; // lower is better (e.g. missed calls)
  subtitle?: string;
}

export default function KPICard({ label, value, icon, delta, suffix, badge, inverse, subtitle }: KPIProps) {
  const isPositive = inverse ? (delta ?? 0) <= 0 : (delta ?? 0) >= 0;
  return (
    <Card className="flex-1 min-w-[160px]">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: C.sub }}>{label}</span>
        <span style={{ color: C.cyan }}>{icon}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold count-up" style={{ color: C.text }}>
          {value}{suffix || ''}
        </span>
        {badge && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded mb-0.5"
                style={{ background: badge.color + '22', color: badge.color }}>
            {badge.label}
          </span>
        )}
      </div>
      {delta !== undefined && delta !== null && (
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs" style={{ color: isPositive ? C.good : C.bad }}>
            {delta >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(delta)} vs yesterday
          </span>
        </div>
      )}
      {subtitle && (
        <div className="mt-1">
          <span className="text-xs" style={{ color: C.sub }}>{subtitle}</span>
        </div>
      )}
    </Card>
  );
}
