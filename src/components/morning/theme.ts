/**
 * Morning dashboard theme: colors, sizing system, helpers.
 *
 * Sizing uses a BASE map (desktop = 1.0x) with per-mode scale factors.
 * Z(key) returns the scaled size for the current mode.
 * G(base) returns scaled spacing.
 */

export type LayoutMode = 'auto' | 'tv' | 'mobile';

// ── Colors (warm, light theme) ─────────────────────────────────────
export const T = {
  bg: '#fafaf9',
  surface: '#ffffff',
  subtle: '#f5f5f4',
  border: '#e7e5e4',
  ink: '#1c1917',
  inkSoft: '#44403c',
  inkMuted: '#78716c',
  inkFaint: '#a8a29e',
  positive: '#15803d',
  caution: '#b45309',
  negative: '#b91c1c',
  gold: '#ca8a04',
};

// ── Base sizes (desktop = 1.0x) ────────────────────────────────────
const BASE: Record<string, number> = {
  hero: 52,
  heading: 30,
  stepTitle: 22,
  agentName: 15,
  agentValue: 20,
  label: 10,
  tab: 10,
  body: 14,
  pill: 11,
  date: 12,
  badge: 28,
  bar: 7,
  dot: 8,
  button: 14,
  gap: 14,
  sub: 10,
};

const SCALE: Record<LayoutMode, number> = {
  mobile: 0.85,
  auto: 1.0,
  tv: 2.0,
};

// Floor clamps — nothing smaller than these on mobile
const FLOOR: Partial<Record<string, number>> = {
  body: 12,
  button: 12,
  agentName: 13,
  tab: 9,
  label: 9,
};

// ── Runtime mode (set by MorningDashboard shell) ───────────────────
let _mode: LayoutMode = 'auto';
export function setMode(m: LayoutMode) { _mode = m; }
export function getMode(): LayoutMode { return _mode; }

/** Scaled size for an element key */
export function Z(key: string): number {
  const base = BASE[key] ?? 14;
  const scaled = Math.round(base * SCALE[_mode]);
  const floor = FLOOR[key];
  return floor && _mode === 'mobile' ? Math.max(scaled, floor) : scaled;
}

/** Scaled spacing — pass a base-12 value */
export function G(base: number): number {
  return Math.round(base * (Z('gap') / 14));
}

// ── Layout constants per mode ──────────────────────────────────────
export const SIDEBAR_W: Record<LayoutMode, number> = { mobile: 0, auto: 200, tv: 60 };
export const PAD: Record<LayoutMode, number> = { mobile: 16, auto: 32, tv: 48 };
