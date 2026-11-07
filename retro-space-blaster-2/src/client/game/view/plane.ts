/**
 * Logical playfield and the mild behind-the-ship lens.
 *
 * The simulation still thinks in a flat 1280×720 rectangle: x grows forward
 * (the old "right"), y is lateral (the old "down"). Nothing in here changes
 * a speed, a timer, or a hit circle. It only decides where those floor marks
 * show up on the glass, and how a finger on the glass maps back to a mark.
 *
 * Why the lens is separate from game.js: tilt changes pixels, and the sim
 * measures speed in pixels. Folding the camera into the sim would make a
 * 13px step a different distance on a phone than on a widescreen and quietly
 * retune the game. Analogy: the stage marks stay taped to the floor; this is
 * a new seat in the house, a little above the back row, looking toward the
 * far wing.
 *
 * Far ships are 72% the size of near ships. The floor's vertical run
 * (DEPTH_SPAN) is FAR_SCALE times the forward length of the field, which is
 * what makes a round hit circle still look round at the near edge. A steeper
 * pitch would squash that circle and make dodging lie about the sim.
 */

export const WORLD_W = 1280;
export const WORLD_H = 720;

/** Width of a far sprite divided by the same sprite at the near edge. */
export const FAR_SCALE = 0.72;

/**
 * scale(t) = 1 / (1 + DEPTH_K * t), t in 0..1 along forward x.
 * Picked so scale(1) is exactly FAR_SCALE.
 */
export const DEPTH_K = 1 / FAR_SCALE - 1;

/**
 * Screen pixels of forward travel, near edge to far edge.
 * Equals FAR_SCALE * WORLD_W so the near-edge floor isn't stretched taller
 * or wider than the lateral axis (one screen pixel per world pixel).
 */
export const DEPTH_SPAN = FAR_SCALE * WORLD_W;

/** Sky band above the far edge. One quarter of the logical view is sky. */
export const SKY = DEPTH_SPAN / 3;

export const VIEW_W = WORLD_W;
export const VIEW_H = SKY + DEPTH_SPAN;
export const HORIZON_Y = SKY;

export type Projected = { x: number; y: number; scale: number };

export type Frame = {
  scale: number;
  offsetX: number;
  offsetY: number;
  dpr: number;
  cssW: number;
  cssH: number;
};

/**
 * 1 at the near edge (world x = 0), FAR_SCALE at the far edge (world x = WORLD_W).
 * Values outside the floor keep going: x < 0 grows past the bottom of the
 * glass, x > WORLD_W shrinks past the horizon. Clamping those onto the edges
 * would pin off-screen ships to the border until the sim deleted them.
 * The denominator floor only stops a point behind the camera from flipping
 * the picture upside down.
 */
export function depthScale(worldX: number): number {
  const denom = 1 + DEPTH_K * (worldX / WORLD_W);
  return 1 / Math.max(denom, 0.05);
}

/**
 * World point → logical view pixels. Forward runs toward the horizon (up).
 * Lateral runs left to right. `scale` is the billboard size at that depth.
 */
export function project(worldX: number, worldY: number): Projected {
  const scale = depthScale(worldX);
  const x = VIEW_W / 2 + (worldY - WORLD_H / 2) * scale;
  const y = HORIZON_Y + (DEPTH_SPAN * (scale - FAR_SCALE)) / (1 - FAR_SCALE);
  return { x, y, scale };
}

/**
 * Logical view pixels → world point. The inverse of `project` inside the
 * playfield. Above the horizon and below the near edge clamp onto the far
 * and near borders, so a finger in the sky still aims at the end of the road
 * instead of a world coordinate that doesn't exist.
 */
export function unproject(viewX: number, viewY: number): Projected {
  const yClamped = Math.min(VIEW_H, Math.max(HORIZON_Y, viewY));
  const scale = FAR_SCALE + ((yClamped - HORIZON_Y) / DEPTH_SPAN) * (1 - FAR_SCALE);
  const safe = Math.max(scale, FAR_SCALE);
  const t = (1 / safe - 1) / DEPTH_K;
  const worldX = t * WORLD_W;
  const worldY = WORLD_H / 2 + (viewX - VIEW_W / 2) / safe;
  return { x: worldX, y: worldY, scale: safe };
}

/**
 * Fit the logical view inside the window without stretching. Bars (not a
 * rescale of the sim) fill the leftover space.
 * Analogy: a movie frame dropped into a TV, black bars and all, so the
 * picture isn't squashed to match the bezel.
 */
export function fitView(cssW: number, cssH: number, dpr: number): Frame {
  const safeW = Math.max(cssW, 1);
  const safeH = Math.max(cssH, 1);
  const scale = Math.min(safeW / VIEW_W, safeH / VIEW_H);
  const drawW = VIEW_W * scale;
  const drawH = VIEW_H * scale;
  return {
    scale,
    offsetX: (safeW - drawW) / 2,
    offsetY: (safeH - drawH) / 2,
    dpr: dpr > 0 ? dpr : 1,
    cssW: safeW,
    cssH: safeH,
  };
}

/** Browser pointer → world point, using the same fit the renderer drew with. */
export function clientToWorld(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  frame: Frame
): Projected {
  const scale = frame.scale > 0 ? frame.scale : 1;
  const viewX = (clientX - rect.left - frame.offsetX) / scale;
  const viewY = (clientY - rect.top - frame.offsetY) / scale;
  return unproject(viewX, viewY);
}
