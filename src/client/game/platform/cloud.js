/**
 * Cloud bridge — talks to this app's own Devvit server (src/server) over /api.
 *
 * WHAT
 *   - init():        fetch the player's Reddit username, cloud save and the
 *                    subreddit leaderboard in one round-trip at boot.
 *   - queueSave():   debounced upload of the whole save blob (settings +
 *                    campaign map progress + hi-score).
 *   - submitScore(): post a finished run's score to the leaderboard.
 *
 * WHY
 *   localStorage only lives on one device, and inside Reddit's iframe it can
 *   be wiped or partitioned at any time. Redis on the Devvit server follows
 *   the *Reddit account*, so progress survives switching from desktop to the
 *   phone app — and it's what makes a shared leaderboard possible at all.
 *
 *   Analogy: localStorage is the notepad in your pocket; the cloud save is
 *   the Guild's filing cabinet back at HQ. You jot things in the notepad
 *   instantly, and a courier carries a copy to HQ a moment later.
 *
 * OFFLINE / LOCAL PLAY
 *   When there's no /api server (`npm run local`, or Reddit is having a bad
 *   day) every call fails soft: init() resolves to null and the game keeps
 *   running on localStorage alone. Nothing here may ever throw into the game
 *   loop — a dropped save is annoying, a crashed game is a lost player.
 *
 * SECURITY NOTE
 *   Anything the browser sends can be forged, so the server re-validates every
 *   field (see src/shared/validation.ts). Never trust this file to enforce rules.
 */

/** How long to wait on the API before giving up and playing offline. */
const INIT_TIMEOUT_MS = 4000;

/** Coalesce rapid store.set() calls (e.g. dragging a volume slider) into one upload. */
const SAVE_DEBOUNCE_MS = 1500;

/** Retry a failed upload after 2s, 4s, 8s, 16s, 30s — then wait for the next change. */
const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

/**
 * Upload pipeline state. ONE request in flight at a time:
 *   - `pending` is the newest snapshot not yet sent (older ones are simply
 *     replaced — only the latest state matters),
 *   - `inFlight` blocks a second POST until the first answers, so an older
 *     request can never land after a newer one and overwrite it.
 * Analogy: a single courier on the route. New parcels wait at the depot and
 * only the most recent one goes out on the next run — never two couriers
 * racing, where the slower (older) parcel arrives last and "wins".
 */
let saveTimer = null;
let pending = null; // { snapshot, onSynced }
let inFlight = false;
let attempt = 0;

/**
 * fetch() with a timeout and JSON handling. Returns parsed JSON or null —
 * never throws (see "OFFLINE / LOCAL PLAY" above).
 */
async function request(path, { method = 'GET', body, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method,
      signal: controller.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    // Local Vite dev server answers unknown /api paths with index HTML —
    // only accept real JSON so we don't mistake that for a save file.
    const type = res.headers.get('content-type') || '';
    return type.includes('application/json') ? await res.json() : null;
  } catch {
    return null; // offline, aborted, or blocked — play on with local data
  } finally {
    clearTimeout(timer);
  }
}

export const Cloud = {
  /** True once /api/init succeeded — i.e. we're running inside Reddit. */
  online: false,
  /** Logged-in Reddit username, or null for logged-out viewers / local play. */
  username: null,
  /** Subreddit this post lives in (saves + leaderboard are per subreddit). */
  subreddit: null,
  /** Last known top scores: [{ username, score }] */
  leaderboard: [],
  /** This player's best leaderboard score (0 if none / logged out). */
  best: 0,

  /**
   * One round-trip at boot. Resolves to the cloud save object (or null).
   * @returns {Promise<Record<string, unknown> | null>}
   */
  async init() {
    const data = await request('/api/init', { timeoutMs: INIT_TIMEOUT_MS });
    if (!data || data.type !== 'init') return null;
    this.online = true;
    this.username = data.username ?? null;
    this.subreddit = data.subreddit ?? null;
    this.leaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : [];
    this.best = Number(data.best) || 0;
    return data.save && typeof data.save === 'object' ? data.save : null;
  },

  /**
   * Schedule an upload of the full save blob. Only the latest snapshot is
   * sent — like autosave in an editor, not a keystroke log.
   * Logged-out viewers can't own a save, so we skip the request entirely.
   * @param {Record<string, unknown>} snapshot
   * @param {() => void} [onSynced]  called once the server has confirmed this snapshot
   */
  queueSave(snapshot, onSynced) {
    if (!this.online || !this.username) return;
    pending = { snapshot, onSynced };
    attempt = 0; // fresh data → fresh retry budget
    schedule(SAVE_DEBOUNCE_MS);
  },

  /**
   * Post a run's score. The server keeps each player's best, so it's fine
   * to call this at every node clear and again on game over.
   * @param {number} score
   * @param {string} difficulty  'cadet' | 'pilot' | 'ace'
   */
  async submitScore(score, difficulty) {
    if (!this.online || !this.username) return null;
    const safe = Math.max(0, Math.floor(Number(score) || 0));
    if (safe <= 0) return null;
    const data = await request('/api/score', { method: 'POST', body: { score: safe, difficulty } });
    if (data && data.type === 'score') {
      this.best = data.best;
      this.leaderboard = data.leaderboard;
    }
    return data;
  },
};

/** (Re)arm the upload timer. */
function schedule(delayMs) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flush(), delayMs);
}

/** Send the newest pending snapshot, if any, unless a request is already out. */
async function flush() {
  if (inFlight || !pending) return;
  const job = pending;
  pending = null;
  inFlight = true;
  const ok = await request('/api/save', { method: 'POST', body: { save: job.snapshot } });
  inFlight = false;

  if (ok && ok.type === 'save') {
    // Only mark clean if nothing newer was queued while this was in flight.
    if (!pending) job.onSynced?.();
    attempt = 0;
  } else if (!pending) {
    // Failed (offline, timeout, 429, 500…). Keep the snapshot and back off.
    // store.js also keeps an "unsynced" flag in localStorage, so even if the
    // tab closes before a retry succeeds, the next boot won't let the older
    // cloud copy overwrite this progress.
    pending = job;
    const delay = RETRY_DELAYS_MS[attempt];
    attempt++;
    if (delay !== undefined) schedule(delay);
    return;
  }
  // Something newer arrived meanwhile → send it now (no extra debounce).
  if (pending) void flush();
}
