'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import type { DashboardData, PeriodData } from '@/lib/types';
import { isMonday } from '@/lib/constants';
import { T, Z, G, setMode, getMode, SIDEBAR_W, PAD, type LayoutMode } from './theme';
import { TopBar } from './TopBar';
import { Sidebar, type StepDef } from './Sidebar';
import { MtdStrip } from './MtdStrip';
import { StepCalls } from './StepCalls';
import { StepTalk } from './StepTalk';
import { StepSpeed } from './StepSpeed';
import { StepConversions } from './StepConversions';
import { StepMTD } from './StepMTD';
import { StepChampions } from './StepChampions';
import { aggregateDays } from '@/components/meeting/aggregateDays';

// ── Step definitions ───────────────────────────────────────────────
const BASE_STEPS: StepDef[] = [
  { key: 'calls', label: 'Calls', num: '01' },
  { key: 'talk', label: 'Talk Time', num: '02' },
  { key: 'speed', label: 'Speed', num: '03' },
  { key: 'conv', label: 'Conversions', num: '04' },
  { key: 'mtd', label: 'MTD Race', num: '05' },
];

const MONDAY_STEPS: StepDef[] = [
  { key: 'friday', label: 'Friday', num: '01' },
  { key: 'weekend', label: 'Weekend', num: '02' },
  { key: 'speed', label: 'Speed', num: '03' },
  { key: 'mtd', label: 'MTD Race', num: '04' },
];

