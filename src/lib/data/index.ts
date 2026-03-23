/**
 * Main data orchestrator — getDashboardData().
 *
 * Coordinates all data sources (Google Sheets + Twilio) into a single
 * DashboardData payload for the meeting/race/live pages.
 */
import { getSheets } from '../auth/google';
import { twilioAuth } from '../auth/twilio';
import { isMonday } from '../constants';
import type { DashboardData } from '../types';
import { getConversions, dateStr } from './conversions';
import { extractRecentCalls } from './twilio-calls';
import { fetchRecordingSids } from './recordings';
import { buildPeriodData } from './period';
import { fetchSchedule } from './schedule';
import { cached } from '../cache';
import type { TwilioCall } from '../types';
import clientsData from '@/data/clients.json';

export async function getDashboardData(): Promise<DashboardData> {
  // Force MST date — new Date() returns UTC on Vercel, which after 5pm MST resolves to tomorrow
  const mstNow    = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
  const today     = new Date(mstNow.getFullYear(), mstNow.getMonth(), mstNow.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const monday = isMonday();
  const sheets = getSheets();
  const auth   = twilioAuth();

  // Determine which dates we need
  const datesToFetch = [today, yesterday];
  let friday: Date | undefined, saturday: Date | undefined, sunday: Date | undefined;
  if (monday) {
    friday   = new Date(today); friday.setDate(friday.getDate() - 3);
    saturday = new Date(today); saturday.setDate(saturday.getDate() - 2);
    sunday   = new Date(today); sunday.setDate(sunday.getDate() - 1);
    datesToFetch.push(friday, saturday, sunday);
  }

  // Fetch conversions + schedule in parallel
  const [convResult, schedule] = await Promise.all([
    getConversions(sheets, datesToFetch, today),
    fetchSchedule(),
  ]);

  const todayKey     = dateStr(today);
  const yesterdayKey = dateStr(yesterday);
  const todayConv     = convResult.periods[todayKey]     || { total: 0, byAgent: [], byAccount: [], hourly: new Array(24).fill(0) };
  const yesterdayConv = convResult.periods[yesterdayKey]  || { total: 0, byAgent: [], byAccount: [], hourly: new Array(24).fill(0) };

  // Build today + yesterday in parallel
  const [todayResult, yesterdayResult] = await Promise.all([
    buildPeriodData(today, sheets, todayConv, auth, schedule),
    buildPeriodData(yesterday, sheets, yesterdayConv, auth, schedule),
  ]);

  const recentCalls = extractRecentCalls(todayResult.calls, 20);

  // Map phone numbers → client names for recent calls (JC clients only, exclude MSC)
  const cData = clientsData as { clients: Record<string, string>; brands?: Record<string, string> };
  const mscPhones = new Set(
    Object.entries(cData.brands || {}).filter(([, b]) => b === 'msc').map(([p]) => p),
  );
  const twilioNumbers = new Map<string, string>(
    Object.entries(cData.clients).filter(([phone]) => !mscPhones.has(phone)),
  );
  const customerToClient = new Map<string, string>();
  for (const c of todayResult.calls as TwilioCall[]) {
    const toClient = twilioNumbers.get(c.to);
    const fromClient = twilioNumbers.get(c.from);
    if (toClient) customerToClient.set(c.from, toClient);
    if (fromClient) customerToClient.set(c.to, fromClient);
  }
  for (const call of recentCalls) {
    // phone may be a Twilio# (inbound Flex) or customer# (outbound)
    call.account = twilioNumbers.get(call.phone) || customerToClient.get(call.phone);
  }

  // Annotate calls with recording availability (cached 5 min)
  if (recentCalls.length > 0 && auth) {
    const ds = today.toISOString().slice(0, 10);
    const recordingSids = await cached(`recordings:${ds}`, 300_000, () => fetchRecordingSids(today, auth));
    const recKey = process.env.RECORDING_API_KEY;
    const keySuffix = recKey ? `&key=${recKey}` : '';
    for (const call of recentCalls) {
      if (call.callSid && recordingSids.has(call.callSid)) {
        call.recordingUrl = `/api/calls/recording?sid=${call.callSid}${keySuffix}`;
      }
    }
  }

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const result: DashboardData = {
    date:          fmtDate(today),
    yesterdayDate: fmtDate(yesterday),
    pulledAt:      new Date().toISOString(),
    today:         todayResult.period,
    yesterday:     yesterdayResult.period,
    mtd:           convResult.mtd,
    recentCalls,
    schedule,
  };

  // Monday: build weekend data
  if (monday && friday && saturday && sunday) {
    const friKey = dateStr(friday);
    const satKey = dateStr(saturday);
    const sunKey = dateStr(sunday);

    const [friResult, satResult, sunResult] = await Promise.all([
      buildPeriodData(friday, sheets,
        convResult.periods[friKey] || { total: 0, byAgent: [], byAccount: [], hourly: new Array(24).fill(0) }, auth, schedule),
      buildPeriodData(saturday, sheets,
        convResult.periods[satKey] || { total: 0, byAgent: [], byAccount: [], hourly: new Array(24).fill(0) }, auth, schedule),
      buildPeriodData(sunday, sheets,
        convResult.periods[sunKey] || { total: 0, byAgent: [], byAccount: [], hourly: new Array(24).fill(0) }, auth, schedule),
    ]);

    result.weekend = {
      friday:   friResult.period,
      saturday: satResult.period,
      sunday:   sunResult.period,
    };
  }

  return result;
}
