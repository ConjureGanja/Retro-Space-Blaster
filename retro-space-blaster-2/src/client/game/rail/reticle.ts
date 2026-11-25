/**
 * Where the blasters actually land.
 *
 * A player shot is born at the muzzle and flies straight away from the
 * camera. It does not drift sideways. So at every depth, the shot is still
 * on the same x and y it started on. The crosshair is that point, drawn on
 * the play plane. Spread cannons are the same idea with extra origins.
 *
 * Analogy: a laser pointer taped to the barrel. It marks the wall the
 * bullet will punch, not a hopeful guess beside it.
 */

export type Mark = { x: number; y: number; primary: boolean };

/** Side bolts sit on these offsets. The center barrel is always 0. */
export function gunOffsets(spread: number): number[] {
  const offsets = [0];
  if (spread >= 1) offsets.push(-18, 18);
  if (spread >= 2) offsets.push(-34, 34);
  return offsets;
}

/** World position of every barrel at any depth. Z does not change x or y. */
export function reticleMarks(x: number, y: number, spread: number): Mark[] {
  return gunOffsets(spread).map((offset) => ({
    x: x + offset,
    y,
    primary: offset === 0,
  }));
}

/**
 * Soft magnet. Only when the target is already almost under the guns,
 * and only a few world units. Far enemies are not dragged onto the barrel.
 */
export function assistOrigin(
  x: number,
  y: number,
  target: { x: number; y: number } | null,
  enabled: boolean
): { x: number; y: number } {
  if (!enabled || !target) return { x, y };
  const dx = target.x - x;
  const dy = target.y - y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001 || dist > 28) return { x, y };
  const pull = Math.min(6, dist * 0.35);
  return { x: x + (dx / dist) * pull, y: y + (dy / dist) * pull };
}
