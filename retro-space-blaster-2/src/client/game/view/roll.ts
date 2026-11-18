/**
 * Cosmetic roll for the one rear-view ship sprite.
 *
 * The picture leans toward a sideways shove and eases back to level when
 * the shove stops. It never changes where the hit circle is — that still
 * sits on the sim's flat floor.
 *
 * Analogy: a bobblehead on the dashboard. The car's lane doesn't move
 * when the toy tips.
 */

/** Radians of roll at a full sideways shove. About 24 degrees. */
export const MAX_ROLL = 0.42;

/**
 * Sideways speed that counts as "stick all the way over" for the picture.
 * Not a movement cap — the sim still uses its own speed limit.
 */
export const ROLL_FULL_SPEED = 6.5;

/** How much of the remaining gap closes each frame. 0.18 ≈ a short ease. */
export const ROLL_EASE = 0.18;

export function easeRoll(current: number, lateral: number): number {
  const stick = Math.max(-1, Math.min(1, lateral / ROLL_FULL_SPEED));
  const target = stick * MAX_ROLL;
  const next = current + (target - current) * ROLL_EASE;
  if (Math.abs(next) < 0.0008 && Math.abs(target) < 0.0008) return 0;
  return next;
}
