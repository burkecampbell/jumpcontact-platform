'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';
import { C } from '@/lib/constants';

// ── Types ──────────────────────────────────────────────────────────────────

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
  maxDate?: string; // YYYY-MM-DD
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toDate(s: string) { return new Date(s + 'T12:00:00'); }
function fmt(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(s: string, n: number) {
  const d = toDate(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

function startOfWeek(s: string) {
  const d = toDate(s);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - ((day + 6) % 7)); // Monday
  return fmt(d);
}

function startOfMonth(s: string) {
  return s.slice(0, 8) + '01';
}

function endOfMonth(s: string) {
  const d = toDate(s.slice(0, 8) + '01');
  d.setMonth(d.getMonth() + 1);
  d.setDate(d.getDate() - 1);
  return fmt(d);
}

function isSame(a: string, b: string) { return a === b; }
function isBefore(a: string, b: string) { return a < b; }
function isAfter(a: string, b: string) { return a > b; }
function isBetween(d: string, from: string, to: string) {
  return d >= from && d <= to;
}

function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000);
}

function formatDisplay(range: DateRange): string {
  if (isSame(range.from, range.to)) {
    return toDate(range.from).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      timeZone: 'America/Edmonton',
    });
  }
  const f = toDate(range.from);
  const t = toDate(range.to);
  const sameYear = f.getFullYear() === t.getFullYear();
  const fromStr = f.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'America/Edmonton',
  });
  const toStr = t.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'America/Edmonton',
  });
  return `${fromStr} - ${toStr}`;
}

// ── Presets ─────────────────────────────────────────────────────────────────

function getPresets(today: string): { label: string; range: DateRange }[] {
  const yesterday = addDays(today, -1);
  const weekStart = startOfWeek(today);
  const lastWeekEnd = addDays(weekStart, -1);
  const lastWeekStart = addDays(lastWeekEnd, -6);
  const monthStart = startOfMonth(today);
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = startOfMonth(fmt(toDate(lastMonthEnd)));

  return [
    { label: 'Today',      range: { from: today, to: today } },
    { label: 'Yesterday',  range: { from: yesterday, to: yesterday } },
    { label: 'Last 7 days', range: { from: addDays(today, -6), to: today } },
    { label: 'This week',  range: { from: weekStart, to: today } },
    { label: 'Last week',  range: { from: lastWeekStart, to: lastWeekEnd } },
    { label: 'This month', range: { from: monthStart, to: today } },
    { label: 'Last month', range: { from: lastMonthStart, to: lastMonthEnd } },
    { label: 'Last 30 days', range: { from: addDays(today, -29), to: today } },
  ];
}

