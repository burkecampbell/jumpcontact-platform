'use client';

import Card from './Card';
import OvrBadge from './OvrBadge';
import { C, capitalize, agentColor, rankBadge } from '@/lib/constants';

export interface CategoryTop3 {
  id: string;
  label: string;
  icon: string;
  topAgents: {
    agent: string;
    value: string;
    ovr: number;
    baselineOvr?: number;
  }[];
}

interface TopAgentsProps {
  categories: CategoryTop3[];
}

export default function TopAgents({ categories }: TopAgentsProps) {
  if (categories.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {categories.map(cat => (
        <Card key={cat.id} className="!p-3">
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="text-sm">{cat.icon}</span>
            <span className="text-[11px] font-semibold truncate" style={{ color: C.text }}>{cat.label}</span>
          </div>
          <div className="space-y-1.5">
            {cat.topAgents.map((a, i) => (
              <div key={a.agent} className="flex items-center gap-1.5">
                <span className="text-xs w-4 text-center shrink-0">{rankBadge(i)}</span>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: agentColor(a.agent) }} />
                <span className="text-[11px] font-medium truncate flex-1" style={{ color: C.text }}>
                  {capitalize(a.agent)}
                </span>
                <OvrBadge ovr={a.ovr} baselineOvr={a.baselineOvr} size="sm" showTrend={false} />
                <span className="text-[10px] font-mono shrink-0" style={{ color: C.sub }}>{a.value}</span>
              </div>
            ))}
            {cat.topAgents.length === 0 && (
              <span className="text-[10px]" style={{ color: C.sub }}>No data yet</span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
