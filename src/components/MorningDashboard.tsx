'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { capitalize, agentColor, fmtSpeed, fmtTalkTime, speedGrade, normalizeAgent, EXCLUDED_AGENTS } from '@/lib/constants';
import type { DashboardData, RepAgent, AgentStat, AcctStat, MonthChampions } from '@/lib/types';

type LayoutMode = 'auto' | 'tv' | 'mobile';

// ── Theme (light, newspaper feel) ──────────────────────────────────

const T = {
  bg: '#fafaf9',
  surface: '#ffffff',
  subtle: '#f5f5f4',
  border: '#e7e5e4',
  ink: '#1c1917',
  inkSoft: '#44403c',
  inkMuted: '#78716c',
  inkFaint: '#a8a29e',
  positive: '#15803d',
  caution: '#b45309',
  negative: '#b91c1c',
  brand: '#dc2626',
};

// ── Helpers ─────────────────────────────────────────────────────────

function fmtMin(min: number): string {
  if (min >= 60) return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
  return `${Math.round(min)}m`;
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function dayOfWeekShort(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
}

// ── Sub-components ──────────────────────────────────────────────────

function Num({ children, size = 48 }: { children: React.ReactNode; size?: number }) {
  return (
    <span style={{ fontSize: size, fontWeight: 200, color: T.ink, lineHeight: 1, fontFamily: "'SF Mono','JetBrains Mono','Consolas',monospace", fontVariantNumeric: 'tabular-nums', letterSpacing: -1 }}>
      {children}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2.5, color: T.inkFaint }}>{children}</div>;
}

function Divider() {
  return <div style={{ height: 1, background: T.border, margin: '24px 0' }} />;
}

function Pill({ children, color = T.inkMuted }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color, background: color + '0d', border: `1px solid ${color}22`, padding: '3px 10px', borderRadius: 20 }}>
      {children}
    </span>
  );
}

function Note({ tone = 'neutral', children }: { tone?: string; children: React.ReactNode }) {
  const colors: Record<string, string> = { positive: T.positive, caution: T.caution, negative: T.negative, neutral: T.inkMuted };
  const c = colors[tone] || T.inkMuted;
  return (
    <div style={{ padding: '14px 18px', borderLeft: `2px solid ${c}`, background: T.subtle, borderRadius: '0 8px 8px 0', marginTop: 16 }}>
      <div style={{ color: T.inkSoft, fontSize: 14, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

function AgentBar({ rank, name, value, max, suffix = '' }: { rank: number; name: string; value: number | string; max: number; suffix?: string }) {
  const numVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
  const pct = max > 0 ? Math.max((numVal / max) * 100, 3) : 3;
  const isTop3 = rank < 3;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '32px 80px 1fr auto', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: `1px solid ${T.border}` }}>
      <div style={{ width: 28, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: isTop3 ? T.ink : 'transparent', color: isTop3 ? '#fff' : T.inkFaint, border: isTop3 ? 'none' : `1px solid ${T.border}` }}>{rank + 1}</div>
      <div style={{ fontWeight: 600, fontSize: 15, color: T.ink }}>{capitalize(name)}</div>
      <div style={{ position: 'relative', height: 6, background: T.subtle, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: agentColor(name), opacity: 0.75 }} />
      </div>
      <div style={{ textAlign: 'right', minWidth: 60 }}>
        <span style={{ fontFamily: "'SF Mono','JetBrains Mono','Consolas',monospace", fontSize: 20, fontWeight: 600, color: T.ink }}>{value}</span>
        {suffix && <span style={{ fontSize: 12, color: T.inkFaint, marginLeft: 2 }}>{suffix}</span>}
      </div>
    </div>
  );
}

// ── Step Views ──────────────────────────────────────────────────────

function StepCalls({ data }: { data: DashboardData }) {
  const agents = data.yesterday.repActivity.agents.filter(a => !EXCLUDED_AGENTS.includes(a.agent)).sort((a, b) => b.calls - a.calls);
  const max = agents[0]?.calls || 1;
  const total = agents.reduce((s, a) => s + a.calls, 0);
  return (
    <div>
      <div style={{ marginBottom: 32 }}><Label>Total calls answered</Label><div style={{ marginTop: 8 }}><Num>{total}</Num></div></div>
      {agents.map((a, i) => <AgentBar key={a.agent} rank={i} name={a.agent} value={a.calls} max={max} />)}
    </div>
  );
}

function StepTalk({ data }: { data: DashboardData }) {
  const agents = data.yesterday.repActivity.agents.filter(a => !EXCLUDED_AGENTS.includes(a.agent)).sort((a, b) => b.talkMin - a.talkMin);
  const totalMin = agents.reduce((s, a) => s + a.talkMin, 0);
  return (
    <div>
      <div style={{ marginBottom: 32 }}><Label>Total team talk time</Label><div style={{ marginTop: 8 }}><Num>{fmtMin(totalMin)}</Num></div></div>
      {agents.map((a, i) => <AgentBar key={a.agent} rank={i} name={a.agent} value={fmtMin(a.talkMin)} max={agents[0]?.talkMin || 1} />)}
    </div>
  );
}

function StepSpeed({ data }: { data: DashboardData }) {
  const agents = data.yesterday.repActivity.agents
    .filter(a => !EXCLUDED_AGENTS.includes(a.agent) && a.speedSec != null && a.speedSec > 0)
    .sort((a, b) => a.speedSec! - b.speedSec!);
  const hitting = agents.filter(a => a.speedSec! < 10).length;
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <Label>Speed to answer &mdash; target under 10s</Label>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <Num size={36}>&lt;10s</Num>
          <Pill color={T.positive}>{hitting} of {agents.length} hitting target</Pill>
        </div>
      </div>
      {agents.map((a, i) => {
        const s = a.speedSec!;
        const c = s < 10 ? T.positive : s < 14 ? T.caution : T.negative;
        const { letter } = speedGrade(s);
        return (
          <div key={a.agent} style={{ display: 'grid', gridTemplateColumns: '32px 80px 1fr auto', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: i < 3 ? T.ink : 'transparent', color: i < 3 ? '#fff' : T.inkFaint, border: i < 3 ? 'none' : `1px solid ${T.border}` }}>{i + 1}</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: T.ink }}>{capitalize(a.agent)}</div>
            <div><Pill color={c}>{letter}</Pill></div>
            <div style={{ fontFamily: "'SF Mono','JetBrains Mono','Consolas',monospace", fontSize: 20, fontWeight: 600, color: c, textAlign: 'right', minWidth: 60 }}>{s.toFixed(1)}s</div>
          </div>
        );
      })}
    </div>
  );
}

