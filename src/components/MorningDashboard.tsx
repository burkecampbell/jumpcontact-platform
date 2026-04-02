'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { capitalize, agentColor, fmtSpeed, fmtTalkTime, speedGrade, normalizeAgent, EXCLUDED_AGENTS } from '@/lib/constants';
import { useSpringValue } from '@/hooks/useSpringValue';
import type { DashboardData, RepAgent, AgentStat, AcctStat, MonthChampions } from '@/lib/types';

type LayoutMode = 'auto' | 'tv' | 'mobile';

const MAX_W: Record<LayoutMode, number> = { mobile: 640, auto: 1000, tv: 9999 };
const PAD: Record<LayoutMode, number> = { mobile: 28, auto: 48, tv: 120 };

// ── Per-element sizing per mode ─────────────────────────────────────
// Each element type has its own ideal size on each screen.
// This IS pretext: independent spring targets per element.
const SIZES: Record<string, Record<LayoutMode, number>> = {
  hero:       { mobile: 48,  auto: 56,  tv: 120 },   // big KPI numbers
  heading:    { mobile: 28,  auto: 32,  tv: 64 },    // "Thursday Morning Meeting"
  stepTitle:  { mobile: 22,  auto: 24,  tv: 48 },    // "MTD Race", "Speed"
  agentName:  { mobile: 15,  auto: 16,  tv: 36 },    // "Wendy", "Omar"
  agentValue: { mobile: 20,  auto: 22,  tv: 48 },    // "56", "6.8s"
  label:      { mobile: 10,  auto: 11,  tv: 20 },    // "MONTH TO DATE"
  tab:        { mobile: 9,   auto: 10,  tv: 18 },    // nav tab labels
  body:       { mobile: 13,  auto: 14,  tv: 26 },    // table text, accounts
  pill:       { mobile: 11,  auto: 11,  tv: 20 },    // grade badges, pills
  date:       { mobile: 12,  auto: 12,  tv: 22 },    // "April 2, 2026"
  badge:      { mobile: 28,  auto: 30,  tv: 52 },    // rank circles
  bar:        { mobile: 6,   auto: 7,   tv: 14 },    // progress bars
  dot:        { mobile: 6,   auto: 8,   tv: 16 },    // nav dots
  button:     { mobile: 13,  auto: 14,  tv: 24 },    // Back/Next
  gap:        { mobile: 12,  auto: 14,  tv: 24 },    // spacing
  sub:        { mobile: 10,  auto: 10,  tv: 16 },    // "Jump Contact" brand
};

const T = {
  bg: '#fafaf9', surface: '#ffffff', subtle: '#f5f5f4', border: '#e7e5e4',
  ink: '#1c1917', inkSoft: '#44403c', inkMuted: '#78716c', inkFaint: '#a8a29e',
  positive: '#15803d', caution: '#b45309', negative: '#b91c1c', gold: '#ca8a04',
};

// ── Size helper — reads current mode, returns per-element size ──────
let _m: LayoutMode = 'auto';
function Z(key: string) { return SIZES[key]?.[_m] ?? SIZES[key]?.auto ?? 14; }
// Generic spacing scale (for padding, gaps, margins)
function G(base: number) { return Math.round(base * (Z('gap') / 12)); }

