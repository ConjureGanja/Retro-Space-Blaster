/**
 * Sprite loader + cache.
 *
 * To add a new sprite: drop the master file (SVG/PNG) in art/sprites/, add one
 * line to SPRITE_FILES below pointing at `/assets/sprites/<name>.webp`, then
 * run `npm run art` (dev/build scripts run it for you). Draw it with
 * `drawSprite(ctx, 'key', x, y, size, rot)` or grab it via `Sprites.get('key')`.
 *
 * WHY WEBP: the masters are huge (one HD boss SVG is 19 MB of embedded PNG),
 * but this loader downsamples everything to ≤640px anyway. scripts/optimize-art.mjs
 * pre-renders each master to a ~50 KB WebP at 1280px so Reddit players aren't
 * downloading pixels we immediately throw away.
 *
 * Images are loaded as <img> elements so they can be drawn straight to canvas.
 * All art is auto-trimmed at load time (rendered to an offscreen canvas and
 * cropped to its opaque bounds) since most files center small art inside a
 * large 1440x810 frame. drawSprite() preserves aspect ratio, scaling the
 * sprite so its longest side equals `size`.
 *
 * HD variants: a key ending in "HD" is the high-detail version of the same
 * base key. drawSprite() resolves base keys through Sprites.resolveKey(), so
 * flipping Runtime.useHD (the hangar's HD SPRITES toggle) switches the whole
 * game's art live — enemies, bosses, powerups, effects — with zero per-callsite
 * changes.
 *
 * LAZY HD: only the standard set loads at boot. The HD set is fetched the
 * first time a player turns HD on (Sprites.loadHD()). Until each HD image
 * finishes, resolveKey() quietly keeps drawing the standard version.
 * Analogy: a restaurant preps the regular menu before doors open, and only
 * fires up the tasting-menu station when someone actually orders it.
 */

import { Runtime } from './config.js';

const SPRITE_FILES = {
    powerupWeapon:   '/assets/sprites/powerup-weapon.webp',
    powerupWeaponHD: '/assets/sprites/powerup-weaponHD.webp',
    powerupShield:   '/assets/sprites/powerup-shield.webp',
    powerupShieldHD: '/assets/sprites/powerup-shieldHD.webp',
    powerupHealth:   '/assets/sprites/powerup-health.webp',
    powerupHealthHD: '/assets/sprites/powerup-healthHD.webp',
    powerupSpeed:    '/assets/sprites/powerup-speed.webp',
    powerupSpeedHD:  '/assets/sprites/powerup-speedHD.webp',
    shieldEffect:    '/assets/sprites/shield-effect.webp',
    shieldEffectHD:  '/assets/sprites/shield-effectHD.webp',
    bossDreadnought:   '/assets/sprites/boss-dreadnought.webp',
    bossDreadnoughtHD: '/assets/sprites/boss-dreadnoughtHD.webp',
    bossMothership:    '/assets/sprites/boss-mothership.webp',
    bossMothershipHD:  '/assets/sprites/boss-mothershipHD.webp',
    bossSuperMothership:   '/assets/sprites/boss-SuperMegaMothership.webp',
    bossSuperMothershipHD: '/assets/sprites/boss-SuperMegaMothershipHD.webp',
    superShield:     '/assets/sprites/superbossshieldwopening-spinningshield.webp',
    explosionRing:   '/assets/sprites/explosion-ring.webp',
    explosionRingHD: '/assets/sprites/explosion-ringHD.webp',
    fireExplosion:   '/assets/sprites/fireexplosion.webp',
    bulletSaucer:    '/assets/sprites/enemy-saucer-bulletHD.webp',
    enemySaucer:     '/assets/sprites/enemy-saucer.webp',
    enemySaucerHD:   '/assets/sprites/enemy-saucerHD.webp',
    enemyCharger:    '/assets/sprites/enemy-charger.webp',
    enemyChargerHD:  '/assets/sprites/enemy-chargerHD.webp',
    enemyTank:       '/assets/sprites/enemy-tank.webp',
    enemyTankHD:     '/assets/sprites/enemy-tankHD.webp',
    enemySwarmer:    '/assets/sprites/enemy-swarmer.webp',
    enemySwarmerHD:  '/assets/sprites/enemy-swarmerHD.webp',
    enemySniper:     '/assets/sprites/enemy-sniper.webp',
    enemySniperHD:   '/assets/sprites/enemy-sniperHD.webp',
    playership1:     '/assets/sprites/playership1.webp',
    playership1HD:   '/assets/sprites/playership1HD.webp',
    playership2:     '/assets/sprites/playership2.webp',
    playership2HD:   '/assets/sprites/playership2HD.webp',
    playership3:     '/assets/sprites/playership3.webp',
    playership3HD:   '/assets/sprites/playership3HD.webp',
    playership4:     '/assets/sprites/playership4.webp',
    playership4HD:   '/assets/sprites/playership4HD.webp',
    playership5:     '/assets/sprites/playership5.webp',
    playership5HD:   '/assets/sprites/playership5HD.webp',

    // Roguelite upgrade card icons (keys match upgrade `icon` in upgrades.js)
    upgDouble:       '/assets/sprites/statboost-twin cannons.webp',
    upgSpread:       '/assets/sprites/statboost-spread module.webp',
    upgTail:         '/assets/sprites/statboost-Tail Gunner.webp',
    upgRate:         '/assets/sprites/statboost-overclock.webp',
    upgSpeed:        '/assets/sprites/statboost-Thruster Boost.webp',
    upgRange:        '/assets/sprites/statboost-longbarrel.webp',
    upgFlak:         '/assets/sprites/statboost-flakcannon.webp',
    upgPierce:       '/assets/sprites/wepmod-railgunrounds.webp',
    upgTracer:       '/assets/sprites/weomod-tracerrounds.webp',
    upgTitan:        '/assets/sprites/wepmod-titancaliber.webp',
    upgSeeker:       '/assets/sprites/wepmod-seekermissiles.webp',
    upgExplosive:    '/assets/sprites/wepmod-highexplosive.webp',
    upgPrism:        '/assets/sprites/wepmod-prismaticcore.webp',
    upgBouncy:       '/assets/sprites/wepmod-pinballoptics.webp',
    upgWobbly:       '/assets/sprites/wepmod-phasewobble.webp',
    upgOrbitals:     '/assets/sprites/wepmod-plasmadrones.webp',
    upgLife:         '/assets/sprites/extralife-hullrepair.webp'
};

