/**
 * All canvas drawing. Pure view layer — reads game/FX state, never mutates it
 * (except decaying the screen-shake offset, which is a render-only concern).
 */

import { CONSTANTS, STATE, Runtime } from './config.js';
import { Game } from './game.js';
import { input } from './input.js';
import { FX } from './fx.js';
import { drawSprite, Sprites } from './sprites.js';

let ctx;

// Subtle background tint per zone — gives each area a distinct feel.
const ZONE_TINTS = {
    1: null,                            // Zone 1: The Porch Lights — clean space
    2: 'rgba(160, 90, 10, 0.045)',      // Zone 2: The Junk Belt — amber rust
    3: 'rgba(180, 0, 60, 0.065)'        // Zone 3: Vrax Space — red menace
};

export function initRenderer(canvas) {
    ctx = canvas.getContext('2d');
}

export function draw() {
    const W = CONSTANTS.GAME_WIDTH, H = CONSTANTS.GAME_HEIGHT;
    ctx.fillStyle = '#040408';
    ctx.fillRect(0, 0, W, H);

    // Zone atmosphere tint
    if (Game.currentNode) {
        const tint = ZONE_TINTS[Game.currentNode.zone];
        if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H); }
    }

    // Starfield (drawn without shake so the backdrop stays steady)
    drawStars();

    // Screen shake: decay + jitter, applied to the whole scene below
    const shake = FX.shake;
    shake.mag *= 0.84;
    if (shake.mag < 0.2) shake.mag = 0;
    shake.x = (Math.random() - 0.5) * shake.mag * 2;
    shake.y = (Math.random() - 0.5) * shake.mag * 2;

    // Chrono Field tint
    if (Game.timeScale < 1.0) {
        ctx.fillStyle = 'rgba(0, 50, 110, 0.28)';
        ctx.fillRect(0, 0, W, H);
    }

    ctx.save();
    ctx.translate(shake.x, shake.y);

    drawXPOrbs();
    drawPowerups();
    drawSpriteExplosions();
    drawParticles();
    drawShockwaves();
    drawNovas();
    drawOrbitals();
    drawBeam();
    drawShip();
    drawAsteroids();
    drawEnemies();
    drawLasers();
    drawEnemyLasers();
    drawExplosions();
    drawFloatTexts();
    drawReticle();

    ctx.restore();
}

