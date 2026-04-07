// ── Colors (CSS variable bridge — values defined in globals.css) ────
// Dark/light mode is controlled by `html.light` class toggle.
// All 471+ inline style references resolve through these CSS vars.
export const C = {
  bg:        'var(--jc-bg)',
  card:      'var(--jc-card)',
  text:      'var(--jc-text)',
  sub:       'var(--jc-sub)',
  border:    'var(--jc-border)',
  lime:      'var(--jc-lime)',
  cyan:      'var(--jc-cyan)',
  pink:      'var(--jc-pink)',
  good:      'var(--jc-good)',
  warn:      'var(--jc-warn)',
  bad:       'var(--jc-bad)',
  info:      'var(--jc-info)',
  // Opacity variants (replace C.cyan + '22' patterns)
  cyanSoft:  'var(--jc-cyan-soft)',
  cyanHover: 'var(--jc-cyan-hover)',
  cyanMuted: 'var(--jc-cyan-muted)',
  limeSoft:  'var(--jc-lime-soft)',
  limeHover: 'var(--jc-lime-hover)',
  pinkSoft:  'var(--jc-pink-soft)',
  navBg:     'var(--jc-nav-bg)',
  overlay:   'var(--jc-overlay)',
  contrast:  'var(--jc-contrast)',
} as const;

export const ACTIVITY_COLORS = {
  available: '#10b981',
  busy:      '#22d3ee',
  wrapUp:    '#fbbf24',
  offline:   '#4b5563',
} as const;

// ── Agents ──────────────────────────────────────────────────────────
const csv = (key: string, fallback: string) =>
  (process.env[key] || fallback).split(',').map(s => s.trim().toLowerCase());

export const ACTIVE_AGENTS = csv('ACTIVE_AGENTS', 'omar,burke,ian,danny,chris,wendy,sara,george,sue,angel');
export const OUTBOUND_AGENTS = csv('OUTBOUND_AGENTS', 'william,joseph');
export const EXCLUDED_AGENTS = csv('EXCLUDED_AGENTS', 'sara,sue');

// MSC-only agents — NEVER appear on JC dashboards
export const MSC_ONLY_AGENTS = new Set([
  'desi', 'natalie', 'sofia', 'sue', 'rebecca', 'francis', 'richard', 'anthony',
]);

/** Agent should appear on JC dashboards (not excluded, not MSC-only) */
export function isJCAgent(name: string): boolean {
  const n = name.toLowerCase();
  return !EXCLUDED_AGENTS.includes(n) && !MSC_ONLY_AGENTS.has(n);
}

export const AGENT_COLORS: Record<string, string> = {
  // JC agents
  burke:    '#4ade80',
  omar:     '#38bdf8',
  ian:      '#a78bfa',
  danny:    '#fbbf24',
  chris:    '#f87171',
  george:   '#22d3ee',
  angel:    '#e879f9',
  william:  '#c084fc',
  joseph:   '#34d399',
  // MSC agents
  desi:     '#f472b6',
  richard:  '#fb923c',
  francis:  '#06b6d4',
  natalie:  '#a3e635',
  sofia:    '#c084fc',
  rebecca:  '#f59e0b',
  anthony:  '#10b981',
  jose:     '#fb923c',
  // Blended
  sara:     '#94a3b8',
  sue:      '#fb923c',
  wendy:    '#e879f9',
};

// ── Sheet IDs ───────────────────────────────────────────────────────
export const CONVERSIONS_SHEET_ID = process.env.CONVERSIONS_SHEET_ID || 'YOUR_SHEET_ID';
export const MISSED_CALLS_SHEET_ID = process.env.MISSED_CALLS_SHEET_ID || 'YOUR_SHEET_ID';
export const SCHEDULE_SHEET_ID = process.env.SCHEDULE_SHEET_ID || 'YOUR_SHEET_ID';
export const YTICA_SHEET_ID = process.env.YTICA_SHEET_ID || 'YOUR_SHEET_ID';
export const MSC_CALLS_SHEET_ID = process.env.MSC_CALLS_SHEET_ID || 'YOUR_SHEET_ID';
export const GOAL = 900;
export const DAILY_GOAL = 30;
export const MONTHLY_GOAL = 900;
export const TZ = 'America/Edmonton';

// ── Helpers ─────────────────────────────────────────────────────────
const AGENT_ALIASES: Record<string, string> = {
  'danny r': 'danny', 'danny rodriguez': 'danny',
  'daniel': 'danny',
  'anthony': 'jose', 'anthony ': 'jose', // Anthony is Jose making calls under a different name
};

const NON_AGENT_VALUES = new Set(['yes', 'no', 'true', 'false', 'n/a', 'na', '-', 'other', '']);

export function normalizeAgent(name: string): string {
  const lower = name.toLowerCase().trim();
  if (NON_AGENT_VALUES.has(lower)) return '';
  return AGENT_ALIASES[lower] || lower;
}

