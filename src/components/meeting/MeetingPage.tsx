'use client';

import { useEffect, useState, useCallback, Suspense, useMemo } from 'react';
import NavBar from '../NavBar';
import HealthBanner from '../HealthBanner';
import ErrorBoundary from '../ErrorBoundary';
import { C, isMonday, GOAL, fmtSpeed, computePace, capitalize } from '@/lib/constants';
import type { DashboardData, PeriodData } from '@/lib/types';
import { aggregateDays } from './aggregateDays';
import StepCalls from './StepCalls';
import StepSpeed from './StepSpeed';
import StepConversions from './StepConversions';
import StepMTD from './StepMTD';
import { useBrand } from '@/hooks/useBrand';

const JC_STEP_LABELS = ['Calls', 'Speed', 'Conversions', 'MTD + YTD'];
const MIXED_STEP_LABELS = ['Calls', 'Speed'];

/** Main Meeting presentation shell — data fetch, step/tab state, keyboard nav */
function MeetingPageInner() {
  const { brand, isMixed } = useBrand();
  const stepLabels = isMixed ? MIXED_STEP_LABELS : JC_STEP_LABELS;
  const total = stepLabels.length;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [activeDay, setActiveDay] = useState<'today' | 'yesterday' | 'friday' | 'weekend'>(isMonday() ? 'friday' : 'yesterday');
  const [slackCopied, setSlackCopied] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/data?brand=${brand}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [brand]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  const goTo = useCallback((n: number) => { setStep(Math.max(0, Math.min(total - 1, n))); }, [total]);

  // Keyboard nav
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(step + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(step - 1); }
      if (e.key === ' ') { e.preventDefault(); setAutoPlay(p => !p); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [step, goTo]);

  // Auto-advance every 12s (togglable)
  useEffect(() => {
    if (!autoPlay) return;
    const t = setInterval(() => setStep(s => (s + 1) % total), 12_000);
    return () => clearInterval(t);
  }, [total, autoPlay]);

  if (loading || !data) {
    return (
      <>
        <NavBar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="skeleton h-96 rounded-2xl" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <NavBar />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <p style={{ color: '#f87171' }}>Failed to load: {error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ background: C.cyan, color: '#000' }}>Retry</button>
        </div>
      </>
    );
  }

  // Monday mode: show Friday + Weekend tabs
  const monday = isMonday();

  // Resolve which period to display
  let period: PeriodData;
  let periodLabel: string;

  if (activeDay === 'today') {
    period = data.today;
    periodLabel = 'TODAY';
  } else if (activeDay === 'yesterday') {
    period = data.yesterday;
    periodLabel = 'YESTERDAY';
  } else if (activeDay === 'friday' && data.weekend?.friday) {
    period = data.weekend.friday;
    periodLabel = 'FRIDAY';
  } else if (activeDay === 'weekend' && data.weekend) {
    period = aggregateDays([data.weekend.friday, data.weekend.saturday, data.weekend.sunday]);
    periodLabel = 'WEEKEND';
  } else {
    period = data.yesterday;
    periodLabel = activeDay.toUpperCase();
  }

  // ── Slack quick-copy ──────────────────────────────────────────────
  const copySlack = useCallback(async () => {
    if (!data) return;
    const dot = (l: string, v: string, w = 28) => `${l} ${'.'.repeat(Math.max(w - l.length - v.length, 2))} ${v}`;
    const medal = ['🥇', '🥈', '🥉'];
    const monday = isMonday();
    const pLbl = monday ? 'Weekend' : 'Yesterday';
    const p = data.yesterday;
    const { projected, pacePercent } = computePace(data.mtd.total, data.pulledAt);
    const paceEmoji = pacePercent >= 100 ? '🟢' : pacePercent >= 80 ? '🟡' : '🔴';
    const agentLines = p.conversions.byAgent.slice(0, 5)
      .map((a, i) => `${medal[i] || `${i + 1}.`} ${dot(capitalize(a.agent), `*${a.count}*`)}`).join('\n');
    const acctLines = p.conversions.byAccount.slice(0, 5)
      .map((a, i) => `${i + 1}. ${dot(a.account, `${a.count}`)}`).join('\n');
    const speedAgents = [...p.repActivity.agents].filter(a => a.speedSec != null)
      .sort((a, b) => (a.speedSec ?? Infinity) - (b.speedSec ?? Infinity)).slice(0, 3);
    const speedLines = speedAgents.length
      ? speedAgents.map((a, i) => `${medal[i] || `${i + 1}.`} ${dot(capitalize(a.agent), `*${fmtSpeed(a.speedSec)}*`)}`).join('\n')
      : 'No speed data yet';
    const avgLine = p.repActivity.avgSpeedSec != null ? `\n${dot('Team Average', `*${fmtSpeed(p.repActivity.avgSpeedSec)}*`)}` : '';
    const mtdDaily = data.mtd.mtdDaily ?? [];
    const wtd = mtdDaily.length > 0 ? mtdDaily.slice(-7).reduce((s, d) => s + d.total, 0) : 0;
    const wtdLine = wtd > 0 ? `\n${dot('Week-to-Date', `*${wtd}*`)}` : '';
    const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Edmonton' });
    const CLOSING = ["Let's close strong today! 💪", "Make today count! 🔥", "Every call is an opportunity! 📞", "Let's hit our targets! 🎯", "Time to lock in! 🔒", "Stay hungry, stay sharp! ⚡", "Greatness is a choice — choose it today! 🏆"];

    const msg = `🌅 *JUMP CONTACT — MORNING REPORT*\n📅 ${data.date}\n\n━━━━━━━━━━━━━━━━━━━━━\n📊 *CONVERSIONS*\n━━━━━━━━━━━━━━━━━━━━━\n${dot(pLbl, `*${p.conversions.total}*`)}${wtdLine}\n${dot('MTD Total', `*${data.mtd.total}* / ${GOAL}`)}\n${dot('Projected', `*${projected}* ${paceEmoji} (${pacePercent}%)`)}\n\n━━━━━━━━━━━━━━━━━━━━━\n🏆 *AGENT RANKINGS — ${pLbl}*\n━━━━━━━━━━━━━━━━━━━━━\n${agentLines || 'No data yet'}\n\n━━━━━━━━━━━━━━━━━━━━━\n📋 *TOP ACCOUNTS — ${pLbl}*\n━━━━━━━━━━━━━━━━━━━━━\n${acctLines || 'No data yet'}\n\n━━━━━━━━━━━━━━━━━━━━━\n⚡ *SPEED TO LEAD — ${pLbl}*\n━━━━━━━━━━━━━━━━━━━━━\n${speedLines}${avgLine}\n\n━━━━━━━━━━━━━━━━━━━━━\n📞 *MISSED CALLS*  ${p.missedCalls.total}\n━━━━━━━━━━━━━━━━━━━━━\n\n${CLOSING[new Date().getDay() % CLOSING.length]}\n_Generated ${t} MST_`;

    await navigator.clipboard.writeText(msg);
    setSlackCopied(true);
    setTimeout(() => setSlackCopied(false), 2500);
  }, [data]);

  // Map step index to the right component (Mixed skips conversions/MTD)
  const currentLabel = stepLabels[step];

  function renderStep() {
    switch (currentLabel) {
      case 'Calls':
        return <StepCalls period={period} label={periodLabel} data={data!} />;
      case 'Speed':
        return <StepSpeed period={period} label={periodLabel} data={data!} />;
      case 'Conversions':
        return <StepConversions period={period} label={periodLabel} data={data!} />;
      case 'MTD + YTD':
        return <StepMTD data={data!} />;
      default:
        return null;
    }
  }

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <HealthBanner />
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Day Tabs + Auto-play */}
        <div className="flex items-center justify-center gap-2 mb-4 relative">
          {[...(monday ? ['friday', 'weekend'] : []), 'yesterday', 'today'].map(day => (
            <button
              key={day}
              onClick={() => setActiveDay(day as typeof activeDay)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border-none cursor-pointer"
              style={{
                background: activeDay === day ? C.cyan + '22' : 'transparent',
                color: activeDay === day ? C.cyan : C.sub,
                border: activeDay === day ? `1px solid ${C.cyan}44` : '1px solid transparent',
              }}
            >
              {day.charAt(0).toUpperCase() + day.slice(1)}
            </button>
          ))}
          <div className="absolute right-0 flex items-center gap-1.5">
            <button
              onClick={copySlack}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border-none cursor-pointer transition-colors"
              style={{
                background: slackCopied ? '#22c55e22' : 'rgba(139,146,168,0.1)',
                color: slackCopied ? '#22c55e' : C.sub,
                border: `1px solid ${slackCopied ? '#22c55e44' : 'transparent'}`,
              }}
              title="Copy Slack morning report to clipboard"
            >
              {slackCopied ? '✓ Copied' : '📋 Slack'}
            </button>
            <button
              onClick={() => setAutoPlay(p => !p)}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border-none cursor-pointer transition-colors"
              style={{
                background: autoPlay ? C.cyan + '22' : 'rgba(139,146,168,0.1)',
                color: autoPlay ? C.cyan : C.sub,
                border: `1px solid ${autoPlay ? C.cyan + '44' : 'transparent'}`,
              }}
              title={autoPlay ? 'Pause auto-advance (Space)' : 'Resume auto-advance (Space)'}
            >
              {autoPlay ? '\u25AE\u25AE Auto' : '\u25B6 Auto'}
            </button>
          </div>
        </div>

        {/* Step Tabs */}
        <div className="flex items-center justify-center gap-1 mb-6">
          {stepLabels.map((label, i) => (
            <button
              key={label}
              onClick={() => goTo(i)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border-none cursor-pointer"
              style={{
                background: step === i ? C.cyan + '22' : 'transparent',
                color: step === i ? C.text : C.sub,
                border: step === i ? `1px solid ${C.cyan}44` : '1px solid transparent',
              }}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        {/* Step Content */}
        <ErrorBoundary section={currentLabel}>
          {renderStep()}
        </ErrorBoundary>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 mb-12">
          <button
            onClick={() => goTo(step - 1)}
            disabled={step === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors border-none cursor-pointer"
            style={{
              background: step > 0 ? 'rgba(139,146,168,0.12)' : 'transparent',
              color: step > 0 ? C.text : C.sub,
            }}
          >
            &larr; Back
          </button>
          <div className="flex gap-1.5">
            {stepLabels.map((_, i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full transition-colors cursor-pointer"
                style={{ background: step === i ? C.cyan : 'rgba(139,146,168,0.2)' }}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
          <button
            onClick={() => goTo(step + 1)}
            disabled={step === total - 1}
            className="px-4 py-2 rounded-lg text-sm font-bold transition-colors border-none cursor-pointer"
            style={{
              background: step < total - 1 ? C.cyan : 'transparent',
              color: step < total - 1 ? '#0A0E1A' : C.sub,
            }}
          >
            Next &rarr;
          </button>
        </div>
      </div>
    </>
  );
}

export default function MeetingPage() {
  return (
    <Suspense fallback={<><NavBar /><div className="max-w-4xl mx-auto px-4 py-8"><div className="skeleton h-96 rounded-2xl" /></div></>}>
      <MeetingPageInner />
    </Suspense>
  );
}