function StepConversions({ data }: { data: DashboardData }) {
  const convByAgent: Record<string, number> = {};
  for (const a of data.yesterday.conversions.byAgent) convByAgent[a.agent.toLowerCase()] = a.count;
  const agents = data.yesterday.repActivity.agents
    .filter(a => !EXCLUDED_AGENTS.includes(a.agent))
    .map(a => ({ ...a, convs: convByAgent[a.agent.toLowerCase()] || 0 }))
    .sort((a, b) => b.convs - a.convs);
  const total = data.yesterday.conversions.total;

  // Day-over-day from trend
  const trend = data.trend7d.conversions;
  const priorVal = trend.length >= 2 ? trend[trend.length - 1] : null;
  const pct = priorVal ? Math.round(((total - priorVal) / Math.max(priorVal, 1)) * 100) : null;

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <Label>Conversions &mdash; {dayOfWeekShort(data.yesterdayDate || '')}</Label>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <Num size={64}>{total}</Num>
          {pct !== null && <Pill color={pct >= 0 ? T.positive : T.negative}>{pct >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(pct)}% vs prior {dayOfWeekShort(data.yesterdayDate || '')}</Pill>}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {['#', 'Agent', 'Conv', 'Calls', 'Rate', 'Conv/Hr'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: h === '#' || h === 'Agent' ? 'left' : 'right', color: T.inkFaint, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((a, i) => {
              const rate = a.calls > 0 ? Math.round((a.convs / a.calls) * 100) : 0;
              return (
                <tr key={a.agent} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 ? T.subtle : 'transparent' }}>
                  <td style={{ padding: 10 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: i < 3 ? T.ink : 'transparent', color: i < 3 ? '#fff' : T.inkFaint, border: i < 3 ? 'none' : `1px solid ${T.border}` }}>{i + 1}</div>
                  </td>
                  <td style={{ padding: 10, fontWeight: 700, color: agentColor(a.agent) }}>{capitalize(a.agent)}</td>
                  <td style={{ padding: 10, textAlign: 'right', fontFamily: "'SF Mono','Consolas',monospace", fontSize: 20, fontWeight: 700 }}>{a.convs}</td>
                  <td style={{ padding: 10, textAlign: 'right', fontFamily: "'SF Mono','Consolas',monospace", color: T.inkMuted }}>{a.calls}</td>
                  <td style={{ padding: 10, textAlign: 'right' }}><Pill color={rate >= 15 ? T.positive : rate >= 8 ? T.inkMuted : T.caution}>{rate}%</Pill></td>
                  <td style={{ padding: 10, textAlign: 'right', fontFamily: "'SF Mono','Consolas',monospace", color: T.inkSoft }}>{a.convsPerHour?.toFixed(2) || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Divider />
      <Label>Top accounts</Label>
      <div style={{ marginTop: 8 }}>
        {data.yesterday.conversions.byAccount.slice(0, 8).map(a => (
          <div key={a.account} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
            <span style={{ color: T.inkSoft }}>{a.account}</span>
            <span style={{ fontFamily: "'SF Mono','Consolas',monospace", fontWeight: 600 }}>{a.count}</span>
          </div>
        ))}
      </div>
      <Divider />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <Label>Missed calls</Label>
        <Num size={28}>{data.yesterday.missedCalls.total}</Num>
      </div>
      {data.yesterday.missedCalls.byAccount.slice(0, 5).map(a => (
        <div key={a.account} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, color: T.inkMuted }}>
          <span>{a.account}</span>
          <span style={{ fontWeight: 600, color: T.negative }}>{a.count}</span>
        </div>
      ))}
    </div>
  );
}

function StepMTD({ data }: { data: DashboardData }) {
  const mtd = data.mtd;
  const pace = mtd.dayOfMonth > 0 ? Math.round(mtd.total / mtd.dayOfMonth) : 0;
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <Label>Month to date &mdash; {mtd.dayOfMonth} days</Label>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <Num size={64}>{mtd.total}</Num>
          <span style={{ fontSize: 14, color: T.inkMuted }}>{pace}/day pace</span>
        </div>
      </div>
      {mtd.byAgent.sort((a, b) => b.count - a.count).map((a, i) => (
        <AgentBar key={a.agent} rank={i} name={a.agent} value={a.count} max={mtd.byAgent[0]?.count || 1} />
      ))}
      <Divider />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'center' }}>
        <div><div style={{ fontFamily: "'SF Mono','Consolas',monospace", fontSize: 24, fontWeight: 600 }}>{mtd.goalPace}</div><div style={{ fontSize: 10, color: T.inkFaint, textTransform: 'uppercase' }}>Projected</div></div>
        <div><div style={{ fontFamily: "'SF Mono','Consolas',monospace", fontSize: 24, fontWeight: 600 }}>{mtd.goal}</div><div style={{ fontSize: 10, color: T.inkFaint, textTransform: 'uppercase' }}>Goal</div></div>
        <div><div style={{ fontFamily: "'SF Mono','Consolas',monospace", fontSize: 24, fontWeight: 600, color: mtd.onTrack ? T.positive : T.negative }}>{mtd.requiredDailyRate}</div><div style={{ fontSize: 10, color: T.inkFaint, textTransform: 'uppercase' }}>Needed/Day</div></div>
      </div>
    </div>
  );
}

