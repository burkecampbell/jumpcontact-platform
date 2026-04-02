/**
 * Centralized theme configuration — drives app UI styling.
 *
 * Derived colors (card surface, input surface, hover states) are computed from C
 * so a single palette swap re-skins the entire platform.
 */

import { C } from './constants';

/** Page-level background color (used on layout wrapper divs) */
export function getPageBackground() {
  return C.bg;
}

/** Subtitle text color for page-level hints */
export function getSubtitleColor() {
  return C.sub;
}

/** Clerk appearance.variables — dark theme derived from C palette */
export function getClerkThemeVariables() {
  return {
    colorPrimary: C.cyan,
    colorBackground: C.bg,
    colorInputBackground: C.card,
    colorInputText: C.text,
    colorText: C.text,
    colorTextSecondary: C.sub,
    colorDanger: C.pink,
    borderRadius: '10px',
    fontFamily: 'Inter, -apple-system, sans-serif',
    fontFamilyButtons: 'Inter, -apple-system, sans-serif',
  };
}

/** Clerk appearance.elements — glass card style matching platform UI */
export function getClerkPageElements() {
  return {
    // ── Sign-in / Sign-up pages ──
    card: {
      background: C.card,
      border: `1px solid ${C.border}`,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      backdropFilter: 'blur(12px)',
    },
    formButtonPrimary: {
      background: C.cyan,
      fontWeight: 600,
    },
    formFieldInput: {
      background: 'rgba(20,24,36,0.9)',
      borderColor: C.border,
      color: C.text,
    },
    footerActionLink: {
      color: C.cyan,
    },
    headerTitle: {
      color: C.text,
    },
    headerSubtitle: {
      color: C.sub,
    },
    socialButtonsBlockButton: {
      border: `1px solid ${C.border}`,
      color: C.text,
    },
    // ── Sign-in card body — elements Clerk doesn't pick up from variables ──
    dividerLine: {
      background: C.border,
    },
    dividerText: {
      color: C.sub,
    },
    formFieldLabel: {
      color: C.sub,
    },
    formFieldInputPlaceholder: {
      color: 'rgba(139,146,168,0.6)',
    },
    footerActionText: {
      color: C.sub,
    },
    footer: {
      color: C.sub,
    },
    footerAction: {
      color: C.sub,
    },
    identityPreviewText: {
      color: C.text,
    },
    identityPreviewEditButton: {
      color: C.cyan,
    },
    otpCodeFieldInput: {
      borderColor: C.border,
      color: C.text,
    },
    formResendCodeLink: {
      color: C.cyan,
    },
    alert: {
      color: C.text,
      background: 'rgba(20,24,36,0.9)',
      borderColor: C.border,
    },
    alertText: {
      color: C.text,
    },
    // ── UserButton popover (dropdown menu) ──
    userButtonPopoverCard: {
      background: C.bg,
      border: `1px solid ${C.border}`,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    },
    userButtonPopoverActionButton: {
      color: C.text,
    },
    userButtonPopoverActionButtonText: {
      color: C.text,
    },
    userButtonPopoverActionButtonIcon: {
      color: C.sub,
    },
    userButtonPopoverFooter: {
      display: 'none',
    },
    userPreviewMainIdentifier: {
      color: C.text,
    },
    userPreviewSecondaryIdentifier: {
      color: C.sub,
    },
  };
}
