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
import StepPickupRate from './StepPickupRate';
import StepConversions from './StepConversions';
import StepMTD from './StepMTD';
import { useBrand } from '@/hooks/useBrand';

// Meeting cadence matches Burke's speaking flow:
// "Yesterday's numbers" → Speed → Pickup Rate → Conversions → MTD
const JC_STEP_LABELS = ['Calls', 'Speed', 'Pickup Rate', 'Conversions', 'MTD'];
const MIXED_STEP_LABELS = ['Calls', 'Speed', 'Pickup Rate'];

/** Main Meeting presentation shell — data fetch, step/tab state, keyboard nav */
function MeetingPageInner() {
  const { brand, isMixed, fullName: brandName } = useBrand();
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

    // Calls section — ranked by volume (matches meeting step 1)
    const callAgents = [...p.repActivity.agents].sort((a, b) => b.calls - a.calls).slice(0, 8);
    const callLines = callAgents
      .map((a, i) => `${medal[i] || `${i + 1}.`} ${dot(capitalize(a.agent), `*${a.calls} calls* (${a.talkMin ? Math.round(a.talkMin) + 'm' : '0m'})`)}`).join('\n');

    // Pickup rate section — ranked by rate (matches meeting step 3)
    const pickupAgents = [...p.repActivity.agents].filter(a => (a.reservationsCreated ?? 0) > 0)
      .sort((a, b) => (b.pickupRate ?? 0) - (a.pickupRate ?? 0));
    const totalOffered = p.repActivity.agents.reduce((s, a) => s + (a.reservationsCreated ?? 0), 0);
    const totalCaught = p.repActivity.agents.reduce((s, a) => s + (a.reservationsAccepted ?? 0), 0);
    const teamPickup = totalOffered > 0 ? Math.round((totalCaught / totalOffered) * 1000) / 10 : null;
    const pickupLines = pickupAgents.length > 0
      ? pickupAgents.map((a, i) => `${medal[i] || `${i + 1}.`} ${dot(capitalize(a.agent), `*${a.pickupRate}%* (${a.reservationsAccepted}/${a.reservationsCreated})`)}`).join('\n')
      : 'No pickup data';

    const msg = [
      `🌅 *${brandName.toUpperCase()} — MORNING REPORT*`,
      `📅 ${data.date}`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `📞 *CALLS — ${pLbl}*`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      callLines || 'No data yet',
      ``,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `⚡ *SPEED — ${pLbl}*`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      speedLines,
      avgLine,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `🎯 *PICKUP RATE — ${pLbl}*`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      teamPickup != null ? dot('Team', `*${teamPickup}%* (${totalCaught}/${totalOffered})`) : '',
      pickupLines,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `📊 *CONVERSIONS — ${pLbl}*`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      dot(pLbl, `*${p.conversions.total}*`),
      agentLines || 'No data yet',
      ``,
      acctLines ? `📋 *Top Accounts*\n${acctLines}` : '',
      ``,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `📈 *MTD PACE*`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      dot('MTD Total', `*${data.mtd.total}* / ${GOAL}`),
      dot('Projected', `*${projected}* ${paceEmoji} (${pacePercent}%)`),
      wtdLine,
      ``,
      p.missedCalls.total > 0 ? `📵 *Missed Calls:* ${p.missedCalls.total}` : '',
      ``,
      CLOSING[new Date().getDay() % CLOSING.length],
      `_Generated ${t} MST_`,
    ].filter(Boolean).join('\n');

    await navigator.clipboard.writeText(msg);
    setSlackCopied(true);
    setTimeout(() => setSlackCopied(false), 2500);
  }, [data]);

  // ── Download conversions report (ExcelJS, JC Document Standards) ──
  const downloadReport = useCallback(async () => {
    if (!data) return;
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Jump Contact';

    const JC_TEAL = '3BA5B5';
    const JC_DARK = '2C3E50';
    const JC_TEXT = '1A1A1A';
    const JC_LABEL = '495057';
    const JC_BG = 'F8F9FA';
    const JC_BORDER = 'DEE2E6';
    const WHITE = 'FFFFFF';
    const thin = (c: string) => ({ style: 'thin' as const, color: { argb: c } });
    const docBorder = { bottom: thin(JC_BORDER), right: thin(JC_BORDER), left: thin(JC_BORDER), top: thin(JC_BORDER) };

    const mtd = data.mtd;
    const byAccount = mtd.byAccount ?? [];
    const agents = mtd.byAgent.map(a => a.agent);
    const cap = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
    const dom = mtd.dayOfMonth || 1;
    const dim = mtd.daysInMonth || 30;
    const dateStr = data.date || new Date().toISOString().slice(0, 10);
    const monthName = new Date(dateStr + 'T12:00:00').toLocaleString('en-US', { month: 'long', timeZone: 'America/Edmonton' });
    const year = new Date(dateStr + 'T12:00:00').getFullYear();

    // ── Sheet 1: Agent Leaderboard ──
    const ws1 = wb.addWorksheet('Agent Leaderboard', {
      views: [{ state: 'frozen', ySplit: 8 }],
      properties: { tabColor: { argb: JC_TEAL } },
    });
    ws1.columns = [{ width: 5 }, { width: 16 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }];

    // Title bar
    ws1.mergeCells('A1:I1');
    ws1.getCell('A1').value = 'JUMP CONTACT';
    ws1.getCell('A1').font = { name: 'Arial', size: 20, bold: true, color: { argb: WHITE } };
    ws1.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: JC_DARK } };
    ws1.getCell('A1').border = { bottom: { style: 'medium', color: { argb: JC_TEAL } } };
    ws1.getRow(1).height = 36;

    ws1.mergeCells('A2:I2');
    ws1.getCell('A2').value = `Conversions Report — ${monthName} ${year}`;
    ws1.getCell('A2').font = { name: 'Arial', size: 12, bold: true, color: { argb: JC_DARK } };

    // Summary strip
    const infoFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: JC_BG } };
    ws1.getCell('A4').value = 'Total Conversions'; ws1.getCell('A4').font = { name: 'Arial', size: 11, bold: true, color: { argb: JC_LABEL } };
    ws1.getCell('B4').value = mtd.total; ws1.getCell('B4').font = { name: 'Arial', size: 13, bold: true, color: { argb: JC_TEXT } };
    ws1.getCell('D4').value = 'Clients'; ws1.getCell('D4').font = { name: 'Arial', size: 11, bold: true, color: { argb: JC_LABEL } };
    ws1.getCell('E4').value = byAccount.length; ws1.getCell('E4').font = { name: 'Arial', size: 13, bold: true, color: { argb: JC_TEXT } };
    ws1.getCell('G4').value = 'Day'; ws1.getCell('G4').font = { name: 'Arial', size: 11, bold: true, color: { argb: JC_LABEL } };
    ws1.getCell('H4').value = `${dom}/${dim}`; ws1.getCell('H4').font = { name: 'Arial', size: 13, bold: true, color: { argb: JC_TEXT } };
    for (let c = 1; c <= 9; c++) { ws1.getRow(4).getCell(c).fill = infoFill; ws1.getRow(4).getCell(c).border = { top: thin(JC_BORDER), bottom: thin(JC_BORDER) }; }

    // Headers
    const h1 = ['#', 'AGENT', 'CONV', 'AVG/DAY', 'CONV/HR', 'PROJECTED', 'BEST DAY', 'CALLS', 'CONV %'];
    h1.forEach((h, i) => {
      const cell = ws1.getRow(6).getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: JC_DARK } };
      cell.border = { bottom: { style: 'medium', color: { argb: JC_TEAL } } };
      if (i >= 2) cell.alignment = { horizontal: 'right' };
    });

    ws1.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + agents.length, column: 9 } };

    mtd.byAgent.forEach((a, i) => {
      const row = ws1.getRow(7 + i);
      const daily = a.daily || {};
      const avg = +(a.count / Math.max(dom, 1)).toFixed(1);
      const projected = Math.round(a.count / Math.max(dom, 1) * dim);
      const best = Object.values(daily).length > 0 ? Math.max(...Object.values(daily)) : 0;
      const rep = (data.mtdRepActivity || []).find((r: { agent: string }) => r.agent === a.agent);
      const calls = (rep as { totalCalls?: number } | undefined)?.totalCalls ?? 0;
      const convPct = calls > 0 ? ((a.count / calls) * 100).toFixed(1) + '%' : '';
      const bg = i % 2 === 0 ? WHITE : JC_BG;
      const fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: bg } };
      const font = { name: 'Arial', size: 11, color: { argb: JC_TEXT } };

      row.getCell(1).value = i < 3 ? ['🥇','🥈','🥉'][i] : i + 1; row.getCell(1).font = font;
      row.getCell(2).value = cap(a.agent); row.getCell(2).font = { ...font, bold: true };
      row.getCell(3).value = a.count; row.getCell(3).font = { ...font, bold: true, size: 13 }; row.getCell(3).alignment = { horizontal: 'right' };
      row.getCell(4).value = avg; row.getCell(4).font = font; row.getCell(4).alignment = { horizontal: 'right' };
      row.getCell(5).value = ''; row.getCell(5).font = font; row.getCell(5).alignment = { horizontal: 'right' };
      row.getCell(6).value = projected; row.getCell(6).font = { ...font, color: { argb: projected >= Math.round(GOAL / agents.length) ? '27AE60' : JC_LABEL } }; row.getCell(6).alignment = { horizontal: 'right' };
      row.getCell(7).value = best || ''; row.getCell(7).font = font; row.getCell(7).alignment = { horizontal: 'right' };
      row.getCell(8).value = calls || ''; row.getCell(8).font = font; row.getCell(8).alignment = { horizontal: 'right' };
      row.getCell(9).value = convPct; row.getCell(9).font = font; row.getCell(9).alignment = { horizontal: 'right' };
      for (let c = 1; c <= 9; c++) { row.getCell(c).fill = fill; row.getCell(c).border = docBorder; }
    });

    // ── Sheet 2: Conversions Per Client (with agent pivot) ──
    const ws2 = wb.addWorksheet('Per Client', {
      views: [{ state: 'frozen', ySplit: 4, xSplit: 2 }],
      properties: { tabColor: { argb: '27AE60' } },
    });

    const agentCols = agents.length;
    const totalCols = 4 + agentCols; // #, Client, Conv, %, agent1, agent2, ...
    ws2.columns = [
      { width: 5 },   // #
      { width: 30 },  // Client
      { width: 12 },  // Conversions
      { width: 10 },  // % of Total
      ...agents.map(() => ({ width: 10 })), // agent columns
    ];

    // Title
    ws2.mergeCells(1, 1, 1, totalCols);
    ws2.getCell('A1').value = 'CONVERSIONS PER CLIENT — AGENT BREAKDOWN';
    ws2.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: WHITE } };
    ws2.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: JC_DARK } };
    ws2.getCell('A1').border = { bottom: { style: 'medium', color: { argb: JC_TEAL } } };
    ws2.getRow(1).height = 30;

    ws2.mergeCells(2, 1, 2, totalCols);
    ws2.getCell('A2').value = `${monthName} ${year} — ${mtd.total} total conversions across ${byAccount.length} clients`;
    ws2.getCell('A2').font = { name: 'Arial', size: 10, italic: true, color: { argb: JC_LABEL } };

    // Column headers
    const headers = ['#', 'CLIENT', 'CONV', '%', ...agents.map(a => cap(a).toUpperCase())];
    headers.forEach((h, i) => {
      const cell = ws2.getRow(4).getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: JC_DARK } };
      cell.border = { bottom: { style: 'medium', color: { argb: JC_TEAL } } };
      if (i >= 2) cell.alignment = { horizontal: 'right' };
    });

    ws2.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + byAccount.length, column: totalCols } };

    // Data rows
    byAccount.forEach((acct, i) => {
      const row = ws2.getRow(5 + i);
      const bd = acct.agentBreakdown || {};
      const pct = mtd.total > 0 ? ((acct.count / mtd.total) * 100).toFixed(1) + '%' : '0%';
      const bg = i % 2 === 0 ? WHITE : JC_BG;
      const fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: bg } };
      const font = { name: 'Arial', size: 11, color: { argb: JC_TEXT } };

      row.getCell(1).value = i + 1; row.getCell(1).font = { ...font, color: { argb: JC_LABEL } };
      row.getCell(2).value = cap(acct.account); row.getCell(2).font = { ...font, bold: true };
      row.getCell(3).value = acct.count; row.getCell(3).font = { ...font, bold: true, size: 12 }; row.getCell(3).alignment = { horizontal: 'right' };
      row.getCell(4).value = pct; row.getCell(4).font = { ...font, color: { argb: JC_LABEL } }; row.getCell(4).alignment = { horizontal: 'right' };

      agents.forEach((agent, j) => {
        const val = bd[agent] || 0;
        const cell = row.getCell(5 + j);
        cell.value = val > 0 ? val : '';
        cell.font = { ...font, bold: val > 0, color: { argb: val > 0 ? JC_TEXT : 'CCCCCC' } };
        cell.alignment = { horizontal: 'right' };
      });

      for (let c = 1; c <= totalCols; c++) { row.getCell(c).fill = fill; row.getCell(c).border = docBorder; }
    });

    // Totals row
    const totRow = ws2.getRow(5 + byAccount.length);
    totRow.getCell(1).value = '';
    totRow.getCell(2).value = 'TOTAL'; totRow.getCell(2).font = { name: 'Arial', size: 11, bold: true, color: { argb: JC_DARK } };
    totRow.getCell(3).value = mtd.total; totRow.getCell(3).font = { name: 'Arial', size: 12, bold: true, color: { argb: JC_DARK } }; totRow.getCell(3).alignment = { horizontal: 'right' };
    totRow.getCell(4).value = '100%'; totRow.getCell(4).font = { name: 'Arial', size: 11, bold: true, color: { argb: JC_DARK } }; totRow.getCell(4).alignment = { horizontal: 'right' };
    agents.forEach((agent, j) => {
      const total = byAccount.reduce((s, ac) => s + ((ac.agentBreakdown || {})[agent] || 0), 0);
      const cell = totRow.getCell(5 + j);
      cell.value = total; cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: JC_DARK } }; cell.alignment = { horizontal: 'right' };
    });
    for (let c = 1; c <= totalCols; c++) {
      totRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: JC_BG } };
      totRow.getCell(c).border = { top: { style: 'medium', color: { argb: JC_TEAL } }, bottom: thin(JC_BORDER), left: thin(JC_BORDER), right: thin(JC_BORDER) };
    }

    // Save
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JC_Conversions-Report_${monthName}-${year}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

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

  // Map step index to the right component (Mixed skips conversions/MTD)
  const currentLabel = stepLabels[step];

  function renderStep() {
    switch (currentLabel) {
      case 'Calls':
        return <StepCalls period={period} label={periodLabel} data={data!} />;
      case 'Speed':
        return <StepSpeed period={period} label={periodLabel} data={data!} />;
      case 'Pickup Rate':
        return <StepPickupRate period={period} label={periodLabel} data={data!} />;
      case 'Conversions':
        return <StepConversions period={period} label={periodLabel} data={data!} />;
      case 'MTD':
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
              onClick={downloadReport}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border-none cursor-pointer transition-colors"
              style={{
                background: 'rgba(139,146,168,0.1)',
                color: C.sub,
                border: '1px solid transparent',
              }}
              title="Download MTD conversions report (CSV)"
            >
              📥 Report
            </button>
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
