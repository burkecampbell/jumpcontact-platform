/**
 * CEO Report — Executive summary XLSX export
 *
 * 5 sheets per JC Document Standards:
 *   1. Executive Summary — KPIs, deltas, period overview
 *   2. Agent Leaderboard — ranked by conversions with all metrics
 *   3. Client Breakdown — conversions per client with agent pivot
 *   4. Brand Comparison — JC vs MSC side-by-side
 *   5. Daily Trend — row per day with MTD pace
 *
 * All styling follows DOCUMENT_STANDARDS.md Spreadsheet Standards.
 */

import type { DashboardData, PeriodData, RepAgent, AcctStat } from './types';
import { capitalize } from './constants';

// ── Document Standards Colors ──────────────────────────────────────
const JC_DARK = '2C3E50';
const JC_TEAL = '3BA5B5';
const JC_TEXT = '1A1A1A';
const JC_LABEL = '495057';
const JC_BG = 'F8F9FA';
const JC_BORDER = 'DEE2E6';
const WHITE = 'FFFFFF';
const GREEN = '27AE60';
const RED = 'C0392B';
const BLUE = '2980B9';

type ExcelJSModule = typeof import('exceljs');
type Workbook = InstanceType<ExcelJSModule['Workbook']>;
type Worksheet = ReturnType<Workbook['addWorksheet']>;

const thin = (c: string) => ({ style: 'thin' as const, color: { argb: c } });
const docBorder = { bottom: thin(JC_BORDER), right: thin(JC_BORDER), left: thin(JC_BORDER), top: thin(JC_BORDER) };
const tealUnderline = { bottom: { style: 'medium' as const, color: { argb: JC_TEAL } } };

// ── Shared styling helpers ─────────────────────────────────────────

function addTitleBar(ws: Worksheet, title: string, colCount: number) {
  ws.mergeCells(1, 1, 1, colCount);
  const cell = ws.getCell('A1');
  cell.value = title;
  cell.font = { name: 'Arial', size: 20, bold: true, color: { argb: WHITE } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: JC_DARK } };
  cell.border = tealUnderline;
  cell.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 36;
}

function addSubtitle(ws: Worksheet, text: string, colCount: number) {
  ws.mergeCells(2, 1, 2, colCount);
  ws.getCell('A2').value = text;
  ws.getCell('A2').font = { name: 'Arial', size: 12, bold: true, color: { argb: JC_DARK } };
}

function addDateLine(ws: Worksheet, text: string, colCount: number) {
  ws.mergeCells(3, 1, 3, colCount);
  ws.getCell('A3').value = text;
  ws.getCell('A3').font = { name: 'Arial', size: 10, italic: true, color: { argb: JC_LABEL } };
}

function addHeaders(ws: Worksheet, headers: string[], row: number) {
  headers.forEach((h, i) => {
    const cell = ws.getRow(row).getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: JC_DARK } };
    cell.border = tealUnderline;
    if (i >= 2) cell.alignment = { horizontal: 'right' };
  });
}

function styleDataRow(ws: Worksheet, rowNum: number, colCount: number, isEven: boolean) {
  const bg = isEven ? WHITE : JC_BG;
  const fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: bg } };
  for (let c = 1; c <= colCount; c++) {
    ws.getRow(rowNum).getCell(c).fill = fill;
    ws.getRow(rowNum).getCell(c).border = docBorder;
  }
  ws.getRow(rowNum).height = 19;
}

const font = { name: 'Arial', size: 11, color: { argb: JC_TEXT } };
const boldFont = { ...font, bold: true };
const labelFont = { name: 'Arial', size: 11, bold: true, color: { argb: JC_LABEL } };
const valueFont = { name: 'Arial', size: 13, bold: true, color: { argb: JC_TEXT } };

// ── Report Generator ───────────────────────────────────────────────

