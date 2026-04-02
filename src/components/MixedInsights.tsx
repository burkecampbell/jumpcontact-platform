/**
 * Cross-brand comparison insights — shown only in Mixed view.
 * Accounts for EVERY call: JC + MSC + Blended + Internal = Total.
 */
import Card from './Card';
import { C } from '@/lib/constants';
import { MSC_ONLY_AGENTS, JC_ONLY_AGENTS, BLENDED_AGENTS } from '@/lib/brand';
import type { RepAgent } from '@/lib/types';

interface Props {
  agents: RepAgent[];
  totalAnswered?: number; // from period.answeredCalls
}

function avg(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function agentBrand(a: RepAgent): 'jc' | 'msc' | 'blended' {
  const lower = a.agent.toLowerCase();
  if (MSC_ONLY_AGENTS.has(lower)) return 'msc';
  if (JC_ONLY_AGENTS.has(lower)) return 'jc';
  if (BLENDED_AGENTS.has(lower)) return 'blended';
  return 'jc'; // Unknown agents default to JC
}

export default function MixedInsights({ agents, totalAnswered }: Props) {
  const jc = agents.filter(a => agentBrand(a) === 'jc' && a.calls > 0);
  const msc = agents.filter(a => agentBrand(a) === 'msc' && a.calls > 0);
  const blended = agents.filter(a => agentBrand(a) === 'blended' && a.calls > 0);

  if (jc.length === 0 && msc.length === 0) return null;

  const jcCalls = jc.reduce((s, a) => s + a.calls, 0);
  const mscCalls = msc.reduce((s, a) => s + a.calls, 0);
  const blendedCalls = blended.reduce((s, a) => s + a.calls, 0);
  const attributedTotal = jcCalls + mscCalls + blendedCalls;
  const agentTotal = agents.reduce((s, a) => s + a.calls, 0);
  const unattributed = agentTotal - attributedTotal;

  const jcSpeed = avg(jc.filter(a => a.speedSec != null).map(a => a.speedSec!));
  const mscSpeed = avg(msc.filter(a => a.speedSec != null).map(a => a.speedSec!));
  const jcTalk = avg(jc.map(a => a.talkMin));
  const mscTalk = avg(msc.map(a => a.talkMin));

  const insights: string[] = [];

  if (jcSpeed > 0 && mscSpeed > 0) {
    const faster = jcSpeed < mscSpeed ? 'JC' : 'MSC';
    const diff = Math.abs(jcSpeed - mscSpeed).toFixed(1);
    insights.push(`${faster} picks up ${diff}s faster on average`);
  }

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
        {blendedCalls > 0 && (
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: '#a78bfa' }}>{blendedCalls}</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>Cross-Brand</div>
          </div>
        )}
        {jcSpeed > 0 && (
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: C.cyan }}>{jcSpeed.toFixed(1)}s</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>JC Speed</div>
          </div>
        )}
        {mscSpeed > 0 && (
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: '#5BC5D4' }}>{mscSpeed.toFixed(1)}s</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>MSC Speed</div>
          </div>
        )}
      </div>
    </Card>
  );
}