function StepChampions({ champions }: { champions: MonthChampions }) {
  const cards = [
    { icon: '\uD83C\uDFC6', title: 'Most Conversions', ...champions.mostConversions, suffix: '' },
    { icon: '\uD83D\uDCDE', title: 'Most Calls', ...champions.mostCalls, suffix: '' },
    { icon: '\u26A1', title: 'Fastest Speed', ...champions.fastestSpeed, suffix: 's' },
    { icon: '\uD83D\uDDE3\uFE0F', title: 'Most Talk Time', ...champions.mostTalkTime, suffix: 'm' },
    { icon: '\uD83C\uDFAF', title: 'Best Conv Rate', ...champions.bestConvRate, suffix: '%' },
  ];
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{'\uD83C\uDFC6'}</div>
        <Num size={32}>{champions.month}</Num>
        <div style={{ marginTop: 4 }}><Label>Champions</Label></div>
      </div>
      {cards.map(c => (
        <div key={c.title} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 24, width: 40, textAlign: 'center' }}>{c.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: T.inkFaint, textTransform: 'uppercase', letterSpacing: 1 }}>{c.title}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: agentColor(c.agent), marginTop: 2 }}>{capitalize(c.agent)}</div>
            {c.runnerUp && <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 1 }}>Runner-up: {capitalize(c.runnerUp)} ({c.runnerUpValue}{c.suffix})</div>}
          </div>
          <div style={{ fontFamily: "'SF Mono','JetBrains Mono','Consolas',monospace", fontSize: 28, fontWeight: 700, color: T.ink }}>{typeof c.value === 'number' && c.suffix === 'm' ? fmtMin(c.value) : c.value}{c.suffix !== 'm' ? c.suffix : ''}</div>
        </div>
      ))}
    </div>
  );
}