// ── TV overlay (time + autoplay) ───────────────────────────────────
function TvOverlay({ autoPlay, pulledAt }: { autoPlay: boolean; pulledAt: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  const time = now.toLocaleTimeString('en-US', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit', hour12: true });
  return (
    <div style={{
      position: 'fixed', top: G(16), right: G(20), zIndex: 70,
      display: 'flex', alignItems: 'center', gap: G(12),
      padding: `${G(8)}px ${G(16)}px`, borderRadius: 12,
      background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)',
      border: `1px solid ${T.border}`,
    }}>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: Z('body'), fontWeight: 600, color: T.ink }}>{time}</span>
      <span style={{ fontSize: Z('sub'), color: T.inkFaint }}>{pulledAt}</span>
      {autoPlay && <span style={{ fontSize: Z('sub'), color: T.positive, fontWeight: 700 }}>LIVE</span>}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────
export default function MorningDashboard() {
  const searchParams = useSearchParams();
  const mode = (searchParams.get('mode') as LayoutMode) || 'auto';
  setMode(mode);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(mode === 'tv');

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch('/api/data?brand=jc');
      if (r.ok) setData(await r.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build step list — Monday gets Friday + Weekend, other days get normal steps
  const monday = isMonday();
  const steps = useMemo(() => {
    const base = monday ? MONDAY_STEPS : BASE_STEPS;
    if (data?.prevMonthChampions) {
      return [{ key: 'champions', label: data.prevMonthChampions.month, num: '00' }, ...base];
    }
    return base;
  }, [data?.prevMonthChampions, monday]);
  const total = steps.length;

  // Keyboard nav
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setStep(s => Math.min(s + 1, total - 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setStep(s => Math.max(s - 1, 0)); }
      if (e.key === 'p' || e.key === 'P') setAutoPlay(a => !a);
      // Number keys jump to steps
      const n = parseInt(e.key);
      if (!isNaN(n) && n >= 0 && n < total) setStep(n);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [total]);

  // Auto-advance
  useEffect(() => {
    if (!autoPlay) return;
    const t = setInterval(() => setStep(s => (s + 1) % total), mode === 'tv' ? 12_000 : 10_000);
    return () => clearInterval(t);
  }, [autoPlay, total, mode]);

  const pulledAt = data?.pulledAt
    ? new Date(data.pulledAt).toLocaleTimeString('en-US', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit', hour12: true })
    : '';

  // Must call ALL hooks before any early return (Rules of Hooks)
  const weekendPeriod = useMemo(() => {
    if (!data?.weekend) return null;
    return aggregateDays([data.weekend.friday, data.weekend.saturday, data.weekend.sunday]);
  }, [data?.weekend]);

  // ── Loading state ────────────────────────────────────────────────
  if (loading || !data) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50, background: T.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: T.inkMuted, fontSize: 16,
      }}>Loading...</div>
    );
  }

  // ── Resolve period data for current context ──────────────────────
  const yesterdayPeriod = data!.yesterday;
  const fridayPeriod = data!.weekend?.friday;

  // ── Render step content ──────────────────────────────────────────
  function renderStep() {
    switch (steps[step]?.key) {
      case 'champions':
        return data!.prevMonthChampions ? <StepChampions champions={data!.prevMonthChampions} /> : null;

      // Normal day steps (Tue-Sun)
      case 'calls': return <StepCalls period={yesterdayPeriod} />;
      case 'talk': return <StepTalk period={yesterdayPeriod} />;
      case 'speed': return <StepSpeed period={yesterdayPeriod} data={data!} />;
      case 'conv': return <StepConversions period={yesterdayPeriod} data={data!} />;

      // Monday steps
      case 'friday':
        if (!fridayPeriod) return <StepConversions period={yesterdayPeriod} data={data!} label="Friday" />;
        return (
          <div>
            <StepConversions period={fridayPeriod} data={data!} label="Friday" />
            <div style={{ height: 1, background: T.border, margin: `${G(24)}px 0` }} />
            <StepCalls period={fridayPeriod} label="Friday" />
          </div>
        );
      case 'weekend':
        if (!weekendPeriod) return <StepCalls period={yesterdayPeriod} label="Weekend" />;
        return (
          <div>
            <StepConversions period={weekendPeriod} data={data!} label="Weekend (Sat+Sun)" />
            <div style={{ height: 1, background: T.border, margin: `${G(24)}px 0` }} />
            <StepCalls period={weekendPeriod} label="Weekend (Sat+Sun)" />
          </div>
        );

      case 'mtd': return <StepMTD data={data!} />;
      default: return null;
    }
  }

  const sidebarW = SIDEBAR_W[mode];
  const pad = PAD[mode];

  // ── TV layout ────────────────────────────────────────────────────
  if (mode === 'tv') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50, background: T.bg, overflow: 'hidden',
        color: T.ink, fontFamily: "'Inter','Helvetica Neue',system-ui,sans-serif",
      }}>
        <TvOverlay autoPlay={autoPlay} pulledAt={pulledAt} />
        <Sidebar steps={steps} current={step} onSelect={setStep} autoPlay={autoPlay} onToggleAutoPlay={() => setAutoPlay(a => !a)} />

        {/* TV header */}
        <div style={{ padding: `24px 80px 16px` }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 4, color: T.inkFaint }}>
            Jump Contact
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 4 }}>
            <h1 style={{ fontSize: Z('heading'), fontWeight: 800, margin: 0, letterSpacing: -1, color: T.ink }}>
              {steps[step].label}
            </h1>
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: Z('label'),
              fontWeight: 700, color: T.inkFaint, background: T.subtle,
              padding: '3px 8px', borderRadius: 4,
            }}>{steps[step].num}</span>
          </div>
        </div>

        {/* TV content */}
        <main style={{ padding: '8px 80px 32px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            {renderStep()}
          </div>
        </main>

        {/* TV progress bar */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', gap: 2, padding: '0 20px 8px' }}>
          {steps.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? T.ink : T.border, transition: 'background 0.3s' }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Mobile layout ────────────────────────────────────────────────
  if (mode === 'mobile') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50, background: T.bg, overflow: 'hidden',
        color: T.ink, fontFamily: "'Inter','Helvetica Neue',system-ui,sans-serif",
        display: 'flex', flexDirection: 'column',
      }}>
        <TopBar data={data} mode={mode} />
        <MtdStrip data={data} />

        {/* Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: `${pad}px`, paddingBottom: 72 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: G(8), marginBottom: G(16) }}>
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: Z('label'),
              fontWeight: 700, color: T.inkFaint, background: T.subtle,
              padding: `${G(3)}px ${G(7)}px`, borderRadius: 4,
              border: `1px solid ${T.border}`,
            }}>{steps[step].num}</span>
            <h2 style={{ fontSize: Z('stepTitle'), fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>
              {steps[step].label}
            </h2>
          </div>
          {renderStep()}
        </main>

        {/* Bottom nav */}
        <Sidebar steps={steps} current={step} onSelect={setStep} autoPlay={autoPlay} onToggleAutoPlay={() => setAutoPlay(a => !a)} />
      </div>
    );
  }

  // ── Desktop layout ───────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50, background: T.bg, overflow: 'hidden',
      color: T.ink, fontFamily: "'Inter','Helvetica Neue',system-ui,sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      <TopBar data={data} mode={mode} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar */}
        <Sidebar steps={steps} current={step} onSelect={setStep} autoPlay={autoPlay} onToggleAutoPlay={() => setAutoPlay(a => !a)} />

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <MtdStrip data={data} />

          <main style={{ flex: 1, overflowY: 'auto', padding: `${G(24)}px ${pad}px ${G(16)}px` }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: G(10), marginBottom: G(20) }}>
                <span style={{
                  fontFamily: "'JetBrains Mono',monospace", fontSize: Z('label'),
                  fontWeight: 700, color: T.inkFaint, background: T.subtle,
                  padding: `${G(4)}px ${G(8)}px`, borderRadius: 4,
                  border: `1px solid ${T.border}`,
                }}>{steps[step].num}</span>
                <h2 style={{ fontSize: Z('stepTitle'), fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>
                  {steps[step].label}
                </h2>
              </div>
              {renderStep()}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
