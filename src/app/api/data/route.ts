import { NextRequest, NextResponse } from 'next/server';
import { fetchCallLegs, pairCallLegs, todayMST } from '@/lib/twilio';
import {
  fetchConversions,
  fetchConversionsForDates,
  fetchYTD,
  fetchSchedule,
  getScheduledHours,
  fetchYticaRepActivity,
  fetchYticaTeamStats,
  fetchYticaMtdActivity,
} from '@/lib/sheets';
import { blendYticaIntoPerioData, buildBrandSummary, deriveBrandView } from '@/lib/blender';
import { fetchKPIForDate, fetchKPIMtdSummary, type KPIAgentDay } from '@/lib/kpi-sheet';
import { parseBrand, MSC_ONLY_AGENTS, JC_ONLY_AGENTS, BLENDED_AGENTS, type Brand } from '@/lib/brand';
import {
  ACTIVE_AGENTS,
  OUTBOUND_AGENTS,
  EXCLUDED_AGENTS,
  MONTHLY_GOAL,
  DAILY_GOAL,
  TZ,
  normalizeAgent,
  isOnShift,
  isMonday,
} from '@/lib/constants';
import { cached } from '@/lib/cache';
import { resolveClient, isMscPhone, getClientBrand } from '@/lib/clients';

/** Resolve the brand of each call and tag it with the source of that determination.
 *  Returns calls with `resolvedBrand` and `brandSource` set.
 *  Unknown-brand calls get `resolvedBrand: null` — they only appear in Mixed. */
function resolveCallBrands(calls: PairedCall[]): PairedCall[] {
  return calls.map(call => {
    // 1. Client name brand — most reliable
    if (call.client) {
      const cb = getClientBrand(call.client);
      if (cb) return { ...call, resolvedBrand: cb, brandSource: 'client-name' as const };
    }
    // 2. Trunk phone number
    const trunk = call.direction === 'inbound' ? call.to : call.from;
    if (trunk?.startsWith('+')) {
      const trunkIsMsc = isMscPhone(trunk);
      return { ...call, resolvedBrand: trunkIsMsc ? 'msc' as const : 'jc' as const, brandSource: 'trunk-phone' as const };
    }
    // 3. Definitive agent brand (MSC-only / JC-only)
    const agent = normalizeAgent(call.agent || '');
    if (agent) {
      const lower = agent.toLowerCase();
      if (MSC_ONLY_AGENTS.has(lower)) return { ...call, resolvedBrand: 'msc' as const, brandSource: 'agent-definitive' as const };
      if (JC_ONLY_AGENTS.has(lower)) return { ...call, resolvedBrand: 'jc' as const, brandSource: 'agent-definitive' as const };
      // Blended agent with no trunk/client — we DON'T know the brand
      return { ...call, resolvedBrand: null, brandSource: 'agent-blended' as const };
    }
    // 4. No signal at all
    return { ...call, resolvedBrand: null, brandSource: 'unknown' as const };
  });
}

/** Filter tagged calls by brand. Unknown-brand calls only appear in Mixed. */
function filterCallsByBrand(calls: PairedCall[], brand: Brand): PairedCall[] {
  if (brand === 'mixed') return calls;
  return calls.filter(call => call.resolvedBrand === brand);
}

/** Build data quality metrics from tagged calls */
function buildDataQuality(calls: PairedCall[]): import('@/lib/types').DataQuality {
  const paired = { trunkMatch: 0, crossTrunk: 0, parentSid: 0, fallback: 0, missed: 0, outbound: 0 };
  const branded = { clientName: 0, trunkPhone: 0, agentDefinitive: 0, agentBlended: 0, unknown: 0 };
  for (const c of calls) {
    if (c.pairMethod === 'trunk-match') paired.trunkMatch++;
    else if (c.pairMethod === 'cross-trunk') paired.crossTrunk++;
    else if (c.pairMethod === 'parent-sid') paired.parentSid++;
    else if (c.pairMethod === 'fallback') paired.fallback++;
    else if (c.pairMethod === 'missed') paired.missed++;
    else if (c.pairMethod === 'outbound') paired.outbound++;
    if (c.brandSource === 'client-name') branded.clientName++;
    else if (c.brandSource === 'trunk-phone') branded.trunkPhone++;
    else if (c.brandSource === 'agent-definitive') branded.agentDefinitive++;
    else if (c.brandSource === 'agent-blended') branded.agentBlended++;
    else branded.unknown++;
  }
  const definitive = branded.clientName + branded.trunkPhone + branded.agentDefinitive;
  return {
    totalCalls: calls.length,
    paired,
    branded,
    brandConfidence: calls.length > 0 ? Math.round((definitive / calls.length) * 1000) / 10 : 100,
  };
}
// Old piecemeal functions removed — replaced by buildBrandSummary() + deriveBrandView() in blender.ts

