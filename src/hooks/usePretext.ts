'use client';

import { useMemo, useEffect, useState } from 'react';
import { prepare, layout, prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

/**
 * Measure the exact pixel width of a text string using Pretext.
 * Uses prepareWithSegments + layoutWithLines to get the actual line width.
 *
 * Returns 0 on SSR and before fonts load.
 */
export function useTextWidth(text: string, font: string): number {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.fonts.ready.then(() => setReady(true));
  }, []);

  return useMemo(() => {
    if (!ready || !text) return 0;
    try {
      const prepared = prepareWithSegments(text, font);
      // Layout with huge width so everything fits on one line
      const result = layoutWithLines(prepared, 99999, 1);
      return result.lines[0]?.width ?? 0;
    } catch {
      return 0;
    }
  }, [text, font, ready]);
}

/**
 * Calculate text content height for a given container width.
 * Useful for pre-calculating step heights before transitions.
 */
export function useContentHeight(text: string, font: string, maxWidth: number, lineHeight: number): number {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.fonts.ready.then(() => setReady(true));
  }, []);

  return useMemo(() => {
    if (!ready || !text || maxWidth <= 0) return 0;
    try {
      const prepared = prepare(text, font);
      const result = layout(prepared, maxWidth, lineHeight);
      return result.height;
    } catch {
      return 0;
    }
  }, [text, font, maxWidth, lineHeight, ready]);
}