function StepSlack({ data }: { data: DashboardData }) {
  const [copied, setCopied] = useState(false);
  const yd = data.yesterday;
  const agents = yd.repActivity.agents.filter(a => !EXCLUDED_AGENTS.includes(a.agent));
  const convByAgent: Record<string, number> = {};
  for (const a of yd.conversions.byAgent) convByAgent[a.agent.toLowerCase()] = a.count;

  const dayName = dayOfWeekShort(data.yesterdayDate || '').toUpperCase();
  const dateShort = new Date((data.yesterdayDate || '') + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const callsRank = [...agents].sort((a, b) => b.calls - a.calls).map(a => `${capitalize(a.agent)} ${'·'.repeat(Math.max(12 - a.agent.length, 1))} ${a.calls}`).join('\n');
  const talkRank = [...agents].sort((a, b) => b.talkMin - a.talkMin).map(a => `${capitalize(a.agent)} ${'·'.repeat(Math.max(12 - a.agent.length, 1))} ${fmtMin(a.talkMin)}`).join('\n');
  const speedRank = [...agents].filter(a => a.speedSec != null && a.speedSec > 0).sort((a, b) => a.speedSec! - b.speedSec!).map(a => `${capitalize(a.agent)} ${'·'.repeat(Math.max(12 - a.agent.length, 1))} ${a.speedSec!.toFixed(1)}s`).join('\n');
  const convRank = [...agents].map(a => ({ ...a, convs: convByAgent[a.agent.toLowerCase()] || 0 })).sort((a, b) => b.convs - a.convs).map(a => {
    const rate = a.calls > 0 ? Math.round((a.convs / a.calls) * 100) + '%' : '—';
    return `${capitalize(a.agent)} ${'·'.repeat(Math.max(12 - a.agent.length, 1))} ${a.convs}  (${rate})`;
  }).join('\n');
  const topAccts = yd.conversions.byAccount.slice(0, 5).map(a => `${a.account} — ${a.count}`).join('\n');
  const mtdRank = data.mtd.byAgent.sort((a, b) => b.count - a.count).map((a, i) => `${i + 1}. ${capitalize(a.agent)} ${'·'.repeat(Math.max(10 - a.agent.length, 1))} ${a.count}`).join('\n');

  const championsBlock = data.prevMonthChampions ? `\uD83C\uDFC6  ${data.prevMonthChampions.month.toUpperCase()} CHAMPIONS\nMost Conversions: ${capitalize(data.prevMonthChampions.mostConversions.agent)} (${data.prevMonthChampions.mostConversions.value})\nFastest Speed: ${capitalize(data.prevMonthChampions.fastestSpeed.agent)} (${data.prevMonthChampions.fastestSpeed.value}s)\nMost Calls: ${capitalize(data.prevMonthChampions.mostCalls.agent)} (${data.prevMonthChampions.mostCalls.value})\nMost Talk Time: ${capitalize(data.prevMonthChampions.mostTalkTime.agent)} (${fmtMin(data.prevMonthChampions.mostTalkTime.value)})\nBest Conv Rate: ${capitalize(data.prevMonthChampions.bestConvRate.agent)} (${data.prevMonthChampions.bestConvRate.value}%)\n\n` : '';

  const dashboardUrl = typeof window !== 'undefined' ? `${window.location.origin}/morning` : '';

  const post = `${dayName} RECAP  ·  ${dateShort}\n${'━'.repeat(27)}\n\n${championsBlock}\uD83D\uDCDE  CALLS ANSWERED — ${agents.reduce((s, a) => s + a.calls, 0)} total\n${callsRank}\n\n\u23F1  TALK TIME — ${fmtMin(agents.reduce((s, a) => s + a.talkMin, 0))} total\n${talkRank}\n\n\u26A1  SPEED TO ANSWER\n${speedRank}\n\n\uD83C\uDFAF  CONVERSIONS — ${yd.conversions.total}\n${convRank}\n\n\uD83C\uDFE2  TOP ACCOUNTS\n${topAccts}\n\n\uD83D\uDCDE  MISSED CALLS — ${yd.missedCalls.total}\n\n\uD83C\uDFC6  MTD RACE (${data.mtd.dayOfMonth} days)\n${mtdRank}\n${dashboardUrl ? `\n\uD83D\uDCCA Dashboard: ${dashboardUrl}` : ''}\n\nKeep the momentum going \uD83D\uDCAA`;

  const handleCopy = () => { navigator.clipboard.writeText(post); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label>Auto-generated from live data</Label>
        <button onClick={handleCopy} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.border}`, background: copied ? T.ink : T.surface, color: copied ? '#fff' : T.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit' }}>
          {copied ? '\u2713 Copied' : 'Copy to clipboard'}
        </button>
      </div>
      <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 8, padding: 20, fontFamily: "'Lato','Helvetica Neue',sans-serif", fontSize: 14, lineHeight: 1.6, color: '#1d1c1d', whiteSpace: 'pre-wrap', maxHeight: 500, overflowY: 'auto', borderLeft: `4px solid ${T.ink}` }}>
        {post}
      </div>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────

const BASE_STEPS = [
  { key: 'calls', label: 'Calls Answered', num: '01' },
  { key: 'talk', label: 'Talk Time', num: '02' },
  { key: 'speed', label: 'Speed', num: '03' },
  { key: 'conv', label: 'Conversions', num: '04' },
  { key: 'mtd', label: 'MTD Race', num: '05' },
  { key: 'slack', label: 'Slack Post', num: '06' },
];

export default function MorningDashboard() {
  const searchParams = useSearchParams();
  const mode = (searchParams.get('mode') as LayoutMode) || 'auto';

  // Layout config per mode
  const layout = useMemo(() => {
    switch (mode) {
      case 'tv':
        return { maxWidth: '100%', padding: '40px 80px', fontSize: 1.35, headerSize: 36, heroSize: 80, barHeight: 8 };
      case 'mobile':
        return { maxWidth: '640px', padding: '28px', fontSize: 1, headerSize: 28, heroSize: 48, barHeight: 6 };
      default: // auto
        return { maxWidth: '960px', padding: '28px 40px', fontSize: 1.1, headerSize: 32, heroSize: 56, barHeight: 7 };
    }
  }, [mode]);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/data?brand=jc');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      console.error('Morning dashboard fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const steps = useMemo(() => {
    if (data?.prevMonthChampions) {
      return [
        { key: 'champions', label: `${data.prevMonthChampions.month} Champions`, num: '00' },
        ...BASE_STEPS,
      ];
    }
    return BASE_STEPS;
  }, [data?.prevMonthChampions]);

  const total = steps.length;

  // Keyboard nav
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setStep(s => Math.min(s + 1, total - 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setStep(s => Math.max(s - 1, 0)); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [total]);

  // Meeting day context
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Edmonton' });
  const todayDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Edmonton' });

  if (loading || !data) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: T.inkMuted, fontSize: 14 }}>Loading morning dashboard...</div>
      </div>
    );
  }

  function renderStep() {
    const currentKey = steps[step].key;
    switch (currentKey) {
      case 'champions': return data!.prevMonthChampions ? <StepChampions champions={data!.prevMonthChampions} /> : null;
      case 'calls': return <StepCalls data={data!} />;
      case 'talk': return <StepTalk data={data!} />;
      case 'speed': return <StepSpeed data={data!} />;
      case 'conv': return <StepConversions data={data!} />;
      case 'mtd': return <StepMTD data={data!} />;
      case 'slack': return <StepSlack data={data!} />;
      default: return null;
    }
  }

  const scale = layout.fontSize;

  return (
    <div style={{ background: T.bg, minHeight: '100vh', color: T.ink, fontFamily: "'Inter','Helvetica Neue',system-ui,sans-serif", maxWidth: layout.maxWidth, margin: '0 auto', fontSize: `${scale}rem` }}>
      {/* Mode switcher (top-right corner) */}
      <div style={{ position: 'fixed', top: 12, right: 12, display: 'flex', gap: 4, zIndex: 50 }}>
        {(['mobile', 'auto', 'tv'] as LayoutMode[]).map(m => (
          <a key={m} href={`/morning${m === 'auto' ? '' : `?mode=${m}`}`}
            style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, textDecoration: 'none', background: mode === m ? T.ink : T.subtle, color: mode === m ? '#fff' : T.inkFaint, border: `1px solid ${mode === m ? T.ink : T.border}` }}>
            {m === 'tv' ? '16:9' : m === 'mobile' ? 'Mobile' : 'Auto'}
          </a>
        ))}
      </div>

      {/* Header */}
      <header style={{ padding: `32px ${layout.padding} 0`, borderBottom: `1px solid ${T.border}`, paddingBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11 * scale, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 3, color: T.inkFaint }}>Jump Contact</div>
            <h1 style={{ fontSize: layout.headerSize, fontWeight: 800, margin: '6px 0 0', letterSpacing: -0.8, color: T.ink, lineHeight: 1.1 }}>
              {todayName}<br />Morning Meeting
            </h1>
          </div>
          <div style={{ textAlign: 'right', marginRight: mode === 'tv' ? 120 : 0 }}>
            <div style={{ fontSize: 12 * scale, color: T.inkMuted }}>{todayDate}</div>
            <div style={{ fontSize: 12 * scale, color: T.inkFaint, marginTop: 2 }}>Reviewing {dayOfWeekShort(data.yesterdayDate || '')}</div>
          </div>
        </div>
      </header>

      {/* Step tabs */}
      <nav style={{ padding: `16px ${layout.padding}`, borderBottom: `1px solid ${T.border}`, overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {steps.map((s, i) => (
            <button key={s.key} onClick={() => setStep(i)} style={{ flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer', background: 'transparent', borderBottom: step === i ? `2px solid ${T.ink}` : '2px solid transparent', transition: 'all 0.2s' }}>
              <div style={{ fontSize: 10 * scale, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: step === i ? T.ink : T.inkFaint, transition: 'color 0.2s' }}>
                <span style={{ fontFamily: "'SF Mono',monospace", marginRight: 4, fontSize: 9 * scale }}>{s.num}</span>{s.label}
              </div>
            </button>
          ))}
        </div>
      </nav>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 2, padding: `0 ${layout.padding}`, marginTop: -1 }}>
        {steps.map((_, i) => <div key={i} style={{ flex: 1, height: mode === 'tv' ? 3 : 2, background: i <= step ? T.ink : T.border, transition: 'background 0.3s' }} />)}
      </div>

      {/* Content */}
      <main style={{ padding: layout.padding }}>
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: "'SF Mono',monospace", fontSize: 11 * scale, fontWeight: 700, color: T.inkFaint, background: T.subtle, padding: '4px 10px', borderRadius: 4, border: `1px solid ${T.border}` }}>{steps[step].num}</span>
          <h2 style={{ fontSize: 22 * scale, fontWeight: 700, margin: 0, color: T.ink, letterSpacing: -0.3 }}>{steps[step].label}</h2>
        </div>
        {renderStep()}
      </main>

      {/* Footer nav */}
      <footer style={{ padding: `20px ${layout.padding} 32px`, borderTop: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => step > 0 && setStep(step - 1)} style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13 * scale, fontWeight: 600, border: `1px solid ${T.border}`, background: T.surface, color: step === 0 ? T.inkFaint : T.ink, cursor: step === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>&larr; Back</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {steps.map((_, i) => <div key={i} onClick={() => setStep(i)} style={{ width: mode === 'tv' ? 10 : 6, height: mode === 'tv' ? 10 : 6, borderRadius: '50%', cursor: 'pointer', background: i === step ? T.ink : T.border, transition: 'background 0.3s' }} />)}
          </div>
          <button onClick={() => step < total - 1 && setStep(step + 1)} style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13 * scale, fontWeight: 600, border: 'none', background: step === total - 1 ? T.subtle : T.ink, color: step === total - 1 ? T.inkFaint : '#fff', cursor: step === total - 1 ? 'default' : 'pointer', fontFamily: 'inherit' }}>Next &rarr;</button>
        </div>
      </footer>
    </div>
  );
}
