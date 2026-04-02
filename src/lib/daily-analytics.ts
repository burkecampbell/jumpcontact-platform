import { fetchCallLegs, pairCallLegs, todayMST } from './twilio';
import { twilioAuth, WORKSPACE_SID } from './auth/twilio';
import { ACTIVE_AGENTS, OUTBOUND_AGENTS, normalizeAgent, TZ, speedGrade } from './constants';
import { fetchConversions, fetchSchedule, getScheduledHours } from './sheets';
import type { AgentEfficiency, ActivityBreakdown, AnalyticsData } from './types';

export interface DailyAnalyticsResult extends AnalyticsData {
  missedByClient: { client: string; count: number }[];
}

export async function buildDailyAnalytics(date: string): Promise<DailyAnalyticsResult> {
  const dateObj = new Date(date + 'T00:00:00');
  const auth = twilioAuth();

  const [legs, conversions, schedule, workerStatsMap] = await Promise.all([
    fetchCallLegs(date),
    fetchConversions(date),
    fetchSchedule(),
    fetchAllWorkerStats(date, auth),
  ]);

  const calls = pairCallLegs(legs);
  const allAgents = [...new Set([...ACTIVE_AGENTS, ...OUTBOUND_AGENTS])];

  const agg: Record<string, { calls: number; dur: number; ib: number; ob: number; ans: number; mis: number; ringSum: number; ringCount: number }> = {};
  const hourly: Record<string, number[]> = {};
  for (const a of allAgents) {
    agg[a] = { calls: 0, dur: 0, ib: 0, ob: 0, ans: 0, mis: 0, ringSum: 0, ringCount: 0 };
    hourly[a] = new Array(24).fill(0);
  }
  const hourlyTotal    = new Array(24).fill(0);
  const hourlyAnswered = new Array(24).fill(0);
  const hourlyMissed   = new Array(24).fill(0);

  const missedClientMap: Record<string, number> = {};
  for (const call of calls) {
    if (call.direction === 'inbound' && call.duration === 0) {
      const key = call.client || 'Unknown';
      missedClientMap[key] = (missedClientMap[key] || 0) + 1;
    }
  }
  const missedByClient = Object.entries(missedClientMap)
    .map(([client, count]) => ({ client, count }))
    .sort((a, b) => b.count - a.count);

  for (const call of calls) {
    const agent = normalizeAgent(call.agent);
    if (!agg[agent]) { agg[agent] = { calls: 0, dur: 0, ib: 0, ob: 0, ans: 0, mis: 0, ringSum: 0, ringCount: 0 }; hourly[agent] = new Array(24).fill(0); }
    agg[agent].calls++;
    agg[agent].dur += call.duration;
    if (call.direction === 'inbound') agg[agent].ib++; else agg[agent].ob++;
    const answered = call.status === 'completed';
    if (answered) agg[agent].ans++; else agg[agent].mis++;
    if (call.ringTime > 0 && call.ringTime < 120 && answered) {
      agg[agent].ringSum += call.ringTime;
      agg[agent].ringCount++;
    }
    const h = parseInt(new Date(call.time).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }));
    if (h >= 0 && h < 24) {
      hourly[agent][h]++;
      hourlyTotal[h]++;
      if (answered) hourlyAnswered[h]++; else hourlyMissed[h]++;
    }
  }

  const agents: AgentEfficiency[] = [];
  for (const [name, cd] of Object.entries(agg)) {
    if (cd.calls === 0 || !name) continue;
    const ws = workerStatsMap[name] || emptyAct();
    const hrsSched = getScheduledHours(schedule, name, dateObj);
    const hrsActive = ws.totalActiveSec / 3600;
    const effHrs = hrsActive > 0.25 ? hrsActive : hrsSched;
    const conv = conversions.byAgent[name] || 0;
    const avgDur = cd.calls > 0 ? cd.dur / cd.calls : 0;
    const util = hrsSched > 0 ? Math.round((hrsActive / hrsSched) * 100) : 0;
    const avgRingTime = cd.ringCount > 0 ? Math.round(cd.ringSum / cd.ringCount) : 0;
    const effectiveAvgSpeed = avgRingTime > 0 ? avgRingTime : ws.avgSpeed;
    const grade = speedGrade(effectiveAvgSpeed);
    const conversionRate = cd.ans > 0 ? Math.round((conv / cd.ans) * 1000) / 10 : null;
    const missedCallRate = (cd.ans + cd.mis) > 0
      ? Math.round((cd.mis / (cd.ans + cd.mis)) * 1000) / 10 : 0;
    const firstConversionTime = conversions.firstConvByAgent[name] || '';
    const lastConversionTime  = conversions.lastConvByAgent[name]  || '';
    agents.push({
      name, calls: cd.calls, inbound: cd.ib, outbound: cd.ob,
      answered: cd.ans, missed: cd.mis, totalDuration: cd.dur,
      avgCallDuration: Math.round(avgDur), avgSpeed: effectiveAvgSpeed,
      avgWrapUp: ws.avgWrapUp, avgRingTime, speedGrade: grade.letter, conversions: conv,
      conversionRate, missedCallRate, firstConversionTime, lastConversionTime,
      conversionsPerHour: effHrs > 0 ? Math.round((conv / effHrs) * 100) / 100 : 0,
      callsPerHour: effHrs > 0 ? Math.round((cd.calls / effHrs) * 100) / 100 : 0,
      hoursScheduled: hrsSched, hoursActive: Math.round(hrsActive * 100) / 100,
      utilization: util, activity: ws,
    });
  }
  agents.sort((a, b) => b.conversions - a.conversions || b.conversionsPerHour - a.conversionsPerHour || b.calls - a.calls);

  const tc = calls.length;
  const tib = calls.filter(c => c.direction === 'inbound').length;
  const tob = tc - tib;
  const tans = agents.reduce((s, a) => s + a.answered, 0);
  const tmis = calls.filter(c => c.direction === 'inbound' && c.duration === 0).length;
  const tdur = calls.reduce((s, c) => s + c.duration, 0);
  const ansRate = tc > 0 ? Math.round((tans / tc) * 100) : 0;
  const activeAgentCount = agents.filter(a => a.answered > 0).length;
  const teamConversionRate = tans > 0
    ? Math.round((conversions.total / tans) * 1000) / 10 : null;
  const teamMissedCallRate = (tans + tmis) > 0
    ? Math.round((tmis / (tans + tmis)) * 1000) / 10 : 0;
  const avgDur = tc > 0 ? Math.round(tdur / tc) : 0;
  const talkMin = Math.round(tdur / 60);
  const teamHrs = agents.reduce((s, a) => s + a.hoursActive, 0);
  let effTeamHrs = teamHrs;
  if (effTeamHrs < 0.25) {
    const nowMST = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    const fiveAm = new Date(nowMST); fiveAm.setHours(5, 0, 0, 0);
    effTeamHrs = Math.max((nowMST.getTime() - fiveAm.getTime()) / 3600000, 0.5);
  }
  const tConvHr = Math.round((conversions.total / effTeamHrs) * 100) / 100;
  const tCallHr = Math.round((tc / effTeamHrs) * 100) / 100;
  const wSpd = agents.reduce((s, a) => s + a.avgSpeed * a.calls, 0);
  const wWrap = agents.reduce((s, a) => s + a.avgWrapUp * a.calls, 0);
  const wRing = agents.reduce((s, a) => s + a.avgRingTime * a.answered, 0);
  const tAns = agents.reduce((s, a) => s + a.answered, 0);
  const tSpd = tc > 0 ? Math.round((wSpd / tc) * 10) / 10 : 0;
  const tWrap = tc > 0 ? Math.round((wWrap / tc) * 10) / 10 : 0;
  const tRing = tAns > 0 ? Math.round((wRing / tAns) * 10) / 10 : 0;

  let peakHour = 0, peakCalls = 0;
  for (let h = 0; h < 24; h++) { if (hourlyTotal[h] > peakCalls) { peakCalls = hourlyTotal[h]; peakHour = h; } }

  const hFilt: Record<string, number[]> = {};
  for (const a of agents) hFilt[a.name] = hourly[a.name];

  return {
    date, totalCalls: tc, totalInbound: tib, totalOutbound: tob, totalAnswered: tans,
    totalMissed: tmis, totalConversions: conversions.total,
    teamConversionRate, missedCallRate: teamMissedCallRate, activeAgentCount,
    teamConvPerHour: tConvHr, teamCallsPerHour: tCallHr,
    teamAvgSpeed: tSpd, teamAvgWrapUp: tWrap, teamAvgRingTime: tRing,
    answerRate: ansRate, avgCallDuration: avgDur, totalTalkMinutes: talkMin, peakHour, peakHourCalls: peakCalls,
    agents, hourly: hFilt, hourlyTotal, hourlyAnswered, hourlyMissed,
    convByHour: conversions.byHour,
    convByAgent: conversions.byAgent, convByAccount: conversions.byAccount,
    pulledAt: new Date().toISOString(),
    missedByClient,
  };
}

