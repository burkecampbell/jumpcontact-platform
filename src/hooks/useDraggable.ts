/**
 * useDraggable — React hook for draggable elements with spring physics.
 * Handles pointer events, flick velocity, and spring animation.
 */
'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import {
  createSpring, springAdvance, springAtRest, springSetDest,
  springAddVelocity, springSnap, type SpringConfig,
} from './useSpring';

interface PointerSample {
  x: number;
  y: number;
  time: number;
}

interface DragState {
  isDragging: boolean;
  x: number;
  y: number;
  scale: number;
  zIndex: number;
}

interface UseDraggableOptions {
  /** Initial position */
  initialX?: number;
  initialY?: number;
  /** Spring stiffness (higher = snappier) */
  stiffness?: number;
  /** Spring damping (higher = less bouncy) */
  damping?: number;
  /** Scale when lifted */
  liftScale?: number;
  /** Called when drag ends with final position */
  onDragEnd?: (x: number, y: number) => void;
  /** If true, spring back to initial position on release */
  snapBack?: boolean;
  /** Z-index when not dragging */
  baseZIndex?: number;
}

export function useDraggable(opts: UseDraggableOptions = {}) {
  const {
    initialX = 0,
    initialY = 0,
    stiffness = 290,
    damping = 24,
    liftScale = 1.04,
    onDragEnd,
    snapBack = false,
    baseZIndex = 1,
  } = opts;

  const springX = useRef<SpringConfig>(createSpring(initialX, stiffness, damping));
  const springY = useRef<SpringConfig>(createSpring(initialY, stiffness, damping));
  const springScale = useRef<SpringConfig>(createSpring(1, 180, 20));

  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const pointerHistory = useRef<PointerSample[]>([]);
  const lastFrameTime = useRef(0);
  const animFrameId = useRef(0);

  const [state, setState] = useState<DragState>({
    isDragging: false,
    x: initialX,
    y: initialY,
    scale: 1,
    zIndex: baseZIndex,
  });

  // Animation loop — fixed-timestep spring, render at display rate
  const animate = useCallback((now: number) => {
    const dt = lastFrameTime.current ? now - lastFrameTime.current : 16;
    lastFrameTime.current = now;

    springAdvance(springX.current, dt);
    springAdvance(springY.current, dt);
    springAdvance(springScale.current, dt);

    const allRest =
      springAtRest(springX.current) &&
      springAtRest(springY.current) &&
      springAtRest(springScale.current);

    if (allRest && !dragging.current) {
      springSnap(springX.current);
      springSnap(springY.current);
      springSnap(springScale.current);
    }

    setState({
      isDragging: dragging.current,
      x: springX.current.pos,
      y: springY.current.pos,
      scale: springScale.current.pos,
      zIndex: dragging.current ? 9999 : baseZIndex,
    });

    if (!allRest || dragging.current) {
      animFrameId.current = requestAnimationFrame(animate);
    }
  }, [baseZIndex]);

  const startAnimation = useCallback(() => {
    cancelAnimationFrame(animFrameId.current);
    lastFrameTime.current = 0;
    animFrameId.current = requestAnimationFrame(animate);
  }, [animate]);

  // Pointer handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragging.current = true;
    dragOffset.current = {
      x: e.clientX - springX.current.pos,
      y: e.clientY - springY.current.pos,
    };
    pointerHistory.current = [{ x: e.clientX, y: e.clientY, time: performance.now() }];

    // Lift animation
    springSetDest(springScale.current, liftScale);

    // Kill existing velocity for instant grab feel
    springX.current.v = 0;
    springY.current.v = 0;

    startAnimation();
  }, [liftScale, startAnimation]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;

    const now = performance.now();
    pointerHistory.current.push({ x: e.clientX, y: e.clientY, time: now });
    // Keep last 100ms of samples
    while (pointerHistory.current.length > 1 && now - pointerHistory.current[0].time > 100) {
      pointerHistory.current.shift();
    }

    // Direct position tracking (no spring during drag)
    springX.current.pos = e.clientX - dragOffset.current.x;
    springX.current.dest = springX.current.pos;
    springY.current.pos = e.clientY - dragOffset.current.y;
    springY.current.dest = springY.current.pos;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;

    // Calculate flick velocity from pointer history
    const now = performance.now();
    const history = pointerHistory.current;
    if (history.length >= 2) {
      let i = history.length - 1;
      while (i > 0 && now - history[i].time <= 100) i--;
      const oldest = history[Math.max(0, i)];
      const newest = history[history.length - 1];
      const dt = newest.time - oldest.time;
      if (dt > 0) {
        const vx = ((newest.x - oldest.x) / dt) * 1000;
        const vy = ((newest.y - oldest.y) / dt) * 1000;
        springAddVelocity(springX.current, vx);
        springAddVelocity(springY.current, vy);
      }
    }

    // Set destination
    if (snapBack) {
      springSetDest(springX.current, initialX);
      springSetDest(springY.current, initialY);
    } else {
      // Spring to wherever momentum carries it
      springSetDest(springX.current, springX.current.pos);
      springSetDest(springY.current, springY.current.pos);
    }

    // Drop animation
    springSetDest(springScale.current, 1);

    startAnimation();
    onDragEnd?.(springX.current.pos, springY.current.pos);
  }, [snapBack, initialX, initialY, startAnimation, onDragEnd]);

  // Cleanup
  useEffect(() => {
    return () => cancelAnimationFrame(animFrameId.current);
  }, []);

  return {
    state,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}
