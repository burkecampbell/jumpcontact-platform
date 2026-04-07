'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import NavBar from './NavBar';
import HealthBanner from './HealthBanner';
import Card from './Card';
import DateRangePicker, { type DateRange } from './DateRangePicker';
import { C, capitalize, fmtTalkTime, ACTIVE_AGENTS, agentColor } from '@/lib/constants';
import { formatPhone, formatDuration, formatTime, formatDateTime } from '@/lib/formatters';
import type { RawCall } from '@/lib/getDashboard';
import type { CallsResponse, AgentCallSummary } from '@/lib/api-types';
import { ArrowDown, ArrowUp, Filter, Download, Volume2, Square, CheckSquare, Share2 } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';
import InlinePlayer from './InlinePlayer';
import { useBrand } from '@/hooks/useBrand';

// ── XLSX Export (branded Jump Contact report) ──────────────────────────────

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtTimeXLS(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Edmonton',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

import { shareRecording, buildPlayerUrl } from '@/lib/recording-utils';

async function downloadReport(calls: RawCall[], filename: string, _date: string) {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Jump Contact';
  wb.created = new Date();

  // ── JC Document Standards — Light theme ──
  const JC_TEAL = '3BA5B5';
  const JC_DARK = '2C3E50';
  const JC_TEXT = '1A1A1A';
  const JC_LABEL = '495057';
  const JC_BG_GRAY = 'F8F9FA';
  const JC_BORDER = 'DEE2E6';
  const JC_GREEN = '27AE60';
  const JC_BLUE = '2980B9';
  const JC_RED = 'C0392B';
  const WHITE = 'FFFFFF';
  const STRIPE_LIGHT = 'F8F9FA';
  const STRIPE_WHITE = 'FFFFFF';

  const thin = (color: string) => ({ style: 'thin' as const, color: { argb: color } });
  const docBorder = { bottom: thin(JC_BORDER), right: thin(JC_BORDER), left: thin(JC_BORDER), top: thin(JC_BORDER) };

  // ── Aggregate stats ──
  const totalCalls = calls.length;
  const totalDurSec = calls.reduce((s, c) => s + c.duration, 0);
  const inbound = calls.filter(c => c.direction === 'inbound').length;
  const outbound = totalCalls - inbound;
  const withRec = calls.filter(c => c.recordingUrl).length;

  // ── Agent breakdown ──
  const agentMap = new Map<string, { calls: number; durSec: number; inbound: number; outbound: number }>();
  for (const c of calls) {
    const name = capitalize(c.agent) || 'Unassigned';
    const prev = agentMap.get(name) || { calls: 0, durSec: 0, inbound: 0, outbound: 0 };
    prev.calls += 1;
    prev.durSec += c.duration;
    if (c.direction === 'inbound') prev.inbound += 1; else prev.outbound += 1;
    agentMap.set(name, prev);
  }

  // =====================================================================
  //  SHEET 1: Call Detail — JC Document Standards (light, professional)
  // =====================================================================
  const ws = wb.addWorksheet('Call Detail', {
    views: [{ state: 'frozen', ySplit: 8 }],
    properties: { tabColor: { argb: JC_TEAL } },
  });

  ws.columns = [
    { width: 24 },  // A: Time
    { width: 14 },  // B: Agent
    { width: 28 },  // C: Client
    { width: 18 },  // D: Phone
    { width: 12 },  // E: Duration
    { width: 10 },  // F: Ring Time
    { width: 12 },  // G: Direction
    { width: 18 },  // H: Recording
  ];

  // ── Branded header (teal bar) ──
  ws.mergeCells('A1:G1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'JUMP CONTACT';
  titleCell.font = { name: 'Arial', size: 20, bold: true, color: { argb: WHITE } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: JC_DARK } };
  titleCell.alignment = { vertical: 'middle' };
  titleCell.border = { bottom: { style: 'medium', color: { argb: JC_TEAL } } };
  ws.getRow(1).height = 36;

  ws.mergeCells('A2:G2');
  const subtitleCell = ws.getCell('A2');
  subtitleCell.value = 'Call Detail Report';
  subtitleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: JC_DARK } };
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };

  ws.mergeCells('A3:G3');
  const dateCell = ws.getCell('A3');
  const fromDate = calls.length > 0 ? new Date(calls[calls.length - 1].time) : new Date();
  const toDate = calls.length > 0 ? new Date(calls[0].time) : new Date();
  const dateOpts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Edmonton' };
  dateCell.value = fromDate.toLocaleDateString('en-US', dateOpts) + ' — ' + toDate.toLocaleDateString('en-US', dateOpts);
  dateCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: JC_LABEL } };
  dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };

  // ── Summary info box (rows 5-6, gray background per doc standards) ──
  const infoFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: JC_BG_GRAY } };
  const labelFont = { name: 'Arial', size: 11, bold: true, color: { argb: JC_LABEL } };
  const valueFont = { name: 'Arial', size: 13, bold: true, color: { argb: JC_TEXT } };

  for (let c = 1; c <= 7; c++) {
    ws.getRow(5).getCell(c).fill = infoFill;
    ws.getRow(5).getCell(c).border = { top: thin(JC_BORDER), bottom: thin(JC_BORDER) };
    ws.getRow(6).getCell(c).fill = infoFill;
    ws.getRow(6).getCell(c).border = { bottom: thin(JC_BORDER) };
  }

  ws.getCell('A5').value = 'Total Calls'; ws.getCell('A5').font = labelFont;
  ws.getCell('B5').value = totalCalls; ws.getCell('B5').font = valueFont;
  ws.getCell('C5').value = 'Inbound'; ws.getCell('C5').font = labelFont;
  ws.getCell('D5').value = inbound; ws.getCell('D5').font = { ...valueFont, color: { argb: JC_GREEN } };
  ws.getCell('E5').value = 'Outbound'; ws.getCell('E5').font = labelFont;
  ws.getCell('F5').value = outbound; ws.getCell('F5').font = { ...valueFont, color: { argb: JC_BLUE } };
  ws.getCell('G5').value = 'Talk Time'; ws.getCell('G5').font = labelFont;
  ws.getCell('A6').value = 'Recordings'; ws.getCell('A6').font = labelFont;
  ws.getCell('B6').value = withRec; ws.getCell('B6').font = valueFont;
  ws.getCell('G6').value = fmtDur(totalDurSec); ws.getCell('G6').font = valueFont;

  // ── Column headers (row 8) — teal underline per doc standards ──
  const headers = ['Time', 'Agent', 'Client', 'Phone', 'Duration', 'Ring Time', 'Direction', 'Recording'];
  const headerRowXLS = ws.getRow(8);
  headers.forEach((h, i) => {
    const cell = headerRowXLS.getCell(i + 1);
    cell.value = h.toUpperCase();
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: JC_DARK } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
    cell.border = { bottom: { style: 'medium', color: { argb: JC_TEAL } } };
    cell.alignment = { vertical: 'middle' };
  });
  headerRowXLS.height = 22;

  // Auto-filter
  ws.autoFilter = { from: { row: 8, column: 1 }, to: { row: 8 + calls.length, column: 8 } };

  // ── Data rows — alternating white/gray stripes ──
  calls.forEach((c, i) => {
    const row = ws.getRow(9 + i);
    const isEven = i % 2 === 0;
    const bg = isEven ? STRIPE_WHITE : STRIPE_LIGHT;
    const fillStyle = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: bg } };
    const baseFont = { name: 'Arial', size: 11, color: { argb: JC_TEXT } };

    row.getCell(1).value = fmtTimeXLS(c.time);
    row.getCell(1).font = { ...baseFont, size: 10, color: { argb: JC_LABEL } };

    row.getCell(2).value = capitalize(c.agent) || '';
    row.getCell(2).font = { ...baseFont, bold: !!c.agent };

    row.getCell(3).value = c.account || '';
    row.getCell(3).font = c.account ? baseFont : { ...baseFont, color: { argb: 'AAAAAA' } };

    row.getCell(4).value = formatPhone(c.phone);
    row.getCell(4).font = { ...baseFont, size: 10 };

    row.getCell(5).value = fmtDur(c.duration);
    row.getCell(5).font = baseFont;
    row.getCell(5).alignment = { horizontal: 'right' };

    row.getCell(6).value = c.ringTime ? c.ringTime + 's' : '';
    row.getCell(6).font = { ...baseFont, color: { argb: c.ringTime ? JC_TEAL : 'CCCCCC' } };
    row.getCell(6).alignment = { horizontal: 'right' };

    const isInbound = c.direction === 'inbound';
    row.getCell(7).value = isInbound ? 'Inbound' : 'Outbound';
    row.getCell(7).font = { ...baseFont, size: 10, color: { argb: isInbound ? JC_GREEN : JC_BLUE } };

    // Recording hyperlink — teal per brand
    const url = buildPlayerUrl(c);
    if (url) {
      row.getCell(8).value = { text: '▶ Play', hyperlink: url };
      row.getCell(8).font = { name: 'Arial', size: 10, color: { argb: JC_TEAL }, underline: true };
    } else {
      row.getCell(8).value = '—';
      row.getCell(8).font = { ...baseFont, color: { argb: 'CCCCCC' } };
    }

    for (let col = 1; col <= 8; col++) {
      row.getCell(col).fill = fillStyle;
      row.getCell(col).border = docBorder;
    }
    row.height = 19;
  });

  // =====================================================================
  //  SHEET 2: Agent Summary — JC Document Standards
  // =====================================================================
  const ws2 = wb.addWorksheet('Agent Summary', {
    properties: { tabColor: { argb: JC_GREEN } },
  });

  ws2.columns = [
    { width: 5 },   // #
    { width: 16 },  // Agent
    { width: 12 },  // Calls
    { width: 12 },  // Inbound
    { width: 12 },  // Outbound
    { width: 14 },  // Talk Time
    { width: 14 },  // Avg Duration
    { width: 12 },  // % of Total
  ];

  // Header — dark bar with white text
  ws2.mergeCells('A1:H1');
  ws2.getCell('A1').value = 'AGENT PERFORMANCE SUMMARY';
  ws2.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: WHITE } };
  ws2.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: JC_DARK } };
  ws2.getCell('A1').border = { bottom: { style: 'medium', color: { argb: JC_TEAL } } };
  ws2.getRow(1).height = 30;

  // Column headers — teal underline
  const agentHeaders = ['#', 'AGENT', 'CALLS', 'INBOUND', 'OUTBOUND', 'TALK TIME', 'AVG DURATION', '% OF TOTAL'];
  const agentHeaderRow = ws2.getRow(3);
  agentHeaders.forEach((h, i) => {
    const cell = agentHeaderRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: JC_DARK } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
    cell.border = { bottom: { style: 'medium', color: { argb: JC_TEAL } } };
    if (i >= 2) cell.alignment = { horizontal: 'right' };
  });

  const sortedAgents = [...agentMap.entries()].sort((a, b) => b[1].calls - a[1].calls);
  sortedAgents.forEach(([name, stats], i) => {
    const row = ws2.getRow(4 + i);
    const isEven = i % 2 === 0;
    const bg = isEven ? STRIPE_WHITE : STRIPE_LIGHT;
    const fillStyle = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: bg } };
    const baseFont = { name: 'Arial', size: 11, color: { argb: JC_TEXT } };

    row.getCell(1).value = i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1);
    row.getCell(1).font = baseFont;
    row.getCell(2).value = name;
    row.getCell(2).font = { ...baseFont, bold: true };
    row.getCell(3).value = stats.calls;
    row.getCell(3).font = { ...baseFont, bold: true, size: 13 };
    row.getCell(3).alignment = { horizontal: 'right' };
    row.getCell(4).value = stats.inbound;
    row.getCell(4).font = { ...baseFont, color: { argb: JC_GREEN } };
    row.getCell(4).alignment = { horizontal: 'right' };
    row.getCell(5).value = stats.outbound;
    row.getCell(5).font = { ...baseFont, color: { argb: JC_BLUE } };
    row.getCell(5).alignment = { horizontal: 'right' };
    row.getCell(6).value = fmtDur(stats.durSec);
    row.getCell(6).font = baseFont;
    row.getCell(6).alignment = { horizontal: 'right' };
    const avgSec = stats.calls > 0 ? Math.round(stats.durSec / stats.calls) : 0;
    row.getCell(7).value = fmtDur(avgSec);
    row.getCell(7).font = { ...baseFont, color: { argb: JC_LABEL } };
    row.getCell(7).alignment = { horizontal: 'right' };
    const pct = totalCalls > 0 ? ((stats.calls / totalCalls) * 100).toFixed(1) + '%' : '0%';
    row.getCell(8).value = pct;
    row.getCell(8).font = { ...baseFont, color: { argb: JC_LABEL } };
    row.getCell(8).alignment = { horizontal: 'right' };

    for (let col = 1; col <= 8; col++) {
      row.getCell(col).fill = fillStyle;
      row.getCell(col).border = docBorder;
    }
    row.height = 22;
  });

  // ── Save ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Filter Dropdown ──────────────────────────────────────────────────────────

