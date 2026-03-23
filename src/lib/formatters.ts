/**
 * Shared formatting utilities for the JumpContact Platform.
 *
 * formatPhone  — pretty-print a phone number (10/11 digits → (xxx) xxx-xxxx)
 * formatDuration — seconds → "m:ss"
 * formatTime   — ISO timestamp → "hh:mm AM/PM" in MST
 */

export function formatPhone(num: string): string {
  if (!num) return '—';
  const d = num.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1'))
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10)
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return num;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Edmonton',
    });
  } catch {
    return '—';
  }
}
