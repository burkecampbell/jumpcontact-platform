/**
 * Cross-brand comparison insights — shown only in Mixed view.
 * Compares JC vs MSC agent performance from the same dataset.
 */
import Card from './Card';
import { C } from '@/lib/constants';
import { MSC_ONLY_AGENTS, JC_ONLY_AGENTS } from '@/lib/brand';
import type { RepAgent } from '@/lib/types';

interface Props {
  agents: RepAgent[];
}

function avg(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function brand(agent: RepAgent): 'jc' | 'msc' | 'blended' {
  const lower = agent.agent.toLowerCase();
  if (MSC_ONLY_AGENTS.has(lower)) return 'msc';
  if (JC_ONLY_AGENTS.has(lower)) return 'jc';
  return 'blended';
}

export default function MixedInsights({ agents }: Props) {
  const jc = agents.filter(a => brand(a) === 'jc' && a.calls > 0);
  const msc = agents.filter(a => brand(a) === 'msc' && a.calls > 0);

  if (jc.length === 0 || msc.length === 0) return null;

  const jcCalls = jc.reduce((s, a) => s + a.calls, 0);
  const mscCalls = msc.reduce((s, a) => s + a.calls, 0);
  const jcSpeed = avg(jc.filter(a => a.speedSec != null).map(a => a.speedSec!));
  const mscSpeed = avg(msc.filter(a => a.speedSec != null).map(a => a.speedSec!));
  const jcTalk = avg(jc.map(a => a.talkMin));
  const mscTalk = avg(msc.map(a => a.talkMin));

  const insights: string[] = [];

  // Speed comparison
  if (jcSpeed > 0 && mscSpeed > 0) {
    const faster = jcSpeed < mscSpeed ? 'JC' : 'MSC';
    const diff = Math.abs(jcSpeed - mscSpeed).toFixed(1);
    insights.push(`${faster} picks up ${diff}s faster on average`);
  }

  // Volume comparison
  const volRatio = jcCalls > 0 ? (jcCalls / Math.max(mscCalls, 1)).toFixed(1) : '0';
  if (jcCalls > mscCalls * 1.5) {
    insights.push(`JC handles ${volRatio}x more call volume than MSC`);
  } else if (mscCalls > jcCalls * 1.5) {
    insights.push(`MSC handles ${(mscCalls / Math.max(jcCalls, 1)).toFixed(1)}x more call volume than JC`);
  }

  // Talk time comparison
  if (jcTalk > 0 && mscTalk > 0) {
    const longer = jcTalk > mscTalk ? 'JC' : 'MSC';
    const diff = Math.abs(jcTalk - mscTalk).toFixed(1);
    insights.push(`${longer} averages ${diff}min more talk time per agent`);
  }

  if (insights.length === 0) return null;

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.cyan }}>
          Cross-Brand Insights
        </span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {insights.map((text, i) => (
          <span key={i} className="text-sm" style={{ color: C.text }}>
            {text}
          </span>
        ))}
      </div>
      <div className="flex gap-6 mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-center">
          <div className="text-lg font-bold font-mono" style={{ color: C.cyan }}>{jcCalls}</div>
          <div className="text-[10px] uppercase" style={{ color: C.sub }}>JC Calls</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold font-mono" style={{ color: '#5BC5D4' }}>{mscCalls}</div>
          <div className="text-[10px] uppercase" style={{ color: C.sub }}>MSC Calls</div>
        </div>
        {jcSpeed > 0 && (
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: C.cyan }}>{jcSpeed.toFixed(1)}s</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>JC Avg Speed</div>
          </div>
        )}
        {mscSpeed > 0 && (
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: '#5BC5D4' }}>{mscSpeed.toFixed(1)}s</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>MSC Avg Speed</div>
          </div>
        )}
      </div>
    </Card>
  );
}