function fmtMin(m: number) { return m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`; }
function dayName(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }); }

// ── Primitives ──────────────────────────────────────────────────────

function Num({ children, el = 'hero' }: { children: React.ReactNode; el?: string }) {
  return <span style={{ fontSize: Z(el), fontWeight: 200, color: T.ink, lineHeight: 1, fontFamily: "'JetBrains Mono','Consolas',monospace", fontVariantNumeric: 'tabular-nums', letterSpacing: -1 }}>{children}</span>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: Z('label'), fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, color: T.inkFaint }}>{children}</div>;
}
function Pill({ children, color = T.inkMuted }: { children: React.ReactNode; color?: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: Z('pill'), fontWeight: 600, color, background: color + '0d', border: `1px solid ${color}22`, padding: `${G(4)}px ${G(10)}px`, borderRadius: 20 }}>{children}</span>;
}

function AgentBar({ rank, name, value, max, suffix = '' }: { rank: number; name: string; value: number | string; max: number; suffix?: string }) {
  const numVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
  const pct = max > 0 ? Math.max((numVal / max) * 100, 3) : 3;
  const top3 = rank < 3;
  const b = Z('badge');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${b}px ${G(90)}px 1fr auto`, alignItems: 'center', gap: G(12), padding: `${G(12)}px 0`, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ width: b, height: b, borderRadius: b / 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Z('body') * 0.85, fontWeight: 700, background: top3 ? T.ink : 'transparent', color: top3 ? '#fff' : T.inkFaint, border: top3 ? 'none' : `1px solid ${T.border}` }}>{rank + 1}</div>
      <div style={{ fontWeight: 600, fontSize: Z('agentName'), color: T.ink }}>{capitalize(name)}</div>
      <div style={{ position: 'relative', height: Z('bar'), background: T.subtle, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: agentColor(name), opacity: 0.8 }} />
      </div>
      <div style={{ textAlign: 'right', minWidth: G(60) }}>
        <span style={{ fontFamily: "'JetBrains Mono','Consolas',monospace", fontSize: Z('agentValue'), fontWeight: 600, color: T.ink }}>{value}</span>
        {suffix && <span style={{ fontSize: Z('label'), color: T.inkFaint, marginLeft: 2 }}>{suffix}</span>}
      </div>
    </div>
  );
}

// ── Steps ───────────────────────────────────────────────────────────

function StepCalls({ data }: { data: DashboardData }) {
  const agents = data.yesterday.repActivity.agents.filter(a => !EXCLUDED_AGENTS.includes(a.agent)).sort((a, b) => b.calls - a.calls);
  const total = agents.reduce((s, a) => s + a.calls, 0);
  return (
    <div>
      <div style={{ marginBottom: G(24) }}><Label>Total calls answered</Label><div style={{ marginTop: G(8) }}><Num>{total}</Num></div></div>
      {agents.map((a, i) => <AgentBar key={a.agent} rank={i} name={a.agent} value={a.calls} max={agents[0]?.calls || 1} />)}
    </div>
  );
}

function StepTalk({ data }: { data: DashboardData }) {
  const agents = data.yesterday.repActivity.agents.filter(a => !EXCLUDED_AGENTS.includes(a.agent)).sort((a, b) => b.talkMin - a.talkMin);
  return (
    <div>
      <div style={{ marginBottom: G(24) }}><Label>Total team talk time</Label><div style={{ marginTop: G(8) }}><Num>{fmtMin(agents.reduce((s, a) => s + a.talkMin, 0))}</Num></div></div>
      {agents.map((a, i) => <AgentBar key={a.agent} rank={i} name={a.agent} value={fmtMin(a.talkMin)} max={agents[0]?.talkMin || 1} />)}
    </div>
  );
}

