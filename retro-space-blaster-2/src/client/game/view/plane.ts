/**
 * Chase camera for the behind-the-ship view.
 *
 * The simulation still thinks in a flat 1280×720 rectangle: x grows forward
 * (the old "right"), y is lateral (the old "down"). Nothing here changes a
 * speed, a timer, or a hit circle. The camera rides just behind the ship and
 * films a small patch of that floor, tipped up toward a nearby horizon.
 *
 * Why it rides the ship: filming the whole floor made the fighter a speck.
 * The video look is a helmet camera — the ship fills the lower frame and the
 * road ahead shrinks fast. Analogy: the stage marks stay taped down; we
 * stopped shooting the whole stage from the balcony and walked down behind
 * the lead actor.
 *
 * `scale` on a projected point is view-pixels per world-pixel. Sprites
 * multiply by it, so the zoom lives entirely in the lens.
 */

export const WORLD_W = 1280;
export const WORLD_H = 720;

/** Logical glass. 16:9 so a widescreen window is the picture, not a side bar. */
export const VIEW_W = 1280;
export const VIEW_H = 720;

/** Horizon, in view pixels. The road in front of the ship runs up to here. */
export const HORIZON_Y = 92;

/**
 * Size of a sprite at the far end of the visible road, divided by its size
 * at the camera's near plane (not at the ship). Small on purpose: the floor
 * should fall away, not lie flat.
 */
export const FAR_SCALE = 0.2;

/** World pixels of road kept in frame ahead of and behind the ship. */
export const LOOK_AHEAD = 430;
export const LOOK_BEHIND = 78;

/**
 * Half the corridor width, in world pixels, at the ship. The full width
 * (±HALF_WIDTH) fills the glass, which is what makes the fighter large.
 */
export const HALF_WIDTH = 110;

/** Where the ship sits down the glass. 0 is the top, 1 is the bottom. */
export const SHIP_SCREEN_FRAC = 0.8;

const DEPTH = LOOK_AHEAD + LOOK_BEHIND;
const DEPTH_K = 1 / FAR_SCALE - 1;

/**
 * Helmet-camera anchor, in sim pixels. Spawn matches createShip (x=120,
 * vertical center) so the opening shot is already behind the fighter.
 */
let camera = { x: 120, y: WORLD_H / 2 };

export function setCamera(x: number, y: number): void {
  camera = { x, y };
}

export function getCamera(): { x: number; y: number } {
  return camera;
}

export type Projected = { x: number; y: number; scale: number };

export type Frame = {
  scale: number;
  offsetX: number;
  offsetY: number;
  dpr: number;
  cssW: number;
  cssH: number;
};

/** Perspective factor along forward offset from the camera. 1 at the near lip. */
export function perspective(dx: number): number {
  const t = (dx + LOOK_BEHIND) / DEPTH;
  return 1 / Math.max(1 + DEPTH_K * t, 0.05);
}

const SCALE_SHIP = perspective(0);
const NEARNESS_SHIP = (SCALE_SHIP - FAR_SCALE) / (1 - FAR_SCALE);
const BIASED_SHIP = (VIEW_H * SHIP_SCREEN_FRAC - HORIZON_Y) / (VIEW_H - HORIZON_Y);

/**
 * Bends the road so the ship lands on SHIP_SCREEN_FRAC instead of halfway up.
 * Solved from biased = nearness ^ PITCH at the ship's own depth.
 */
export const PITCH = Math.log(BIASED_SHIP) / Math.log(NEARNESS_SHIP);

function screenY(perspScale: number): number {
  const nearness = (perspScale - FAR_SCALE) / (1 - FAR_SCALE);
  const biased = nearness >= 0 ? nearness ** PITCH : nearness;
  return HORIZON_Y + biased * (VIEW_H - HORIZON_Y);
}

function perspFromY(viewY: number): number {
  const biased = (viewY - HORIZON_Y) / (VIEW_H - HORIZON_Y);
  const nearness = biased >= 0 ? biased ** (1 / PITCH) : biased;
  return FAR_SCALE + nearness * (1 - FAR_SCALE);
}

function dxFromPersp(perspScale: number): number {
  const t = (1 / perspScale - 1) / DEPTH_K;
  return t * DEPTH - LOOK_BEHIND;
}

/** View pixels per world pixel at this forward offset. */
function zoomAt(perspScale: number): number {
  return (VIEW_W / (2 * HALF_WIDTH)) * (perspScale / SCALE_SHIP);
}

/**
 * World point → view pixels, relative to the chase camera.
 * The ship (the camera anchor) sits low and centered. Ahead is up, toward
 * the horizon, and smaller.
 */
export function project(worldX: number, worldY: number): Projected {
  const cam = getCamera();
  const dx = worldX - cam.x;
  const dy = worldY - cam.y;
  const perspScale = perspective(dx);
  const zoom = zoomAt(perspScale);
  return {
    x: VIEW_W / 2 + dy * zoom,
    y: screenY(perspScale),
    scale: zoom,
  };
}

/**
 * View pixels → world point. Inverse of `project` for the current camera.
 * Callers that aim a finger clamp into the visible road first; this function
 * itself does not, so a projected point round-trips.
 */
export function unproject(viewX: number, viewY: number): Projected {
  const cam = getCamera();
  const perspScale = perspFromY(viewY);
  const zoom = zoomAt(perspScale);
  const dx = dxFromPersp(perspScale);
  const dy = (viewX - VIEW_W / 2) / zoom;
  return { x: cam.x + dx, y: cam.y + dy, scale: zoom };
}

/**
 * Scale the picture until it covers the window, then crop the overflow.
 * Letterboxing a tall phone left the ship tiny again. Cover keeps the
 * fighter large on both a widescreen and a phone. The sim floor is not
 * resized. Analogy: zooming a photo until it fills the frame, and letting
 * the edges fall outside the mat.
 */
export function fitView(cssW: number, cssH: number, dpr: number): Frame {
  const safeW = Math.max(cssW, 1);
  const safeH = Math.max(cssH, 1);
  const scale = Math.max(safeW / VIEW_W, safeH / VIEW_H);
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

/**
 * Browser pointer → world point. Sky and the area below the near lip clamp
 * onto the visible road, so a finger past the horizon still aims at the far
 * mark instead of a world coordinate off the filmed patch.
 */
export function clientToWorld(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  frame: Frame
): Projected {
  const fit = frame.scale > 0 ? frame.scale : 1;
  const viewX = (clientX - rect.left - frame.offsetX) / fit;
  let viewY = (clientY - rect.top - frame.offsetY) / fit;
  viewY = Math.min(VIEW_H, Math.max(HORIZON_Y, viewY));
  return unproject(viewX, viewY);
}
