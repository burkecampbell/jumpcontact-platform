'use client';

import Card from '@/components/Card';
import { C, agentColor, capitalize } from '@/lib/constants';
import type { OutboundAgentStats } from '@/lib/outbound-types';

function fmtDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AgentStatCard({ agent }: { agent: OutboundAgentStats }) {
  const color = agentColor(agent.key);
  const barPct = Math.min(agent.totalCalls, 100); // cap bar at 100

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-sm font-semibold" style={{ color: C.text }}>
          {capitalize(agent.name)}
        </span>
      </div>

      {/* Calls bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[11px] mb-1">
          <span style={{ color: C.sub }}>Calls today</span>
          <span className="font-mono font-bold" style={{ color: C.text }}>{agent.totalCalls}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.border }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${barPct}%`, background: color }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <div className="flex justify-between">
          <span style={{ color: C.sub }}>Connected</span>
          <span className="font-mono" style={{ color: C.good }}>{agent.connected}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: C.sub }}>No Answer</span>
          <span className="font-mono" style={{ color: C.warn }}>{agent.noAnswer}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: C.sub }}>Connect %</span>
          <span className="font-mono" style={{ color: C.text }}>{agent.connectRate}%</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: C.sub }}>Duration</span>
          <span className="font-mono" style={{ color: C.text }}>{fmtDuration(agent.totalDurationMs)}</span>
        </div>
        {agent.deals > 0 && (
          <div className="flex justify-between col-span-2">
            <span style={{ color: C.sub }}>Deals</span>
            <span className="font-mono" style={{ color: C.cyan }}>{agent.deals}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
