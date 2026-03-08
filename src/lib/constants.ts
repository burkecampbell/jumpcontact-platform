// ── JumpContact Platform — Shared Constants ──────────────────────────────────

export const GOAL = 900;

export const ACTIVE_AGENTS = ['omar', 'burke', 'ian', 'danny', 'chris'];
export const OUTBOUND_AGENTS = ['william', 'joseph'];
export const EXCLUDED_AGENTS_LOWER = ['sara', 'george'];

export const AGENT_COLORS: Record<string, string> = {
  burke: '#4ade80',
  omar:  '#38bdf8',
  ian:   '#a78bfa',
  danny: '#fbbf24',
  chris: '#f87171',
};

export const C = {
  bg:     '#0A0E1A',
  card:   'rgba(20,24,36,0.72)',
  text:   '#f1f5f9',
  sub:    '#8B92A8',
  border: 'rgba(62,165,195,0.18)',
  lime:   '#BCFD4C',
  cyan:   '#3EA5C3',
  pink:   '#E63888',
};

export const JC_KEYWORDS = [
  'sapochnick', 'ttn', 'brudner', 'bueno', 'mne law', 'solimon', 'ibrahim',
  'mckee', 'jdc', "moe's", 'moes', 'sos handyman', 'divine restoration',
  'restoration pro', 'dansel', 'zenith', 'thomas restoration', 'pro master',
  'mchugh', 'boldera', 'oasis',
  'convertable', 'employee retirement', 'greg kennedy', 'accounting leads',
  'rundle', 'palm coast', 'rs gonzal',
  'pod plumber', 'joseph jump', 'jump contact', 'jump sales',
];

export const IBRAHIM_KEYWORDS = ['ibrahim'];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function agentColor(name: string): string {
  return AGENT_COLORS[name.toLowerCase()] ?? '#64748b';
}

export function normalizeAgent(name: string): string {
  if (!name) return '';
  const n = name.trim();
  if (n.toLowerCase() === 'jose' || n.toLowerCase() === 'daniel') return 'Danny';
  return n;
}

export function decodeAgent(identifier: string): string | null {
  if (!identifier || !identifier.startsWith('client:')) return null;
  return identifier
    .replace('client:', '')
    .replace(/_40/gi, '@')
    .replace(/_2E/gi, '.')
    .split('@')[0]
    .toLowerCase();
}

export function isJCAccount(name: string): boolean {
  const lower = name.toLowerCase();
  return JC_KEYWORDS.some(kw => lower.includes(kw));
}

export function isIbrahim(name: string): boolean {
  const l = name.toLowerCase();
  return IBRAHIM_KEYWORDS.some(k => l.includes(k));
}

export function fmtTalkTime(talkMin: number): string {
  const totalMin = Math.round(talkMin);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function fmtSpeed(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) {
    const r = Math.round(sec * 10) / 10;
    return r % 1 === 0 ? `${r}s` : `${r.toFixed(1)}s`;
  }
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function speedGrade(sec: number | null): { grade: string; color: string } {
  if (sec === null) return { grade: '—', color: C.sub };
  if (sec < 8)  return { grade: 'A+', color: '#4ade80' };
  if (sec < 10) return { grade: 'A',  color: '#86efac' };
  if (sec < 12) return { grade: 'B+', color: '#38bdf8' };
  if (sec < 14) return { grade: 'B',  color: '#a78bfa' };
  if (sec < 17) return { grade: 'B-', color: '#fbbf24' };
  return { grade: 'C', color: '#f87171' };
}

export function computePace(mtdTotal: number, pulledAt: string) {
  const now = new Date(pulledAt);
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = Math.round((mtdTotal / Math.max(dayOfMonth, 1)) * daysInMonth);
  const pacePercent = Math.round((projected / GOAL) * 100);
  return { dayOfMonth, daysInMonth, projected, pacePercent };
}

export function parseHMS(hms: string): number {
  if (!hms) return 0;
  const parts = hms.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0]) || 0;
}

export function isMonday(): boolean {
  return new Date().getDay() === 1;
}

export function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Sheet IDs ─────────────────────────────────────────────────────────────────
export const CONVERSIONS_SHEET_ID  = 'YOUR_SHEET_ID';
export const MISSED_CALLS_SHEET_ID = 'YOUR_SHEET_ID';
export const MISSED_CALLS_TAB     = 'Missed Calls';
export const YTICA_SHEET_ID       = 'YOUR_SHEET_ID';
