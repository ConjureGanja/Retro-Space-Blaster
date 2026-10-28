/**
 * Input validation for everything the browser sends the server.
 *
 * RULE #1 OF GAME BACKENDS: the client is in the player's hands, so every
 * request might be hand-crafted in devtools. These pure functions are the
 * bouncer at the door — the server calls them before touching Redis.
 *
 * They live in src/shared (not src/server) so they stay pure — no Redis, no
 * Reddit API — which makes them trivial to unit test (validation.test.ts).
 *
 * Analogy: airport security. It doesn't matter how trustworthy the passenger
 * *looks* (a polished client), every bag goes through the scanner.
 */

/**
 * Keys a cloud save may contain. Must match SYNCED_KEYS in
 * src/client/game/store.js. Unknown keys are dropped, not stored.
 */
export const SAVE_KEYS = [
  'campaign',
  'difficulty',
  'ship',
  'hd',
  'volMusic',
  'volSfx',
  'theme',
  'introSeen',
  'hiscore',
] as const;

/** Max serialized save size. The real save is ~1 KB; 16 KB leaves headroom. */
export const MAX_SAVE_BYTES = 16 * 1024;

/**
 * Highest score the server will accept. Generous on purpose — it isn't
 * anti-cheat, it just stops absurd values (1e308, Infinity) polluting the board.
 * Raise it if legit runs ever get near it.
 */
export const MAX_SCORE = 100_000_000;

export const DIFFICULTY_IDS = ['cadet', 'pilot', 'ace'] as const;
export type DifficultyId = (typeof DIFFICULTY_IDS)[number];

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validate a save blob: must be a plain object, only whitelisted keys,
 * and small. Returns a cleaned copy containing only allowed keys.
 */
export function validateSave(input: unknown): Result<Record<string, unknown>> {
  if (!isPlainObject(input)) return { ok: false, error: 'save must be an object' };

  const cleaned: Record<string, unknown> = {};
  for (const key of SAVE_KEYS) {
    if (key in input) cleaned[key] = input[key];
  }

  const size = new TextEncoder().encode(JSON.stringify(cleaned)).length;
  if (size > MAX_SAVE_BYTES) {
    return { ok: false, error: `save too large (${size} > ${MAX_SAVE_BYTES} bytes)` };
  }
  return { ok: true, value: cleaned };
}

/** Validate a submitted score: finite, whole, non-negative, under the cap. */
export function validateScore(input: unknown): Result<number> {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return { ok: false, error: 'score must be a finite number' };
  }
  if (!Number.isInteger(input)) return { ok: false, error: 'score must be a whole number' };
  if (input < 0) return { ok: false, error: 'score must not be negative' };
  if (input > MAX_SCORE) return { ok: false, error: 'score exceeds maximum' };
  return { ok: true, value: input };
}

/** Normalize a difficulty id; anything unexpected becomes 'pilot'. */
export function normalizeDifficulty(input: unknown): DifficultyId {
  // .find() narrows the type for us — no `as` cast needed (casts silence the
  // compiler instead of convincing it, which is how bugs sneak through).
  return DIFFICULTY_IDS.find((id) => id === input) ?? 'pilot';
}
