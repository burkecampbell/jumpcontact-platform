/**
 * Rep activity — joins Twilio call data with speed stats and schedule.
 */
import {
  ACTIVE_AGENTS,
  OUTBOUND_AGENTS,
  AGENT_SCHEDULE,
  decodeAgent,
  capitalize,
} from '../constants';
import { getScheduledHoursFromSchedule } from './schedule';
import type { TwilioCall, RepAgent, OutboundAgent, AgentSchedule } from '../types';

/**
 * Build per-agent inbound + outbound activity from Twilio call records.
 */
export function buildRepActivity(
  calls: TwilioCall[],
  speedMap: Record<string, number>,
  avgSpeedSec: number | null,
  workerStats: Record<string, { speedSec: number; wrapUpSec: number }>,
  cdrSpeedMap: Record<string, number>,
  cdrWrapUpMap: Record<string, number>,
  date: Date,
  schedule?: AgentSchedule,
) {
  const inboundMap: Record<string, { calls: number; durationSec: number }> = {};
  for (const call of calls) {
    if (call.status !== 'completed') continue;
    const raw = decodeAgent(call.to || '');
    if (!raw || !ACTIVE_AGENTS.includes(raw)) continue;
    const agent = capitalize(raw === 'jose' || raw === 'daniel' ? 'danny' : raw);
    if (!inboundMap[agent]) inboundMap[agent] = { calls: 0, durationSec: 0 };
    inboundMap[agent].calls++;
    inboundMap[agent].durationSec += parseInt(call.duration) || 0;
  }

  const outboundMap: Record<string, { calls: number; durationSec: number }> = {};
  for (const call of calls) {
    if (call.status !== 'completed') continue;
    const raw = decodeAgent(call.from || '');
    if (!raw || !OUTBOUND_AGENTS.includes(raw)) continue;
    const agent = capitalize(raw);
    if (!outboundMap[agent]) outboundMap[agent] = { calls: 0, durationSec: 0 };
    outboundMap[agent].calls++;
    outboundMap[agent].durationSec += parseInt(call.duration) || 0;
  }

  const agents: RepAgent[] = Object.entries(inboundMap)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([agent, s]) => {
      const rawName    = agent.toLowerCase();
      const lookupKeys = rawName === 'danny' ? ['danny', 'jose', 'daniel'] : [rawName];
      const speedSec   = lookupKeys.map(k => speedMap[k]).find(v => v != null)                         // Ytica (most accurate)
                          ?? lookupKeys.map(k => cdrSpeedMap[k]).find(v => v != null)                    // CDR computed (works for ALL agents)
                          ?? lookupKeys.map(k => workerStats[k]?.speedSec).find(v => v != null && v > 0) // TaskRouter (last resort)
                          ?? null;
      const wrapUpSec  = lookupKeys.map(k => cdrWrapUpMap[k]).find(v => v != null)                        // CDR gaps (most accurate avg)
                          ?? lookupKeys.map(k => workerStats[k]?.wrapUpSec).find(v => v != null && v > 0) // TaskRouter fallback
                          ?? null;
      const hoursScheduled = getScheduledHoursFromSchedule(schedule ?? AGENT_SCHEDULE, rawName, date);
      return { agent, calls: s.calls, talkMin: +(s.durationSec / 60).toFixed(1), speedSec, wrapUpSec, hoursScheduled };
    });

  const outbound: OutboundAgent[] = Object.entries(outboundMap)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([agent, s]) => ({
      agent,
      callsMade: s.calls,
      talkMin: +(s.durationSec / 60).toFixed(1),
    }));

  // Compute overall avg speed from agents that have speed data (prefer per-agent over Ytica global avg)
  const agentsWithSpeed = agents.filter(a => a.speedSec !== null);
  const computedAvgSpeed = agentsWithSpeed.length > 0
    ? parseFloat((agentsWithSpeed.reduce((s, a) => s + (a.speedSec || 0), 0) / agentsWithSpeed.length).toFixed(1))
    : avgSpeedSec;

  return { agents, outbound, avgSpeedSec: computedAvgSpeed };
}