function StepSpeed({ data }: { data: DashboardData }) {
  const agents = data.yesterday.repActivity.agents
    .filter(a => !EXCLUDED_AGENTS.includes(a.agent) && a.speedSec != null && a.speedSec > 0)
    .sort((a, b) => a.speedSec! - b.speedSec!);
  const hitting = agents.filter(a => a.speedSec! < 10).length;
  const b = Z('badge');
  return (
    <div>
      <div style={{ marginBottom: G(24) }}>
        <Label>Speed to answer</Label>
        <div style={{ marginTop: G(8), display: 'flex', alignItems: 'baseline', gap: G(16) }}>
          <Num>&lt;10s target</Num>
          <Pill color={T.positive}>{hitting}/{agents.length} hitting</Pill>
        </div>
      </div>
      {agents.map((a, i) => {
        const s = a.speedSec!;
        const c = s < 10 ? T.positive : s < 14 ? T.caution : T.negative;
        const { letter } = speedGrade(s);
        return (
          <div key={a.agent} style={{ display: 'grid', gridTemplateColumns: `${b}px ${G(90)}px 1fr auto`, alignItems: 'center', gap: G(12), padding: `${G(12)}px 0`, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ width: b, height: b, borderRadius: b / 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Z('body') * 0.85, fontWeight: 700, background: i < 3 ? T.ink : 'transparent', color: i < 3 ? '#fff' : T.inkFaint, border: i < 3 ? 'none' : `1px solid ${T.border}` }}>{i + 1}</div>
            <div style={{ fontWeight: 600, fontSize: Z('agentName'), color: T.ink }}>{capitalize(a.agent)}</div>
            <div><Pill color={c}>{letter}</Pill></div>
            <div style={{ fontFamily: "'JetBrains Mono','Consolas',monospace", fontSize: Z('agentValue'), fontWeight: 600, color: c, textAlign: 'right' }}>{s.toFixed(1)}s</div>
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
  const trend = data.trend7d.conversions;
  const prior = trend.length >= 2 ? trend[trend.length - 1] : null;
  const pct = prior ? Math.round(((total - prior) / Math.max(prior, 1)) * 100) : null;
  const b = Z('badge');

  return (
    <div>
      <div style={{ marginBottom: G(24) }}>
        <Label>Conversions &mdash; {dayName(data.yesterdayDate || '')}</Label>
        <div style={{ marginTop: G(8), display: 'flex', alignItems: 'baseline', gap: G(16) }}>
          <Num>{total}</Num>
          {pct !== null && <Pill color={pct >= 0 ? T.positive : T.negative}>{pct >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(pct)}%</Pill>}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${T.border}` }}>
            {['#', 'Agent', 'Conv', 'Calls', 'Rate', 'Conv/Hr'].map(h => (
              <th key={h} style={{ padding: `${G(8)}px ${G(10)}px`, textAlign: h === '#' || h === 'Agent' ? 'left' : 'right', color: T.inkFaint, fontSize: Z('label'), textTransform: 'uppercase', letterSpacing: 1.5 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((a, i) => {
            const rate = a.calls > 0 ? Math.round((a.convs / a.calls) * 100) : 0;
            return (
              <tr key={a.agent} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 ? T.subtle : 'transparent' }}>
                <td style={{ padding: G(8) }}>
                  <div style={{ width: b, height: b, borderRadius: b / 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Z('body') * 0.85, fontWeight: 700, background: i < 3 ? T.ink : 'transparent', color: i < 3 ? '#fff' : T.inkFaint, border: i < 3 ? 'none' : `1px solid ${T.border}` }}>{i + 1}</div>
                </td>
                <td style={{ padding: G(8), fontWeight: 700, fontSize: Z('agentName'), color: agentColor(a.agent) }}>{capitalize(a.agent)}</td>
                <td style={{ padding: G(8), textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue'), fontWeight: 700 }}>{a.convs}</td>
                <td style={{ padding: G(8), textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: Z('body'), color: T.inkMuted }}>{a.calls}</td>
                <td style={{ padding: G(8), textAlign: 'right' }}><Pill color={rate >= 15 ? T.positive : rate >= 8 ? T.inkMuted : T.caution}>{rate}%</Pill></td>
                <td style={{ padding: G(8), textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: Z('body'), color: T.inkSoft }}>{a.convsPerHour?.toFixed(2) || '\u2014'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ height: 1, background: T.border, margin: `${G(20)}px 0` }} />
      <div style={{ display: 'flex', gap: G(40) }}>
        <div style={{ flex: 1 }}>
          <Label>Top accounts</Label>
          <div style={{ marginTop: G(8) }}>
            {data.yesterday.conversions.byAccount.slice(0, 6).map(a => (
              <div key={a.account} style={{ display: 'flex', justifyContent: 'space-between', padding: `${G(5)}px 0`, borderBottom: `1px solid ${T.border}`, fontSize: Z('body') }}>
                <span style={{ color: T.inkSoft }}>{a.account}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{a.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: G(8), marginBottom: G(8) }}>
            <Label>Missed calls</Label>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue'), fontWeight: 600, color: T.negative }}>{data.yesterday.missedCalls.total}</span>
          </div>
          {data.yesterday.missedCalls.byAccount.slice(0, 5).map(a => (
            <div key={a.account} style={{ display: 'flex', justifyContent: 'space-between', padding: `${G(4)}px 0`, fontSize: Z('body') * 0.9, color: T.inkMuted }}>
              <span>{a.account}</span>
              <span style={{ fontWeight: 600, color: T.negative }}>{a.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepMTD({ data }: { data: DashboardData }) {
  const mtd = data.mtd;
  const pace = mtd.dayOfMonth > 0 ? Math.round(mtd.total / mtd.dayOfMonth) : 0;
  return (
    <div>
      <div style={{ marginBottom: G(24) }}>
        <Label>Month to date &mdash; day {mtd.dayOfMonth}</Label>
        <div style={{ marginTop: G(8), display: 'flex', alignItems: 'baseline', gap: G(16) }}>
          <Num>{mtd.total}</Num>
          <span style={{ fontSize: Z('body'), color: T.inkMuted }}>{pace}/day pace</span>
        </div>
      </div>
      {mtd.byAgent.filter(a => !EXCLUDED_AGENTS.includes(a.agent)).sort((a, b) => b.count - a.count).map((a, i) => (
        <AgentBar key={a.agent} rank={i} name={a.agent} value={a.count} max={mtd.byAgent[0]?.count || 1} />
      ))}
      <div style={{ height: 1, background: T.border, margin: `${G(20)}px 0` }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: G(16), textAlign: 'center' }}>
        <div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue'), fontWeight: 600 }}>{mtd.goalPace}</div><Label>Projected</Label></div>
        <div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue'), fontWeight: 600 }}>{mtd.goal}</div><Label>Goal</Label></div>
        <div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue'), fontWeight: 600, color: mtd.onTrack ? T.positive : T.negative }}>{mtd.requiredDailyRate}</div><Label>Needed/Day</Label></div>
      </div>
    </div>
  );
}

function StepChampions({ champions }: { champions: MonthChampions }) {
  const items = [
    { icon: '\uD83C\uDFC6', title: 'Most Conversions', ...champions.mostConversions, sfx: '', accent: T.gold },
    { icon: '\uD83D\uDCDE', title: 'Most Calls (last day)', ...champions.mostCalls, sfx: '', accent: T.ink },
    { icon: '\u26A1', title: 'Fastest Speed (last day)', ...champions.fastestSpeed, sfx: 's', accent: T.positive },
    { icon: '\uD83D\uDDE3\uFE0F', title: 'Most Talk Time (last day)', ...champions.mostTalkTime, sfx: 'm', accent: T.ink },
    { icon: '\uD83C\uDFAF', title: 'Best Conv/Day', ...champions.bestConvRate, sfx: '', accent: T.caution },
  ];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: G(12), marginBottom: G(24) }}>
        <span style={{ fontSize: Z('hero') * 0.6 }}>{'\uD83C\uDFC6'}</span>
        <div>
          <Num el="stepTitle">{champions.month}</Num>
          <Label>Champions</Label>
        </div>
      </div>
      {items.map(c => (
        <div key={c.title} style={{ display: 'grid', gridTemplateColumns: `${G(40)}px 1fr auto`, alignItems: 'center', gap: G(12), padding: `${G(14)}px 0`, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: Z('agentValue'), textAlign: 'center' }}>{c.icon}</div>
          <div>
            <div style={{ fontSize: Z('label'), color: T.inkFaint, textTransform: 'uppercase', letterSpacing: 1 }}>{c.title}</div>
            <div style={{ fontSize: Z('agentName'), fontWeight: 700, color: agentColor(c.agent) }}>{capitalize(c.agent)}</div>
            {c.runnerUp && <div style={{ fontSize: Z('body') * 0.85, color: T.inkMuted }}>Runner-up: {capitalize(c.runnerUp)} ({c.runnerUpValue}{c.sfx})</div>}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: Z('agentValue'), fontWeight: 700, color: c.accent }}>
            {typeof c.value === 'number' && c.sfx === 'm' ? fmtMin(c.value) : c.value}{c.sfx !== 'm' ? c.sfx : ''}
          </div>
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

  const dn = dayName(data.yesterdayDate || '').toUpperCase();
  const ds = new Date((data.yesterdayDate || '') + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const dot = (n: string) => '\u00b7'.repeat(Math.max(12 - n.length, 1));

  const callsR = [...agents].sort((a, b) => b.calls - a.calls).map(a => `${capitalize(a.agent)} ${dot(a.agent)} ${a.calls}`).join('\n');
  const talkR = [...agents].sort((a, b) => b.talkMin - a.talkMin).map(a => `${capitalize(a.agent)} ${dot(a.agent)} ${fmtMin(a.talkMin)}`).join('\n');
  const speedR = [...agents].filter(a => a.speedSec != null && a.speedSec > 0).sort((a, b) => a.speedSec! - b.speedSec!).map(a => `${capitalize(a.agent)} ${dot(a.agent)} ${a.speedSec!.toFixed(1)}s`).join('\n');
  const convR = [...agents].map(a => ({ ...a, c: convByAgent[a.agent.toLowerCase()] || 0 })).sort((a, b) => b.c - a.c).map(a => { const r = a.calls > 0 ? Math.round((a.c / a.calls) * 100) + '%' : '\u2014'; return `${capitalize(a.agent)} ${dot(a.agent)} ${a.c}  (${r})`; }).join('\n');
  const accts = yd.conversions.byAccount.slice(0, 5).map(a => `${a.account} \u2014 ${a.count}`).join('\n');
  const mtdR = data.mtd.byAgent.filter(a => !EXCLUDED_AGENTS.includes(a.agent)).sort((a, b) => b.count - a.count).map((a, i) => `${i + 1}. ${capitalize(a.agent)} ${dot(a.agent)} ${a.count}`).join('\n');
  const champ = data.prevMonthChampions;
  const champBlock = champ ? `\uD83C\uDFC6  ${champ.month.toUpperCase()} CHAMPIONS\nMost Conversions: ${capitalize(champ.mostConversions.agent)} (${champ.mostConversions.value})\nFastest Speed: ${capitalize(champ.fastestSpeed.agent)} (${champ.fastestSpeed.value}s)\nMost Calls: ${capitalize(champ.mostCalls.agent)} (${champ.mostCalls.value})\nBest Conv/Day: ${capitalize(champ.bestConvRate.agent)} (${champ.bestConvRate.value})\n\n` : '';
  const url = typeof window !== 'undefined' ? `${window.location.origin}/morning` : '';

  const post = `${dn} RECAP  \u00b7  ${ds}\n${'\u2501'.repeat(27)}\n\n${champBlock}\uD83D\uDCDE  CALLS \u2014 ${agents.reduce((s, a) => s + a.calls, 0)}\n${callsR}\n\n\u23F1  TALK TIME \u2014 ${fmtMin(agents.reduce((s, a) => s + a.talkMin, 0))}\n${talkR}\n\n\u26A1  SPEED\n${speedR}\n\n\uD83C\uDFAF  CONVERSIONS \u2014 ${yd.conversions.total}\n${convR}\n\n\uD83C\uDFE2  TOP ACCOUNTS\n${accts}\n\n\uD83D\uDCDE  MISSED \u2014 ${yd.missedCalls.total}\n\n\uD83C\uDFC6  MTD (day ${data.mtd.dayOfMonth})\n${mtdR}\n${url ? `\n\uD83D\uDCCA ${url}` : ''}`;

  const copy = () => { navigator.clipboard.writeText(post); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: G(12) }}>
        <Label>Auto-generated from live data</Label>
        <button onClick={copy} style={{ padding: `${G(8)}px ${G(16)}px`, borderRadius: 8, border: `1px solid ${T.border}`, background: copied ? T.ink : T.surface, color: copied ? '#fff' : T.ink, fontSize: G(12), fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{copied ? '\u2713 Copied' : 'Copy to clipboard'}</button>
      </div>
      <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 8, padding: G(20), fontSize: G(13), lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: '60vh', overflowY: 'auto', borderLeft: `4px solid ${T.ink}` }}>{post}</div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────

const BASE_STEPS = [
  { key: 'calls', label: 'Calls', num: '01' },
  { key: 'talk', label: 'Talk Time', num: '02' },
  { key: 'speed', label: 'Speed', num: '03' },
  { key: 'conv', label: 'Conversions', num: '04' },
  { key: 'mtd', label: 'MTD Race', num: '05' },
  { key: 'slack', label: 'Slack', num: '06' },
];

export default function MorningDashboard() {
  const searchParams = useSearchParams();
  const mode = (searchParams.get('mode') as LayoutMode) || 'auto';

  const maxW = useSpringValue(MAX_W[mode], 120, 18);
  const pad = useSpringValue(PAD[mode], 150, 20);
  _m = mode;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);

  const fetchData = useCallback(async () => {
    try { const r = await fetch('/api/data?brand=jc'); if (r.ok) setData(await r.json()); }
    catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const steps = useMemo(() => {
    if (data?.prevMonthChampions) return [{ key: 'champions', label: data.prevMonthChampions.month, num: '00' }, ...BASE_STEPS];
    return BASE_STEPS;
  }, [data?.prevMonthChampions]);
  const total = steps.length;

  // Keyboard nav
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setStep(s => Math.min(s + 1, total - 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setStep(s => Math.max(s - 1, 0)); }
      if (e.key === 'p' || e.key === 'P') setAutoPlay(a => !a);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [total]);

  // Auto-advance
  useEffect(() => {
    if (!autoPlay) return;
    const t = setInterval(() => setStep(s => (s + 1) % total), 10_000);
    return () => clearInterval(t);
  }, [autoPlay, total]);

  const todayFull = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Edmonton' });
  const todayDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Edmonton' });
  const pulledAt = data?.pulledAt ? new Date(data.pulledAt).toLocaleTimeString('en-US', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit', hour12: true }) : '';

  if (loading || !data) {
    return <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkMuted, fontSize: 16 }}>Loading...</div>;
  }

  function renderStep() {
    switch (steps[step].key) {
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

  const p = Math.round(pad);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: T.bg, overflowY: 'auto', color: T.ink, fontFamily: "'Inter','Helvetica Neue',system-ui,sans-serif" }}>
      <div style={{ maxWidth: maxW >= 9000 ? '100%' : `${Math.round(maxW)}px`, margin: '0 auto' }}>

        {/* Mode switcher */}
        <div style={{ position: 'fixed', top: G(12), right: G(16), display: 'flex', gap: G(4), zIndex: 60 }}>
          {(['mobile', 'auto', 'tv'] as LayoutMode[]).map(m => (
            <a key={m} href={`/morning${m === 'auto' ? '' : `?mode=${m}`}`}
              style={{ padding: `${G(5)}px ${G(12)}px`, borderRadius: 6, fontSize: G(10), fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, textDecoration: 'none', background: mode === m ? T.ink : T.subtle, color: mode === m ? '#fff' : T.inkFaint, border: `1px solid ${mode === m ? T.ink : T.border}` }}>
              {m === 'tv' ? '16:9' : m === 'mobile' ? 'Mobile' : 'Auto'}
            </a>
          ))}
        </div>

        {/* Header */}
        <header style={{ padding: `${G(28)}px ${p}px ${G(20)}px`, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: Z('sub'), fontWeight: 600, textTransform: 'uppercase', letterSpacing: 3, color: T.inkFaint }}>Jump Contact</div>
              <h1 style={{ fontSize: Z('heading'), fontWeight: 800, margin: `${G(4)}px 0 0`, letterSpacing: -0.8, color: T.ink, lineHeight: 1.15 }}>{todayFull}<br />Morning Meeting</h1>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: Z('date'), color: T.inkMuted }}>{todayDate}</div>
              <div style={{ fontSize: Z('date') * 0.9, color: T.inkFaint }}>Reviewing {dayName(data.yesterdayDate || '')}</div>
              {pulledAt && <div style={{ fontSize: Z('sub'), color: T.inkFaint, marginTop: G(4) }}>Pulled {pulledAt}</div>}
            </div>
          </div>
        </header>

        {/* Tabs */}
        <nav style={{ padding: `${G(10)}px ${p}px`, borderBottom: `1px solid ${T.border}`, overflowX: 'auto', display: 'flex', gap: 0 }}>
          {steps.map((s, i) => (
            <button key={s.key} onClick={() => setStep(i)} style={{ flex: 1, padding: `${G(10)}px ${G(4)}px`, border: 'none', cursor: 'pointer', background: 'transparent', borderBottom: step === i ? `3px solid ${T.ink}` : '3px solid transparent' }}>
              <div style={{ fontSize: Z('tab'), fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: step === i ? T.ink : T.inkFaint, whiteSpace: 'nowrap' }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", marginRight: G(3) }}>{s.num}</span>{s.label}
              </div>
            </button>
          ))}
        </nav>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 2, padding: `0 ${p}px` }}>
          {steps.map((_, i) => <div key={i} style={{ flex: 1, height: G(3), background: i <= step ? T.ink : T.border }} />)}
        </div>

        {/* Content */}
        <main style={{ padding: `${G(24)}px ${p}px ${G(16)}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: G(10), marginBottom: G(20) }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: Z('label'), fontWeight: 700, color: T.inkFaint, background: T.subtle, padding: `${G(4)}px ${G(8)}px`, borderRadius: 4, border: `1px solid ${T.border}` }}>{steps[step].num}</span>
            <h2 style={{ fontSize: Z('stepTitle'), fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>{steps[step].label}</h2>
          </div>
          {renderStep()}
        </main>

        {/* Footer */}
        <footer style={{ padding: `${G(16)}px ${p}px ${G(24)}px`, borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={() => step > 0 && setStep(step - 1)} style={{ padding: `${G(10)}px ${G(20)}px`, borderRadius: 8, fontSize: Z('button'), fontWeight: 600, border: `1px solid ${T.border}`, background: T.surface, color: step === 0 ? T.inkFaint : T.ink, cursor: step === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>&larr; Back</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: G(12) }}>
              <div style={{ display: 'flex', gap: G(6) }}>
                {steps.map((_, i) => <div key={i} onClick={() => setStep(i)} style={{ width: Z('dot'), height: Z('dot'), borderRadius: '50%', cursor: 'pointer', background: i === step ? T.ink : T.border }} />)}
              </div>
              <button onClick={() => setAutoPlay(a => !a)} title={autoPlay ? 'Pause (P)' : 'Auto-play (P)'} style={{ padding: `${G(4)}px ${G(10)}px`, borderRadius: 6, fontSize: Z('sub'), fontWeight: 700, border: `1px solid ${autoPlay ? T.ink : T.border}`, background: autoPlay ? T.ink + '15' : 'transparent', color: autoPlay ? T.ink : T.inkFaint, cursor: 'pointer', fontFamily: 'inherit' }}>
                {autoPlay ? '\u25AE\u25AE' : '\u25B6'}
              </button>
            </div>
            <button onClick={() => step < total - 1 && setStep(step + 1)} style={{ padding: `${G(10)}px ${G(20)}px`, borderRadius: 8, fontSize: Z('button'), fontWeight: 600, border: 'none', background: step === total - 1 ? T.subtle : T.ink, color: step === total - 1 ? T.inkFaint : '#fff', cursor: step === total - 1 ? 'default' : 'pointer', fontFamily: 'inherit' }}>Next &rarr;</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
