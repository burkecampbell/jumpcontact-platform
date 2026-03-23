'use client';

import { useEffect, useState, useRef } from 'react';

/**
 * Animated count-up hook — eases from 0 to target over `duration` ms.
 */
export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0);
  const startTs = useRef<number | null>(null);
  const rafId = useRef<number>(0);

  useEffect(() => {
    setValue(0);
    startTs.current = null;
    function tick(ts: number) {
      if (!startTs.current) startTs.current = ts;
      const elapsed = ts - startTs.current;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(ease * target));
      if (progress < 1) rafId.current = requestAnimationFrame(tick);
    }
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [target, duration]);
  return value;
}
