/**
 * FX — the "juice" layer. Owns purely-cosmetic systems:
 * parallax starfield, screen shake, particles, shockwave rings, floating text,
 * and sprite-based explosions (fireexplosion.svg).
 *
 * Game logic spawns effects via these helpers; render.js draws them.
 * Nothing here affects gameplay or collisions.
 */

import { CONSTANTS } from './config.js';

export const FX = {
    stars: [],
    shake: { mag: 0, x: 0, y: 0 },
    particles: [],
    shockwaves: [],
    floatTexts: [],
    spriteExplosions: [], // sprite-based fire explosions using fireexplosion.svg

    /** How fast the starfield scrolls forward (game.js sets this per-frame based on node type). */
    scrollRate: 8,

    /** Clear transient effects (called on new game). Stars persist via initStars. */
    reset() {
        this.particles = [];
        this.shockwaves = [];
        this.floatTexts = [];
        this.spriteExplosions = [];
        this.shake = { mag: 0, x: 0, y: 0 };
    },

    initStars(w, h) {
        this.stars = [];
        const count = Math.floor((w * h) / 5500);
        for (let i = 0; i < count; i++) {
            const z = Math.random() * 0.8 + 0.2; // depth 0.2 (far) .. 1.0 (near)
            this.stars.push({
                x: Math.random() * w,
                y: Math.random() * h,
                z, size: z * 2.2,
                phase: Math.random() * Math.PI * 2 // twinkle offset
            });
        }
    },

    addShake(mag) {
        this.shake.mag = Math.min(Math.max(this.shake.mag, mag), 28);
    },

    spawnShockwave(x, y, maxR, color = '#ffffff') {
        this.shockwaves.push({ x, y, r: maxR * 0.15, maxR, life: 1, color });
    },

    spawnFloatText(x, y, text, color = '#fff') {
        this.floatTexts.push({ x, y, text, color, life: 1, vy: -0.8 });
    },

    createParticles(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const life = 25 + Math.random() * 20;
            const spd = 3 + Math.random() * 5;
            const angle = Math.random() * Math.PI * 2;
            this.particles.push({
                x, y,
                xv: Math.cos(angle) * spd,
                yv: Math.sin(angle) * spd,
                life, maxLife: life, size: 1 + Math.random() * 3, color
            });
        }
    },

    /** Add a single, pre-configured particle (used for tracer/charger trails). */
    addParticle(p) { this.particles.push(p); },

    /**
     * Spawn a sprite-based fire explosion that scales up and fades out.
     * size is the peak display size in pixels.
     */
    spawnSpriteExplosion(x, y, size) {
        const rot = Math.random() * Math.PI * 2;
        this.spriteExplosions.push({ x, y, size, rot, scale: 0.15, life: 1.0 });
    },

    /** Per-frame update during active play. */
    update(timeScale, ship) {
        const w = CONSTANTS.GAME_WIDTH, h = CONSTANTS.GAME_HEIGHT;

        // Starfield parallax driven by ship velocity + forward scroll
        const pvx = ship ? ship.xv : 0, pvy = ship ? ship.yv : 0;
        const sr = this.scrollRate;
        this.stars.forEach(s => {
            s.x -= (pvx + sr) * s.z * 0.25; s.y -= pvy * s.z * 0.25;
            if (s.x < 0) s.x += w; else if (s.x > w) s.x -= w;
            if (s.y < 0) s.y += h; else if (s.y > h) s.y -= h;
        });

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.xv * timeScale; p.y += p.yv * timeScale;
            p.xv *= 0.94; p.yv *= 0.94; // drag
            p.life -= timeScale;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // Shockwave rings
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const s = this.shockwaves[i];
            s.r += (s.maxR - s.r) * 0.28; // ease outward
            s.life -= 0.07;
            if (s.life <= 0) this.shockwaves.splice(i, 1);
        }

        // Floating text
        for (let i = this.floatTexts.length - 1; i >= 0; i--) {
            const f = this.floatTexts[i];
            f.y += f.vy; f.vy *= 0.94; f.life -= 0.025;
            if (f.life <= 0) this.floatTexts.splice(i, 1);
        }

        // Sprite explosions: scale up quickly, fade out
        for (let i = this.spriteExplosions.length - 1; i >= 0; i--) {
            const ex = this.spriteExplosions[i];
            ex.scale = Math.min(1.2, ex.scale + 0.14 * timeScale);
            ex.rot += 0.04 * timeScale;
            ex.life -= 0.06 * timeScale;
            if (ex.life <= 0) this.spriteExplosions.splice(i, 1);
        }
    },

    /** Gentle drift for menus / paused states so the backdrop stays alive. */
    updateAmbient() {
        const w = CONSTANTS.GAME_WIDTH, h = CONSTANTS.GAME_HEIGHT;
        this.stars.forEach(s => {
            s.y += s.z * 0.15;
            if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
        });
    }
};
