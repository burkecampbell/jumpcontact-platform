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
