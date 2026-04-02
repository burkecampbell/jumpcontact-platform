/**
 * Cross-brand comparison insights — shown only in Mixed view.
 * Uses pre-computed brand breakdown from the API (blended agents already split).
 * Every call is attributed to JC or MSC — no mystery buckets.
 */
import Card from './Card';
import { C } from '@/lib/constants';

interface BrandBreakdown {
  jc: { calls: number; avgSpeed: number | null };
  msc: { calls: number; avgSpeed: number | null };
}

interface Props {
  breakdown: BrandBreakdown;
}

export default function MixedInsights({ breakdown }: Props) {
  const { jc, msc } = breakdown;

  if (jc.calls === 0 && msc.calls === 0) return null;

  const insights: string[] = [];

  if (jc.avgSpeed && msc.avgSpeed && jc.avgSpeed > 0 && msc.avgSpeed > 0) {
    const faster = jc.avgSpeed < msc.avgSpeed ? 'JC' : 'MSC';
    const diff = Math.abs(jc.avgSpeed - msc.avgSpeed).toFixed(1);
    insights.push(`${faster} picks up ${diff}s faster on average`);
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.cyan }}>
          Cross-Brand Insights
        </span>
      </div>
      {insights.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3">
          {insights.map((text, i) => (
            <span key={i} className="text-sm" style={{ color: C.text }}>
              {text}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-6 pt-3" style={{ borderTop: insights.length > 0 ? `1px solid ${C.border}` : 'none' }}>
        <div className="text-center">
          <div className="text-lg font-bold font-mono" style={{ color: C.cyan }}>{jc.calls}</div>
          <div className="text-[10px] uppercase" style={{ color: C.sub }}>JC Calls</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold font-mono" style={{ color: '#5BC5D4' }}>{msc.calls}</div>
          <div className="text-[10px] uppercase" style={{ color: C.sub }}>MSC Calls</div>
        </div>
        {jc.avgSpeed != null && jc.avgSpeed > 0 && (
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: C.cyan }}>{jc.avgSpeed.toFixed(1)}s</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>JC Speed</div>
          </div>
        )}
        {msc.avgSpeed != null && msc.avgSpeed > 0 && (
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: '#5BC5D4' }}>{msc.avgSpeed.toFixed(1)}s</div>
            <div className="text-[10px] uppercase" style={{ color: C.sub }}>MSC Speed</div>
          </div>
        )}
      </div>
    </Card>
  );
}
