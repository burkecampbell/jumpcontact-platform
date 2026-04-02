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
} from '@/lib/sheets';
import { blendYticaIntoPerioData, filterByBrand } from '@/lib/blender';
import { parseBrand } from '@/lib/brand';
import {
  ACTIVE_AGENTS,
  OUTBOUND_AGENTS,
  MONTHLY_GOAL,
  DAILY_GOAL,
  TZ,
  normalizeAgent,
  isOnShift,
} from '@/lib/constants';
import { cached } from '@/lib/cache';
import { resolveClient } from '@/lib/clients';
import { twilioAuth, WORKSPACE_SID } from '@/lib/auth/twilio';
import { fetchAllWorkerStats } from '@/lib/daily-analytics';
import { fetchMscConversions } from '@/lib/ops-center';
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
    const avgSpeed = data.ringCount > 0 ? Math.round((data.ringSum / data.ringCount) * 10) / 10 : null;
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
  for (const c of missedCalls) {
    const acct = c.client || 'Unknown';
    missedByAccount[acct] = (missedByAccount[acct] || 0) + 1;
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
    },
    repActivity,
    teamStats: teamStats ? { ...teamStats, source: 'ytica' as const } : null,
    conversionRate,
  };

  // Blend Ytica data if available
  period = blendYticaIntoPerioData(period, ytica);
  // Brand filtering is now applied in the GET handler per ?brand= param

  return period;
}

// ── Add CDR-derived call fields to any period ─────────────────────

function addPeriodCallFields(
  period: PeriodData,
  calls: PairedCall[],
): PeriodData {
  const totalCalls = calls.length;
  const answeredCalls = calls.filter(c => c.status === 'completed').length;
  const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
  const missedInbound = calls.filter(c => c.direction === 'inbound' && c.duration === 0).length;
  const totalInbound = calls.filter(c => c.direction === 'inbound').length;
  const missedCallRate = totalInbound > 0
    ? Math.round((missedInbound / totalInbound) * 1000) / 10
    : 0;

  const speedVals = period.repActivity.agents
    .filter(a => a.speedSec !== null && a.speedSec !== undefined && a.speedSec > 0)
    .map(a => a.speedSec!);
  const teamAvgSpeed = period.repActivity.avgSpeedSec ?? (
    speedVals.length > 0
      ? Math.round((speedVals.reduce((s, v) => s + v, 0) / speedVals.length) * 10) / 10
      : 0
  );
  const fastestPickup = speedVals.length > 0 ? Math.min(...speedVals) : 0;

  return {
    ...period,
    totalCalls,
    answeredCalls,
    answerRate,
    missedCallRate,
    teamAvgSpeed,
    fastestPickup,
  };
}

// ── Build today's extra fields ─────────────────────────────────────

function addTodayFields(
  period: PeriodData,
  calls: PairedCall[],
): DashboardData['today'] {
  const totalCalls = calls.length;
  const answeredCalls = calls.filter(c => c.status === 'completed').length;
  const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
  const missedInbound = calls.filter(c => c.direction === 'inbound' && c.duration === 0).length;
  const totalInbound = calls.filter(c => c.direction === 'inbound').length;
  const missedCallRate = totalInbound > 0
    ? Math.round((missedInbound / totalInbound) * 1000) / 10
    : 0;

  const speedVals = period.repActivity.agents
    .filter(a => a.speedSec !== null && a.speedSec > 0)
    .map(a => a.speedSec!);
  const teamAvgSpeed = period.repActivity.avgSpeedSec ?? (
    speedVals.length > 0
      ? Math.round((speedVals.reduce((s, v) => s + v, 0) / speedVals.length) * 10) / 10
      : 0
  );
  const fastestPickup = speedVals.length > 0 ? Math.min(...speedVals) : 0;

  // convPerHour: team-level conversions per hour since ~7am MST
  const now = mstNow();
  const startOfDay = new Date(now);
  startOfDay.setHours(7, 0, 0, 0);
  const hoursElapsed = Math.max((now.getTime() - startOfDay.getTime()) / 3600000, 0.5);
  const convPerHour = Math.round((period.conversions.total / hoursElapsed) * 100) / 100;

  return {
    ...period,
    totalCalls,
    answeredCalls,
    answerRate,
    missedCallRate,
    teamAvgSpeed,
    fastestPickup,
    convPerHour,
  };
}

// ── Build recentCalls (last 20 paired calls) ───────────────────────

