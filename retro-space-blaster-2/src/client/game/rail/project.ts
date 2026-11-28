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

/** Keep the ship's legal box this many pixels inside the glass. */
const EDGE_MARGIN = 28;

/**
 * Pixels per world unit, shrunk when the screen is too small to show the whole
 * playfield. Without this a landscape phone (844x390) lets the ship steer
 * offscreen while the fight goes on.
 *
 * Analogy: zooming a map out until the whole park fits on the page, rather
 * than printing it at a fixed scale and letting the gates fall off the edge.
 */
export function spreadFor(viewW: number, viewH: number): { x: number; y: number } {
  const shipY = viewH * TUNE.SHIP_Y;
  const fitX = (viewW / 2 - EDGE_MARGIN) / TUNE.PLAY_X;
  const fitY = Math.min(shipY - EDGE_MARGIN, viewH - EDGE_MARGIN - shipY) / TUNE.PLAY_Y;
  return {
    x: Math.max(0.5, Math.min(TUNE.X_SPREAD, fitX)),
    y: Math.max(0.5, Math.min(TUNE.Y_SPREAD, fitY)),
  };
}

export function project(x: number, y: number, z: number, viewW: number, viewH: number): Projected {
  const depth = TUNE.FOCAL + Math.max(0, z);
  const scale = TUNE.FOCAL / depth;
  const horizon = viewH * TUNE.HORIZON_Y;
  const shipY = viewH * TUNE.SHIP_Y;
  const spread = spreadFor(viewW, viewH);
  const sx = viewW / 2 + x * scale * spread.x;
  const sy = horizon + (shipY - horizon) * scale + y * scale * spread.y;
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
  const spread = spreadFor(viewW, viewH);
  return {
    x: (sx - viewW / 2) / spread.x,
    y: (sy - shipY) / spread.y,
  };
}
