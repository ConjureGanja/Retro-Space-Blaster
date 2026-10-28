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

/**
 * localStorage key prefix. Starts as the shared/anonymous slot ('rsb_') and is
 * narrowed to one Reddit account in hydrate() — see scopeToAccount().
 */
let prefix = 'rsb_';

/**
 * Give each Reddit account (per subreddit) its own localStorage slot.
 * WHY: several Reddit accounts can share one browser. Without this, account B
 * would load account A's cached campaign at boot and then upload it as its own
 * cloud save. The subreddit is part of the slot because Devvit's Redis — and
 * so the cloud save — is per subreddit install.
 * Analogy: separate lockers in a shared changing room — same building,
 * nobody walks off in someone else's kit.
 * Logged-out viewers and `npm run local` keep the plain 'rsb_' slot.
 */
function scopeToAccount(username, subreddit) {
    if (!username) { prefix = 'rsb_'; return; }
    const sub = (subreddit || 'any').toLowerCase();
    prefix = `rsb_u_${sub}_${username.toLowerCase()}_`;
}

/**
 * "Unsynced" marker: set on every write of a synced key, cleared only when the
 * server confirms the upload. Lives in localStorage so it survives the tab
 * closing mid-upload. WHY: if a save never reached the server (offline, error),
 * the cloud copy is OLDER than this device's — so on the next boot this
 * device's data must win, then get re-uploaded.
 * Analogy: a "not yet filed" sticky note on the folder — whoever opens it next
 * knows the copy in their hand beats the one in the cabinet.
 */
const DIRTY_KEY = '__unsynced';

function markDirty() { writeLocal(DIRTY_KEY, true); }
function markClean() { removeLocal(DIRTY_KEY); }

/** Queue the current save for upload; clear the sticky note once it lands. */
function sync() { Cloud.queueSave(snapshot(), markClean); }

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
        const v = localStorage.getItem(prefix + key);
        return v === null ? undefined : JSON.parse(v);
    } catch {
        return undefined; // private mode / blocked storage / corrupt JSON
    }
}

function writeLocal(key, value) {
    try { localStorage.setItem(prefix + key, JSON.stringify(value)); } catch { /* private mode */ }
}

function removeLocal(key) {
    try { localStorage.removeItem(prefix + key); } catch { /* private mode */ }
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
        // Ask the server who's playing FIRST, so we read the right account's
        // local slot (never another account's leftovers). Offline → null.
        const remote = await Cloud.init();
        scopeToAccount(Cloud.username, Cloud.subreddit);

        for (const key of SYNCED_KEYS) {
            const v = readLocal(key);
            if (v !== undefined) cache[key] = v;
        }
        const unsynced = readLocal(DIRTY_KEY) === true;

        if (remote) {
            for (const key of SYNCED_KEYS) {
                if (!(key in remote)) continue;
                // Unsynced local progress beats the (older) cloud copy.
                if (unsynced && key in cache && key !== 'hiscore') continue;
                // Hi-score: never let an older device lower it.
                cache[key] = key === 'hiscore'
                    ? Math.max(Number(cache.hiscore) || 0, Number(remote.hiscore) || 0)
                    : remote[key];
                writeLocal(key, cache[key]);
            }
        }
        // The leaderboard is authoritative for the account's best score.
        if (Cloud.best > (Number(cache.hiscore) || 0)) cache.hiscore = Cloud.best;

        // Push the local-wins merge back up so the cloud catches up.
        if (unsynced) sync();
    },

    get(key, fallback) {
        return key in cache ? cache[key] : fallback;
    },

    set(key, value) {
        // Skip no-op writes (the hangar re-saves ship/HD on every boot): they'd
        // raise the unsynced flag and upload for nothing.
        if (key in cache && JSON.stringify(cache[key]) === JSON.stringify(value)) return;
        cache[key] = value;
        writeLocal(key, value);
        if (SYNCED_KEYS.includes(key)) { markDirty(); sync(); }
    },

    remove(key) {
        delete cache[key];
        removeLocal(key);
        if (SYNCED_KEYS.includes(key)) { markDirty(); sync(); }
    }
};
