/**
 * Tiny localStorage wrapper with JSON encoding and a shared key prefix.
 * Fails silently (returns fallbacks) in private mode / blocked storage.
 */

export const store = {
    get(key, fallback) {
        try { const v = localStorage.getItem('rsb_' + key); return v === null ? fallback : JSON.parse(v); }
        catch { return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem('rsb_' + key, JSON.stringify(value)); } catch { /* private mode */ }
    },
    remove(key) {
        try { localStorage.removeItem('rsb_' + key); } catch { /* private mode */ }
    }
};