/** Fetch timeout — prevents dashboard hang when Twilio is slow */
function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** Detect Mountain Time UTC offset for a given date (handles DST). */
function mtOffset(dateStr: string): string {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const mt = probe.toLocaleString('en-US', { timeZone: TZ, hour12: false, timeZoneName: 'shortOffset' });
  // Extract offset like "GMT-6" or "GMT-7"
  const match = mt.match(/GMT([+-]\d+)/);
  const hours = match ? parseInt(match[1]) : -7;
  return `${hours < 0 ? '-' : '+'}${String(Math.abs(hours)).padStart(2, '0')}:00`;
}

export async function fetchAllWorkerStats(dateStr: string, auth: string) {
  const result: Record<string, ActivityBreakdown & { avgSpeed: number; avgWrapUp: number }> = {};
  const offset = mtOffset(dateStr);
  try {
    const url = `https://taskrouter.twilio.com/v1/Workspaces/${WORKSPACE_SID}/Workers?PageSize=100`;
    const wRes = await fetchWithTimeout(url, { headers: { Authorization: auth } });
    if (!wRes.ok) return result;
    const wJson = await wRes.json();
    const workers: { sid: string; friendly_name: string }[] = wJson.workers || [];
    const start = `${dateStr}T00:00:00${offset}`;

    await Promise.all(workers.map(async (w) => {
      const name = normalizeAgent(xName(w.friendly_name));
      try {
        const end = `${dateStr}T23:59:59${offset}`;
        const sUrl = `https://taskrouter.twilio.com/v1/Workspaces/${WORKSPACE_SID}/Workers/${w.sid}/Statistics?StartDate=${encodeURIComponent(start)}&EndDate=${encodeURIComponent(end)}`;
        const r = await fetchWithTimeout(sUrl, { headers: { Authorization: auth } });
        if (!r.ok) return;
        const j = await r.json();
        const c = j.cumulative || {};
        const acts: { friendly_name: string; max: number }[] = c.activity_durations || [];
        const g = (n: string) => acts.find(a => a.friendly_name === n)?.max || 0;
        const av = g('Available') + g('Idle');
        const bu = g('Busy') + g('Reserved');
        const wr = g('WrapUp');
        const of_ = g('Offline') + g('Break');
        const resCreated   = c.reservations_created   || 0;
        const resAccepted  = c.reservations_accepted  || 0;
        const resRejected  = c.reservations_rejected  || 0;
        const resTimedOut  = c.reservations_timed_out || 0;
        const taskAcceptanceRate = resCreated > 0 ? Math.round((resAccepted / resCreated) * 100) : 0;
        result[name] = {
          availableSec: av, busySec: bu, wrapUpSec: wr, offlineSec: of_,
          totalActiveSec: av + bu + wr,
          reservationsCreated: resCreated, reservationsAccepted: resAccepted,
          reservationsRejected: resRejected, reservationsTimedOut: resTimedOut,
          taskAcceptanceRate,
          avgSpeed: 0,
          avgWrapUp: Math.round((c.avg_task_cleanup_time || 0) * 10) / 10,
        };
      } catch { /* skip */ }
    }));
  } catch { /* empty */ }
  return result;
}

export function xName(fn: string) { const at = fn.indexOf('@'); return (at > 0 ? fn.slice(0, at) : fn).toLowerCase().trim(); }
export function emptyAct(): ActivityBreakdown & { avgSpeed: number; avgWrapUp: number } {
  return {
    availableSec: 0, busySec: 0, wrapUpSec: 0, offlineSec: 0, totalActiveSec: 0,
    reservationsCreated: 0, reservationsAccepted: 0, reservationsRejected: 0, reservationsTimedOut: 0,
    taskAcceptanceRate: 0, avgSpeed: 0, avgWrapUp: 0,
  };
}

export { todayMST };