// ── Calendar Month Grid ────────────────────────────────────────────────────

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function CalendarMonth({
  year, month, rangeStart, rangeEnd, hoverDate, maxDate,
  onDayClick, onDayHover,
}: {
  year: number;
  month: number; // 0-indexed
  rangeStart: string | null;
  rangeEnd: string | null;
  hoverDate: string | null;
  maxDate: string;
  onDayClick: (d: string) => void;
  onDayHover: (d: string | null) => void;
}) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday = 0, Sunday = 6
  const startDow = (firstDay.getDay() + 6) % 7;

  const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const effectiveEnd = rangeEnd || hoverDate;
  let selFrom = rangeStart;
  let selTo = effectiveEnd;
  if (selFrom && selTo && isAfter(selFrom, selTo)) {
    [selFrom, selTo] = [selTo, selFrom];
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="flex-1 min-w-[260px]">
      <div className="text-center text-sm font-semibold mb-3" style={{ color: C.text }}>
        {monthLabel}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-medium pb-1.5" style={{ color: C.sub }}>
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="h-8" />;
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const disabled = isAfter(dateStr, maxDate);
          const isStart = selFrom && isSame(dateStr, selFrom);
          const isEnd = selTo && isSame(dateStr, selTo);
          const inRange = selFrom && selTo && isBetween(dateStr, selFrom, selTo);
          const isToday = isSame(dateStr, maxDate);

          let bg: string = 'transparent';
          let textColor: string = C.text;
          let fontWeight = '400';
          let borderRadius = '6px';

          if (disabled) {
            textColor = C.sub + '55';
          } else if (isStart || isEnd) {
            bg = C.cyan;
            textColor = '#0A0E1A';
            fontWeight = '700';
            borderRadius = isStart && isEnd ? '6px' : isStart ? '6px 0 0 6px' : '0 6px 6px 0';
          } else if (inRange) {
            bg = C.cyan + '22';
            textColor = C.text;
            borderRadius = '0';
          }

          return (
            <button
              key={dateStr}
              disabled={disabled}
              onClick={() => onDayClick(dateStr)}
              onMouseEnter={() => !disabled && onDayHover(dateStr)}
              onMouseLeave={() => onDayHover(null)}
              className="h-8 w-full flex items-center justify-center text-xs transition-colors cursor-pointer border-none"
              style={{
                background: bg,
                color: textColor,
                fontWeight,
                borderRadius,
                fontFamily: 'var(--font-mono, monospace)',
                opacity: disabled ? 0.3 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                ...(isToday && !isStart && !isEnd ? { boxShadow: `inset 0 0 0 1px ${C.cyan}66` } : {}),
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function DateRangePicker({ value, onChange, maxDate }: Props) {
  const today = maxDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<'idle' | 'start'>('idle');
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Two months to display — left month, right month
  const [viewDate, setViewDate] = useState(() => {
    const d = toDate(value.to || today);
    // Show current month on the right
    d.setMonth(d.getMonth() - 1);
    return fmt(d);
  });

  const leftYear = toDate(viewDate).getFullYear();
  const leftMonth = toDate(viewDate).getMonth();
  const rightDate = new Date(leftYear, leftMonth + 1, 1);
  const rightYear = rightDate.getFullYear();
  const rightMonth = rightDate.getMonth();

  const presets = useMemo(() => getPresets(today), [today]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSelecting('idle');
        setRangeStart(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setSelecting('idle');
        setRangeStart(null);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const navigateMonth = useCallback((dir: -1 | 1) => {
    const d = toDate(viewDate);
    d.setMonth(d.getMonth() + dir);
    setViewDate(fmt(d));
  }, [viewDate]);

  const handleDayClick = useCallback((dateStr: string) => {
    if (selecting === 'idle') {
      // First click — start selecting
      setRangeStart(dateStr);
      setSelecting('start');
    } else {
      // Second click — complete the range
      let from = rangeStart!;
      let to = dateStr;
      if (isAfter(from, to)) [from, to] = [to, from];
      onChange({ from, to });
      setSelecting('idle');
      setRangeStart(null);
      setOpen(false);
    }
  }, [selecting, rangeStart, onChange]);

  const handlePreset = useCallback((range: DateRange) => {
    onChange(range);
    setSelecting('idle');
    setRangeStart(null);
    setOpen(false);
  }, [onChange]);

  // Count of days in current selection
  const days = daysBetween(value.from, value.to) + 1;
  const displayText = formatDisplay(value);

  // Active preset detection
  const activePreset = presets.find(
    p => p.range.from === value.from && p.range.to === value.to
  )?.label;

  return (
    <div ref={ref} className="relative" style={{ zIndex: 50 }}>
      {/* Trigger Button */}
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) {
            setSelecting('idle');
            setRangeStart(null);
            // Position calendar to show the current range
            const d = toDate(value.to || today);
            d.setMonth(d.getMonth() - 1);
            setViewDate(fmt(d));
          }
        }}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 border transition-all cursor-pointer"
        style={{
          background: open ? C.cyan + '15' : C.card,
          borderColor: open ? C.cyan + '66' : C.cyan + '44',
          color: C.text,
        }}
      >
        <Calendar size={14} style={{ color: C.cyan }} />
        <span className="text-xs font-semibold" style={{ color: C.text }}>
          {displayText}
        </span>
        {days > 1 && (
          <span
            className="text-[10px] font-mono rounded-md px-1.5 py-0.5"
            style={{ background: C.cyan + '22', color: C.cyan }}
          >
            {days}d
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          className="absolute top-full left-0 mt-2 rounded-xl border shadow-2xl"
          style={{
            background: '#0f1320',
            borderColor: C.border,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
            minWidth: '640px',
          }}
        >
          <div className="flex">
            {/* Presets sidebar */}
            <div
              className="w-[150px] p-3 flex flex-col gap-1 border-r"
              style={{ borderColor: C.border }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.sub }}>
                Quick select
              </div>
              {presets.map(p => (
                <button
                  key={p.label}
                  onClick={() => handlePreset(p.range)}
                  className="text-left px-2.5 py-1.5 rounded-md text-xs transition-colors border-none cursor-pointer"
                  style={{
                    background: activePreset === p.label ? C.cyan + '22' : 'transparent',
                    color: activePreset === p.label ? C.cyan : C.sub,
                    fontWeight: activePreset === p.label ? '600' : '400',
                  }}
                  onMouseEnter={e => {
                    if (activePreset !== p.label) {
                      (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                      (e.target as HTMLElement).style.color = C.text;
                    }
                  }}
                  onMouseLeave={e => {
                    if (activePreset !== p.label) {
                      (e.target as HTMLElement).style.background = 'transparent';
                      (e.target as HTMLElement).style.color = C.sub;
                    }
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Calendars */}
            <div className="flex-1 p-4">
              {/* Navigation header */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => navigateMonth(-1)}
                  className="p-1 rounded-md transition-colors border-none cursor-pointer"
                  style={{ background: 'transparent', color: C.sub }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; }}
                >
                  <ChevronLeft size={16} />
                </button>

                {selecting === 'start' && (
                  <div className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: C.cyan + '22', color: C.cyan }}>
                    Select end date
                  </div>
                )}

                <button
                  onClick={() => navigateMonth(1)}
                  className="p-1 rounded-md transition-colors border-none cursor-pointer"
                  style={{ background: 'transparent', color: C.sub }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Two month grids */}
              <div className="flex gap-6">
                <CalendarMonth
                  year={leftYear}
                  month={leftMonth}
                  rangeStart={selecting === 'start' ? rangeStart : value.from}
                  rangeEnd={selecting === 'start' ? null : value.to}
                  hoverDate={selecting === 'start' ? hoverDate : null}
                  maxDate={today}
                  onDayClick={handleDayClick}
                  onDayHover={setHoverDate}
                />
                <div style={{ width: 1, background: C.border }} />
                <CalendarMonth
                  year={rightYear}
                  month={rightMonth}
                  rangeStart={selecting === 'start' ? rangeStart : value.from}
                  rangeEnd={selecting === 'start' ? null : value.to}
                  hoverDate={selecting === 'start' ? hoverDate : null}
                  maxDate={today}
                  onDayClick={handleDayClick}
                  onDayHover={setHoverDate}
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t" style={{ borderColor: C.border }}>
                <div className="text-xs" style={{ color: C.sub }}>
                  {selecting === 'start' ? (
                    <span>
                      Started: <span style={{ color: C.cyan, fontFamily: 'var(--font-mono)' }}>{rangeStart}</span>
                    </span>
                  ) : (
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {value.from} &rarr; {value.to}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {selecting === 'start' && (
                    <button
                      onClick={() => { setSelecting('idle'); setRangeStart(null); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border-none cursor-pointer"
                      style={{ background: 'rgba(255,255,255,0.05)', color: C.sub }}
                    >
                      <X size={12} /> Cancel
                    </button>
                  )}
                  <button
                    onClick={() => { setOpen(false); setSelecting('idle'); setRangeStart(null); }}
                    className="px-3 py-1 rounded-md text-xs font-medium border-none cursor-pointer"
                    style={{ background: C.cyan, color: '#0A0E1A' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