import { twilioAuth, WORKSPACE_SID } from '@/lib/auth/twilio';
import { fetchAllWorkerStats } from '@/lib/daily-analytics';
import { fetchMscConversions, fetchMscConversionsRange } from '@/lib/ops-center';
import type { MscConversions } from '@/lib/ops-center';
import type {
  DashboardData,
  PeriodData,
  MtdData,
  TrendData,
  YtdData,
  RawCall,
  ScheduleData,
  RepAgent,
  OutboundAgent,
  AgentStat,
  AcctStat,
  PairedCall,
  MonthChampions,
  MonthChampion,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

// ── Date helpers (all MST / America/Edmonton) ──────────────────────

function mstNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

function dateMST(iso: string): Date {
  return new Date(new Date(iso).toLocaleString('en-US', { timeZone: TZ }));
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// ── Build repActivity from paired CDR calls + TaskRouter stats ─────

function buildRepActivity(
  calls: PairedCall[],
  conversions: { byAgent: Record<string, number> },
  workerStats: Record<string, { wrapUpSec: number; totalActiveSec: number; avgWrapUp: number; reservationsCreated?: number; reservationsAccepted?: number; reservationsRejected?: number; reservationsTimedOut?: number }>,
  schedule: Awaited<ReturnType<typeof fetchSchedule>>,
  dateObj: Date,
): { agents: RepAgent[]; outbound: OutboundAgent[]; avgSpeedSec: number | null } {
  const agentMap = new Map<string, { calls: number; dur: number; ringSum: number; ringCount: number }>();
  const outboundMap = new Map<string, { callsMade: number; dur: number }>();

  for (const call of calls) {
    const agent = normalizeAgent(call.agent);
    if (!agent) continue;

    if (call.direction === 'outbound') {
      const ob = outboundMap.get(agent) || { callsMade: 0, dur: 0 };
      ob.callsMade++;
      ob.dur += call.duration;
      outboundMap.set(agent, ob);
      continue;
    }

    const entry = agentMap.get(agent) || { calls: 0, dur: 0, ringSum: 0, ringCount: 0 };
    entry.calls++;
    entry.dur += call.duration;
    if (call.ringTime > 0 && call.ringTime < 120 && call.status === 'completed') {
      entry.ringSum += call.ringTime;
      entry.ringCount++;
    }
    agentMap.set(agent, entry);
  }

  const agents: RepAgent[] = [];
  const speedValues: number[] = [];

  for (const [agent, data] of agentMap) {
    const avgSpeed = data.ringCount > 0 ? Math.round((data.ringSum / data.ringCount) * 100) / 100 : null;
    const ws = workerStats[agent];
    const wrapUp = ws ? ws.avgWrapUp : null;
    const hrsSched = getScheduledHours(schedule, agent, dateObj);
    const conv = conversions.byAgent[agent] || 0;
    const hrsActive = ws ? ws.totalActiveSec / 3600 : 0;
    const effHrs = hrsActive > 0.25 ? hrsActive : hrsSched;
    const convsPerHour = effHrs > 0 ? Math.round((conv / effHrs) * 100) / 100 : 0;

    if (avgSpeed !== null) speedValues.push(avgSpeed);

    const resCreated = ws?.reservationsCreated ?? 0;
    const resAccepted = ws?.reservationsAccepted ?? 0;
    const resRejected = ws?.reservationsRejected ?? 0;
    const resTimedOut = ws?.reservationsTimedOut ?? 0;
    const pickupRate = resCreated > 0 ? Math.round((resAccepted / resCreated) * 1000) / 10 : undefined;
    const declineRate = resCreated > 0 ? Math.round((resRejected / resCreated) * 1000) / 10 : undefined;
    const ghostRate = resCreated > 0 ? Math.round((resTimedOut / resCreated) * 1000) / 10 : undefined;
    const trueYield = resCreated > 0 ? Math.round((conv / resCreated) * 1000) / 10 : undefined;

    agents.push({
      agent,
      calls: data.calls,
      talkMin: Math.round((data.dur / 60) * 10) / 10,
      speedSec: avgSpeed,
      wrapUpSec: wrapUp,
      hoursScheduled: hrsSched,
      hoursActive: hrsActive > 0 ? Math.round(hrsActive * 100) / 100 : undefined,
      convsPerHour,
      conversions: conv,
      reservationsCreated: resCreated || undefined,
      reservationsAccepted: resAccepted || undefined,
      reservationsRejected: resRejected || undefined,
      reservationsTimedOut: resTimedOut || undefined,
      pickupRate,
      declineRate,
      ghostRate,
      trueYield,
    });
  }

  agents.sort((a, b) => b.conversions - a.conversions || b.calls - a.calls);

  const outbound: OutboundAgent[] = [];
  for (const [agent, data] of outboundMap) {
    outbound.push({
      agent,
      callsMade: data.callsMade,
      talkMin: Math.round((data.dur / 60) * 10) / 10,
    });
  }
  outbound.sort((a, b) => b.callsMade - a.callsMade);

  const avgSpeedSec = speedValues.length > 0
    ? Math.round((speedValues.reduce((s, v) => s + v, 0) / speedValues.length) * 10) / 10
    : null;

  return { agents, outbound, avgSpeedSec };
}

// ── Build a PeriodData from raw sources ────────────────────────────

async function buildPeriodData(
  dateStr: string,
  calls: PairedCall[],
  conversions: Awaited<ReturnType<typeof fetchConversions>>,
  workerStats: Record<string, { wrapUpSec: number; totalActiveSec: number; avgWrapUp: number; reservationsCreated?: number; reservationsAccepted?: number; reservationsRejected?: number; reservationsTimedOut?: number }>,
  schedule: Awaited<ReturnType<typeof fetchSchedule>>,
  ytica: Awaited<ReturnType<typeof fetchYticaRepActivity>>,
  teamStats: Awaited<ReturnType<typeof fetchYticaTeamStats>>,
): Promise<PeriodData> {
  const dateObj = new Date(dateStr + 'T00:00:00');
  const repActivity = buildRepActivity(calls, conversions, workerStats, schedule, dateObj);

  const missedCalls = calls.filter(c => c.direction === 'inbound' && c.duration === 0);
  const missedByAccount: Record<string, number> = {};
  const missedHourly = new Array(24).fill(0);
  for (const c of missedCalls) {
    const acct = c.client || 'Unknown';
    missedByAccount[acct] = (missedByAccount[acct] || 0) + 1;
    const h = new Date(c.time).getHours();
    if (h >= 0 && h < 24) missedHourly[h]++;
  }
  const missedAcctArr: AcctStat[] = Object.entries(missedByAccount)
    .map(([account, count]) => ({ account, count }))
    .sort((a, b) => b.count - a.count);

  const answeredInbound = calls.filter(c => c.direction === 'inbound' && c.status === 'completed').length;
  const conversionRate = answeredInbound > 0
    ? Math.round((conversions.total / answeredInbound) * 1000) / 10
    : null;

  const byAgent: AgentStat[] = Object.entries(conversions.byAgent)
    .map(([agent, count]) => ({ agent, count }))
    .sort((a, b) => b.count - a.count);

  let period: PeriodData = {
    date: dateStr,
    conversions: {
      total: conversions.total,
      byAgent,
      byAccount: conversions.byAccount,
      hourly: conversions.byHour,
    },
    missedCalls: {
      total: missedCalls.length,
      byAccount: missedAcctArr,
      hourly: missedHourly,
    },
    repActivity,
    teamStats: teamStats ? { ...teamStats, source: 'ytica' as const } : null,
    conversionRate,
  };

  // Blend Ytica data — but NOT for today.
  // Ytica emails arrive at 6am with YESTERDAY's data, but the Apps Script
  // labels them with today's date. Blending today would overwrite real-time
  // CDR data with yesterday's stale numbers.
  const todayStr_ = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
  if (dateStr !== todayStr_) {
    period = blendYticaIntoPerioData(period, ytica);

    // Ytica-only agents get hoursScheduled=0 from the blender — patch them
    // with actual schedule data so conv/hr works for historical days
    for (const agent of period.repActivity.agents) {
      if (agent.hoursScheduled === 0) {
        agent.hoursScheduled = getScheduledHours(schedule, agent.agent, dateObj);
      }
      if (agent.convsPerHour == null && agent.hoursScheduled > 0) {
        const conv = conversions.byAgent[agent.agent.toLowerCase()] || 0;
        agent.convsPerHour = Math.round((conv / agent.hoursScheduled) * 100) / 100;
      }
    }
  }
  // Brand filtering is now applied in the GET handler per ?brand= param

  return period;
}

// ── Add CDR-derived call fields to any period ─────────────────────

/** Add CDR-derived call stats to a period. Single-pass over calls array. */
function addCallStats(
  period: PeriodData,
  calls: PairedCall[],
  opts?: { includeConvPerHour?: boolean },
): PeriodData & { convPerHour?: number } {
  // Single pass — no triple .filter()
  let answered = 0, missedInbound = 0, totalInbound = 0;
  for (const c of calls) {
    if (c.status === 'completed') answered++;
    if (c.direction === 'inbound') {
      totalInbound++;
      if (c.duration === 0) missedInbound++;
    }
  }

  const totalCalls = calls.length;
  const answerRate = totalCalls > 0 ? Math.round((answered / totalCalls) * 100) : 0;
  const missedCallRate = totalInbound > 0
    ? Math.round((missedInbound / totalInbound) * 1000) / 10
    : 0;

  const speedVals = period.repActivity.agents
    .filter(a => a.speedSec != null && a.speedSec > 0)
    .map(a => a.speedSec!);
  const teamAvgSpeed = period.repActivity.avgSpeedSec ?? (
    speedVals.length > 0
      ? Math.round((speedVals.reduce((s, v) => s + v, 0) / speedVals.length) * 10) / 10
      : 0
  );
  const fastestPickup = speedVals.length > 0 ? Math.min(...speedVals) : 0;

  const result: PeriodData & { convPerHour?: number } = {
    ...period,
    totalCalls,
    answeredCalls: answered,
    answerRate,
    missedCallRate,
    teamAvgSpeed,
    fastestPickup,
  };

  if (opts?.includeConvPerHour) {
    const now = mstNow();
    const startOfDay = new Date(now);
    startOfDay.setHours(7, 0, 0, 0);
    const hoursElapsed = Math.max((now.getTime() - startOfDay.getTime()) / 3600000, 0.5);
    result.convPerHour = Math.round((period.conversions.total / hoursElapsed) * 100) / 100;
  }

  return result;
}

// ── Reconcile headline metrics after Ytica blending ─────────────────
// CDR leg pairing is unreliable for historical days (legs expire/purge).
// Ytica is source of truth. After blending, headline numbers must reflect
// the blended agent data + Ytica team stats — not stale CDR counts.

function reconcileWithYtica(period: PeriodData): PeriodData {
  const agents = period.repActivity.agents;
  const agentSum = agents.reduce((s, a) => s + a.calls, 0);
  const ts = period.teamStats;

  // Ytica team stats are authoritative when available
  if (ts) {
    const answered = ts.inbound > 0 ? ts.inbound - ts.missed : agentSum;
    const totalCalls = ts.totalCalls || agentSum;
    const missed = ts.missed;
    const answerRate = totalCalls > 0 ? Math.round((answered / totalCalls) * 100) : 0;
    const missedCallRate = ts.inbound > 0
      ? Math.round((missed / ts.inbound) * 1000) / 10
      : 0;

    return {
      ...period,
      answeredCalls: answered,
      totalCalls,
      answerRate,
      missedCallRate,
      missedCalls: {
        ...period.missedCalls,
        total: missed,
      },
      conversionRate: answered > 0
        ? Math.round((period.conversions.total / answered) * 1000) / 10
        : period.conversionRate,
    };
  }

  // No Ytica team stats — fall back to blended agent sum if it's higher than CDR
  if (agentSum > (period.answeredCalls ?? 0)) {
    const totalCalls = agentSum + (period.missedCalls?.total ?? 0);
    const answerRate = totalCalls > 0 ? Math.round((agentSum / totalCalls) * 100) : 0;
    return {
      ...period,
      answeredCalls: agentSum,
      totalCalls,
      answerRate,
      conversionRate: agentSum > 0
        ? Math.round((period.conversions.total / agentSum) * 1000) / 10
        : period.conversionRate,
    };
  }

  return period;
}

// ── Build recentCalls (last 20 paired calls) ───────────────────────

function buildRecentCalls(calls: PairedCall[]): RawCall[] {
  return calls
    .filter(c => {
      // Show paired inbound calls (have agent + caller phone)
      // and outbound calls. Skip raw unpaired legs and duplicates.
      const hasPhone = c.from?.startsWith('+') || c.to?.startsWith('+');
      return hasPhone;
    })
    .slice(0, 20)
    .map(c => ({
      time: c.time,
      agent: c.agent,
      phone: c.from?.startsWith('+') ? c.from : c.to?.startsWith('+') ? c.to : '',
      duration: c.duration,
      direction: c.direction,
      callSid: c.id,
      recordingUrl: c.agentLegSid ? `/api/calls/recording?sid=${c.id}&agent_sid=${c.agentLegSid}` : undefined,
      account: c.client || undefined,
    }));
}

// ── Build MTD ──────────────────────────────────────────────────────

function buildMtd(
  mtdMap: Map<string, { total: number; byAgent: Record<string, number>; byAccount: AcctStat[]; byHour: number[] }>,
  now: Date,
): MtdData {
  let total = 0;
  const agentTotals: Record<string, number> = {};
  const agentDaily: Record<string, Record<string, number>> = {};
  const acctTotals: Record<string, number> = {};
  const acctAgentCounts: Record<string, Record<string, number>> = {};
  const hourly = new Array(24).fill(0);
  const mtdDaily: { date: string; total: number }[] = [];

  const sortedDates = [...mtdMap.keys()].sort();
  for (const date of sortedDates) {
    const entry = mtdMap.get(date)!;
    total += entry.total;
    mtdDaily.push({ date, total: entry.total });
    for (const [agent, count] of Object.entries(entry.byAgent)) {
      agentTotals[agent] = (agentTotals[agent] || 0) + count;
      if (!agentDaily[agent]) agentDaily[agent] = {};
      agentDaily[agent][date] = count;
    }
    for (const a of entry.byAccount) {
      acctTotals[a.account] = (acctTotals[a.account] || 0) + a.count;
      // Accumulate per-agent-per-account counts from daily breakdowns
      if (a.agentBreakdown) {
        if (!acctAgentCounts[a.account]) acctAgentCounts[a.account] = {};
        for (const [agent, cnt] of Object.entries(a.agentBreakdown)) {
          acctAgentCounts[a.account][agent] = (acctAgentCounts[a.account][agent] || 0) + cnt;
        }
      } else if (a.topAgent) {
        // Fallback: count days as top agent
        if (!acctAgentCounts[a.account]) acctAgentCounts[a.account] = {};
        acctAgentCounts[a.account][a.topAgent] = (acctAgentCounts[a.account][a.topAgent] || 0) + 1;
      }
    }
    for (let h = 0; h < 24; h++) hourly[h] += entry.byHour[h];
  }

  const dayOfMonth = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const dim = daysInMonth(year, month);
  const daysRemaining = dim - dayOfMonth;
  const goalPace = dayOfMonth > 0 ? Math.round((total / dayOfMonth) * dim) : 0;
  const projectedEOM = goalPace;
  const deficit = MONTHLY_GOAL - total;
  const requiredDailyRate = daysRemaining > 0 ? Math.round((deficit / daysRemaining) * 10) / 10 : 0;

  const byAgent: AgentStat[] = Object.entries(agentTotals)
    .map(([agent, count]) => ({ agent, count, daily: agentDaily[agent] }))
    .sort((a, b) => b.count - a.count);

  const byAccount: AcctStat[] = Object.entries(acctTotals)
    .map(([account, count]) => {
      const agents = acctAgentCounts[account];
      const topAgent = agents ? Object.entries(agents).sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
      return { account, count, topAgent, agentBreakdown: agents && Object.keys(agents).length > 0 ? agents : undefined };
    })
    .sort((a, b) => b.count - a.count);

  return {
    total,
    byAgent,
    goal: MONTHLY_GOAL,
    dailyGoal: DAILY_GOAL,
    dayOfMonth,
    daysInMonth: dim,
    daysRemaining,
    goalPace,
    projectedEOM,
    deficit,
    requiredDailyRate,
    onTrack: projectedEOM >= MONTHLY_GOAL,
    byAccount,
    hourly,
    mtdDaily,
  };
}

// ── Build trend7d ──────────────────────────────────────────────────

function buildTrend7d(
  trendMap: Map<string, { total: number; byAgent: Record<string, number>; byAccount: AcctStat[]; byHour: number[] }>,
  dates: string[],
): TrendData {
  const trendDates: string[] = [];
  const conversions: number[] = [];
  const missed: number[] = [];
  const conversionRate: (number | null)[] = [];

  for (const date of dates) {
    const entry = trendMap.get(date);
    trendDates.push(date);
    conversions.push(entry?.total ?? 0);
    // We don't have missed call data from sheets for historical days, default to 0
    missed.push(0);
    conversionRate.push(null);
  }

  return { dates: trendDates, conversions, missed, conversionRate };
}

// ── Build YTD ──────────────────────────────────────────────────────

function buildYtd(raw: { total: number; byMonth: { month: string; conversions: number }[] }): YtdData {
  const annualGoal = MONTHLY_GOAL * 12;
  const now = mstNow();
  const monthsElapsed = now.getMonth() + 1;
  const annualPace = monthsElapsed > 0
    ? Math.round((raw.total / monthsElapsed) * 12)
    : 0;

  return {
    total: raw.total,
    byMonth: raw.byMonth,
    goal: annualGoal,
    annualPace,
    projectedEOY: annualPace,
    onTrack: annualPace >= annualGoal,
  };
}

// ── Build schedule data ────────────────────────────────────────────

function buildScheduleData(
  entries: Awaited<ReturnType<typeof fetchSchedule>>,
): ScheduleData {
  const nowMST = mstNow();
  return {
    agents: entries.map(e => ({
      name: e.name,
      schedule: e.schedule,
      hrsPerWeek: e.hrsPerWeek,
      isOnShift: isOnShift(e.schedule, nowMST),
    })),
  };
}

// ── Weekly totals ──────────────────────────────────────────────────

function getWeekDates(offsetWeeks: number): string[] {
  const now = mstNow();
  // Start of this week (Monday)
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offsetWeeks * 7);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(fmtDate(d));
  }
  return dates;
}