function drawStars() {
    FX.stars.forEach(s => {
        const twinkle = 0.5 + 0.5 * Math.sin(Game.tick * 0.05 + s.phase);
        const b = Math.floor((110 + s.z * 145) * (0.5 + 0.5 * twinkle));
        ctx.fillStyle = `rgb(${b},${b},${Math.min(255, b + 40)})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
    });
}

function drawXPOrbs() {
    const pulse = 0.7 + 0.3 * Math.sin(Game.tick * 0.22);
    Game.entities.xpOrbs.forEach(xp => {
        ctx.fillStyle = '#ffcc00'; ctx.shadowBlur = 14 * pulse; ctx.shadowColor = '#ffcc00';
        ctx.beginPath(); ctx.arc(xp.x, xp.y, 3.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
}

const POWERUP_SPRITES = {
    weapon: 'powerupWeapon', shield: 'powerupShield',
    speed: 'powerupSpeed', health: 'powerupHealth'
};

function drawPowerups() {
    Game.entities.powerups.forEach(p => {
        const pulse = 0.85 + 0.15 * Math.sin(p.phase * 2);
        const fade = p.life < 120 ? (Math.floor(p.life / 8) % 2 === 0 ? 0.3 : 1) : 1;
        ctx.save();
        ctx.shadowBlur = 16; ctx.shadowColor = '#ffffff';
        drawSprite(ctx, POWERUP_SPRITES[p.type], p.x, p.y, p.r * 2.4 * pulse, 0, fade);
        ctx.restore();
    });
}

/** Sprite-based fire explosions — scale up and fade. */
function drawSpriteExplosions() {
    FX.spriteExplosions.forEach(ex => {
        const alpha = Math.max(0, ex.life);
        const size = ex.size * ex.scale;
        ctx.save();
        ctx.shadowBlur = 20 * alpha; ctx.shadowColor = '#ff8800';
        drawSprite(ctx, 'fireExplosion', ex.x, ex.y, size, ex.rot, alpha);
        ctx.restore();
    });
}

function drawParticles() {
    FX.particles.forEach(p => {
        const t = p.life / (p.maxLife || p.life || 1);
        ctx.globalAlpha = Math.max(0, Math.min(1, t));
        ctx.fillStyle = p.color;
        const s = (p.size || 2) * (0.4 + t * 0.6);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    });
    ctx.globalAlpha = 1;
}

function drawShockwaves() {
    FX.shockwaves.forEach(s => {
        ctx.globalAlpha = Math.max(0, s.life) * 0.7;
        ctx.strokeStyle = s.color; ctx.lineWidth = 1.5 + 3.5 * s.life;
        ctx.shadowBlur = 18; ctx.shadowColor = s.color;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

/** NOVA BLAST expanding ring — uses the explosion-ring SVG plus a stroke. */
function drawNovas() {
    Game.entities.novas.forEach(n => {
        const t = n.life / n.maxLife;
        drawSprite(ctx, 'explosionRing', n.x, n.y, n.r * 2, Game.tick * 0.1, t * 0.9);
        ctx.globalAlpha = t * 0.6;
        ctx.strokeStyle = n.color; ctx.lineWidth = 7 * t + 1;
        ctx.shadowBlur = 30; ctx.shadowColor = n.color;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    });
}

function drawOrbitals() {
    Game.entities.orbitals.forEach(o => {
        ctx.beginPath(); ctx.arc(o.x, o.y, o.size, 0, Math.PI * 2);
        ctx.fillStyle = '#ccff00'; ctx.shadowBlur = o.size * 2; ctx.shadowColor = '#ccff00';
        ctx.fill(); ctx.shadowBlur = 0;
    });
}

/** HYPER BEAM — a pulsing lance from the ship's nose to the right edge. */
function drawBeam() {
    const ship = Game.entities.ship;
    if (!ship || ship.dead || ship.explodeTime || ship.beamTime <= 0) return;
    const def = ship.shipDef.ability;
    const x0 = ship.x + 18, y0 = ship.y;
    const w = CONSTANTS.GAME_WIDTH - x0;
    const pulse = 0.7 + 0.3 * Math.sin(Game.tick * 0.6);
    const coreH = 10 * pulse + (ship.beamTime < 20 ? -ship.beamTime * 0.2 + 4 : 0);

    const grad = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.15, def.color);
    grad.addColorStop(1, 'rgba(255,60,40,0.35)');

    ctx.save();
    ctx.shadowBlur = 35; ctx.shadowColor = def.color;
    ctx.fillStyle = def.color; ctx.globalAlpha = 0.22;
    ctx.fillRect(x0, y0 - 30, w, 60);
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(x0, y0 - coreH / 2, w, coreH);
    for (let i = 0; i < 4; i++) {
        const sx = x0 + Math.random() * w;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx, y0 - 14 + Math.random() * 28, 3, 3);
    }
    ctx.restore();
}

function drawShip() {
    const ship = Game.entities.ship;
    if (!ship || ship.dead || ship.explodeTime) return;

    // Shield bubble: spawn grace flickers, AEGIS/powerup shield glows steady
    if (ship.buffs.shield > 0) {
        const alpha = ship.buffs.shield < 60 ? (Math.floor(ship.buffs.shield / 6) % 2 === 0 ? 0.35 : 0.9) : 0.85;
        drawSprite(ctx, 'shieldEffect', ship.x, ship.y, ship.r * 5.2, Game.tick * 0.03, alpha);
    } else if (ship.spawnGrace > 0) {
        const alpha = 0.4 + 0.6 * Math.sin(Game.tick * 0.5);
        drawSprite(ctx, 'shieldEffect', ship.x, ship.y, ship.r * 4.5, Game.tick * 0.025, alpha);
    }

    // Visual banking: roll into climbs and dives (art faces up; +PI/2 faces right)
    const bank = Math.max(-CONSTANTS.BANK_MAX, Math.min(CONSTANTS.BANK_MAX, ship.yv * CONSTANTS.BANK_TILT));
    const rot = Math.PI / 2 + bank;

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(rot);

    // Engine flame (reacts to thrust; local +y = behind the right-facing ship)
    if (ship.thrust > 0.04) {
        const f = ship.thrust;
        const flick = 0.6 + Math.random() * 0.4;
        const len = 16 + f * 30 * flick;
        const w = 7 + f * 5;
        const grad = ctx.createLinearGradient(0, 12, 0, 12 + len);
        grad.addColorStop(0, 'rgba(255,255,200,0.95)');
        grad.addColorStop(0.3, 'rgba(120,255,120,0.75)');
        grad.addColorStop(0.7, 'rgba(0,200,100,0.4)');
        grad.addColorStop(1, 'rgba(0,180,80,0)');
        ctx.shadowBlur = 12; ctx.shadowColor = '#88ff88';
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-w * 0.6, 12); ctx.lineTo(0, 12 + len); ctx.lineTo(w * 0.6, 12);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
    }
    ctx.restore();

    drawSprite(ctx, Runtime.shipSpriteName || 'playership1', ship.x, ship.y, ship.r * 3.8, rot);

    // Muzzle flash at the nose
    if (ship.muzzleFlash > 0) {
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.globalAlpha = ship.muzzleFlash / 4;
        ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 20; ctx.shadowColor = '#aaffaa';
        ctx.beginPath(); ctx.arc(24, 0, 5 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

function drawAsteroids() {
    Game.entities.asteroids.forEach(a => {
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.a);
        ctx.fillStyle = a.hitFlash > 0 ? '#ffffff' : '#1e1a1a';
        ctx.fill(a.path);
        ctx.strokeStyle = a.hitFlash > 0 ? '#ffffff' : '#bbb'; ctx.lineWidth = 2;
        if (a.hitFlash > 0) { ctx.shadowBlur = 18; ctx.shadowColor = '#fff'; }
        ctx.stroke(a.path);
        ctx.shadowBlur = 0;
        ctx.restore();
    });
}

function drawEnemies() {
    Game.entities.enemies.forEach(e => {
        if (e.isBoss) {
            // Boss art stays horizontal (wide + imposing), with a slow menacing sway
            const wobble = Math.sin(Game.tick * 0.05) * 0.06;
            ctx.save();
            if (e.hitFlash > 0) { ctx.shadowBlur = 35; ctx.shadowColor = '#ffffff'; }
            drawSprite(ctx, e.sprite, e.x, e.y, e.r * 3.2, wobble, e.hitFlash > 0 ? 0.55 : 1.0);
            ctx.restore();

            // SUPER MOTHERSHIP spinning shield — rotated so the art's opening
            // sits exactly at the gameplay gap angle (see Sprites.ringGap).
            if (e.shield && e.shield.active) {
                const gap = Sprites.ringGap('superShield');
                const pulse = 0.8 + Math.sin(Game.tick * 0.12) * 0.15;
                ctx.save();
                ctx.shadowBlur = 25; ctx.shadowColor = '#88ddff';
                drawSprite(ctx, 'superShield', e.x, e.y, e.shield.r * 2.15, e.shield.angle - gap.center, pulse);
                ctx.restore();
            }
            return;
        }

        if (Sprites.isReady(e.sprite)) {
            ctx.save();
            if (e.hitFlash > 0) {
                ctx.shadowBlur = 24; ctx.shadowColor = '#ffffff';
                ctx.globalAlpha = 0.65;
            }
            drawSprite(ctx, e.sprite, e.x, e.y, e.r * 2.8, e.angle + Math.PI / 2, e.hitFlash > 0 ? 0.65 : 1);
            ctx.restore();
        } else {
            // Vector fallback
            ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle - Math.PI / 2);
            const col = e.hitFlash > 0 ? '#ffffff' : (e.color || '#ff4444');
            ctx.shadowBlur = 10; ctx.shadowColor = col;
            ctx.fillStyle = 'rgba(40,0,0,0.5)'; ctx.fill(e.path);
            ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(e.path);
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        // Health bar for multi-hit enemies (always shown, not just when damaged)
        if (e.maxHp > 1) {
            const hpFrac = Math.max(0, e.hp / e.maxHp);
            ctx.save(); ctx.translate(e.x, e.y);
            const bw = 22, bh = 3;
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-bw/2 - 1, -e.r - 12, bw + 2, bh + 2);
            ctx.fillStyle = '#440000'; ctx.fillRect(-bw/2, -e.r - 11, bw, bh);
            ctx.fillStyle = hpFrac > 0.5 ? '#00ff44' : hpFrac > 0.25 ? '#ffaa00' : '#ff2222';
            ctx.fillRect(-bw/2, -e.r - 11, bw * hpFrac, bh);
            ctx.restore();
        }
    });
}

/** Player laser bolts — elongated energy rounds with a glow core. */
function drawLasers() {
    Game.entities.lasers.forEach(l => {
        const angle = Math.atan2(l.yv, l.xv);
        const speed = Math.hypot(l.xv, l.yv);
        const boltLen = 18 + speed * 1.0 + (Game.upgrades.bulletSize * 5);
        const boltW = 2.5 + (Game.upgrades.bulletSize * 0.8);

        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(angle);
        ctx.shadowBlur = 14; ctx.shadowColor = l.color;

        // Glow halo
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = l.color;
        ctx.fillRect(-boltLen / 2, -boltW * 2, boltLen, boltW * 4);

        // Core bolt
        const grad = ctx.createLinearGradient(-boltLen / 2, 0, boltLen / 2, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.25, l.color);
        grad.addColorStop(0.6, '#ffffff');
        grad.addColorStop(0.8, l.color);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.fillRect(-boltLen / 2, -boltW / 2, boltLen, boltW);

        ctx.restore();
    });
    ctx.shadowBlur = 0;
}

/** Enemy laser bolts — sprite art when the round has one, gradient bolts otherwise. */
function drawEnemyLasers() {
    Game.entities.enemyLasers.forEach(l => {
        const col = l.color || '#ff9900';
        const angle = Math.atan2(l.yv, l.xv);

        if (l.sprite && Sprites.isReady(l.sprite)) {
            ctx.save();
            ctx.shadowBlur = 14; ctx.shadowColor = col;
            drawSprite(ctx, l.sprite, l.x, l.y, 10 + l.r * 4, angle);
            ctx.restore();
            return;
        }

        const speed = Math.hypot(l.xv, l.yv);
        const boltLen = 14 + speed * 0.8;
        const boltH = l.r * 0.9;

        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(angle);
        ctx.shadowBlur = 12; ctx.shadowColor = col;

        // Glow
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = col;
        ctx.fillRect(-boltLen / 2, -boltH * 1.8, boltLen, boltH * 3.6);

        // Core
        const grad = ctx.createLinearGradient(-boltLen / 2, 0, boltLen / 2, 0);
        grad.addColorStop(0, 'rgba(255,120,0,0)');
        grad.addColorStop(0.3, col);
        grad.addColorStop(0.6, '#ffffff');
        grad.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.fillRect(-boltLen / 2, -boltH / 2, boltLen, boltH);

        ctx.restore();
    });
    ctx.shadowBlur = 0;
}

/** AoE explosion rings from HIGH EXPLOSIVE upgrade. */
function drawExplosions() {
    Game.entities.explosions.forEach(ex => {
        ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 170, 0, ${ex.life / 15 * 0.6})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 220, 80, ${ex.life / 15})`;
        ctx.lineWidth = 2; ctx.stroke();
    });
}

