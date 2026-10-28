/**
 * SVG sprite loader + cache.
 *
 * To add a new sprite: drop the .svg in assets/sprites/ and add one line to
 * SPRITE_FILES below. Then draw it with `drawSprite(ctx, 'key', x, y, size, rot)`
 * or grab the raw Image via `Sprites.get('key')`.
 *
 * SVGs are loaded as <img> elements so they can be drawn straight to canvas.
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
 */

import { Runtime } from './config.js';

const SPRITE_FILES = {
    powerupWeapon:   'assets/sprites/powerup-weapon.svg',
    powerupWeaponHD: 'assets/sprites/powerup-weaponHD.svg',
    powerupShield:   'assets/sprites/powerup-shield.svg',
    powerupShieldHD: 'assets/sprites/powerup-shieldHD.svg',
    powerupHealth:   'assets/sprites/powerup-health.svg',
    powerupHealthHD: 'assets/sprites/powerup-healthHD.svg',
    powerupSpeed:    'assets/sprites/powerup-speed.svg',
    powerupSpeedHD:  'assets/sprites/powerup-speedHD.svg',
    shieldEffect:    'assets/sprites/shield-effect.svg',
    shieldEffectHD:  'assets/sprites/shield-effectHD.svg',
    bossDreadnought:   'assets/sprites/boss-dreadnought.svg',
    bossDreadnoughtHD: 'assets/sprites/boss-dreadnoughtHD.svg',
    bossMothership:    'assets/sprites/boss-mothership.svg',
    bossMothershipHD:  'assets/sprites/boss-mothershipHD.svg',
    bossSuperMothership:   'assets/sprites/boss-SuperMegaMothership.svg',
    bossSuperMothershipHD: 'assets/sprites/boss-SuperMegaMothershipHD.svg',
    superShield:     'assets/sprites/superbossshieldwopening-spinningshield.svg',
    explosionRing:   'assets/sprites/explosion-ring.svg',
    explosionRingHD: 'assets/sprites/explosion-ringHD.svg',
    fireExplosion:   'assets/sprites/fireexplosion.svg',
    bulletSaucer:    'assets/sprites/enemy-saucer-bulletHD.svg',
    enemySaucer:     'assets/sprites/enemy-saucer.svg',
    enemySaucerHD:   'assets/sprites/enemy-saucerHD.svg',
    enemyCharger:    'assets/sprites/enemy-charger.svg',
    enemyChargerHD:  'assets/sprites/enemy-chargerHD.svg',
    enemyTank:       'assets/sprites/enemy-tank.svg',
    enemyTankHD:     'assets/sprites/enemy-tankHD.svg',
    enemySwarmer:    'assets/sprites/enemy-swarmer.svg',
    enemySwarmerHD:  'assets/sprites/enemy-swarmerHD.svg',
    enemySniper:     'assets/sprites/enemy-sniper.svg',
    enemySniperHD:   'assets/sprites/enemy-sniperHD.svg',
    playership1:     'assets/sprites/playership1.svg',
    playership1HD:   'assets/sprites/playership1HD.svg',
    playership2:     'assets/sprites/playership2.svg',
    playership2HD:   'assets/sprites/playership2HD.svg',
    playership3:     'assets/sprites/playership3.svg',
    playership3HD:   'assets/sprites/playership3HD.svg',
    playership4:     'assets/sprites/playership4.svg',
    playership4HD:   'assets/sprites/playership4HD.svg',
    playership5:     'assets/sprites/playership5.svg',
    playership5HD:   'assets/sprites/playership5HD.svg',

    // Roguelite upgrade card icons (keys match upgrade `icon` in upgrades.js)
    upgDouble:       'assets/sprites/statboost-twin cannons.svg',
    upgSpread:       'assets/sprites/statboost-spread module.svg',
    upgTail:         'assets/sprites/statboost-Tail Gunner.svg',
    upgRate:         'assets/sprites/statboost-overclock.svg',
    upgSpeed:        'assets/sprites/statboost-Thruster Boost.svg',
    upgRange:        'assets/sprites/statboost-longbarrel.svg',
    upgFlak:         'assets/sprites/statboost-flakcannon.svg',
    upgPierce:       'assets/sprites/wepmod-railgunrounds.svg',
    upgTracer:       'assets/sprites/weomod-tracerrounds.svg',
    upgTitan:        'assets/sprites/wepmod-titancaliber.svg',
    upgSeeker:       'assets/sprites/wepmod-seekermissiles.svg',
    upgExplosive:    'assets/sprites/wepmod-highexplosive.svg',
    upgPrism:        'assets/sprites/wepmod-prismaticcore.svg',
    upgBouncy:       'assets/sprites/wepmod-pinballoptics.svg',
    upgWobbly:       'assets/sprites/wepmod-phasewobble.svg',
    upgOrbitals:     'assets/sprites/wepmod-plasmadrones.svg',
    upgLife:         'assets/sprites/extralife-hullrepair.svg'
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

    /** Preload every registered sprite. Resolves once all have loaded (or errored). */
    loadAll() {
        const entries = Object.entries(SPRITE_FILES);
        return Promise.all(entries.map(([key, src]) => new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                let trimmed = trimImage(img);
                if (trimmed && key in CARD_CROP) trimmed = cropTopSquare(trimmed, CARD_CROP[key]);
                if (trimmed) this.images[key] = trimmed;
                resolve();
            };
            img.onerror = () => { console.warn(`[sprites] failed to load ${src}`); resolve(); };
            img.src = src;
            this.images[key] = img;
        }))).then(() => { this.ready = true; });
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
