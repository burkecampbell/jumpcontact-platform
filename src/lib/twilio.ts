import { twilioAuth, twilioAccountSid } from './auth/twilio';
import { normalizeAgent, decodeAgent, TZ } from './constants';
import { resolveClient, isJCPhone } from './clients';
import type { CallLeg, PairedCall } from './types';

const PAIR_WINDOW_MS = 30_000;
const PAGE_SIZE = 500;

interface TwilioCallResource {
  sid: string;
  from: string;
  to: string;
  direction: string;
  status: string;
  start_time: string;
  end_time: string;
  duration: string;
  queue_time?: string;
  parent_call_sid?: string;
}

export async function fetchCallLegs(date: string): Promise<CallLeg[]> {
  const sid = twilioAccountSid();
  const auth = twilioAuth();

  // Mountain Time day boundaries in UTC (handles both MST −7 and MDT −6)
  const mstStart = new Date(`${date}T07:00:00Z`);
  const mstEnd   = new Date(`${nextDay(date)}T07:00:00Z`);

  // Query Twilio with an extra day buffer so we don't lose legs that
  // fall after midnight UTC (= 6 PM MDT).  The local filter below
  // trims to exact Mountain Time boundaries.
  const queryEnd = nextDay(nextDay(date));

  const legs: CallLeg[] = [];
  let pageUrl: string | null =
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json` +
    `?StartTime>=${date}&StartTime<=${queryEnd}` +
    `&PageSize=${PAGE_SIZE}`;

  while (pageUrl) {
    const resp: Response = await fetch(pageUrl, { headers: { Authorization: auth } });
    if (!resp.ok) throw new Error(`Twilio CDR ${resp.status}: ${await resp.text()}`);
    const json = await resp.json();

    for (const c of json.calls as TwilioCallResource[]) {
      legs.push({
        sid: c.sid,
        from: c.from,
        to: c.to,
        direction: c.direction,
        status: c.status,
        startTime: c.start_time,
        endTime: c.end_time,
        duration: parseInt(c.duration) || 0,
        queueTime: parseInt(c.queue_time || '0') || 0,
        parentCallSid: c.parent_call_sid || undefined,
      });
    }

    pageUrl = json.next_page_uri
      ? `https://api.twilio.com${json.next_page_uri}`
      : null;
  }

  return legs.filter(leg => {
    const t = new Date(leg.startTime);
    return t >= mstStart && t < mstEnd;
  });
}

// ── Leg Pairing ─────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^1/, '');
}