function drawFloatTexts() {
    ctx.textAlign = 'center';
    FX.floatTexts.forEach(f => {
        const alpha = Math.max(0, Math.min(1, f.life));
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 8 * alpha; ctx.shadowColor = f.color;
        ctx.fillStyle = f.color;
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.textAlign = 'left';
}

/** Targeting reticle — crosshair at the mouse cursor during play. */
function drawReticle() {
    const ship = Game.entities.ship;
    if (!ship || ship.dead || ship.explodeTime) return;

    const mx = input.mouseX, my = input.mouseY;
    const dist = Math.hypot(mx - ship.x, my - ship.y);
    if (dist < 10) return; // hide when overlapping the ship

    const alpha = 0.55 + 0.2 * Math.sin(Game.tick * 0.15);
    const sz = 9;
    const gap = 4;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#44ff44'; ctx.lineWidth = 1.5;
    ctx.shadowBlur = 8; ctx.shadowColor = '#44ff44';

    // Four gap-separated lines forming a crosshair
    ctx.beginPath();
    ctx.moveTo(mx - sz - gap, my); ctx.lineTo(mx - gap, my);
    ctx.moveTo(mx + gap, my);       ctx.lineTo(mx + sz + gap, my);
    ctx.moveTo(mx, my - sz - gap); ctx.lineTo(mx, my - gap);
    ctx.moveTo(mx, my + gap);       ctx.lineTo(mx, my + sz + gap);
    ctx.stroke();

    // Small center dot
    ctx.beginPath(); ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#44ff44'; ctx.fill();

    ctx.restore();
}