function FilterDropdown({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-1.5 rounded-lg text-xs font-medium appearance-none cursor-pointer"
      style={{
        background: C.card,
        color: value !== 'all' ? C.cyan : C.sub,
        border: `1px solid ${value !== 'all' ? C.cyanHover : C.border}`,
        paddingRight: '1.5rem',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B92A8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.4rem center',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: '#141824', color: C.text }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Agent Mini Card ─────────────────────────────────────────────────────────

function AgentMiniCard({ agent, calls, talkMin }: AgentCallSummary) {
  const clr = agentColor(agent);
  return (
    <div className="flex-1 min-w-[120px] rounded-xl p-3 border" style={{ background: C.card, borderColor: C.border }}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: clr }} />
        <span className="text-xs font-medium" style={{ color: C.text }}>{capitalize(agent)}</span>
      </div>
      <div className="flex items-end gap-3">
        <div>
          <span className="text-lg font-bold font-mono" style={{ color: C.text }}>{calls}</span>
          <span className="text-xs ml-1" style={{ color: C.sub }}>calls</span>
        </div>
        <span className="text-xs font-mono" style={{ color: C.sub }}>{fmtTalkTime(talkMin)}</span>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

function getTodayMST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
}

function CallsPageInner() {
  const { brand, fullName } = useBrand();
  const [todayMST, setTodayMST] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });

  // Initialize dates on client only to avoid SSR hydration mismatch
  useEffect(() => {
    const t = getTodayMST();
    setTodayMST(t);
    setDateRange({ from: t, to: t });
  }, []);
  const [data, setData] = useState<CallsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [dirFilter, setDirFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [selectedSids, setSelectedSids] = useState<Set<string>>(new Set());

  const INITIAL_LOAD = 200;
  const LOAD_MORE_SIZE = 50;
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchData = useCallback(async (range: DateRange, offset = 0, append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const isSingleDay = range.from === range.to;
      const brandParam = `&brand=${brand}`;
      const base = isSingleDay
        ? `/api/calls?date=${range.from}`
        : `/api/calls?from=${range.from}&to=${range.to}`;
      const pageSize = offset === 0 ? INITIAL_LOAD : LOAD_MORE_SIZE;
      const url = `${base}&limit=${pageSize}&offset=${offset}${brandParam}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (append) {
        // Append new calls to existing data using functional update
        setData(prev => prev ? { ...json, calls: [...prev.calls, ...json.calls] } : json);
      } else {
        setData(json);
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [brand]);

  useEffect(() => {
    if (!dateRange.from) return; // Wait for client-side init
    fetchData(dateRange);
    // Only auto-refresh if viewing today
    if (dateRange.from === todayMST && dateRange.to === todayMST) {
      const interval = setInterval(() => fetchData(dateRange), 120_000);
      return () => clearInterval(interval);
    }
  }, [fetchData, dateRange, todayMST]);

  // Build unique client list from call data
  const clientOptions = useMemo(() => {
    if (!data) return [];
    const clients = new Set<string>();
    for (const c of data.calls) {
      if (c.account) clients.add(c.account);
    }
    return [...clients].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.calls.filter(c => {
      if (agentFilter !== 'all' && c.agent.toLowerCase() !== agentFilter) return false;
      if (clientFilter !== 'all' && (c.account || '') !== clientFilter) return false;
      if (dirFilter !== 'all' && c.direction !== dirFilter) return false;
      return true;
    });
  }, [data, agentFilter, clientFilter, dirFilter]);

  const [exporting, setExporting] = useState(false);

  const handleDownload = async () => {
    if (!data) return;
    setExporting(true);
    try {
      // Fetch ALL calls for the full date range (not just what's loaded)
      const isSingleDay = dateRange.from === dateRange.to;
      const brandParam = `&brand=${brand}`;
      const base = isSingleDay
        ? `/api/calls?date=${dateRange.from}`
        : `/api/calls?from=${dateRange.from}&to=${dateRange.to}`;

      let allCalls: RawCall[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const res = await fetch(`${base}&limit=2000&offset=${offset}${brandParam}`);
        if (!res.ok) break;
        const json = await res.json();
        allCalls = [...allCalls, ...(json.calls || [])];
        hasMore = json.hasMore;
        offset += 2000;
      }

      // Apply filters
      const exportCalls = allCalls.filter(c => {
        if (agentFilter !== 'all' && c.agent.toLowerCase() !== agentFilter) return false;
        if (clientFilter !== 'all' && (c.account || '') !== clientFilter) return false;
        if (dirFilter !== 'all' && c.direction !== dirFilter) return false;
        return true;
      });

      const subject = agentFilter !== 'all' ? agentFilter : 'all-agents';
      const dateLabel = dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from}_to_${dateRange.to}`;
      downloadReport(exportCalls, `JC_Call-Report_${dateLabel}_${subject}.xlsx`, dateRange.from);
    } finally {
      setExporting(false);
    }
  };

  // Selection helpers
  const recordingsInView = useMemo(
    () => filtered.filter(c => c.recordingUrl && c.callSid),
    [filtered],
  );

  const allSelected = recordingsInView.length > 0 && recordingsInView.every(c => selectedSids.has(c.callSid!));

  const toggleSelect = (sid: string) => {
    setSelectedSids(prev => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedSids(new Set());
    } else {
      setSelectedSids(new Set(recordingsInView.map(c => c.callSid!)));
    }
  };

  const downloadRecording = async (url: string, filename: string) => {
    const res = await fetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  const handleBulkDownload = async () => {
    for (const sid of selectedSids) {
      const call = filtered.find(c => c.callSid === sid);
      if (!call?.recordingUrl) continue;
      const url = call.recordingUrl + (call.recordingUrl.includes('?') ? '&' : '?') + 'download=1';
      await downloadRecording(url, `recording-${sid}.mp3`);
      await new Promise(r => setTimeout(r, 500));
    }
  };

  if (loading) {
    return (
      <>
        <NavBar />
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="grid grid-cols-5 gap-3 mb-6">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
          <div className="skeleton h-96 rounded-2xl" />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <NavBar />
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <p style={{ color: '#f87171' }}>Failed to load: {error}</p>
          <button onClick={() => fetchData(dateRange)} className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ background: C.cyan, color: '#000' }}>
            Retry
          </button>
        </div>
      </>
    );
  }

  const agents = ['all', ...ACTIVE_AGENTS];

  // Agent wrap-up lookup — placeholder for future per-call wrap column
  const totalCalls = data.calls.length;
  const recordingCount = data.calls.filter(c => c.recordingUrl).length;

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <HealthBanner />
      <ErrorBoundary section="Call Log">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* Agent Summary Strip */}
        <div className="flex gap-3 overflow-x-auto pb-1">
          {data.agents.map(a => (
            <AgentMiniCard key={a.agent} {...a} />
          ))}
        </div>

        {/* Date Range Picker + Filter Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker
            value={dateRange}
            onChange={(r) => { setDateRange(r); setSelectedSids(new Set()); }}
            maxDate={todayMST}
          />
          <div style={{ width: 1, height: 20, background: C.border }} />
          <Filter size={14} style={{ color: C.sub }} />
          <FilterDropdown
            value={agentFilter}
            onChange={setAgentFilter}
            options={agents.map(a => ({ value: a, label: a === 'all' ? 'All Agents' : capitalize(a) }))}
          />
          <FilterDropdown
            value={clientFilter}
            onChange={setClientFilter}
            options={[
              { value: 'all', label: 'All Clients' },
              ...clientOptions.map(c => ({ value: c, label: c })),
            ]}
          />
          <FilterDropdown
            value={dirFilter}
            onChange={v => setDirFilter(v as 'all' | 'inbound' | 'outbound')}
            options={[
              { value: 'all', label: 'All Directions' },
              { value: 'inbound', label: 'Inbound' },
              { value: 'outbound', label: 'Outbound' },
            ]}
          />

          <div className="flex items-center gap-3 ml-auto">
            {recordingCount > 0 && (
              <span className="text-xs font-mono flex items-center gap-1" style={{ color: C.sub }}>
                <Volume2 size={12} /> {recordingCount} recordings
              </span>
            )}
            <span className="text-xs font-mono" style={{ color: C.sub }}>
              {filtered.length} / {data?.total?.toLocaleString() || totalCalls} calls
            </span>
            {selectedSids.size > 0 && (
              <button
                onClick={handleBulkDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: C.cyanSoft,
                  color: C.cyan,
                  border: `1px solid ${C.cyan}44`,
                }}
              >
                <Download size={13} />
                Download {selectedSids.size} Recording{selectedSids.size > 1 ? 's' : ''}
              </button>
            )}
            <button
              onClick={handleDownload}
              disabled={!filtered.length || exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: filtered.length ? C.limeSoft : 'transparent',
                color: filtered.length ? C.lime : C.sub,
                border: `1px solid ${filtered.length ? C.limeHover : C.border}`,
                opacity: exporting ? 0.6 : 1,
              }}
            >
              <Download size={13} />
              {exporting ? 'Exporting...' : 'Export All Calls'}
            </button>
          </div>
        </div>

        {/* Call Table */}
        <Card padding={false}>
          <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: '#141824' }}>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th className="px-3 py-2.5 w-10">
                    {recordingsInView.length > 0 && (
                      <button onClick={toggleAll} className="p-0.5 rounded hover:bg-white/5" title="Select all recordings">
                        {allSelected
                          ? <CheckSquare size={14} style={{ color: C.cyan }} />
                          : <Square size={14} style={{ color: C.sub }} />}
                      </button>
                    )}
                  </th>
                  {['Time', 'Agent', 'Client', 'Phone', 'Duration', 'Ring', '', 'Recording'].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs font-medium" style={{ color: C.sub }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((call, i) => {
                  const hasRec = !!(call.recordingUrl && call.callSid);
                  const isSelected = hasRec && selectedSids.has(call.callSid!);
                  return (
                    <tr key={i} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="px-3 py-2.5 w-10">
                        {hasRec && (
                          <button onClick={() => toggleSelect(call.callSid!)} className="p-0.5 rounded hover:bg-white/5">
                            {isSelected
                              ? <CheckSquare size={14} style={{ color: C.cyan }} />
                              : <Square size={14} style={{ color: C.sub }} />}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.sub }}>{dateRange.from !== dateRange.to ? formatDateTime(call.time) : formatTime(call.time)}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: agentColor(call.agent) }} />
                          <span className="font-medium" style={{ color: C.text }}>{capitalize(call.agent)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-xs" style={{ color: call.account ? C.text : C.border }}>
                        {call.account || '—'}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.sub }}>{formatPhone(call.phone)}</td>
                      <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.text }}>{formatDuration(call.duration)}</td>
                      <td className="px-5 py-2.5 font-mono text-xs" style={{ color: call.ringTime ? C.cyan : C.border }}>
                        {call.ringTime ? call.ringTime + 's' : '—'}
                      </td>
                      <td className="px-5 py-2.5">
                        {call.direction === 'inbound'
                          ? <ArrowDown size={14} style={{ color: '#4ade80' }} />
                          : <ArrowUp size={14} style={{ color: '#38bdf8' }} />}
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          {hasRec ? (
                            <>
                              <InlinePlayer callSid={call.callSid!} recordingUrl={call.recordingUrl!} />
                              <button
                                onClick={() => shareRecording(call)}
                                className="p-1 rounded-md transition-colors hover:bg-white/5 border-none bg-transparent cursor-pointer"
                                title="Share recording"
                              >
                                <Share2 size={13} style={{ color: C.sub }} />
                              </button>
                              <button
                                onClick={() => downloadRecording(
                                  call.recordingUrl! + (call.recordingUrl!.includes('?') ? '&' : '?') + 'download=1',
                                  `recording-${call.callSid}.mp3`
                                )}
                                className="p-1 rounded-md transition-colors hover:bg-white/5 border-none bg-transparent cursor-pointer"
                                title="Download recording"
                              >
                                <Download size={13} style={{ color: C.sub }} />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs" style={{ color: C.border }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-sm" style={{ color: C.sub }}>
                      No calls match the current filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Load More / Total count */}
          {data && data.total > data.calls.length && (
            <div className="flex items-center justify-center gap-3 py-4 border-t" style={{ borderColor: C.border }}>
              <span className="text-xs font-mono" style={{ color: C.sub }}>
                Showing {data.calls.length.toLocaleString()} of {data.total.toLocaleString()} calls
              </span>
              <button
                onClick={() => fetchData(dateRange, data.calls.length, true)}
                disabled={loadingMore}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer transition-colors"
                style={{
                  background: C.cyan,
                  color: '#0A0E1A',
                  opacity: loadingMore ? 0.6 : 1,
                }}
              >
                {loadingMore ? 'Loading...' : `Load ${Math.min(LOAD_MORE_SIZE, data.total - data.calls.length).toLocaleString()} more`}
              </button>
              <span className="text-[10px]" style={{ color: C.sub }}>or</span>
              <button
                onClick={handleDownload}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border-none cursor-pointer transition-colors"
                style={{
                  background: C.limeSoft,
                  color: C.lime,
                  border: `1px solid ${C.lime}44`,
                  opacity: exporting ? 0.6 : 1,
                }}
              >
                <Download size={13} />
                {exporting ? 'Exporting...' : `Export all ${data.total.toLocaleString()} to spreadsheet`}
              </button>
            </div>
          )}
        </Card>
      </div>
      </ErrorBoundary>
    </>
  );
}

export default function CallsPage() {
  return (
    <Suspense fallback={<><NavBar /><div className="max-w-6xl mx-auto px-4 py-6"><div className="skeleton h-96 rounded-2xl" /></div></>}>
      <CallsPageInner />
    </Suspense>
  );
}
