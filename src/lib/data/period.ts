/**
 * Build period data for a single date — joins conversions, missed calls,
 * speed stats, and rep activity into one PeriodData.
 */
import { getSheets } from '../auth/google';
import type { TwilioCall, RepAgent, OutboundAgent, ConvPeriod, PeriodData, AgentSchedule } from '../types';
import { getMissedCalls } from './missed-calls';
import { getYticaSpeedStats } from './ytica';
import { fetchCallsForDate, computeSpeedFromCDR, computeWrapUpFromCDR } from './twilio-calls';
import { getWorkerSpeedStats } from './twilio-workers';
import { buildRepActivity } from './rep-activity';
import { dateStr } from './conversions';

export async function buildPeriodData(
  date: Date,
  sheets: ReturnType<typeof getSheets>,
  convPeriod: ConvPeriod,
  auth: string | null,
  schedule?: AgentSchedule,
): Promise<{ period: PeriodData; calls: TwilioCall[] }> {
  const [missed, speed] = await Promise.all([
    getMissedCalls(sheets, date),
    getYticaSpeedStats(sheets, date),
  ]);

  let repActivity = { agents: [] as RepAgent[], outbound: [] as OutboundAgent[], avgSpeedSec: speed.avgSpeedSec };
  let calls: TwilioCall[] = [];

  if (auth) {
    const ds = dateStr(date);
    const [fetchedCalls, workerStats] = await Promise.all([
      fetchCallsForDate(date, auth),
      getWorkerSpeedStats(ds, auth),
    ]);
    calls = fetchedCalls;
    const cdrSpeed  = computeSpeedFromCDR(calls);
    const cdrWrapUp = computeWrapUpFromCDR(calls);
    repActivity = buildRepActivity(calls, speed.speedMap, speed.avgSpeedSec, workerStats, cdrSpeed, cdrWrapUp, date, schedule);
  }

  // Compute conversion rate: conversions / calls answered × 100
  const totalCalls = repActivity.agents.reduce((s, a) => s + a.calls, 0);
  const convRate = totalCalls > 0 ? +((convPeriod.total / totalCalls) * 100).toFixed(1) : undefined;

  // Compute per-agent conversions per hour (join conversion data with schedule)
  const convByAgentMap: Record<string, number> = {};
  for (const a of convPeriod.byAgent) convByAgentMap[a.agent.toLowerCase()] = a.count;
  for (const agent of repActivity.agents) {
    const convs = convByAgentMap[agent.agent.toLowerCase()] || 0;
    agent.convsPerHour =
      agent.hoursScheduled > 0 ? +(convs / agent.hoursScheduled).toFixed(2) : undefined;
  }

  return {
    period: { conversions: convPeriod, missedCalls: missed, repActivity, conversionRate: convRate },
    calls,
  };
}
