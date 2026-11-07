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

/** One stamp per known key; a stamp without a value is a retained deletion. */
export const SAVE_VERSION_KEY = '__versions';
export type SaveVersions = Partial<Record<(typeof SAVE_KEYS)[number], string>>;
export const isSaveVersion = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{16}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

/**
 * Highest score the server will accept. Generous on purpose — it isn't
 * anti-cheat, it just stops absurd values (1e308, Infinity) polluting the board.
 * Raise it if legit runs ever get near it.
 */
export const MAX_SCORE = 100_000_000;

export const DIFFICULTY_IDS = ['cadet', 'pilot', 'ace'] as const;
export type DifficultyId = (typeof DIFFICULTY_IDS)[number];

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export type SaveResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: { code: 'INVALID_SAVE' | 'SAVE_TOO_LARGE'; message: string } };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const identifier = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v);

function validField(key: (typeof SAVE_KEYS)[number], value: unknown): boolean {
  switch (key) {
    case 'difficulty':
      return DIFFICULTY_IDS.some((id) => id === value);
    case 'hd':
    case 'introSeen':
      return typeof value === 'boolean';
    case 'volMusic':
    case 'volSfx':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
    case 'hiscore':
      return validateScore(value).ok;
    case 'ship':
      // Released clients store numeric hangar indexes; also allow bounded IDs.
      return (
        identifier(value) ||
        (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 64)
      );
    case 'theme':
      return identifier(value);
    case 'campaign':
      // Partial campaigns still receive game defaults. Known fields must be
      // usable, like checking a map's legend without prescribing every road.
      return (
        isPlainObject(value) &&
        (!Object.hasOwn(value, 'unlocked') ||
          (Array.isArray(value.unlocked) && value.unlocked.every(identifier))) &&
        (!Object.hasOwn(value, 'completed') ||
          (isPlainObject(value.completed) &&
            Object.entries(value.completed).every(
              ([id, grade]) =>
                identifier(id) && typeof grade === 'string' && ['A', 'B', 'C', 'D'].includes(grade)
            ))) &&
        (!Object.hasOwn(value, 'victory') || typeof value.victory === 'boolean')
      );
  }
}

/** Validate values and bounded version metadata; unknown top-level keys are dropped. */
export function validateSave(input: unknown): SaveResult {
  const invalid = (message: string): SaveResult => ({
    ok: false,
    error: { code: 'INVALID_SAVE', message },
  });
  if (!isPlainObject(input)) return invalid('save must be an object');

  const cleaned: Record<string, unknown> = {};
  for (const key of SAVE_KEYS) {
    if (!Object.hasOwn(input, key)) continue;
    const value = input[key];
    // Range inputs historically persisted strings. Normalize only this exact
    // legacy representation, not arbitrary coercible objects or blank strings.
    cleaned[key] =
      (key === 'volMusic' || key === 'volSfx') &&
      typeof value === 'string' &&
      /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value)
        ? Number(value)
        : value;
  }
  if (Object.hasOwn(input, SAVE_VERSION_KEY)) {
    const versions = input[SAVE_VERSION_KEY];
    if (!isPlainObject(versions)) return invalid('save versions must be an object');
    const stamps: SaveVersions = {};
    for (const [key, version] of Object.entries(versions)) {
      const knownKey = SAVE_KEYS.find((candidate) => candidate === key);
      if (!knownKey || !isSaveVersion(version)) return invalid('invalid save version');
      stamps[knownKey] = version;
    }
    cleaned[SAVE_VERSION_KEY] = stamps;
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(cleaned);
  } catch {
    return invalid('save must be JSON serializable');
  }

  const size = new TextEncoder().encode(serialized).length;
  if (size > MAX_SAVE_BYTES) {
    return {
      ok: false,
      error: {
        code: 'SAVE_TOO_LARGE',
        message: `save too large (${size} > ${MAX_SAVE_BYTES} bytes)`,
      },
    };
  }
  const normalized: Record<string, unknown> = JSON.parse(serialized);
  for (const key of SAVE_KEYS) {
    if (Object.hasOwn(cleaned, key) && !validField(key, normalized[key])) {
      return invalid(`invalid save field: ${key}`);
    }
  }
  return { ok: true, value: normalized };
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
