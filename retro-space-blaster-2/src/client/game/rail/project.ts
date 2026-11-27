/**
 * Perspective for a camera bolted behind the ship.
 *
 * World z grows toward the horizon. The ship lives at z = 0, which this
 * projector treats as the near plane — the glass the player is looking
 * through. Far objects shrink toward the horizon line.
 *
 * Analogy: standing on a station platform, watching the tracks meet.
 * A train far down the platform is small. It does not arrive by popping
 * out of the lens.
 */

import { TUNE } from './tune.ts';

export type Projected = { x: number; y: number; scale: number; alpha: number };

export function project(x: number, y: number, z: number, viewW: number, viewH: number): Projected {
  const depth = TUNE.FOCAL + Math.max(0, z);
  const scale = TUNE.FOCAL / depth;
  const horizon = viewH * TUNE.HORIZON_Y;
  const shipY = viewH * TUNE.SHIP_Y;
  const sx = viewW / 2 + x * scale * TUNE.X_SPREAD;
  const sy = horizon + (shipY - horizon) * scale + y * scale * TUNE.Y_SPREAD;
  let alpha = 1;
  if (z < TUNE.Z_FADE) {
    const span = TUNE.Z_FADE - TUNE.Z_CULL;
    alpha = span <= 0 ? 0.2 : Math.max(0.16, (z - TUNE.Z_CULL) / span);
  }
  return { x: sx, y: sy, scale, alpha };
}

/** Mouse position on the glass → a point on the ship's plane. */
export function unproject(
  sx: number,
  sy: number,
  viewW: number,
  viewH: number
): { x: number; y: number } {
  const shipY = viewH * TUNE.SHIP_Y;
  return {
    x: (sx - viewW / 2) / TUNE.X_SPREAD,
    y: (sy - shipY) / TUNE.Y_SPREAD,
  };
}
