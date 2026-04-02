/**
 * Shared recording utilities — used by CallsPage and LiveNowPage.
 */

import { capitalize } from './constants';
import { formatPhone, formatDuration } from './formatters';
import type { RawCall } from './types';

export function buildPlayerUrl(call: RawCall): string {
  if (!call.recordingUrl || !call.callSid) return '';
  const p = new URLSearchParams({
    sid: call.callSid,
    ...(call.agentLegSid ? { agent_sid: call.agentLegSid } : {}),
    agent: capitalize(call.agent),
    client: call.account || '',
    phone: formatPhone(call.phone),
    dur: formatDuration(call.duration),
    dir: call.direction,
    time: call.time,
  });
  return `${window.location.origin}/play?${p}`;
}

export async function shareRecording(call: RawCall): Promise<void> {
  const url = buildPlayerUrl(call);
  if (!url) return;
  const agentName = capitalize(call.agent);
  const clientName = call.account || 'Unknown';
  const phone = formatPhone(call.phone);
  const dur = formatDuration(call.duration);
  const dir = call.direction === 'inbound' ? 'Inbound' : 'Outbound';
  const time = new Date(call.time).toLocaleString('en-US', {
    timeZone: 'America/Edmonton',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const title = `Jump Contact — ${clientName} Call Recording`;
  const text = [
    `${dir} Call Recording`,
    `Agent: ${agentName}`,
    `Client: ${clientName}`,
    `Phone: ${phone}`,
    `Duration: ${dur}`,
    `Time: ${time}`,
    ``,
    `Listen to the full recording:`,
  ].join('\n');

  if (typeof navigator !== 'undefined' && navigator.share) {
    try { await navigator.share({ title, text, url }); return; } catch { /* cancelled */ }
  }
  await navigator.clipboard.writeText(`${title}\n\n${text}\n${url}`);
}
