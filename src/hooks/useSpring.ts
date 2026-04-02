/**
 * Spring physics engine — ported from chenglou's drag demo.
 * Fixed-timestep simulation decoupled from render framerate.
 * Supports interruptible transitions and flick velocity.
 */

const MS_PER_STEP = 4; // 4ms physics step = 250Hz simulation
const REST_THRESHOLD = 0.5;
const REST_VELOCITY = 0.01;

export interface SpringConfig {
  pos: number;
  dest: number;
  v: number;     // velocity
  k: number;     // stiffness (spring constant)
  b: number;     // damping coefficient
}

export function createSpring(pos: number, k = 290, b = 24): SpringConfig {
  return { pos, dest: pos, v: 0, k, b };
}

/** Single physics step (fixed timestep) */
function springStep(s: SpringConfig): void {
  const t = MS_PER_STEP / 1000;
  const Fspring = -s.k * (s.pos - s.dest);
  const Fdamper = -s.b * s.v;
  const a = Fspring + Fdamper;
  s.v += a * t;
  s.pos += s.v * t;
}

/** Advance spring by `dt` milliseconds (multiple fixed steps) */
export function springAdvance(s: SpringConfig, dt: number): void {
  let steps = Math.floor(dt / MS_PER_STEP);
  // Cap to prevent spiral of death on tab-switch
  if (steps > 200) steps = 200;
  for (let i = 0; i < steps; i++) {
    springStep(s);
  }
}

/** Check if spring is at rest (close to destination, near-zero velocity) */
export function springAtRest(s: SpringConfig): boolean {
  return (
    Math.abs(s.pos - s.dest) < REST_THRESHOLD &&
    Math.abs(s.v) < REST_VELOCITY
  );
}

/** Snap spring to destination instantly */
export function springSnap(s: SpringConfig): void {
  s.pos = s.dest;
  s.v = 0;
}

/** Set destination (interruptible — preserves current velocity) */
export function springSetDest(s: SpringConfig, dest: number): void {
  s.dest = dest;
}

/** Inject velocity (for flick) */
export function springAddVelocity(s: SpringConfig, v: number): void {
  s.v += v;
}