function buildRecentCalls(calls: PairedCall[]): RawCall[] {
  return calls
    .filter(c => c.agent) // Only include calls with a matched agent
    .slice(0, 20)
    .map(c => ({
      time: c.time,
      agent: c.agent,
      phone: c.direction === 'inbound' ? c.from : c.to,
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
  const acctTotals: Record<string, number> = {};
  const hourly = new Array(24).fill(0);
  const mtdDaily: { date: string; total: number }[] = [];

  const sortedDates = [...mtdMap.keys()].sort();
  for (const date of sortedDates) {
    const entry = mtdMap.get(date)!;
    total += entry.total;
    mtdDaily.push({ date, total: entry.total });
    for (const [agent, count] of Object.entries(entry.byAgent)) {
      agentTotals[agent] = (agentTotals[agent] || 0) + count;
    }
    for (const a of entry.byAccount) {
      acctTotals[a.account] = (acctTotals[a.account] || 0) + a.count;
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
    .map(([agent, count]) => ({ agent, count }))
    .sort((a, b) => b.count - a.count);

  const byAccount: AcctStat[] = Object.entries(acctTotals)
    .map(([account, count]) => ({ account, count }))
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
    const raw = await cached('dashboard-data', 30_000, fetchDashboardData);

    // Apply brand filtering on read (cheap, no API calls)
    let filteredToday = filterByBrand(raw.today, brand);
    let filteredYesterday = filterByBrand(raw.yesterday, brand);

    // MSC conversions come from GHL (via ops-center), not Google Sheets
    if (brand === 'msc') {
      try {
        const mscConv = await cached('msc-conv-today', 60_000, () =>
          fetchMscConversions(raw.date || todayMST()),
        );
        filteredToday = {
          ...filteredToday,
          conversions: {
            total: mscConv.total,
            byAgent: Object.entries(mscConv.byAgent).map(([agent, count]) => ({ agent, count })),
            byAccount: mscConv.byAccount,
            hourly: mscConv.byHour,
          },
        };
      } catch (err) {
        console.warn('[API /data] MSC conversions unavailable:', err instanceof Error ? err.message : err);
        // Fall through with JC conversion data stripped by filterByBrand
      }
    }

    // Recompute KPI cards from brand-filtered agent data
    const todayAgents = filteredToday.repActivity.agents;
    const brandCalls = todayAgents.reduce((s, a) => s + a.calls, 0);
    const speedVals = todayAgents.filter(a => a.speedSec != null && a.speedSec! > 0).map(a => a.speedSec!);
    const brandAvgSpeed = speedVals.length > 0
      ? Math.round((speedVals.reduce((s, v) => s + v, 0) / speedVals.length) * 10) / 10
      : raw.today.teamAvgSpeed;
    const brandFastest = speedVals.length > 0 ? Math.min(...speedVals) : raw.today.fastestPickup;

    const data = {
      ...raw,
      today: {
        ...filteredToday,
        totalCalls: brandCalls,
        answeredCalls: brandCalls,
        answerRate: raw.today.answerRate, // answer rate stays global (Twilio-level)
        missedCallRate: raw.today.missedCallRate,
        teamAvgSpeed: brandAvgSpeed,
        fastestPickup: brandFastest,
        convPerHour: brand === 'mixed' ? undefined : raw.today.convPerHour,
      },
      yesterday: filteredYesterday,
      brand,
    };

    return NextResponse.json(data);
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
  ]);

  // ── Today ──────────────────────────────────────────────────────
  const todayCalls = pairCallLegs(todayLegs);
  const todayPeriod = await buildPeriodData(
    todayStr,
    todayCalls,
    todayConversions,
    todayWorkerStats,
    schedule,
    todayYtica,
    todayTeamStats,
  );
  const today = addTodayFields(todayPeriod, todayCalls);

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
  // Add totalCalls, answeredCalls, answerRate, etc. — same as today
  yesterday = addPeriodCallFields(yesterday, yesterdayCalls);
  // Brand filtering is now applied in the GET handler per ?brand= param

  // ── MTD ────────────────────────────────────────────────────────
  // Build mtdMap from histConversions restricted to mtdDates
  const mtdMap = new Map<string, { total: number; byAgent: Record<string, number>; byAccount: AcctStat[]; byHour: number[] }>();
  for (const d of mtdDates) {
    const entry = histConversions.get(d);
    if (entry) mtdMap.set(d, entry);
    else mtdMap.set(d, { total: 0, byAgent: {}, byAccount: [], byHour: new Array(24).fill(0) });
  }
  // Override today's entry with live data
  mtdMap.set(todayStr, {
    total: todayConversions.total,
    byAgent: todayConversions.byAgent,
    byAccount: todayConversions.byAccount,
    byHour: todayConversions.byHour,
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
      thisWeek += todayConversions.total;
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

  // ── Assemble ───────────────────────────────────────────────────
  const pulledAt = new Date().toISOString();

  const dashboard: DashboardData = {
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
    pulledAt,
  };

  return dashboard;
}
