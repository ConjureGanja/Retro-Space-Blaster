/**
 * Save-data store: synchronous for the game, cloud-backed underneath.
 *
 * WHAT
 *   The rest of the game calls store.get / store.set / store.remove exactly
 *   like before. Behind that API, values live in an in-memory cache that is:
 *     1. filled at boot by hydrate() — localStorage first, then the player's
 *        Reddit cloud save (cloud wins, so a fresh phone gets desktop progress),
 *     2. mirrored to localStorage on every write (instant, survives a refresh),
 *     3. uploaded to the Devvit server shortly after (follows the account).
 *
 * WHY KEEP IT SYNCHRONOUS
 *   ui.js / map.js / game.js read settings mid-frame. Making every read async
 *   would ripple `await` through the whole codebase for no gain — one async
 *   hydrate() before the menus appear gives the same result.
 *   Analogy: a stage manager loads the props table before curtain-up, so the
 *   actors can grab what they need mid-scene without running backstage.
 */

import { Cloud } from './platform/cloud.js';

const PREFIX = 'rsb_';

/**
 * Keys that make up a save file. Anything else passed to set() still works
 * locally but isn't synced — keeps the cloud blob small and predictable.
 * Keep in sync with SAVE_KEYS in src/shared/validation.ts (the server rejects
 * unknown keys).
 */
const SYNCED_KEYS = [
    'campaign', 'difficulty', 'ship', 'hd', 'volMusic', 'volSfx',
    'theme', 'introSeen', 'hiscore'
];

const cache = Object.create(null);

function readLocal(key) {
    try {
        const v = localStorage.getItem(PREFIX + key);
        return v === null ? undefined : JSON.parse(v);
    } catch {
        return undefined; // private mode / blocked storage / corrupt JSON
    }
}

function writeLocal(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* private mode */ }
}

function removeLocal(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* private mode */ }
}

/** Snapshot of everything that belongs in the cloud save. */
function snapshot() {
    const out = {};
    for (const key of SYNCED_KEYS) if (key in cache) out[key] = cache[key];
    return out;
}

export const store = {
    /**
     * Load saved data before the UI boots. Never rejects — worst case the
     * player starts fresh with defaults.
     */
    async hydrate() {
        for (const key of SYNCED_KEYS) {
            const v = readLocal(key);
            if (v !== undefined) cache[key] = v;
        }

        const remote = await Cloud.init();
        if (remote) {
            for (const key of SYNCED_KEYS) {
                if (!(key in remote)) continue;
                // Hi-score: never let an older device lower it.
                cache[key] = key === 'hiscore'
                    ? Math.max(Number(cache.hiscore) || 0, Number(remote.hiscore) || 0)
                    : remote[key];
                writeLocal(key, cache[key]);
            }
        }
        // The leaderboard is authoritative for the account's best score.
        if (Cloud.best > (Number(cache.hiscore) || 0)) cache.hiscore = Cloud.best;
    },

    get(key, fallback) {
        return key in cache ? cache[key] : fallback;
    },

    set(key, value) {
        cache[key] = value;
        writeLocal(key, value);
        if (SYNCED_KEYS.includes(key)) Cloud.queueSave(snapshot());
    },

    remove(key) {
        delete cache[key];
        removeLocal(key);
        if (SYNCED_KEYS.includes(key)) Cloud.queueSave(snapshot());
    }
};
