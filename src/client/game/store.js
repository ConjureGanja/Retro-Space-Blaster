/**
 * Save-data store: synchronous for the game, cloud-backed underneath.
 *
 * WHAT
 *   The rest of the game calls store.get / store.set / store.remove exactly
 *   like before. Behind that API, values live in an in-memory cache that is:
 *     1. filled at boot by hydrate() — localStorage first, then the player's
 *        Reddit cloud save (newer per-key versions win, including deletions),
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
import { SAVE_KEYS, SAVE_VERSION_KEY, isSaveVersion, validateSave, validateScore } from '../../shared/validation.ts';

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

/** Legacy arrays are migrated to stamped records, including missing/deleted values. */
const DIRTY_KEY = '__unsynced';

/**
 * A value and its version share an immutable localStorage record (missing value
 * means deleted). Acknowledgements separately name the exact sent version.
 * WHY: an old tab can only acknowledge its own parcel, never erase a newer
 * tab's sticky note. No read/modify/write of a shared dirty-key array is needed.
 * Version-addressed slots prevent a delayed hydrate from overwriting a newer
 * tombstone in another tab. Older slots are pruned only AFTER writing a newer
 * one; raw keys remain mirrored for compatibility with existing local saves.
 */
const stateKey = key => `__state_${key}`;
const recordKey = (key, version) => `${stateKey(key)}_${version}`;
const ackKey = key => `__acked_${key}`;
const records = Object.create(null);
const acknowledged = Object.create(null);

function dirtyKeys() {
    return SYNCED_KEYS.filter(key => records[key] &&
        (readLocal(ackKey(key)) ?? acknowledged[key]) !== records[key].version);
}

/**
 * Stamps sort by logical time, then a random tie-breaker for simultaneous tabs.
 * This is last-writer-wins per field, NOT a merge of two campaign playthroughs;
 * unseen offline edits/clock skew cannot reveal a player's true intent.
 */
function nextVersion() {
    const latest = Math.max(0, ...Object.values(records).map(r => Number(r.version.slice(0, 16))));
    return `${String(Math.max(Date.now(), latest + 1)).padStart(16, '0')}-${crypto.randomUUID()}`;
}

const SYNCED_KEYS = SAVE_KEYS;
const cache = Object.create(null);

function cleanValue(key, value) {
    const result = validateSave({ [key]: value });
    return result.ok ? result.value[key] : undefined;
}

function install(key, record) {
    records[key] = copy(record);
    if ('value' in record) cache[key] = copy(record.value);
    else delete cache[key];
}

function persist(key) {
    const record = records[key];
    const name = recordKey(key, record.version);
    writeLocal(name, record);
    if (readLocal(name)?.version === record.version) {
        for (const old of localNames()) {
            if (old.startsWith(stateKey(key) + '_') && old < name) removeLocal(old);
        }
    }
    if (key in cache) writeLocal(key, cache[key]);
    else removeLocal(key);
}

/** Re-read sibling tabs before taking a snapshot or creating a newer stamp. */
function refreshLocal() {
    const names = localNames();
    for (const key of SYNCED_KEYS) {
        for (const name of names) {
            if (!name.startsWith(stateKey(key) + '_')) continue;
            const record = readLocal(name);
            if (!record || !isSaveVersion(record.version) || name !== recordKey(key, record.version)) continue;
            const value = 'value' in record ? cleanValue(key, record.value) : undefined;
            if ('value' in record && value === undefined) continue;
            if (!records[key] || record.version > records[key].version) {
                install(key, { version: record.version, ...(value !== undefined ? { value } : {}) });
            }
        }
    }
}

function localNames() {
    try {
        return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
            .filter(name => name?.startsWith(prefix)).map(name => name.slice(prefix.length));
    } catch { return []; }
}

/** Capture acknowledgement versions now, not when the network reply arrives. */
function sync() {
    refreshLocal();
    const sent = Object.fromEntries(dirtyKeys().map(key => [key, records[key].version]));
    const slot = prefix;
    Cloud.queueSave(snapshot(), () => {
        if (prefix !== slot) return;
        for (const [key, version] of Object.entries(sent)) {
            acknowledged[key] = version;
            writeLocal(ackKey(key), version);
        }
    });
}