export function decodeAgent(uri: string): string {
  const match = uri.match(/^client:(.+)/);
  if (!match) return uri;
  const decoded = match[1].replace(/_([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  const name = decoded.split('@')[0];
  return normalizeAgent(name);
}

export function agentColor(name: string): string {
  return AGENT_COLORS[normalizeAgent(name)] || '#64748b';
}

export function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function rankBadge(index: number): string {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return `${index + 1}`;
}

export function formatPhone(phone: string): string {
  if (!phone) return '—';
  const d = phone.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return phone;
}

export function speedGrade(sec: number | null): { grade: string; color: string; letter: string } {
  if (sec === null || sec <= 0)  return { grade: '—', letter: '—', color: C.sub };
  if (sec < 8)   return { grade: 'A+', letter: 'A+', color: '#4ade80' };
  if (sec < 10)  return { grade: 'A',  letter: 'A',  color: '#86efac' };
  if (sec < 12)  return { grade: 'B+', letter: 'B+', color: '#38bdf8' };
  if (sec < 14)  return { grade: 'B',  letter: 'B',  color: '#a78bfa' };
  if (sec < 17)  return { grade: 'B-', letter: 'B-', color: '#fbbf24' };
  if (sec < 25)  return { grade: 'C',  letter: 'C',  color: '#eab308' };
  if (sec < 35)  return { grade: 'D',  letter: 'D',  color: '#f97316' };
  return { grade: 'F', letter: 'F', color: C.pink };
}

export function fmtSpeed(sec: number | null): string {
  if (sec === null) return '—';
  const rounded = Math.round(sec * 100) / 100;
  if (rounded < 60) {
    return `${rounded.toFixed(2)}s`;
  }
  return `${Math.floor(rounded / 60)}m ${Math.round(rounded % 60)}s`;
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function fmtHours(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
    });
  } catch { return '—'; }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: TZ,
  });
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function fmtTalkTime(talkMin: number): string {
  const totalMin = Math.round(talkMin);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function parseHMS(hms: string): number {
  if (!hms) return 0;
  const parts = hms.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0]) || 0;
}

export function computePace(mtdTotal: number, pulledAt: string) {
  const now = new Date(pulledAt);
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = Math.round((mtdTotal / Math.max(dayOfMonth, 1)) * daysInMonth);
  const pacePercent = Math.round((projected / GOAL) * 100);
  return { dayOfMonth, daysInMonth, projected, pacePercent };
}

export function isJCAccount(name: string): boolean {
  const lower = name.toLowerCase();
  return JC_KEYWORDS.some(kw => lower.includes(kw));
}

export const JC_KEYWORDS = [
  'sapochnick', 'ttn', 'brudner', 'bueno', 'mne law', 'solimon', 'ibrahim',
  'mckee', 'jdc', "moe's", 'moes', 'sos handyman', 'divine restoration',
  'restoration pro', 'dansel', 'zenith', 'thomas restoration', 'pro master',
  'mchugh', 'boldera', 'oasis',
  'convertable', 'employee retirement', 'greg kennedy', 'accounting leads',
  'rundle', 'palm coast', 'rs gonzal',
  'pod plumber', 'joseph jump', 'jump contact', 'jump sales',
];

export function parseShiftRange(shiftStr: string): { start: number; end: number } | null {
  if (!shiftStr || /off|n\/a|-$/i.test(shiftStr.trim())) return null;
  // Handle formats: "7a-6p", "12a - 7am", "8a-1p", "3p-12a"
  const m = shiftStr.trim().match(/^(\d+(?::\d+)?)\s*([ap])m?\s*[-–]\s*(\d+(?::\d+)?)\s*([ap])m?$/i);
  if (!m) return null;
  const toH = (t: string, ampm: string) => {
    const [h, min = '0'] = t.split(':');
    let hour = parseInt(h);
    if (ampm.toLowerCase() === 'p' && hour !== 12) hour += 12;
    if (ampm.toLowerCase() === 'a' && hour === 12) hour = 0;
    return hour + parseInt(min) / 60;
  };
  return { start: toH(m[1], m[2]), end: toH(m[3], m[4]) };
}

export function isOnShift(schedule: Record<string, string>, nowMST: Date): boolean {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayKey = days[nowMST.getDay()];
  const shift = schedule[dayKey] || schedule[dayKey.toLowerCase()] || '';
  // Handle comma-separated shifts: "8a-1p, 4p-9p"
  const segments = shift.split(',').map(s => s.trim());
  const nowH = nowMST.getHours() + nowMST.getMinutes() / 60;
  for (const seg of segments) {
    const range = parseShiftRange(seg);
    if (!range) continue;
    if (range.end < range.start) {
      // Overnight shift (e.g., 3p-12a = 15-24)
      if (nowH >= range.start || nowH < range.end) return true;
    } else {
      if (nowH >= range.start && nowH < range.end) return true;
    }
  }
  return false;
}

export function isMonday(): boolean {
  const mst = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  return mst.getDay() === 1;
}

export const IBRAHIM_KEYWORDS = ['ibrahim'];

export function isIbrahim(name: string): boolean {
  const l = name.toLowerCase();
  return IBRAHIM_KEYWORDS.some(k => l.includes(k));
}

export const EXCLUDED_AGENTS_LOWER = (process.env.EXCLUDED_AGENTS || '').split(',').filter(Boolean);

// ── Agent Schedule (March 2026) ──────────────────────────────────────────────
export const AGENT_SCHEDULE: Record<string, number[]> = {
  //           Sun  Mon  Tue  Wed  Thu  Fri  Sat
  omar:    [   0,   9,   9,   9,   9,   7,   7 ],
  burke:   [   4,  11,  11,  11,  11,  11,   0 ],
  ian:     [   7,   8,   8,   8,   8,   8,   7 ],
  danny:   [   0,   8,   8,   8,   8,   8,   5 ],
  chris:   [   9,   9,   9,   9,   9,   9,   0 ],
  george:  [   0,   8,   8,   8,   8,   8,   0 ],
};

export function getScheduledHoursClient(agent: string, date: Date): number {
  const key = agent.toLowerCase();
  const dow = date.getDay();
  return AGENT_SCHEDULE[key]?.[dow] ?? 0;
}