// ════════════════════════════════════════════════════════════════════
// GET handler
// ════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const brand = parseBrand(request.nextUrl.searchParams.get('brand'));

    // Cache raw (unfiltered) data once — all brands share the same fetch
    const raw = await cached('dashboard-data', 30_000, fetchDashboardData) as DashboardData & {
      _todayCalls?: PairedCall[];
      _yesterdayCalls?: PairedCall[];
      _schedule?: Awaited<ReturnType<typeof fetchSchedule>>;
      _workerStats?: Record<string, { wrapUpSec: number; totalActiveSec: number; avgWrapUp: number; reservationsCreated?: number; reservationsAccepted?: number; reservationsRejected?: number; reservationsTimedOut?: number }>;
      _yesterdayWorkerStats?: Record<string, { wrapUpSec: number; totalActiveSec: number; avgWrapUp: number; reservationsCreated?: number; reservationsAccepted?: number; reservationsRejected?: number; reservationsTimedOut?: number }>;
      _todayConversions?: { total: number; byAgent: Record<string, number>; byAccount: AcctStat[]; byHour: number[] };
      _yesterdayConv?: { total: number; byAgent: Record<string, number>; byAccount: AcctStat[]; byHour: number[] };
      _mscConvToday?: MscConversions | null;
      _mscConvYesterday?: MscConversions | null;
    };

    // ── Brand pipeline: Mixed-first, derive everything ──────────
    // 1. Tag CDR calls with brand
    // 2. Build brand summary (single pass)
    // 3. deriveBrandView() produces complete PeriodData per brand

    const todayPaired = raw._todayCalls || [];
    const taggedToday = resolveCallBrands(todayPaired);
    const todaySummary = buildBrandSummary(taggedToday);

    const yesterdayPaired = raw._yesterdayCalls || [];
    const taggedYesterday = resolveCallBrands(yesterdayPaired);
    const yesterdaySummary = buildBrandSummary(taggedYesterday);

    // Derive complete brand views — every metric split consistently
    let derivedToday = deriveBrandView(raw.today, brand, todaySummary);
    const derivedYesterday = deriveBrandView(raw.yesterday, brand, yesterdaySummary);

    // Data quality from CDR pairing (informational only)
    const dataQuality = buildDataQuality(taggedToday);

    // Recent calls filtered by brand
    const brandTodayCalls = filterCallsByBrand(taggedToday, brand);
    const brandRecentCalls = buildRecentCalls(brandTodayCalls);

    // Brand-specific conversion overrides:
    // - Mixed: uses merged JC+MSC (already in canonical period from todayConvMerged)
    // - JC: override with Sheets-only conversions (strip MSC)
    // - MSC: override with GHL-only conversions (strip JC)
    const jcConv = raw._todayConversions;
    const mscConv = raw._mscConvToday;
    if (brand === 'jc' && jcConv) {
      // JC view: only Google Sheets conversions
      derivedToday = {
        ...derivedToday,
        conversions: {
          total: jcConv.total,
          byAgent: Object.entries(jcConv.byAgent).map(([agent, count]) => ({ agent, count: count as number })),
          byAccount: jcConv.byAccount,
          hourly: jcConv.byHour,
        },
      };
    } else if (brand === 'msc') {
      // MSC view: GHL conversions only. If GHL unavailable, show 0 (not JC's data).
      if (mscConv) {
        derivedToday = {
          ...derivedToday,
          conversions: {
            total: mscConv.total,
            byAgent: Object.entries(mscConv.byAgent).map(([agent, count]) => ({ agent, count })),
            byAccount: mscConv.byAccount,
            hourly: mscConv.byHour,
          },
        };
      } else {
        derivedToday = {
          ...derivedToday,
          conversions: { total: 0, byAgent: [], byAccount: [], hourly: new Array(24).fill(0) },
        };
      }
    }
    // Mixed: derivedToday already has merged conversions from buildPeriodData(todayConvMerged)

    // Strip internal fields from response
    const { _todayCalls, _yesterdayCalls, _schedule, _workerStats, _yesterdayWorkerStats, _todayConversions, _yesterdayConv, _mscConvToday, _mscConvYesterday, ...cleanRaw } = raw;

    // Brand breakdown: always compute JC + MSC views so Mixed insights
    // can show fully attributed call counts (no mystery buckets)
    const jcView = brand === 'jc' ? derivedToday : deriveBrandView(raw.today, 'jc', todaySummary);
    const mscView = brand === 'msc' ? derivedToday : deriveBrandView(raw.today, 'msc', todaySummary);
    const brandBreakdown = {
      jc: { calls: jcView.answeredCalls ?? jcView.repActivity.agents.reduce((s, a) => s + a.calls, 0), avgSpeed: jcView.repActivity.avgSpeedSec },
      msc: { calls: mscView.answeredCalls ?? mscView.repActivity.agents.reduce((s, a) => s + a.calls, 0), avgSpeed: mscView.repActivity.avgSpeedSec },
    };

    // ── Staleness detection ────────────────────────────────────
    // Report data age so the frontend can warn when sources are stale
    const yticaAge = raw.yesterday.teamStats
      ? { source: 'ytica', fresh: true, note: 'Yesterday data from 6am dump' }
      : { source: 'ytica', fresh: false, note: 'No Ytica teamStats for yesterday — using CDR agent sums' };
    const cdrAge = { source: 'cdr', callCount: todayPaired.length, note: 'Real-time Twilio CDR' };

    // ── Reconciliation ──────────────────────────────────────────
    // Compare Ytica vs CDR vs agent sums — shows data health at a glance
    const mixedView = brand === 'mixed' ? derivedToday : deriveBrandView(raw.today, 'mixed', todaySummary);
    const reconciliation = {
      yticaTeamTotal: raw.today.teamStats?.totalCalls ?? null,
      cdrPairedTotal: todayPaired.length,
      cdrAnswered: todaySummary.jc.answered + todaySummary.msc.answered + todaySummary.unknown.answered,
      cdrMissed: todaySummary.jc.missed + todaySummary.msc.missed + todaySummary.unknown.missed,
      agentSum: mixedView.repActivity.agents.reduce((s, a) => s + a.calls, 0),
      headlineAnswered: mixedView.answeredCalls,
      brandSplit: {
        jcAnswered: jcView.answeredCalls,
        mscAnswered: mscView.answeredCalls,
        sum: (jcView.answeredCalls ?? 0) + (mscView.answeredCalls ?? 0),
        matchesHeadline: (jcView.answeredCalls ?? 0) + (mscView.answeredCalls ?? 0) === mixedView.answeredCalls,
      },
    };

    // Filter weekend data through brand pipeline (no CDR for historical days → 50/50 blended split)
    const emptySummary = buildBrandSummary([]);
    const brandWeekend = cleanRaw.weekend ? {
      friday: deriveBrandView(cleanRaw.weekend.friday, brand, emptySummary),
      saturday: deriveBrandView(cleanRaw.weekend.saturday, brand, emptySummary),
      sunday: derivedYesterday,
    } : undefined;

    const data = {
      ...cleanRaw,
      today: {
        ...derivedToday,
        convPerHour: raw.today.convPerHour,
      },
      yesterday: derivedYesterday,
      weekend: brandWeekend,
      recentCalls: brandRecentCalls,
      dataQuality,
      brandBreakdown,
      brand,
      _health: { staleness: { ytica: yticaAge, cdr: cdrAge }, reconciliation },
    };

    const res = NextResponse.json(data);
    res.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API /data]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function fetchDashboardData(): Promise<DashboardData> {
  const now = mstNow();
  const todayStr = todayMST();
  const yesterdayStr = addDays(todayStr, -1);
  const auth = twilioAuth();

  // ── Compute date ranges ────────────────────────────────────────
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dim = daysInMonth(year, month);

  // MTD dates: 1st of month through today
  const mtdDates: string[] = [];
  for (let d = 1; d <= now.getDate(); d++) {
    mtdDates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  // Trend: last 7 days (not including today)
  const trend7dDates: string[] = [];
  for (let i = 7; i >= 1; i--) {
    trend7dDates.push(addDays(todayStr, -i));
  }

  // Week dates for thisWeek / lastWeek
  const thisWeekDates = getWeekDates(0);
  const lastWeekDates = getWeekDates(-1);

  // All historical dates we need conversions for (deduplicated)
  const allHistDates = [...new Set([...mtdDates, ...trend7dDates, ...thisWeekDates, ...lastWeekDates, yesterdayStr])];

  // ── Parallel fetch: today + historical ─────────────────────────
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  const [
    todayLegs,
    todayConversions,
    todayWorkerStats,
    todayYtica,
    todayTeamStats,
    schedule,
    histConversions,
    ytdRaw,
    yesterdayYtica,
    yesterdayTeamStats,
    mscConvToday,
    mscConvYesterday,
    mscConvHist,
    mtdYtica,
  ] = await Promise.all([
    cached('today-legs', 30_000, () => fetchCallLegs(todayStr)),
    cached('today-conv', 30_000, () => fetchConversions(todayStr)),
    cached('today-workers', 30_000, () => fetchAllWorkerStats(todayStr, auth)),
    cached('today-ytica', 30_000, () => fetchYticaRepActivity(todayStr)),
    cached('today-team', 30_000, () => fetchYticaTeamStats(todayStr)),
    cached('schedule', 3_600_000, () => fetchSchedule()),
    cached('hist-conv', 3_600_000, () => fetchConversionsForDates(allHistDates)),
    cached('ytd', 3_600_000, () => fetchYTD(year)),
    cached('yesterday-ytica', 3_600_000, () => fetchYticaRepActivity(yesterdayStr)),
    cached('yesterday-team', 3_600_000, () => fetchYticaTeamStats(yesterdayStr)),
    cached('msc-conv-today', 60_000, () => fetchMscConversions(todayStr).catch(() => null)),
    cached('msc-conv-yesterday', 3_600_000, () => fetchMscConversions(yesterdayStr).catch(() => null)),
    cached('msc-conv-hist', 3_600_000, () =>
      fetchMscConversionsRange(allHistDates[0], allHistDates[allHistDates.length - 1]).catch(() => [] as MscConversions[]),
    ),
    cached('mtd-ytica', 30_000, () => fetchYticaMtdActivity(monthPrefix)),
  ]);

  // ── KPI Sheet — primary source for agent metrics ────────────────
  // Fetched separately (non-blocking) — overrides Ytica/CDR values
  const [kpiToday, kpiYesterday, kpiMtd] = await Promise.all([
    cached('kpi-today', 30_000, () => fetchKPIForDate(todayStr).catch(() => [] as KPIAgentDay[])),
    cached('kpi-yesterday', 3_600_000, () => fetchKPIForDate(yesterdayStr).catch(() => [] as KPIAgentDay[])),
    cached('kpi-mtd', 300_000, () => fetchKPIMtdSummary(monthPrefix).catch(() => ({ totalConversions: 0, totalCalls: 0, byAgent: [], byDate: [] }))),
  ]);

  // ── Merge MSC (GHL) conversions into JC (Sheets) conversions ──
  // JC conversions come from Google Sheets. MSC conversions come from
  // GHL via ops-center. For Mixed view we need both combined.
  // For JC view, only Sheets. For MSC view, only GHL.
  type ConvEntry = { total: number; byAgent: Record<string, number>; byAccount: AcctStat[]; byHour: number[] };

  function mergeConversions(jc: ConvEntry, msc: MscConversions | null): ConvEntry {
    if (!msc || msc.total === 0) return jc;
    const byAgent = { ...jc.byAgent };
    for (const [agent, count] of Object.entries(msc.byAgent)) {
      byAgent[agent] = (byAgent[agent] || 0) + count;
    }
    const acctMap: Record<string, number> = {};
    for (const a of jc.byAccount) acctMap[a.account] = (acctMap[a.account] || 0) + a.count;
    for (const a of msc.byAccount) acctMap[a.account] = (acctMap[a.account] || 0) + a.count;
    const byAccount = Object.entries(acctMap).map(([account, count]) => ({ account, count })).sort((a, b) => b.count - a.count);
    const byHour = jc.byHour.map((h, i) => h + (msc.byHour[i] || 0));
    return { total: jc.total + msc.total, byAgent, byAccount, byHour };
  }

  // Build MSC historical lookup: date → MscConversions
  const mscHistMap = new Map<string, MscConversions>();
  if (Array.isArray(mscConvHist)) {
    for (const entry of mscConvHist) {
      if (entry?.date) mscHistMap.set(entry.date, entry);
    }
  }

  // Merge MSC into historical conversion map
  for (const [date, jcEntry] of histConversions) {
    const mscEntry = mscHistMap.get(date);
    if (mscEntry) {
      histConversions.set(date, mergeConversions(jcEntry, mscEntry));
    }
  }

  // Merge MSC into today's conversions (preserve firstConvByAgent/lastConvByAgent from Sheets)
  const todayConvMerged = {
    ...mergeConversions(todayConversions, mscConvToday),
    firstConvByAgent: todayConversions.firstConvByAgent,
    lastConvByAgent: todayConversions.lastConvByAgent,
  };

  // ── Today ──────────────────────────────────────────────────────
  const todayCalls = pairCallLegs(todayLegs);
  const todayPeriod = await buildPeriodData(
    todayStr,
    todayCalls,
    todayConvMerged,
    todayWorkerStats,
    schedule,
    todayYtica,
    todayTeamStats,
  );
  // ── Override agent metrics with KPI Sheet data (primary source) ──
  // KPI Sheet has: ring time, pickup %, conversions, wrap-up, talk time — all pre-calculated with brand tags
  function applyKPIOverrides(period: PeriodData, kpiRows: KPIAgentDay[]) {
    if (kpiRows.length === 0) {
      // Fallback: use MTD Ytica if no KPI data
      if (mtdYtica.length > 0) {
        const mtdLookup = new Map(mtdYtica.map(a => [a.agent.toLowerCase(), a]));
        for (const agent of period.repActivity.agents) {
          const mtd = mtdLookup.get(agent.agent.toLowerCase());
          if (mtd) {
            if (mtd.avgSpeedSec != null) agent.speedSec = mtd.avgSpeedSec;
            if (mtd.avgWrapUpSec != null) agent.wrapUpSec = mtd.avgWrapUpSec;
          }
        }
      }
      return;
    }

    const kpiLookup = new Map(kpiRows.map(k => [k.agent.toLowerCase(), k]));
    for (const agent of period.repActivity.agents) {
      const kpi = kpiLookup.get(agent.agent.toLowerCase());
      if (!kpi) continue;

      // Speed: ring time from KPI sheet (THE metric Burke wants)
      if (kpi.ringTimeSec > 0) agent.speedSec = kpi.ringTimeSec;
      // Wrap-up
      if (kpi.avgWrapSec > 0) agent.wrapUpSec = kpi.avgWrapSec;
      // Pickup rate (from KPI sheet % picked up)
      if (kpi.pickupPct > 0 && kpi.callsAvailable > 0) {
        agent.pickupRate = kpi.pickupPct;
        agent.reservationsCreated = kpi.callsAvailable;
        agent.reservationsAccepted = kpi.callsPickedUp;
      }
      // Calls — KPI sheet is authoritative
      if (kpi.callsPickedUp > 0) {
        agent.calls = kpi.callsPickedUp;
      }
      // Talk time — KPI sheet is authoritative
      if (kpi.totalTalkMin > 0) {
        agent.talkMin = kpi.totalTalkMin;
      }
      // Conversions — KPI sheet has brand-accurate conversion counts
      if (kpi.conversions > 0) {
        agent.conversions = kpi.conversions;
      }
    }

    // Rebuild conversions.byAgent from KPI-overridden agent data
    if (kpiRows.length > 0) {
      const kpiConvByAgent = period.repActivity.agents
        .filter(a => a.conversions > 0)
        .map(a => ({ agent: a.agent, count: a.conversions }))
        .sort((a, b) => b.count - a.count);
      const kpiConvTotal = kpiConvByAgent.reduce((s, a) => s + a.count, 0);
      if (kpiConvTotal > 0) {
        period.conversions = {
          ...period.conversions,
          total: kpiConvTotal,
          byAgent: kpiConvByAgent,
        };
      }
    }

    // Cross-check missed calls: KPI available - picked up
    const kpiTotalAvailable = kpiRows.reduce((s, k) => s + k.callsAvailable, 0);
    const kpiTotalPicked = kpiRows.reduce((s, k) => s + k.callsPickedUp, 0);
    if (kpiTotalAvailable > 0) {
      const kpiMissed = kpiTotalAvailable - kpiTotalPicked;
      if (kpiMissed >= 0 && kpiMissed > period.missedCalls.total) {
        period.missedCalls = { ...period.missedCalls, total: kpiMissed };
      }
    }

    // Recompute team average from KPI-corrected values
    const speedVals = period.repActivity.agents
      .filter(a => a.speedSec != null && a.speedSec! > 0)
      .map(a => a.speedSec!);
    period.repActivity.avgSpeedSec = speedVals.length > 0
      ? +(speedVals.reduce((s, v) => s + v, 0) / speedVals.length).toFixed(1)
      : null;
  }

  applyKPIOverrides(todayPeriod, kpiToday);
  const today = addCallStats(todayPeriod, todayCalls, { includeConvPerHour: true }) as DashboardData['today'];

  // ── Yesterday ──────────────────────────────────────────────────
  // Always fetch CDR legs + TaskRouter stats for yesterday so we get
  // totalCalls, answerRate, missed calls, pickup/decline/ghost rates.
  // Ytica speed/wrapup data is blended on top via buildPeriodData.
  const yesterdayConv = histConversions.get(yesterdayStr) || { total: 0, byAgent: {}, byAccount: [], byHour: new Array(24).fill(0) };

  const [yesterdayLegs, yesterdayWorkerStats] = await Promise.all([
    cached('yesterday-legs', 3_600_000, () => fetchCallLegs(yesterdayStr)),
    cached('yesterday-workers', 3_600_000, () => fetchAllWorkerStats(yesterdayStr, auth)),
  ]);
  const yesterdayCalls = pairCallLegs(yesterdayLegs);
  let yesterday = await buildPeriodData(
    yesterdayStr, yesterdayCalls,
    { total: yesterdayConv.total, byAgent: yesterdayConv.byAgent as Record<string, number>, byAccount: yesterdayConv.byAccount, byHour: yesterdayConv.byHour, firstConvByAgent: {}, lastConvByAgent: {} },
    yesterdayWorkerStats,
    schedule, yesterdayYtica, yesterdayTeamStats,
  );
  // Add CDR-derived call stats, then reconcile with Ytica source of truth.
  // CDR leg pairing is unreliable for historical days — Ytica team stats
  // and blended agent sums must drive the headline numbers.
  yesterday = addCallStats(yesterday, yesterdayCalls);
  yesterday = reconcileWithYtica(yesterday);
  applyKPIOverrides(yesterday, kpiYesterday);

  // ── Weekend (Monday only) ─────────────────────────────────────
  // On Monday, fetch Friday + Saturday from Ytica (source of truth for
  // historical days). Sunday = yesterday (already built above).
  // No CDR needed — pass empty calls, Ytica blends on top.
  let weekendData: { friday: PeriodData; saturday: PeriodData; sunday: PeriodData } | undefined;
  if (isMonday()) {
    const fridayStr = addDays(todayStr, -3);
    const saturdayStr = addDays(todayStr, -2);
    // Sunday is yesterday, already fetched

    const [fridayYtica, fridayTeam, saturdayYtica, saturdayTeam] = await Promise.all([
      cached('friday-ytica', 3_600_000, () => fetchYticaRepActivity(fridayStr)),
      cached('friday-team', 3_600_000, () => fetchYticaTeamStats(fridayStr)),
      cached('saturday-ytica', 3_600_000, () => fetchYticaRepActivity(saturdayStr)),
      cached('saturday-team', 3_600_000, () => fetchYticaTeamStats(saturdayStr)),
    ]);

    // Conversions for Fri/Sat are already in histConversions (fetched for MTD/trend)
    const emptyConv = { total: 0, byAgent: {} as Record<string, number>, byAccount: [] as AcctStat[], byHour: new Array(24).fill(0), firstConvByAgent: {}, lastConvByAgent: {} };
    const friConvEntry = histConversions.get(fridayStr);
    const satConvEntry = histConversions.get(saturdayStr);
    const friConv = friConvEntry ? { ...friConvEntry, firstConvByAgent: {}, lastConvByAgent: {} } : emptyConv;
    const satConv = satConvEntry ? { ...satConvEntry, firstConvByAgent: {}, lastConvByAgent: {} } : emptyConv;

    const friday = await buildPeriodData(fridayStr, [], friConv, {}, schedule, fridayYtica, fridayTeam);
    const saturday = await buildPeriodData(saturdayStr, [], satConv, {}, schedule, saturdayYtica, saturdayTeam);

    weekendData = { friday, saturday, sunday: yesterday };
  }

  // ── MTD ────────────────────────────────────────────────────────
  // Build mtdMap from histConversions restricted to mtdDates
  const mtdMap = new Map<string, { total: number; byAgent: Record<string, number>; byAccount: AcctStat[]; byHour: number[] }>();
  for (const d of mtdDates) {
    const entry = histConversions.get(d);
    if (entry) mtdMap.set(d, entry);
    else mtdMap.set(d, { total: 0, byAgent: {}, byAccount: [], byHour: new Array(24).fill(0) });
  }
  // Override today's entry with live merged data (JC Sheets + MSC GHL)
  mtdMap.set(todayStr, {
    total: todayConvMerged.total,
    byAgent: todayConvMerged.byAgent,
    byAccount: todayConvMerged.byAccount,
    byHour: todayConvMerged.byHour,
  });
  const mtd = buildMtd(mtdMap, now);

  // ── Trend 7d ───────────────────────────────────────────────────
  const trendMap = new Map<string, { total: number; byAgent: Record<string, number>; byAccount: AcctStat[]; byHour: number[] }>();
  for (const d of trend7dDates) {
    const entry = histConversions.get(d);
    if (entry) trendMap.set(d, entry);
    else trendMap.set(d, { total: 0, byAgent: {}, byAccount: [], byHour: new Array(24).fill(0) });
  }
  const trend7d = buildTrend7d(trendMap, trend7dDates);

  // ── YTD ────────────────────────────────────────────────────────
  const ytd = buildYtd(ytdRaw);

  // ── Weekly totals ──────────────────────────────────────────────
  let thisWeek = 0;
  for (const d of thisWeekDates) {
    if (d === todayStr) {
      thisWeek += todayConvMerged.total;
    } else {
      thisWeek += histConversions.get(d)?.total ?? 0;
    }
  }
  let lastWeek = 0;
  for (const d of lastWeekDates) {
    lastWeek += histConversions.get(d)?.total ?? 0;
  }

  // ── Recent calls ───────────────────────────────────────────────
  const recentCalls = buildRecentCalls(todayCalls);

  // ── Schedule ───────────────────────────────────────────────────
  const scheduleData = buildScheduleData(schedule);

  // ── Previous Month Champions (day 1-3 of new month) ───────────
  let prevMonthChampions: MonthChampions | undefined;
  if (now.getDate() <= 3) {
    try {
      const prevMonth = now.getMonth(); // 0-based, so current getMonth() is actually prev month's 1-based
      const prevYear = prevMonth === 0 ? year - 1 : year;
      const prevMonthNum = prevMonth === 0 ? 12 : prevMonth;
      const prevDim = daysInMonth(prevYear, prevMonthNum);

      const prevDates: string[] = [];
      for (let d = 1; d <= prevDim; d++) {
        prevDates.push(`${prevYear}-${String(prevMonthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }

      const prevConvs = await cached('prev-month-convs', 3_600_000, () =>
        fetchConversionsForDates(prevDates),
      );

      // Aggregate per agent (excluding Sara, Sue, etc.)
      const excluded = new Set(EXCLUDED_AGENTS.map(a => a.toLowerCase()));
      const agentTotals: Record<string, number> = {};
      const agentBestDay: Record<string, number> = {};
      const agentDaysActive: Record<string, number> = {};
      for (const [, entry] of prevConvs) {
        for (const [agent, count] of Object.entries(entry.byAgent)) {
          const name = normalizeAgent(agent);
          if (!name || excluded.has(name)) continue;
          agentTotals[name] = (agentTotals[name] || 0) + count;
          agentBestDay[name] = Math.max(agentBestDay[name] || 0, count);
          agentDaysActive[name] = (agentDaysActive[name] || 0) + 1;
        }
      }

      function topTwo(arr: [string, number][]): MonthChampion {
        const sorted = arr.filter(([name]) => !excluded.has(name.toLowerCase())).sort((a, b) => b[1] - a[1]);
        return {
          agent: sorted[0]?.[0] || '',
          value: sorted[0]?.[1] || 0,
          runnerUp: sorted[1]?.[0],
          runnerUpValue: sorted[1]?.[1],
        };
      }

      function topTwoMin(arr: [string, number][]): MonthChampion {
        const sorted = arr.filter(([name, v]) => v > 0 && !excluded.has(name.toLowerCase())).sort((a, b) => a[1] - b[1]);
        return {
          agent: sorted[0]?.[0] || '',
          value: sorted[0]?.[1] || 0,
          runnerUp: sorted[1]?.[0],
          runnerUpValue: sorted[1]?.[1],
        };
      }

      // Yesterday's agents for speed/talk (daily data is all we have for CDR metrics)
      const ydAgents = yesterday.repActivity.agents.filter(a => !excluded.has(a.agent.toLowerCase()));

      const monthName = new Date(prevYear, prevMonthNum - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

      prevMonthChampions = {
        month: monthName,
        mostConversions: topTwo(Object.entries(agentTotals)),
        // For calls/speed/talk we only have yesterday's snapshot — label accordingly
        mostCalls: topTwo(ydAgents.map(a => [a.agent, a.calls] as [string, number])),
        fastestSpeed: topTwoMin(
          ydAgents.filter(a => a.speedSec != null && a.speedSec > 0).map(a => [a.agent, a.speedSec!] as [string, number]),
        ),
        mostTalkTime: topTwo(ydAgents.map(a => [a.agent, a.talkMin] as [string, number])),
        bestConvRate: topTwo(
          Object.entries(agentTotals)
            .filter(([, convs]) => convs >= 5) // minimum 5 conversions to qualify
            .map(([name, convs]) => {
              const days = agentDaysActive[name] || 1;
              const rate = Math.round((convs / days) * 100) / 100; // convs per active day
              return [name, rate] as [string, number];
            }),
        ),
      };
    } catch (err) {
      console.warn('[API /data] prev month champions failed:', err instanceof Error ? err.message : err);
    }
  }

  // ── Per-client speed (CDR total wait) ──────────────────────────
  // How long each client's callers wait before reaching an agent.
  // Computed from yesterday's paired calls with valid ring times.
  const clientSpeedMap: Record<string, { ringSum: number; count: number }> = {};
  for (const c of yesterdayCalls) {
    if (c.client && c.ringTime > 0 && c.ringTime < 120 && c.status === 'completed' && c.direction === 'inbound') {
      const key = c.client.toLowerCase();
      if (!clientSpeedMap[key]) clientSpeedMap[key] = { ringSum: 0, count: 0 };
      clientSpeedMap[key].ringSum += c.ringTime;
      clientSpeedMap[key].count++;
    }
  }
  const clientSpeed = Object.entries(clientSpeedMap)
    .map(([account, { ringSum, count }]) => ({ account, avgSpeed: Math.round((ringSum / count) * 10) / 10, calls: count }))
    .sort((a, b) => b.avgSpeed - a.avgSpeed); // worst first

  // ── Assemble ───────────────────────────────────────────────────
  const pulledAt = new Date().toISOString();

  const dashboard: DashboardData & { _todayCalls?: PairedCall[]; _yesterdayCalls?: PairedCall[]; _schedule?: Awaited<ReturnType<typeof fetchSchedule>>; _workerStats?: Record<string, { wrapUpSec: number; totalActiveSec: number; avgWrapUp: number; reservationsCreated?: number; reservationsAccepted?: number; reservationsRejected?: number; reservationsTimedOut?: number }>; _yesterdayWorkerStats?: typeof yesterdayWorkerStats; _todayConversions?: typeof todayConversions; _yesterdayConv?: typeof yesterdayConv; _mscConvToday?: MscConversions | null; _mscConvYesterday?: MscConversions | null } = {
    today,
    yesterday,
    mtd,
    trend7d,
    ytd,
    date: todayStr,
    yesterdayDate: yesterdayStr,
    thisWeek,
    lastWeek,
    schedule: scheduleData,
    recentCalls,
    prevMonthChampions,
    mtdRepActivity: mtdYtica,
    clientSpeed,
    weekend: weekendData,
    pulledAt,
    // Internal: used by GET handler for brand-specific rebuilds
    _todayCalls: todayCalls,
    _yesterdayCalls: yesterdayCalls,
    _schedule: schedule,
    _workerStats: todayWorkerStats,
    _yesterdayWorkerStats: yesterdayWorkerStats,
    _todayConversions: todayConversions,
    _yesterdayConv: yesterdayConv,
    _mscConvToday: mscConvToday,
    _mscConvYesterday: mscConvYesterday,
  };

  return dashboard;
}