/**
 * The cache only ever holds PRIVATE copies. Objects are cloned on the way in
 * (set) and on the way out (get), so game code can never mutate cached data
 * behind the store's back. WHY: Campaign mutates its state object in place
 * and then calls store.set('campaign', sameObject) — if the cache held that
 * same object, the "unchanged?" check below would always say yes and the
 * save would silently never happen.
 * Analogy: a library lends you a photocopy, never the archive original — and
 * files a fresh copy when you hand pages back.
 */
const copy = v => (v !== null && typeof v === 'object' ? structuredClone(v) : v);

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
    const versions = {};
    for (const key of SYNCED_KEYS) {
        if (key in cache) out[key] = copy(cache[key]);
        if (records[key]) versions[key] = records[key].version;
    }
    if (Object.keys(versions).length) out[SAVE_VERSION_KEY] = versions;
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

        for (const target of [cache, records, acknowledged]) {
            for (const key of Object.keys(target)) delete target[key];
        }
        for (const key of SYNCED_KEYS) {
            const v = cleanValue(key, readLocal(key));
            if (v !== undefined) cache[key] = copy(v);
        }
        refreshLocal();
        const legacy = readLocal(DIRTY_KEY);
        if (Array.isArray(legacy)) {
            for (const key of SYNCED_KEYS) {
                if (!legacy.includes(key) || records[key]) continue;
                install(key, { version: nextVersion(), ...(key in cache ? { value: cache[key] } : {}) });
                persist(key);
            }
            // Only retire the old marker once the migration survived storage.
            if (legacy.every(key => !SYNCED_KEYS.includes(key) ||
                readLocal(recordKey(key, records[key].version)))) {
                removeLocal(DIRTY_KEY);
            }
        }

        let mergedBest = 0;
        if (remote && typeof remote === 'object' && !Array.isArray(remote)) {
            const metadata = validateSave({ [SAVE_VERSION_KEY]: remote[SAVE_VERSION_KEY] ?? {} });
            const versions = metadata.ok ? metadata.value[SAVE_VERSION_KEY] : {};
            for (const key of SYNCED_KEYS) {
                const hasValue = Object.hasOwn(remote, key);
                const value = hasValue ? cleanValue(key, remote[key]) : undefined;
                if (hasValue && value === undefined) continue;
                // Scores merge by maximum when BOTH sides have values; an
                // explicit tombstone still follows normal version ordering.
                if (key === 'hiscore' && key in cache && hasValue) {
                    mergedBest = Math.max(cache[key], value);
                }
                const version = versions[key];
                // A tombstone is just as authoritative as a value. Versioned
                // local edits also beat unversioned cloud saves from old clients.
                if (records[key] && (!version || records[key].version >= version)) continue;
                if (version) {
                    install(key, { version, ...(hasValue ? { value } : {}) });
                    acknowledged[key] = version;
                    writeLocal(ackKey(key), version);
                    persist(key);
                } else if (hasValue) {
                    cache[key] = copy(value);
                    writeLocal(key, cache[key]);
                }
            }
        }
        // The leaderboard is authoritative for the account's best score.
        const best = Math.max(mergedBest, validateScore(Cloud.best).ok ? Cloud.best : 0);
        if (best > (cache.hiscore || 0)) {
            this.set('hiscore', best);
        }

        // Push the local-wins merge back up so the cloud catches up.
        if (dirtyKeys().length) sync();
    },

    get(key, fallback) {
        return key in cache ? copy(cache[key]) : fallback;
    },

    set(key, value) {
        if (SYNCED_KEYS.includes(key)) {
            value = cleanValue(key, value);
            if (value === undefined) return;
            refreshLocal();
        }
        // Skip no-op writes (the hangar re-saves ship/HD on every boot): they'd
        // raise the unsynced flag and upload for nothing.
        if (key in cache && JSON.stringify(cache[key]) === JSON.stringify(value)) return;
        cache[key] = copy(value);
        writeLocal(key, value);
        if (SYNCED_KEYS.includes(key)) {
            install(key, { version: nextVersion(), value });
            persist(key);
            sync();
        }
    },

    remove(key) {
        if (SYNCED_KEYS.includes(key)) refreshLocal();
        delete cache[key];
        removeLocal(key);
        if (SYNCED_KEYS.includes(key)) {
            install(key, { version: nextVersion() });
            persist(key);
            sync();
        }
    }
};
