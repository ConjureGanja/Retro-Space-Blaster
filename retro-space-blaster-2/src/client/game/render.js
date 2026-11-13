/**
 * All canvas drawing. Pure view layer — reads game/FX state, never mutates it
 * (except decaying the screen-shake offset, which is a render-only concern).
 *
 * Positions arrive in the sim's flat 1280×720 rectangle. `project` tips that
 * floor away from the camera before anything is stroked, so a speed tuned in
 * game.js is still that many world pixels per step. Analogy: a photograph of
 * a map, not a new map.
 */

import { CONSTANTS, Runtime } from './config.js';
import { Game } from './game.js';
import { input } from './input.js';
import { FX } from './fx.js';
import { drawSprite, Sprites } from './sprites.js';
import { project, setCamera, getCamera, VIEW_W, VIEW_H, LOOK_AHEAD, LOOK_BEHIND, HALF_WIDTH } from './view/plane.ts';
import { easeRoll } from './view/roll.ts';
import { getFrame } from './view/frame.ts';

let ctx;
let canvas;

const ZONE_TINTS = {
    1: null,
    2: 'rgba(160, 90, 10, 0.045)',
    3: 'rgba(180, 0, 60, 0.065)'
};

const SHOW_HITBOXES = typeof location !== 'undefined' && new URLSearchParams(location.search).has('hitbox');

export function initRenderer(target) {
    canvas = target;
    ctx = target.getContext('2d');
}

function enterView() {
    const frame = getFrame();
    ctx.setTransform(
        frame.dpr * frame.scale, 0, 0,
        frame.dpr * frame.scale,
        frame.offsetX * frame.dpr,
        frame.offsetY * frame.dpr
    );
}

/** Screen heading of a world-space direction. Art that faces up needs +PI/2. */
function heading(x, y, xv, yv) {
    const mag = Math.hypot(xv, yv) || 1;
    const a = project(x, y);
    const b = project(x + (xv / mag) * 48, y + (yv / mag) * 48);
    return Math.atan2(b.y - a.y, b.x - a.x);
}

