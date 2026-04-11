'use client';

import { C } from '@/lib/constants';
import Card from '../Card';
import { Info } from 'lucide-react';

interface StepEmptyStateProps {
  label: string;
  brand?: string;
}

/** Defensive empty-state rendered when a meeting step has no agent data.
 *  Triggers when period.repActivity.agents.length === 0 — typically because
 *  KPI sheet has no rows for the requested brand yet (e.g., MSC view before
 *  the day's KPI sheet is populated, or Mixed view on an outage). */
export default function StepEmptyState({ label, brand }: StepEmptyStateProps) {
  return (
    <div>
      <div
        className="text-center mb-1 text-[13px] font-semibold uppercase tracking-wider"
        style={{ color: C.sub }}
      >
        {label}
      </div>
      <Card className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3 max-w-md text-center">
          <div
            className="flex items-center justify-center rounded-full w-12 h-12"
            style={{ background: `${C.cyan}15`, color: C.cyan }}
          >
            <Info size={24} />
          </div>
          <div className="text-lg font-semibold" style={{ color: C.text }}>
            No data yet
          </div>
          <div className="text-sm leading-relaxed" style={{ color: C.sub }}>
            {brand === 'msc'
              ? 'MSC agent metrics for this period are not yet in the KPI sheet. Check back once today\'s numbers land.'
              : brand === 'mixed'
              ? 'Cross-brand metrics are not yet available for this period.'
              : 'No agent activity recorded for this period yet.'}
          </div>
        </div>
      </Card>
    </div>
  );
}
