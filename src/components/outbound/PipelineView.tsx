'use client';

import Card from '@/components/Card';
import { C, agentColor, capitalize } from '@/lib/constants';
import type { Pipeline, HubSpotDeal } from '@/lib/outbound-types';

export default function PipelineView({
  pipelines,
  deals,
}: {
  pipelines: Pipeline[];
  deals: HubSpotDeal[];
}) {
  // Skip the default "Sales Pipeline" — show the custom ones Jose set up
  const customPipelines = pipelines.filter(p => p.id !== 'default');
  const hasDealData = deals.length > 0;

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3" style={{ color: C.text }}>Pipeline</h3>

      {customPipelines.map(pipeline => {
        const pipelineDeals = deals.filter(d => d.pipelineId === pipeline.id);
        const openStages = pipeline.stages.filter(s => !s.isClosed);

        return (
          <div key={pipeline.id} className="mb-4 last:mb-0">
            <div className="text-[11px] font-semibold mb-2" style={{ color: C.cyan }}>
              {pipeline.label}
            </div>

            {/* Stage badges */}
            <div className="flex flex-wrap gap-1 mb-2">
              {openStages.map(stage => {
                const count = pipelineDeals.filter(d => d.stage === stage.id).length;
                return (
                  <div
                    key={stage.id}
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      background: count > 0 ? C.cyanSoft : C.border,
                      color: count > 0 ? C.cyan : C.sub,
                    }}
                  >
                    {stage.label.replace(/\s*â€"\s*/g, ' — ')} {count > 0 && `(${count})`}
                  </div>
                );
              })}
            </div>

            {/* Deals list */}
            {pipelineDeals.length > 0 && (
              <div className="space-y-1">
                {pipelineDeals.map(deal => (
                  <div
                    key={deal.id}
                    className="flex items-center gap-2 text-[11px] px-2 py-1 rounded"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: agentColor(deal.ownerKey) }}
                    />
                    <span className="truncate" style={{ color: C.text }}>{deal.name}</span>
                    {deal.amount && (
                      <span className="font-mono ml-auto shrink-0" style={{ color: C.lime }}>
                        ${deal.amount.toLocaleString()}
                      </span>
                    )}
                    <span className="shrink-0" style={{ color: C.sub }}>{deal.stageLabel}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {!hasDealData && (
        <p className="text-[11px] mt-1" style={{ color: C.sub }}>
          No deals yet. {customPipelines.length} pipelines ready.
        </p>
      )}
    </Card>
  );
}