export function draw() {
    const shipNow = Game.entities.ship;
    if (shipNow) setCamera(shipNow.x, shipNow.y);
    const frame = getFrame();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070512';
    ctx.fillRect(0, 0, canvas ? canvas.width : frame.cssW * frame.dpr, canvas ? canvas.height : frame.cssH * frame.dpr);

    enterView();
    drawSky();
    drawGround();
    drawStars();

    if (Game.currentNode) {
        const tint = ZONE_TINTS[Game.currentNode.zone];
        if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    }

    const shake = FX.shake;
    shake.mag *= 0.84;
    if (shake.mag < 0.2) shake.mag = 0;
    shake.x = (Math.random() - 0.5) * shake.mag * 2;
    shake.y = (Math.random() - 0.5) * shake.mag * 2;

    if (Game.timeScale < 1.0) {
        ctx.fillStyle = 'rgba(0, 50, 110, 0.28)';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
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
    if (SHOW_HITBOXES) drawHitboxes();

    ctx.restore();
}

function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#12081c');
    g.addColorStop(0.12, '#3a1570');
    g.addColorStop(0.2, '#12324a');
    g.addColorStop(1, '#061018');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

/**
 * Cyan floor grid in the patch the camera can see. Spacing is in world
 * pixels, so up close the squares are big and they pinch together at the
 * horizon. That pinch is the tilt; the sim never reads it.
 */
function drawGround() {
    const cam = getCamera();
    const step = 32;
    const x0 = Math.floor((cam.x - LOOK_BEHIND - step) / step) * step;
    const x1 = cam.x + LOOK_AHEAD + step * 2;
    const y0 = cam.y - HALF_WIDTH * 2.4;
    const y1 = cam.y + HALF_WIDTH * 2.4;
    ctx.save();
    ctx.strokeStyle = 'rgba(70, 235, 255, 0.38)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let y = y0; y <= y1; y += step) {
        const a = project(x0, y);
        const b = project(x1, y);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
    }
    for (let x = x0; x <= x1; x += step) {
        const a = project(x, y0);
        const b = project(x, y1);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
}

function drawStars() {
    FX.stars.forEach(s => {
        const p = project(s.x, s.y);
        const twinkle = 0.5 + 0.5 * Math.sin(Game.tick * 0.05 + s.phase);
        const b = Math.floor((110 + s.z * 145) * (0.5 + 0.5 * twinkle));
        ctx.fillStyle = `rgb(${b},${b},${Math.min(255, b + 40)})`;
        const size = Math.max(1, s.size * p.scale);
        ctx.fillRect(p.x, p.y, size, size);
    });
}

function drawXPOrbs() {
    const pulse = 0.7 + 0.3 * Math.sin(Game.tick * 0.22);
    Game.entities.xpOrbs.forEach(xp => {
        const p = project(xp.x, xp.y);
        ctx.fillStyle = '#ffcc00'; ctx.shadowBlur = 14 * pulse; ctx.shadowColor = '#ffcc00';
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5 * p.scale, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
}

const POWERUP_SPRITES = {
    weapon: 'powerupWeapon', shield: 'powerupShield',
    speed: 'powerupSpeed', health: 'powerupHealth'
};

function drawPowerups() {
    Game.entities.powerups.forEach(p => {
        const at = project(p.x, p.y);
        const pulse = 0.85 + 0.15 * Math.sin(p.phase * 2);
        const fade = p.life < 120 ? (Math.floor(p.life / 8) % 2 === 0 ? 0.3 : 1) : 1;
        ctx.save();
        ctx.shadowBlur = 16; ctx.shadowColor = '#ffffff';
        drawSprite(ctx, POWERUP_SPRITES[p.type], at.x, at.y, p.r * 2.4 * pulse * at.scale, 0, fade);
        ctx.restore();
    });
}

function drawSpriteExplosions() {
    FX.spriteExplosions.forEach(ex => {
        const p = project(ex.x, ex.y);
        const alpha = Math.max(0, ex.life);
        const size = ex.size * ex.scale * p.scale;
        ctx.save();
        ctx.shadowBlur = 20 * alpha; ctx.shadowColor = '#ff8800';
        drawSprite(ctx, 'fireExplosion', p.x, p.y, size, ex.rot, alpha);
        ctx.restore();
    });
}

function drawParticles() {
    FX.particles.forEach(p => {
        const at = project(p.x, p.y);
        const t = p.life / (p.maxLife || p.life || 1);
        ctx.globalAlpha = Math.max(0, Math.min(1, t));
        ctx.fillStyle = p.color;
        const s = (p.size || 2) * (0.4 + t * 0.6) * at.scale;
        ctx.fillRect(at.x - s / 2, at.y - s / 2, s, s);
    });
    ctx.globalAlpha = 1;
}

function drawShockwaves() {
    FX.shockwaves.forEach(s => {
        ctx.globalAlpha = Math.max(0, s.life) * 0.7;
        ctx.strokeStyle = s.color; ctx.lineWidth = 1.5 + 3.5 * s.life;
        ctx.shadowBlur = 18; ctx.shadowColor = s.color;
        strokeWorldCircle(s.x, s.y, s.r);
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function drawNovas() {
    Game.entities.novas.forEach(n => {
        const p = project(n.x, n.y);
        const t = n.life / n.maxLife;
        drawSprite(ctx, 'explosionRing', p.x, p.y, n.r * 2 * p.scale, Game.tick * 0.1, t * 0.9);
        ctx.globalAlpha = t * 0.6;
        ctx.strokeStyle = n.color; ctx.lineWidth = 7 * t + 1;
        ctx.shadowBlur = 30; ctx.shadowColor = n.color;
        strokeWorldCircle(n.x, n.y, n.r);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    });
}

function drawOrbitals() {
    Game.entities.orbitals.forEach(o => {
        if (o.x === undefined) return;
        const p = project(o.x, o.y);
        ctx.beginPath(); ctx.arc(p.x, p.y, o.size * p.scale, 0, Math.PI * 2);
        ctx.fillStyle = '#ccff00'; ctx.shadowBlur = o.size * 2; ctx.shadowColor = '#ccff00';
        ctx.fill(); ctx.shadowBlur = 0;
    });
}

function drawBeam() {
    const ship = Game.entities.ship;
    if (!ship || ship.dead || ship.explodeTime || ship.beamTime <= 0) return;
    const def = ship.shipDef.ability;
    const x0 = ship.x + 18;
    const y0 = ship.y;
    const pulse = 0.7 + 0.3 * Math.sin(Game.tick * 0.6);
    const coreH = 10 * pulse + (ship.beamTime < 20 ? -ship.beamTime * 0.2 + 4 : 0);

    ctx.save();
    ctx.shadowBlur = 35; ctx.shadowColor = def.color;
    fillBeam(x0, y0, 30, def.color, 0.22, false);
    fillBeam(x0, y0, coreH / 2, def.color, 1, true);
    ctx.restore();
    ctx.shadowBlur = 0;
}

function fillBeam(x0, y0, half, color, alpha, core) {
    const farX = CONSTANTS.GAME_WIDTH;
    const a = project(x0, y0 - half);
    const b = project(x0, y0 + half);
    const c = project(farX, y0 + half);
    const d = project(farX, y0 - half);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.globalAlpha = alpha;
    if (!core) {
        ctx.fillStyle = color;
    } else {
        const grad = ctx.createLinearGradient(a.x, a.y, d.x, d.y);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.15, color);
        grad.addColorStop(1, 'rgba(255,60,40,0.35)');
        ctx.fillStyle = grad;
    }
    ctx.fill();
}

let shipRoll = 0;
/** Screenshot hook. null means follow the stick. */
let rollOverride = null;

/** Force a roll angle for close-up checks. Pass null to follow steering again. */
export function setRollPreview(radians) {
    rollOverride = radians;
}

/**
 * Lean the one rear sprite toward a sideways shove, then ease it flat.
 * Positive roll tips the right wing down (canvas y grows downward).
 * World +y is screen-right, so a right strafe rolls positive.
 */
function currentRoll(ship) {
    if (rollOverride !== null) return rollOverride;
    shipRoll = easeRoll(shipRoll, ship.yv);
    return shipRoll;
}

function drawShip() {
    const ship = Game.entities.ship;
    if (!ship || ship.dead || ship.explodeTime) return;
    const p = project(ship.x, ship.y);

    if (ship.buffs.shield > 0) {
        const alpha = ship.buffs.shield < 60 ? (Math.floor(ship.buffs.shield / 6) % 2 === 0 ? 0.35 : 0.9) : 0.85;
        drawSprite(ctx, 'shieldEffect', p.x, p.y, ship.r * 5.2 * p.scale, Game.tick * 0.03, alpha);
    } else if (ship.spawnGrace > 0) {
        const alpha = 0.4 + 0.6 * Math.sin(Game.tick * 0.5);
        drawSprite(ctx, 'shieldEffect', p.x, p.y, ship.r * 4.5 * p.scale, Game.tick * 0.025, alpha);
    }

    const roll = currentRoll(ship);
    const base = String(Runtime.shipSpriteName || 'playership1').replace(/HD$/, '');
    // One plate per ship. The nozzle glow is painted into the art, so there
    // is no second plume here. Wings are the long side of the picture: about
    // a fifth of the logical view, on a desktop and on a sideways phone,
    // because both show that same view (the window only scales it).
    // The small lift is paint only. The hit circle and the aim point stay
    // on p, the sim position, like a sticker shifted on a window without
    // moving the person outside.
    const key = `rear-${base}`;
    const art = Sprites.get(key);
    const aspect = art && art.width ? art.height / art.width : 0.5;
    const span = 0.2 * VIEW_W;
    const drawnH = span * aspect;
    const liftFrac = { playership1: 0.11, playership2: 0.09, playership3: 0.1, playership4: 0.08, playership5: 0.07 };
    const drawY = p.y - (liftFrac[base] || 0.09) * drawnH;
    ctx.imageSmoothingEnabled = false;
    drawSprite(ctx, key, p.x, drawY, span, roll);
    ctx.imageSmoothingEnabled = true;

    if (ship.muzzleFlash > 0) {
        const nose = drawnH / 2;
        ctx.save();
        ctx.translate(p.x + Math.sin(roll) * nose, drawY - Math.cos(roll) * nose);
        ctx.globalAlpha = ship.muzzleFlash / 4;
        ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 20; ctx.shadowColor = '#88ffaa';
        ctx.beginPath(); ctx.arc(0, 0, 4 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

function drawAsteroids() {
    Game.entities.asteroids.forEach(a => {
        const p = project(a.x, a.y);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(p.scale, p.scale);
        ctx.rotate(a.a);
        ctx.fillStyle = a.hitFlash > 0 ? '#ffffff' : '#8a9098';
        ctx.fill(a.path);
        ctx.strokeStyle = a.hitFlash > 0 ? '#ffffff' : '#d5dbe3'; ctx.lineWidth = 2;
        if (a.hitFlash > 0) { ctx.shadowBlur = 18; ctx.shadowColor = '#fff'; }
        ctx.stroke(a.path);
        ctx.shadowBlur = 0;
        ctx.restore();
    });
}

function drawEnemies() {
    Game.entities.enemies.forEach(e => {
        const p = project(e.x, e.y);
        if (e.isBoss) {
            const wobble = Math.sin(Game.tick * 0.05) * 0.06;
            // Art faces up. PI turns it toward the camera, down the corridor.
            const rot = Math.PI + wobble;
            ctx.save();
            if (e.hitFlash > 0) { ctx.shadowBlur = 35; ctx.shadowColor = '#ffffff'; }
            drawSprite(ctx, e.sprite, p.x, p.y, e.r * 3.2 * p.scale, rot, e.hitFlash > 0 ? 0.55 : 1.0);
            ctx.restore();

            if (e.shield && e.shield.active) {
                const gap = Sprites.ringGap('superShield');
                const pulse = 0.8 + Math.sin(Game.tick * 0.12) * 0.15;
                const dir = heading(e.x, e.y, Math.cos(e.shield.angle), Math.sin(e.shield.angle));
                ctx.save();
                ctx.shadowBlur = 25; ctx.shadowColor = '#88ddff';
                drawSprite(ctx, 'superShield', p.x, p.y, e.shield.r * 2.15 * p.scale, dir - gap.center, pulse);
                ctx.restore();
            }
        } else if (Sprites.isReady(e.sprite)) {
            const face = heading(e.x, e.y, Math.cos(e.angle), Math.sin(e.angle));
            ctx.save();
            if (e.hitFlash > 0) {
                ctx.shadowBlur = 24; ctx.shadowColor = '#ffffff';
                ctx.globalAlpha = 0.65;
            }
            drawSprite(ctx, e.sprite, p.x, p.y, e.r * 2.8 * p.scale, face + Math.PI / 2, e.hitFlash > 0 ? 0.65 : 1);
            ctx.restore();
        } else {
            const face = heading(e.x, e.y, Math.cos(e.angle), Math.sin(e.angle));
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(p.scale, p.scale);
            ctx.rotate(face + Math.PI / 2);
            const col = e.hitFlash > 0 ? '#ffffff' : (e.color || '#ff4444');
            ctx.shadowBlur = 10; ctx.shadowColor = col;
            ctx.fillStyle = 'rgba(40,0,0,0.5)'; ctx.fill(e.path);
            ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(e.path);
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        if (!e.isBoss && e.maxHp > 1) {
            const hpFrac = Math.max(0, e.hp / e.maxHp);
            const bw = 22 * p.scale, bh = 3 * p.scale;
            const top = p.y - (e.r + 12) * p.scale;
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - bw / 2 - 1, top, bw + 2, bh + 2);
            ctx.fillStyle = '#440000'; ctx.fillRect(p.x - bw / 2, top + 1, bw, bh);
            ctx.fillStyle = hpFrac > 0.5 ? '#00ff44' : hpFrac > 0.25 ? '#ffaa00' : '#ff2222';
            ctx.fillRect(p.x - bw / 2, top + 1, bw * hpFrac, bh);
        }
    });
}

function drawLasers() {
    Game.entities.lasers.forEach(l => {
        const p = project(l.x, l.y);
        const angle = heading(l.x, l.y, l.xv, l.yv);
        const speed = Math.hypot(l.xv, l.yv);
        const boltLen = (18 + speed + (Game.upgrades.bulletSize * 5)) * p.scale;
        const boltW = (2.5 + (Game.upgrades.bulletSize * 0.8)) * p.scale;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        ctx.shadowBlur = 14; ctx.shadowColor = l.color;

        ctx.globalAlpha = 0.35;
        ctx.fillStyle = l.color;
        ctx.fillRect(-boltLen / 2, -boltW * 2, boltLen, boltW * 4);

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

function drawEnemyLasers() {
    Game.entities.enemyLasers.forEach(l => {
        const p = project(l.x, l.y);
        const col = l.color || '#ff9900';
        const angle = heading(l.x, l.y, l.xv, l.yv);

        if (l.sprite && Sprites.isReady(l.sprite)) {
            ctx.save();
            ctx.shadowBlur = 14; ctx.shadowColor = col;
            drawSprite(ctx, l.sprite, p.x, p.y, (10 + l.r * 4) * p.scale, angle);
            ctx.restore();
            return;
        }

        const speed = Math.hypot(l.xv, l.yv);
        const boltLen = (14 + speed * 0.8) * p.scale;
        const boltH = l.r * 0.9 * p.scale;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        ctx.shadowBlur = 12; ctx.shadowColor = col;
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = col;
        ctx.fillRect(-boltLen / 2, -boltH * 1.8, boltLen, boltH * 3.6);

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

function drawExplosions() {
    Game.entities.explosions.forEach(ex => {
        const p = project(ex.x, ex.y);
        ctx.beginPath(); ctx.arc(p.x, p.y, ex.r * p.scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 170, 0, ${ex.life / 15 * 0.6})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 220, 80, ${ex.life / 15})`;
        ctx.lineWidth = 2; ctx.stroke();
    });
}

function drawFloatTexts() {
    ctx.textAlign = 'center';
    FX.floatTexts.forEach(f => {
        const p = project(f.x, f.y);
        const alpha = Math.max(0, Math.min(1, f.life));
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 8 * alpha; ctx.shadowColor = f.color;
        ctx.fillStyle = f.color;
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.fillText(f.text, p.x, p.y);
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.textAlign = 'left';
}

function drawReticle() {
    const ship = Game.entities.ship;
    if (!ship || ship.dead || ship.explodeTime) return;

    const dist = Math.hypot(input.mouseX - ship.x, input.mouseY - ship.y);
    if (dist < 10) return;

    const p = project(input.mouseX, input.mouseY);
    const alpha = 0.55 + 0.2 * Math.sin(Game.tick * 0.15);
    const sz = 9;
    const gap = 4;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#44ff44'; ctx.lineWidth = 1.5;
    ctx.shadowBlur = 8; ctx.shadowColor = '#44ff44';
    ctx.beginPath();
    ctx.moveTo(p.x - sz - gap, p.y); ctx.lineTo(p.x - gap, p.y);
    ctx.moveTo(p.x + gap, p.y); ctx.lineTo(p.x + sz + gap, p.y);
    ctx.moveTo(p.x, p.y - sz - gap); ctx.lineTo(p.x, p.y - gap);
    ctx.moveTo(p.x, p.y + gap); ctx.lineTo(p.x, p.y + sz + gap);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#44ff44'; ctx.fill();
    ctx.restore();
}

/** Floor outline of the sim's circles. Open the game with ?hitbox=1. */
function drawHitboxes() {
    const ship = Game.entities.ship;
    ctx.save();
    ctx.lineWidth = 1;
    if (ship && !ship.dead) strokeWorldCircle(ship.x, ship.y, ship.r, '#44ff88');
    Game.entities.enemies.forEach(e => strokeWorldCircle(e.x, e.y, e.r, '#ff6688'));
    Game.entities.asteroids.forEach(a => strokeWorldCircle(a.x, a.y, a.r, '#cccccc'));
    ctx.restore();
}

function strokeWorldCircle(x, y, r, color) {
    ctx.beginPath();
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const p = project(x + Math.cos(a) * r, y + Math.sin(a) * r);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    if (color) ctx.strokeStyle = color;
    ctx.stroke();
}