export async function generateCEOReport(data: DashboardData, brandName: string): Promise<ArrayBuffer> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = brandName;
  wb.created = new Date();

  const period = data.yesterday;
  const today = data.today;
  const mtd = data.mtd;
  const dateStr = data.date || new Date().toISOString().slice(0, 10);
  const yesterdayDate = data.yesterdayDate || '';
  const monthName = new Date(dateStr + 'T12:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Edmonton' });

  // ═══════════════════════════════════════════════════════════════════
  //  SHEET 1: Executive Summary
  // ═══════════════════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet('Executive Summary', {
    properties: { tabColor: { argb: JC_TEAL } },
  });
  ws1.columns = [{ width: 24 }, { width: 16 }, { width: 6 }, { width: 24 }, { width: 16 }];

  addTitleBar(ws1, brandName.toUpperCase(), 5);
  addSubtitle(ws1, 'CEO Report — Executive Summary', 5);
  addDateLine(ws1, `Generated ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Edmonton' })}`, 5);

  // Summary section
  const infoFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: JC_BG } };
  const summaryData = [
    ['YESTERDAY', '', '', 'TODAY SO FAR', ''],
    ['Conversions', period.conversions.total, '', 'Conversions', today.conversions.total],
    ['Total Calls', period.totalCalls ?? period.repActivity.agents.reduce((s: number, a: RepAgent) => s + a.calls, 0), '', 'Total Calls', today.totalCalls ?? today.repActivity.agents.reduce((s: number, a: RepAgent) => s + a.calls, 0)],
    ['Answer Rate', (period.answerRate ?? 0) + '%', '', 'Answer Rate', (today.answerRate ?? 0) + '%'],
    ['Avg Speed', (period.repActivity.avgSpeedSec ?? 0).toFixed(1) + 's', '', 'Avg Speed', (today.repActivity.avgSpeedSec ?? 0).toFixed(1) + 's'],
    ['Conv Rate', (period.conversionRate ?? 0) + '%', '', 'Conv Rate', (today.conversionRate ?? 0) + '%'],
    ['Missed Calls', period.missedCalls.total, '', 'Missed Calls', today.missedCalls.total],
    ['', '', '', '', ''],
    ['MTD PACE', '', '', '', ''],
    ['MTD Conversions', mtd.total, '', 'Goal', mtd.goal],
    ['Projected EOM', mtd.projectedEOM, '', 'Daily Needed', mtd.requiredDailyRate],
    ['Days Left', mtd.daysRemaining, '', 'On Track', mtd.onTrack ? 'YES ✓' : 'NO ✗'],
  ];

  summaryData.forEach((row, i) => {
    const r = ws1.getRow(5 + i);
    row.forEach((val, j) => {
      const cell = r.getCell(j + 1);
      cell.value = val as string | number;
      if (j === 0 || j === 3) cell.font = i === 0 || i === 8 ? { ...boldFont, size: 12, color: { argb: JC_TEAL } } : labelFont;
      else cell.font = valueFont;
    });
    for (let c = 1; c <= 5; c++) {
      r.getCell(c).fill = infoFill;
      r.getCell(c).border = docBorder;
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  SHEET 2: Agent Leaderboard
  // ═══════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('Agent Leaderboard', {
    views: [{ state: 'frozen', ySplit: 8 }],
    properties: { tabColor: { argb: GREEN } },
  });
  ws2.columns = [{ width: 5 }, { width: 16 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }];

  addTitleBar(ws2, brandName.toUpperCase(), 10);
  addSubtitle(ws2, 'Agent Leaderboard — Yesterday', 10);
  addDateLine(ws2, yesterdayDate, 10);

  // Info strip
  const yAgents = period.repActivity.agents;
  const yCalls = yAgents.reduce((s, a) => s + a.calls, 0);
  const yConv = period.conversions.total;
  ws2.getCell('A5').value = 'Agents'; ws2.getCell('A5').font = labelFont;
  ws2.getCell('B5').value = yAgents.length; ws2.getCell('B5').font = valueFont;
  ws2.getCell('D5').value = 'Calls'; ws2.getCell('D5').font = labelFont;
  ws2.getCell('E5').value = yCalls; ws2.getCell('E5').font = valueFont;
  ws2.getCell('G5').value = 'Conversions'; ws2.getCell('G5').font = labelFont;
  ws2.getCell('H5').value = yConv; ws2.getCell('H5').font = valueFont;
  for (let c = 1; c <= 10; c++) { ws2.getRow(5).getCell(c).fill = infoFill; ws2.getRow(5).getCell(c).border = { top: thin(JC_BORDER), bottom: thin(JC_BORDER) }; }

  addHeaders(ws2, ['#', 'AGENT', 'CONV', 'CALLS', 'RATE', 'SPEED', 'PICKUP', 'WRAP', 'TALK TIME', 'CONV/HR'], 8);
  ws2.autoFilter = { from: { row: 8, column: 1 }, to: { row: 8 + yAgents.length, column: 10 } };

  const sortedAgents = [...yAgents].sort((a, b) => b.conversions - a.conversions || b.calls - a.calls);
  sortedAgents.forEach((a, i) => {
    const r = ws2.getRow(9 + i);
    const rate = a.calls > 0 ? ((a.conversions / a.calls) * 100).toFixed(1) + '%' : '';
    const convHr = a.hoursScheduled && a.hoursScheduled > 0 ? (a.conversions / a.hoursScheduled).toFixed(2) : '';
    const talkStr = a.talkMin >= 60 ? `${Math.floor(a.talkMin / 60)}h ${Math.round(a.talkMin % 60)}m` : `${Math.round(a.talkMin)}m`;

    r.getCell(1).value = i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1; r.getCell(1).font = font;
    r.getCell(2).value = capitalize(a.agent); r.getCell(2).font = boldFont;
    r.getCell(3).value = a.conversions; r.getCell(3).font = { ...boldFont, size: 13 }; r.getCell(3).alignment = { horizontal: 'right' };
    r.getCell(4).value = a.calls; r.getCell(4).font = font; r.getCell(4).alignment = { horizontal: 'right' };
    r.getCell(5).value = rate; r.getCell(5).font = { ...font, color: { argb: parseFloat(rate) >= 15 ? GREEN : JC_TEXT } }; r.getCell(5).alignment = { horizontal: 'right' };
    r.getCell(6).value = a.speedSec != null ? a.speedSec.toFixed(1) + 's' : ''; r.getCell(6).font = { ...font, color: { argb: a.speedSec != null && a.speedSec < 10 ? GREEN : a.speedSec != null && a.speedSec > 15 ? RED : JC_TEXT } }; r.getCell(6).alignment = { horizontal: 'right' };
    r.getCell(7).value = a.pickupRate != null ? a.pickupRate + '%' : ''; r.getCell(7).font = font; r.getCell(7).alignment = { horizontal: 'right' };
    r.getCell(8).value = a.wrapUpSec != null ? Math.round(a.wrapUpSec) + 's' : ''; r.getCell(8).font = font; r.getCell(8).alignment = { horizontal: 'right' };
    r.getCell(9).value = talkStr; r.getCell(9).font = font; r.getCell(9).alignment = { horizontal: 'right' };
    r.getCell(10).value = convHr; r.getCell(10).font = font; r.getCell(10).alignment = { horizontal: 'right' };
    styleDataRow(ws2, 9 + i, 10, i % 2 === 0);
  });

  // ═══════════════════════════════════════════════════════════════════
  //  SHEET 3: Client Breakdown (with agent pivot)
  // ═══════════════════════════════════════════════════════════════════
  const agentNames = mtd.byAgent.map(a => a.agent);
  const byAccount = mtd.byAccount || [];
  const totalCols3 = 4 + agentNames.length;

  const ws3 = wb.addWorksheet('Client Breakdown', {
    views: [{ state: 'frozen', ySplit: 4, xSplit: 2 }],
    properties: { tabColor: { argb: BLUE } },
  });
  ws3.columns = [{ width: 5 }, { width: 30 }, { width: 12 }, { width: 10 }, ...agentNames.map(() => ({ width: 10 }))];

  addTitleBar(ws3, 'CONVERSIONS PER CLIENT — AGENT BREAKDOWN', totalCols3);
  addSubtitle(ws3, `${monthName} — ${mtd.total} total conversions across ${byAccount.length} clients`, totalCols3);

  addHeaders(ws3, ['#', 'CLIENT', 'CONV', '%', ...agentNames.map(a => capitalize(a).toUpperCase())], 4);
  ws3.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + byAccount.length, column: totalCols3 } };

  byAccount.forEach((acct: AcctStat, i: number) => {
    const r = ws3.getRow(5 + i);
    const bd = acct.agentBreakdown || {};
    const pct = mtd.total > 0 ? ((acct.count / mtd.total) * 100).toFixed(1) + '%' : '0%';

    r.getCell(1).value = i + 1; r.getCell(1).font = { ...font, color: { argb: JC_LABEL } };
    r.getCell(2).value = capitalize(acct.account); r.getCell(2).font = boldFont;
    r.getCell(3).value = acct.count; r.getCell(3).font = { ...boldFont, size: 12 }; r.getCell(3).alignment = { horizontal: 'right' };
    r.getCell(4).value = pct; r.getCell(4).font = { ...font, color: { argb: JC_LABEL } }; r.getCell(4).alignment = { horizontal: 'right' };
    agentNames.forEach((agent, j) => {
      const val = bd[agent] || 0;
      r.getCell(5 + j).value = val > 0 ? val : '';
      r.getCell(5 + j).font = { ...font, bold: val > 0, color: { argb: val > 0 ? JC_TEXT : 'CCCCCC' } };
      r.getCell(5 + j).alignment = { horizontal: 'right' };
    });
    styleDataRow(ws3, 5 + i, totalCols3, i % 2 === 0);
  });

  // Totals row
  const totRow3 = ws3.getRow(5 + byAccount.length);
  totRow3.getCell(2).value = 'TOTAL'; totRow3.getCell(2).font = { ...boldFont, color: { argb: JC_DARK } };
  totRow3.getCell(3).value = mtd.total; totRow3.getCell(3).font = { ...boldFont, size: 12, color: { argb: JC_DARK } }; totRow3.getCell(3).alignment = { horizontal: 'right' };
  totRow3.getCell(4).value = '100%'; totRow3.getCell(4).font = { ...boldFont, color: { argb: JC_DARK } }; totRow3.getCell(4).alignment = { horizontal: 'right' };
  agentNames.forEach((agent, j) => {
    const total = byAccount.reduce((s: number, ac: AcctStat) => s + ((ac.agentBreakdown || {})[agent] || 0), 0);
    totRow3.getCell(5 + j).value = total; totRow3.getCell(5 + j).font = { ...boldFont, color: { argb: JC_DARK } }; totRow3.getCell(5 + j).alignment = { horizontal: 'right' };
  });
  for (let c = 1; c <= totalCols3; c++) {
    totRow3.getCell(c).fill = infoFill;
    totRow3.getCell(c).border = { top: { style: 'medium' as const, color: { argb: JC_TEAL } }, bottom: thin(JC_BORDER), left: thin(JC_BORDER), right: thin(JC_BORDER) };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SHEET 4: Brand Comparison
  // ═══════════════════════════════════════════════════════════════════
  const ws4 = wb.addWorksheet('Brand Comparison', {
    properties: { tabColor: { argb: '5BC5D4' } },
  });
  ws4.columns = [{ width: 24 }, { width: 16 }, { width: 16 }, { width: 16 }];

  addTitleBar(ws4, 'BRAND COMPARISON', 4);
  addSubtitle(ws4, `Yesterday — ${yesterdayDate}`, 4);

  addHeaders(ws4, ['METRIC', 'JUMP CONTACT', 'MED SPA', 'COMBINED'], 5);

  // We'll compute from the agent data
  const jcAgents = period.repActivity.agents.filter((a: RepAgent) => {
    const l = a.agent.toLowerCase();
    return !['sue', 'francis', 'natalie', 'desi', 'rebecca', 'sofia', 'richard', 'anthony'].includes(l);
  });
  const mscAgents = period.repActivity.agents.filter((a: RepAgent) => {
    const l = a.agent.toLowerCase();
    return ['sue', 'francis', 'natalie', 'desi', 'rebecca', 'sofia', 'richard', 'anthony', 'sara', 'wendy', 'jose'].includes(l);
  });
  const allAgents = period.repActivity.agents;

  const sumCalls = (agents: RepAgent[]) => agents.reduce((s, a) => s + a.calls, 0);
  const sumConv = (agents: RepAgent[]) => agents.reduce((s, a) => s + a.conversions, 0);
  const avgSpeed = (agents: RepAgent[]) => {
    const w = agents.filter(a => a.speedSec != null && a.speedSec > 0);
    return w.length > 0 ? (w.reduce((s, a) => s + a.speedSec!, 0) / w.length).toFixed(1) + 's' : '—';
  };
  const avgPickup = (agents: RepAgent[]) => {
    const w = agents.filter(a => a.pickupRate != null);
    return w.length > 0 ? (w.reduce((s, a) => s + a.pickupRate!, 0) / w.length).toFixed(1) + '%' : '—';
  };

  const compData = [
    ['Agents', jcAgents.length, mscAgents.length, allAgents.length],
    ['Calls Answered', sumCalls(jcAgents), sumCalls(mscAgents), sumCalls(allAgents)],
    ['Conversions', sumConv(jcAgents), sumConv(mscAgents), sumConv(allAgents)],
    ['Avg Speed', avgSpeed(jcAgents), avgSpeed(mscAgents), avgSpeed(allAgents)],
    ['Avg Pickup Rate', avgPickup(jcAgents), avgPickup(mscAgents), avgPickup(allAgents)],
  ];

  compData.forEach((row, i) => {
    const r = ws4.getRow(6 + i);
    r.getCell(1).value = row[0] as string; r.getCell(1).font = labelFont;
    r.getCell(2).value = row[1]; r.getCell(2).font = valueFont; r.getCell(2).alignment = { horizontal: 'right' };
    r.getCell(3).value = row[2]; r.getCell(3).font = valueFont; r.getCell(3).alignment = { horizontal: 'right' };
    r.getCell(4).value = row[3]; r.getCell(4).font = { ...valueFont, color: { argb: JC_TEAL } }; r.getCell(4).alignment = { horizontal: 'right' };
    styleDataRow(ws4, 6 + i, 4, i % 2 === 0);
  });

  // ═══════════════════════════════════════════════════════════════════
  //  SHEET 5: Daily Trend
  // ═══════════════════════════════════════════════════════════════════
  const ws5 = wb.addWorksheet('Daily Trend', {
    views: [{ state: 'frozen', ySplit: 5 }],
    properties: { tabColor: { argb: JC_DARK } },
  });
  ws5.columns = [{ width: 14 }, { width: 12 }, { width: 12 }, { width: 14 }];

  addTitleBar(ws5, 'DAILY TREND — ' + monthName.toUpperCase(), 4);
  addSubtitle(ws5, `${mtd.total} conversions MTD | Goal: ${mtd.goal} | Projected: ${mtd.projectedEOM}`, 4);

  addHeaders(ws5, ['DATE', 'CONVERSIONS', 'CUMULATIVE', 'PACE TARGET'], 5);
  ws5.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + (mtd.mtdDaily?.length || 0), column: 4 } };

  const dailyGoal = mtd.goal / (mtd.daysInMonth || 30);
  let cumulative = 0;
  (mtd.mtdDaily || []).forEach((day: { date: string; total: number }, i: number) => {
    cumulative += day.total;
    const paceTarget = Math.round(dailyGoal * (i + 1));
    const r = ws5.getRow(6 + i);
    r.getCell(1).value = day.date; r.getCell(1).font = { ...font, color: { argb: JC_LABEL } };
    r.getCell(2).value = day.total; r.getCell(2).font = { ...boldFont, color: { argb: day.total >= dailyGoal ? GREEN : day.total > 0 ? JC_TEXT : JC_LABEL } }; r.getCell(2).alignment = { horizontal: 'right' };
    r.getCell(3).value = cumulative; r.getCell(3).font = { ...font, color: { argb: cumulative >= paceTarget ? GREEN : RED } }; r.getCell(3).alignment = { horizontal: 'right' };
    r.getCell(4).value = paceTarget; r.getCell(4).font = { ...font, color: { argb: JC_LABEL } }; r.getCell(4).alignment = { horizontal: 'right' };
    styleDataRow(ws5, 6 + i, 4, i % 2 === 0);
  });

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
