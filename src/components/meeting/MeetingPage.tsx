'use client';

import { useEffect, useState, useCallback } from 'react';
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

const STEP_LABELS = ['Calls', 'Talk Time', 'Speed', 'Conversions', 'MTD Race', 'Slack Post'];
const TOTAL = 6;

/** Main Meeting presentation shell — data fetch, step/tab state, keyboard nav */
export default function MeetingPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [activeDay, setActiveDay] = useState<'today' | 'yesterday' | 'friday' | 'weekend'>('yesterday');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const goTo = useCallback((n: number) => { setStep(Math.max(0, Math.min(TOTAL - 1, n))); }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(step + 1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goTo(step - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, goTo]);

  if (loading) {
    return (
      <>
        <NavBar />
        <div className="max-w-[640px] mx-auto px-5 py-6">
          <div className="skeleton h-12 rounded-xl mb-4" />
          <div className="skeleton h-32 rounded-2xl mb-4" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <NavBar />
        <div className="max-w-[640px] mx-auto px-5 py-20 text-center">
          <p style={{ color: '#f87171' }}>Failed to load: {error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ background: C.cyan, color: '#000' }}>Retry</button>
        </div>
      </>
    );
  }

  const monday = isMonday();
  let period: PeriodData;
  let label: string;

  if (activeDay === 'today') {
    period = data.today;
    label = 'Today';
  } else if (activeDay === 'friday' && monday && data.weekend) {
    period = data.weekend.friday;
    label = 'Friday';
  } else if (activeDay === 'weekend' && monday && data.weekend) {
    period = aggregateDays([data.weekend.saturday, data.weekend.sunday]);
    label = 'Weekend';
  } else {
    period = data.yesterday;
    label = 'Yesterday';
  }

  function renderStep() {
    switch (step) {
      case 0: return <StepCalls period={period} label={label} />;
      case 1: return <StepTalkTime period={period} label={label} />;
      case 2: return <StepSpeed period={period} label={label} />;
      case 3: return <StepConversions period={period} label={label} />;
      case 4: return <StepMTD data={data!} />;
      case 5: return <StepSlack data={data!} />;
      default: return null;
    }
  }

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <div className="max-w-[640px] mx-auto px-5 pb-24">
        {/* Step tab bar */}
        <div className="flex items-center gap-2 mb-4 pt-4">
          <div className="flex gap-1 overflow-x-auto pb-1 flex-1">
            {STEP_LABELS.map((lbl, i) => (
              <button key={i} onClick={() => goTo(i)} className="shrink-0 px-3 py-1.5 rounded-lg border-none text-[13px] cursor-pointer transition-all whitespace-nowrap"
                style={{
                  background: step === i ? C.cyan : 'rgba(255,255,255,0.05)',
                  color: step === i ? '#0A0E1A' : C.sub,
                  fontWeight: step === i ? 700 : 500,
                }}>
                {i + 1}. {lbl}
              </button>
            ))}
          </div>
          <div className="flex gap-1 shrink-0">
            {(monday
              ? [{ key: 'today', label: 'Today' }, { key: 'friday', label: 'Friday' }, { key: 'weekend', label: 'Weekend' }]
              : [{ key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' }]
            ).map(d => (
              <button key={d.key} onClick={() => setActiveDay(d.key as typeof activeDay)} className="px-2.5 py-1 rounded-md border-none text-xs cursor-pointer"
                style={{
                  background: activeDay === d.key ? C.lime : 'rgba(255,255,255,0.06)',
                  color: activeDay === d.key ? '#0A0E1A' : C.sub,
                  fontWeight: 600,
                }}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Step content */}
        <ErrorBoundary section={`Meeting Step: ${STEP_LABELS[step]}`}>
          <div key={`${step}-${activeDay}`}>{renderStep()}</div>
        </ErrorBoundary>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t" style={{ background: 'rgba(10,14,26,0.82)', backdropFilter: 'blur(20px)', borderColor: C.border }}>
        <div className="max-w-[640px] mx-auto flex items-center justify-between px-5 py-3">
          <button onClick={() => goTo(step - 1)} disabled={step === 0}
            className="px-5 py-2 rounded-lg border text-sm font-semibold cursor-pointer"
            style={{ background: C.card, borderColor: C.border, color: step === 0 ? C.sub : C.text, opacity: step === 0 ? 0.4 : 1 }}>
            ← Back
          </button>
          <div className="flex gap-1.5 items-center">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <button key={i} onClick={() => goTo(i)} className="border-none cursor-pointer p-0 transition-all duration-200"
                style={{ width: i === step ? '20px' : '7px', height: '7px', borderRadius: '4px', background: i === step ? C.cyan : C.border }} />
            ))}
          </div>
          {step < TOTAL - 1 ? (
            <button onClick={() => goTo(step + 1)} className="px-5 py-2 rounded-lg border-none text-sm font-semibold cursor-pointer"
              style={{ background: C.cyan, color: '#0A0E1A' }}>
              Next →
            </button>
          ) : (
            <button onClick={() => goTo(0)} className="px-5 py-2 rounded-lg border-none text-sm font-bold cursor-pointer"
              style={{ background: C.lime, color: '#0A0E1A' }}>
              ↩ Restart
            </button>
          )}
        </div>
      </div>
    </>
  );
}