export function pairCallLegs(legs: CallLeg[]): PairedCall[] {
  const agentLegs: CallLeg[] = [];
  const inboundLegs: CallLeg[] = [];

  for (const leg of legs) {
    const to = (leg.to || '').toLowerCase();
    if (to.includes('client:')) {
      agentLegs.push(leg);
    } else if (leg.direction === 'inbound') {
      inboundLegs.push(leg);
    }
  }

  // Index inbound legs by trunk number (for time-window matching)
  const inboundByTrunk = new Map<string, CallLeg[]>();
  for (const leg of inboundLegs) {
    const trunk = normalizePhone(leg.to);
    if (trunk) {
      const arr = inboundByTrunk.get(trunk) || [];
      arr.push(leg);
      inboundByTrunk.set(trunk, arr);
    }
  }

  // Index ALL legs by SID (for parent-call lookup)
  const legBySid = new Map<string, CallLeg>();
  for (const leg of legs) {
    legBySid.set(leg.sid, leg);
  }

  // Index inbound legs by SID (for direct parent lookup)
  const inboundBySid = new Map<string, CallLeg>();
  for (const leg of inboundLegs) {
    inboundBySid.set(leg.sid, leg);
  }

  const pairedInboundSids = new Set<string>();
  const paired: PairedCall[] = [];

  for (const agentLeg of agentLegs) {
    const agentName = decodeAgent(agentLeg.to);
    const trunk = normalizePhone(agentLeg.from);
    const agentTime = new Date(agentLeg.startTime).getTime();

    if (!trunk || !agentTime) continue;

    // ── Strategy 1: Time-window match on trunk number ──────────────
    const candidates = inboundByTrunk.get(trunk) || [];
    let bestMatch: CallLeg | undefined;
    let bestDelta = PAIR_WINDOW_MS + 1;

    for (const inbound of candidates) {
      if (pairedInboundSids.has(inbound.sid)) continue;
      const inboundTime = new Date(inbound.startTime).getTime();
      const delta = Math.abs(agentTime - inboundTime);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestMatch = inbound;
      }
    }

    if (bestMatch && bestDelta <= PAIR_WINDOW_MS) {
      pairedInboundSids.add(bestMatch.sid);
      if (!isJCPhone(bestMatch.to)) continue;

      const inboundMs = new Date(bestMatch.startTime).getTime();
      const ringTime = agentTime > inboundMs ? Math.round((agentTime - inboundMs) / 1000) : 0;

      paired.push({
        id: bestMatch.sid,
        time: bestMatch.startTime,
        agent: normalizeAgent(agentName),
        from: bestMatch.from,
        to: bestMatch.to,
        client: resolveClient(bestMatch.to),
        direction: 'inbound',
        duration: agentLeg.duration,
        totalDuration: bestMatch.duration,
        ringTime,
        status: agentLeg.status,
        agentLegSid: agentLeg.sid,
      });
      continue;
    }

    // ── Strategy 2: Parent-call SID lookup ─────────────────────────
    //   The agent leg's parentCallSid often points to the inbound leg
    //   or to an intermediate conference leg whose parent is inbound.
    let parentInbound: CallLeg | undefined;
    let callerPhone = '';

    if (agentLeg.parentCallSid) {
      // Direct parent is an inbound leg?
      parentInbound = inboundBySid.get(agentLeg.parentCallSid);

      if (!parentInbound) {
        // Parent might be a conference/queue leg — check ITS parent
        const intermediateLeg = legBySid.get(agentLeg.parentCallSid);
        if (intermediateLeg?.parentCallSid) {
          parentInbound = inboundBySid.get(intermediateLeg.parentCallSid);
        }
        // Also check if the intermediate leg itself has the caller phone
        if (!parentInbound && intermediateLeg && intermediateLeg.from?.startsWith('+')) {
          callerPhone = intermediateLeg.from;
        }
      }
    }

    if (parentInbound && !pairedInboundSids.has(parentInbound.sid)) {
      pairedInboundSids.add(parentInbound.sid);
      if (!isJCPhone(parentInbound.to)) continue;

      const inboundMs = new Date(parentInbound.startTime).getTime();
      const ringTime = agentTime > inboundMs ? Math.round((agentTime - inboundMs) / 1000) : 0;

      paired.push({
        id: parentInbound.sid,
        time: parentInbound.startTime,
        agent: normalizeAgent(agentName),
        from: parentInbound.from,
        to: parentInbound.to,
        client: resolveClient(parentInbound.to),
        direction: 'inbound',
        duration: agentLeg.duration,
        totalDuration: parentInbound.duration,
        ringTime,
        status: agentLeg.status,
        agentLegSid: agentLeg.sid,
      });
      continue;
    }

    // ── Strategy 3: Fallback — use whatever phone we found ─────────
    if (!isJCPhone(agentLeg.from)) continue;

    // If parent gave us a caller phone, use it
    if (!callerPhone && parentInbound) {
      callerPhone = parentInbound.from || '';
    }

    paired.push({
      id: agentLeg.sid,
      time: agentLeg.startTime,
      agent: normalizeAgent(agentName),
      from: callerPhone,
      to: agentLeg.from,
      client: resolveClient(agentLeg.from),
      direction: 'inbound',
      duration: agentLeg.duration,
      totalDuration: agentLeg.duration,
      ringTime: 0,
      status: agentLeg.status,
      agentLegSid: agentLeg.sid,
    });
  }

  // Unmatched inbound legs (missed/unanswered)
  for (const leg of inboundLegs) {
    if (pairedInboundSids.has(leg.sid)) continue;
    if (!isJCPhone(leg.to)) continue;

    paired.push({
      id: leg.sid,
      time: leg.startTime,
      agent: '',
      from: leg.from,
      to: leg.to,
      client: resolveClient(leg.to),
      direction: 'inbound',
      duration: 0,
      totalDuration: leg.duration,
      ringTime: 0,
      status: leg.status,
      agentLegSid: undefined,
    });
  }

  // Outbound calls (agent-initiated via Flex dialpad)
  const usedSids = new Set(paired.map(p => p.id));
  for (const leg of legs) {
    if (
      leg.direction === 'outbound-api' &&
      leg.to.startsWith('+') &&
      leg.from.startsWith('+') &&
      !leg.parentCallSid &&
      !usedSids.has(leg.sid)
    ) {
      if (!isJCPhone(leg.from)) continue;
      const client = resolveClient(leg.from) || '';
      paired.push({
        id: leg.sid,
        time: leg.startTime,
        agent: '',
        from: leg.from,
        to: leg.to,
        client,
        direction: 'outbound',
        duration: leg.duration,
        totalDuration: leg.duration,
        ringTime: 0,
        status: leg.status,
        agentLegSid: leg.sid,
      });
    }
  }

  paired.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return paired;
}

// ── Recording lookup ────────────────────────────────────────────────

export async function fetchRecordingSid(callSid: string): Promise<string | null> {
  const sid = twilioAccountSid();
  const auth = twilioAuth();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}/Recordings.json?PageSize=1`;
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) return null;
  const json = await res.json();
  return json.recordings?.[0]?.sid || null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function todayMST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}
