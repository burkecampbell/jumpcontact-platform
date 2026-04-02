'use client';

import { useEffect, useState, useCallback, Suspense, useMemo } from 'react';
import NavBar from '../NavBar';
import ErrorBoundary from '../ErrorBoundary';
import { C, isMonday } from '@/lib/constants';
import type { DashboardData, PeriodData } from '@/lib/types';
import { aggregateDays } from './aggregateDays';
import StepCalls from './StepCalls';
import StepTalkTime from './StepTalkTime';
import StepSpeed from './StepSpeed';
import StepConversions from './StepConversions';
import StepMTD from './StepMTD';
import StepSlack from './StepSlack';
import { useBrand } from '@/hooks/useBrand';

const JC_STEP_LABELS = ['Calls', 'Talk Time', 'Speed', 'Conversions', 'MTD Race', 'Slack Post'];
const MIXED_STEP_LABELS = ['Calls', 'Talk Time', 'Speed', 'Slack Post']; // No conversions in Mixed

/** Main Meeting presentation shell — data fetch, step/tab state, keyboard nav */
function MeetingPageInner() {
  const { brand, isMixed } = useBrand();
  const stepLabels = isMixed ? MIXED_STEP_LABELS : JC_STEP_LABELS;
  const total = stepLabels.length;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [activeDay, setActiveDay] = useState<'today' | 'yesterday' | 'friday' | 'weekend'>('yesterday');

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
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goTo(step + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(step - 1); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [step, goTo]);

  // Auto-advance every 12s
  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % total), 12_000);
    return () => clearInterval(t);
  }, [total]);

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
  } else {
    period = data.yesterday;
    periodLabel = activeDay.toUpperCase();
  }

  // Map step index to the right component (Mixed skips conversions/MTD)
  const currentLabel = stepLabels[step];

  function renderStep() {
    switch (currentLabel) {
      case 'Calls':
        return <StepCalls period={period} label={periodLabel} />;
      case 'Talk Time':
        return <StepTalkTime period={period} label={periodLabel} />;
      case 'Speed':
        return <StepSpeed period={period} label={periodLabel} />;
      case 'Conversions':
        return <StepConversions period={period} label={periodLabel} />;
      case 'MTD Race':
        return <StepMTD data={data!} />;
      case 'Slack Post':
        return <StepSlack data={data!} />;
      default:
        return null;
    }
  }

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Day Tabs */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {['today', 'yesterday', ...(monday ? ['friday', 'weekend'] : [])].map(day => (
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
        <div className="flex items-center justify-between mt-6">
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
