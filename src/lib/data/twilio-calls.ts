/**
 * Twilio CDR — fetch call records and extract recent calls.
 */
import { ACTIVE_AGENTS } from '../constants';
import { decodeAgent, capitalize } from '../constants';
import type { TwilioCall, RawCall } from '../types';
import { dateStr, nextDayStr } from './conversions';

/**
 * Fetch all completed calls for a given MST date from Twilio CDR API.
 */
export async function fetchCallsForDate(date: Date, auth: string): Promise<TwilioCall[]> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  // Use ISO timestamps with MST offset so Twilio queries the correct MST day
  const ds  = `${dateStr(date)}T00:00:00-07:00`;
  const nds = `${nextDayStr(date)}T00:00:00-07:00`;
  const calls: TwilioCall[] = [];
  let url: string | null =
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json?StartTime>=${ds}&StartTime<${nds}&PageSize=1000`;
  while (url) {
    const res  = await fetch(url, { headers: { Authorization: auth } });
    const data = await res.json() as { calls?: TwilioCall[]; next_page_uri?: string };
    if (data.calls) calls.push(...data.calls);
    url = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null;
  }
  return calls;
}

/**
 * Compute per-agent ASA (Average Speed of Answer) from CDR data.
 *
 * Uses parent/child call correlation for accurate customer-facing wait time:
 *   ASA = child.start_time − parent.date_created
 *
 * Parent call = customer → Twilio number (the inbound leg that enters the queue).
 * Child call  = Twilio → client:agent (the leg that connects to the agent).
 *
 * Auto-accept agents (Omar, Danny, George, Chris) answer the child leg instantly
 * (~0s), but the customer waited through IVR + queue + routing. The parent's
 * date_created captures when the customer's call first arrived, so the delta
 * gives the true customer wait time.
 *
 * Falls back to child-only timing when parent_call_sid is missing.
 */
export function computeSpeedFromCDR(calls: TwilioCall[]): Record<string, number> {
  // Build SID → call index for O(1) parent lookup
  const bySid: Record<string, TwilioCall> = {};
  for (const call of calls) bySid[call.sid] = call;

  const agentSpeeds: Record<string, number[]> = {};

  for (const call of calls) {
    if (call.status !== 'completed') continue;
    const raw = decodeAgent(call.to || '');
    if (!raw || !ACTIVE_AGENTS.includes(raw)) continue;

    const agent = raw === 'jose' || raw === 'daniel' ? 'danny' : raw;

    if (!call.start_time) continue;
    const answered = new Date(call.start_time).getTime();
    if (isNaN(answered)) continue;

    // Try parent call for true customer wait time
    let ringStart: number | null = null;
    if (call.parent_call_sid) {
      const parent = bySid[call.parent_call_sid];
      if (parent?.date_created) {
        const t = new Date(parent.date_created).getTime();
        if (!isNaN(t)) ringStart = t;
      }
    }

    // Fallback: use child's own date_created (accurate for non-auto-accept agents)
    if (ringStart === null) {
      if (!call.date_created) continue;
      const t = new Date(call.date_created).getTime();
      if (isNaN(t)) continue;
      ringStart = t;
    }

    const speedSec = (answered - ringStart) / 1000;
    // Ignore negative values and outliers > 5 minutes
    if (speedSec < 0 || speedSec > 300) continue;

    if (!agentSpeeds[agent]) agentSpeeds[agent] = [];
    agentSpeeds[agent].push(speedSec);
  }

  const result: Record<string, number> = {};
  for (const [agent, speeds] of Object.entries(agentSpeeds)) {
    if (speeds.length === 0) continue;
    const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    result[agent] = Math.round(avg * 10) / 10;
  }
  return result;
}

/**
 * Compute per-agent average wrap-up time from CDR gaps between consecutive calls.
 * Wrap-up ≈ gap between one call's end_time and the next call's date_created for the same agent.
 * Only counts gaps < 10 minutes (longer gaps are idle time, not wrap-up).
 */
export function computeWrapUpFromCDR(calls: TwilioCall[]): Record<string, number> {
  // Group calls by agent, sorted chronologically
  const agentCalls: Record<string, { ended: number; nextCreated: number }[]> = {};
  const completed = calls
    .filter(c => c.status === 'completed')
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  // Group by agent
  const byAgent: Record<string, TwilioCall[]> = {};
  for (const call of completed) {
    const raw = decodeAgent(call.to || '');
    if (!raw || !ACTIVE_AGENTS.includes(raw)) continue;
    const agent = raw === 'jose' || raw === 'daniel' ? 'danny' : raw;
    if (!byAgent[agent]) byAgent[agent] = [];
    byAgent[agent].push(call);
  }

  const result: Record<string, number> = {};
  for (const [agent, agCalls] of Object.entries(byAgent)) {
    const gaps: number[] = [];
    for (let i = 0; i < agCalls.length - 1; i++) {
      const endTime = new Date(agCalls[i].end_time).getTime();
      const nextStart = new Date(agCalls[i + 1].date_created).getTime();
      if (isNaN(endTime) || isNaN(nextStart)) continue;
      const gap = (nextStart - endTime) / 1000;
      // Only count gaps 0-120s as wrap-up (> 2 min = idle/break, not ACW)
      if (gap >= 0 && gap <= 120) gaps.push(gap);
    }
    if (gaps.length > 0) {
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      result[agent] = Math.round(avg * 10) / 10;
    }
  }
  return result;
}

/**
 * Extract and format recent calls from raw Twilio data.
 */
export function extractRecentCalls(calls: TwilioCall[], limit = 20): RawCall[] {
  const sorted = [...calls]
    .filter(c => c.status === 'completed')
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
    .slice(0, limit);

  return sorted.map(c => {
    const toAgent   = decodeAgent(c.to || '');
    const fromAgent = decodeAgent(c.from || '');
    const isInbound = !!toAgent && ACTIVE_AGENTS.includes(toAgent);
    return {
      time: c.start_time,
      agent: capitalize(isInbound ? (toAgent || '') : (fromAgent || 'unknown')),
      phone: isInbound ? c.from : c.to,
      duration: parseInt(c.duration) || 0,
      direction: isInbound ? 'inbound' as const : 'outbound' as const,
      callSid: c.sid,
    };
  }).filter(c => c.agent && c.agent !== 'Unknown');
}
