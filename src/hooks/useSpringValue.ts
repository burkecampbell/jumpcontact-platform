'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { createSpring, springAdvance, springAtRest, springSnap, type SpringConfig } from './useSpring';

/**
 * Animate a single numeric value with spring physics.
 * When `target` changes, the value springs to it instead of snapping.
 */
export function useSpringValue(target: number, stiffness = 180, damping = 22): number {
  const spring = useRef<SpringConfig>(createSpring(target, stiffness, damping));
  const [value, setValue] = useState(target);
  const animId = useRef(0);
  const lastFrame = useRef(0);
  const prevTarget = useRef(target);

  const animate = useCallback((now: number) => {
    const dt = lastFrame.current ? now - lastFrame.current : 16;
    lastFrame.current = now;
    springAdvance(spring.current, dt);

    if (springAtRest(spring.current)) {
      springSnap(spring.current);
      setValue(spring.current.pos);
      return;
    }

    setValue(spring.current.pos);
    animId.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (target !== prevTarget.current) {
      prevTarget.current = target;
      spring.current.dest = target;
      cancelAnimationFrame(animId.current);
      lastFrame.current = 0;
      animId.current = requestAnimationFrame(animate);
    }
  }, [target, animate]);

  useEffect(() => () => cancelAnimationFrame(animId.current), []);

  return value;
}
