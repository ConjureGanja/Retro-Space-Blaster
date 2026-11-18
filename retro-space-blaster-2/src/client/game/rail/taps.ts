/**
 * Double-tap detection for the barrel roll.
 *
 * A roll is two presses of the same direction inside a short window.
 * The caller only reports a press when the key, stick, or bumper goes
 * down — a held key never calls this, so steering does not roll the ship.
 *
 * Analogy: knocking twice on a door. Leaning on the door is not a second knock.
 */

export const DOUBLE_TAP_MS = 250;

export type TapDir = -1 | 1;

export type TapMemory = {
  lastDir: -1 | 0 | 1;
  lastAt: number;
};

export function freshTaps(): TapMemory {
  return { lastDir: 0, lastAt: Number.NEGATIVE_INFINITY };
}

/**
 * Record one rising edge. Returns the roll direction when this press
 * completes a pair, otherwise 0. The memory resets after a roll so a
 * third tap starts a new pair instead of rolling again for free.
 */
export function notePress(
  memory: TapMemory,
  dir: TapDir,
  nowMs: number,
  windowMs = DOUBLE_TAP_MS
): { memory: TapMemory; roll: -1 | 0 | 1 } {
  const dt = nowMs - memory.lastAt;
  if (memory.lastDir === dir && dt > 0 && dt <= windowMs) {
    return { memory: { lastDir: 0, lastAt: nowMs }, roll: dir };
  }
  return { memory: { lastDir: dir, lastAt: nowMs }, roll: 0 };
}
