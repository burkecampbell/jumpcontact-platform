/**
 * Centralized theme configuration — drives both app UI and Clerk components.
 * When the "mask" (theme) changes, update the palette in constants.ts (the C object)
 * and everything inherits it automatically:
 *   layout.tsx ClerkProvider, sign-in/sign-up pages, NavBar, all dashboard components.
 *
 * Derived colors (card surface, input surface, hover states) are computed from C
 * so a single palette swap re-skins the entire platform.
 */

import { C } from './constants';

// ── Derived surface colors (could be extracted into C later) ─────────────────
const SURFACE      = '#0F1322';   // card / modal background
const SURFACE_ALT  = '#151929';   // input / hover background
const HOVER_ACCENT = '#3495b0';   // cyan hover state
const LINK_HOVER   = '#5EBDD6';   // link hover

/** Clerk appearance variables derived from the app color palette */
export function getClerkThemeVariables() {
  return {
    colorPrimary:         C.cyan,
    colorBackground:      SURFACE,
    colorInputBackground: SURFACE_ALT,
    colorText:            C.text,
    colorTextSecondary:   C.sub,
    borderRadius:         '0.75rem',
  } as const;
}

/** Clerk element-level overrides for sign-in / sign-up pages */
export function getClerkPageElements() {
  return {
    rootBox:                  'mx-auto',
    card:                     `bg-[${SURFACE}] border border-[${C.border}] shadow-2xl`,
    headerTitle:              `text-[${C.text}]`,
    headerSubtitle:           `text-[${C.sub}]`,
    socialButtonsBlockButton: `border-[${C.border}] hover:bg-[${SURFACE_ALT}]`,
    formButtonPrimary:        `bg-[${C.cyan}] hover:bg-[${HOVER_ACCENT}] text-[${C.bg}] font-bold`,
    footerActionLink:         `text-[${C.cyan}] hover:text-[${LINK_HOVER}]`,
  } as const;
}

/** Page-level background color (used on sign-in/sign-up wrapper divs) */
export function getPageBackground() {
  return C.bg;
}

/** Subtitle text color for page-level hints */
export function getSubtitleColor() {
  return C.sub;
}