// These upgrade icons ship as full trading-card art (icon square on top,
// baked-in title text below) — keep only the top square so the text, which is
// illegible at icon size, is cut away. The factor trims the square's height
// for art whose icon area is slightly shorter than its width.
const CARD_CROP = {
    upgDouble: 1, upgSpread: 0.92, upgTail: 1,
    upgRate: 1, upgSpeed: 0.9, upgRange: 1
};

function cropTopSquare(cvs, heightFactor = 1) {
    const side = Math.min(cvs.width, cvs.height);
    const h = Math.max(1, Math.round(side * heightFactor));
    const out = document.createElement('canvas');
    out.width = side; out.height = h;
    out.getContext('2d').drawImage(cvs, 0, 0, side, h, 0, 0, side, h);
    return out;
}

/**
 * Render an image to an offscreen canvas and crop away transparent margins.
 * Returns a canvas holding just the opaque pixels (or null if fully transparent
 * or unreadable, e.g. a tainted canvas when not served over http).
 */
function trimImage(img) {
    try {
        const MAX_W = 640; // Plenty of resolution for in-game sizes
        const scale = Math.min(1, MAX_W / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const cvs = document.createElement('canvas');
        cvs.width = w; cvs.height = h;
        const c = cvs.getContext('2d');
        c.drawImage(img, 0, 0, w, h);
        const data = c.getImageData(0, 0, w, h).data;

        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (data[(y * w + x) * 4 + 3] > 8) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return null;

        const tw = maxX - minX + 1, th = maxY - minY + 1;
        const out = document.createElement('canvas');
        out.width = tw; out.height = th;
        out.getContext('2d').drawImage(cvs, minX, minY, tw, th, 0, 0, tw, th);
        return out;
    } catch (e) {
        console.warn('[sprites] trim failed, using raw image', e);
        return null;
    }
}

export const Sprites = {
    images: {},
    ready: false,

    /** Keys whose name ends in "HD" belong to the lazily-loaded HD set. */
    _isHDKey(key) {
        return key.endsWith('HD');
    },

    /** Load one sprite: decode → trim → (optional) card crop → cache. */
    _loadOne(key, src) {
        return new Promise(resolve => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => {
                let trimmed = trimImage(img);
                if (trimmed && key in CARD_CROP) trimmed = cropTopSquare(trimmed, CARD_CROP[key]);
                if (trimmed) this.images[key] = trimmed;
                resolve();
            };
            img.onerror = () => { console.warn(`[sprites] failed to load ${src}`); resolve(); };
            img.src = src;
            this.images[key] = img;
        });
    },

    /**
     * Preload the standard (non-HD) sprite set. Resolves once all have loaded
     * (or errored — a missing sprite should never block the game from booting).
     */
    loadAll() {
        const entries = Object.entries(SPRITE_FILES).filter(([key]) => !this._isHDKey(key));
        return Promise.all(entries.map(([key, src]) => this._loadOne(key, src)))
            .then(() => { this.ready = true; });
    },

    _hdPromise: null,

    /**
     * Load the HD set on demand. Safe to call repeatedly — the first call
     * starts the downloads, later calls just get the same promise back.
     */
    loadHD() {
        if (!this._hdPromise) {
            const entries = Object.entries(SPRITE_FILES).filter(([key]) => this._isHDKey(key));
            this._hdPromise = Promise.all(entries.map(([key, src]) => this._loadOne(key, src)));
        }
        return this._hdPromise;
    },

    get(key) {
        return this.images[key];
    },

    /**
     * Map a base key to its HD variant when the HD toggle is on and the HD
     * art actually loaded. Keys that already end in HD (player ships pass
     * explicit names) fall through untouched.
     */
    resolveKey(key) {
        // Explicit HD key (e.g. the player's 'playership1HD') whose lazy
        // download hasn't finished yet → draw the standard art meanwhile, so
        // the ship never blinks out of existence while HD streams in.
        if (key.endsWith('HD') && !this.isReady(key)) {
            const base = key.slice(0, -2);
            return this.isReady(base) ? base : key;
        }
        if (Runtime.useHD && !key.endsWith('HD')) {
            const hd = key + 'HD';
            if (this.isReady(hd)) return hd;
        }
        return key;
    },

    _gapCache: {},

    /**
     * Locate the opening in a ring-shaped sprite (the super boss's spinning
     * shield) by sampling the trimmed art's alpha channel around the ring.
     * Returns { center, half }: the gap's center angle in art coordinates and
     * its angular half-width, so gameplay and visuals always agree no matter
     * where the artist drew the opening.
     */
    ringGap(key) {
        if (this._gapCache[key]) return this._gapCache[key];
        const fallback = { center: 0, half: 0.55 };
        if (!this.isReady(key)) return fallback; // not cached — retry once loaded
        let cvs = this.images[key];
        if (!(cvs instanceof HTMLCanvasElement)) return fallback;
        try {
            const w = cvs.width, h = cvs.height;
            const data = cvs.getContext('2d').getImageData(0, 0, w, h).data;
            const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
            const N = 180;
            const open = [];
            for (let i = 0; i < N; i++) {
                const a = (i / N) * Math.PI * 2;
                let opaque = false;
                for (const f of [0.5, 0.65, 0.8, 0.93]) {
                    const x = Math.round(cx + Math.cos(a) * R * f);
                    const y = Math.round(cy + Math.sin(a) * R * f);
                    if (x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 24) { opaque = true; break; }
                }
                open.push(!opaque);
            }
            // Longest contiguous transparent run (scan doubled for wraparound)
            let best = 0, bestStart = 0, run = 0, runStart = 0;
            for (let i = 0; i < N * 2; i++) {
                if (open[i % N]) {
                    if (run === 0) runStart = i;
                    run++;
                    if (run > best && run <= N) { best = run; bestStart = runStart; }
                } else run = 0;
            }
            if (best === 0 || best >= N) return (this._gapCache[key] = fallback);
            const step = (Math.PI * 2) / N;
            const result = {
                center: ((bestStart + best / 2) % N) * step,
                half: Math.max(0.15, (best * step) / 2)
            };
            return (this._gapCache[key] = result);
        } catch (e) {
            console.warn('[sprites] ringGap analysis failed', e);
            return (this._gapCache[key] = fallback);
        }
    },

    /**
     * A URL usable as an <img> src: the trimmed canvas as a data URL when
     * available, otherwise the original file path.
     */
    url(key) {
        const img = this.images[key];
        if (img instanceof HTMLCanvasElement) return img.toDataURL();
        return SPRITE_FILES[key];
    },

    /** True only when the image exists and has finished decoding. */
    isReady(key) {
        const img = this.images[key];
        if (!img) return false;
        if (img instanceof HTMLCanvasElement) return true;
        return !!(img.complete && img.naturalWidth > 0);
    }
};

/**
 * Draw a sprite centered at (x, y) with its longest side scaled to `size` px,
 * optionally rotated. Aspect ratio is preserved.
 * Silently no-ops if the sprite isn't loaded yet, so callers don't need guards.
 */
export function drawSprite(ctx, key, x, y, size, rotation = 0, alpha = 1) {
    key = Sprites.resolveKey(key);
    if (!Sprites.isReady(key)) return;
    const img = Sprites.get(key);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const s = size / Math.max(iw, ih);
    const w = iw * s, h = ih * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
}
