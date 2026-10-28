/**
 * Entity factories — pure(ish) builders that describe *what* an entity is.
 * Spawn orchestration (where/when, array bookkeeping) lives in game.js.
 *
 * This is the natural home for new enemy/boss definitions: add an entry to
 * ENEMY_TYPES, or extend buildBoss()/buildMiniBoss().
 */

import { CONSTANTS, Runtime } from './config.js';

export function createShip(shipDef) {
    return {
        x: 120, y: CONSTANTS.GAME_HEIGHT / 2, xv: 0, yv: 0,
        a: 0, r: 15,
        laserTimer: 0, dead: false, explodeTime: 0,
        thrust: 0,        // 0..1 current thrust intensity (drives engine flame)
        muzzleFlash: 0,   // frames remaining of muzzle flash
        spawnGrace: 90,   // brief invulnerability + shield bubble on (re)spawn
        shipDef,          // selected roster entry (ships.js)
        // Special ability state — energy starts full so the player can use it early.
        ability: { energy: shipDef.ability.max, active: 0 },
        // Timed powerup buffs (frames remaining)
        buffs: { rapid: 0, speed: 0, shield: 0 },
        beamTime: 0       // frames of HYPER BEAM remaining (VULCAN)
    };
}

/** Build a single asteroid with a randomized lumpy vector outline. */
export function buildAsteroid(x, y, r, level) {
    r = r || (30 + Math.random() * 25);
    const vert = 8 + Math.floor(Math.random() * 4);
    const path = new Path2D();
    for (let i = 0; i < vert; i++) {
        const angle = (i / vert) * Math.PI * 2;
        const dist = r * (0.8 + Math.random() * 0.4);
        if (i === 0) path.moveTo(dist * Math.cos(angle), dist * Math.sin(angle));
        else path.lineTo(dist * Math.cos(angle), dist * Math.sin(angle));
    }
    path.closePath();

    const spd = 1.5 + (level * 0.15);
    return {
        x: x !== undefined ? x : CONSTANTS.GAME_WIDTH + CONSTANTS.SPAWN_MARGIN,
        y: y !== undefined ? y : Math.random() * CONSTANTS.GAME_HEIGHT,
        r,
        xv: -spd - Math.random() * spd,
        yv: (Math.random() - 0.5) * spd * 0.5,
        a: Math.random() * Math.PI * 2,
        rot: (Math.random() - 0.5) * 0.05,
        path,
        hp: r > 30 ? 2 : 1,
        hitFlash: 0
    };
}

/**
 * Enemy archetypes. `sprite` is the SVG key (sprites.js); `path` is a vector
 * fallback outline if the sprite hasn't loaded. `move` picks the AI in game.js:
 *   drift  — cruise left, gently homing on the player's y
 *   dive   — enter from top/bottom, curve toward the player, then streak left
 *   sine   — fly left on a sine wave (spawned in chains, R-Type style)
 *   hold   — park on the right side of the screen and snipe
 */
export const ENEMY_TYPES = {
    saucer:  { hp: 2,  spd: 2.6, r: 16, score: 300,  color: '#ff4444', sprite: 'enemySaucer',  move: 'drift', path: new Path2D("M -10 -5 L 10 -5 L 0 10 Z") },
    charger: { hp: 1,  spd: 5.8, r: 13, score: 400,  color: '#ff00aa', sprite: 'enemyCharger', move: 'dive',  path: new Path2D("M -8 -10 L 8 -10 L 0 15 Z") },
    tank:    { hp: 8,  spd: 1.3, r: 26, score: 900,  color: '#ff8800', sprite: 'enemyTank',    move: 'drift', path: new Path2D("M -15 -10 L 15 -10 L 20 5 L 0 20 L -20 5 Z") },
    swarmer: { hp: 1,  spd: 5.0, r: 10, score: 200,  color: '#ffff00', sprite: 'enemySwarmer', move: 'sine',  path: new Path2D("M -5 -5 L 5 -5 L 0 8 Z") },
    sniper:  { hp: 3,  spd: 1.8, r: 18, score: 600,  color: '#00ffff', sprite: 'enemySniper',  move: 'hold',  path: new Path2D("M -10 -15 L 10 -15 L 15 0 L 0 15 L -15 0 Z") }
};

/** Build one enemy of the given archetype at (x, y). */
export function buildEnemy(typeName, x, y, level, opts = {}) {
    const t = ENEMY_TYPES[typeName];
    const hpScale = (1 + (level - 1) * 0.25) * Runtime.difficulty.enemyHp;
    return {
        x, y,
        xv: 0, yv: 0,
        r: t.r, hp: Math.ceil(t.hp * hpScale), maxHp: Math.ceil(t.hp * hpScale),
        spd: t.spd * (1 + level * 0.04),
        eType: typeName, color: t.color, path: t.path, sprite: t.sprite,
        score: t.score, move: t.move,
        angle: Math.PI, // facing left
        shootTimer: 60 + Math.random() * 120, hitFlash: 0,
        baseY: y,                 // sine anchor
        wavePhase: opts.wavePhase || 0,
        diveDir: opts.diveDir || 0, // -1 from bottom, 1 from top
        holdX: CONSTANTS.GAME_WIDTH * (0.68 + Math.random() * 0.22)
    };
}

/**
 * The end-of-level MOTHERSHIP. Huge HP pool, multi-phase attack patterns.
 * `opts.finale` builds the campaign's final boss: the VRAX OVERMIND —
 * the SUPER MOTHERSHIP, guarded by a spinning energy shield with a single
 * opening. Shots only get through the gap; the shield shatters at half HP.
 */
export function buildBoss(level, opts = {}) {
    const hp = Math.ceil((300 + 220 * level) * Runtime.difficulty.enemyHp * (opts.finale ? 1.4 : 1));
    const r = opts.finale ? 105 : 85;
    return {
        x: CONSTANTS.GAME_WIDTH + 200,
        y: CONSTANTS.GAME_HEIGHT / 2,
        xv: 0, yv: 0,
        r, hp, maxHp: hp, spd: 0.6 + (level * 0.08),
        eType: 'boss', color: '#cc44ff',
        sprite: opts.finale ? 'bossSuperMothership' : 'bossMothership',
        score: (opts.finale ? 20000 : 5000) + level * 1000,
        angle: Math.PI, shootTimer: 90, hitFlash: 0,
        isBoss: true, bossName: opts.finale ? 'THE VRAX OVERMIND' : 'MOTHERSHIP',
        isFinale: !!opts.finale,
        // Spinning shield ring (finale only): world angle of the opening, spin
        // rate, and ring radius. Gameplay + rendering both read this.
        shield: opts.finale ? { active: true, angle: Math.PI, spin: 0.016, r: r * 1.8 } : null,
        phase: 0,          // vertical bob phase
        attackTimer: 90, spiralAngle: 0, summonTimer: 400,
        lungeTimer: 0, lungeX: 0
    };
}

/** The mid-level DREADNOUGHT ambush. Smaller pool, simpler pattern. */
export function buildMiniBoss(level) {
    const hp = Math.ceil((120 + 90 * level) * Runtime.difficulty.enemyHp);
    return {
        x: CONSTANTS.GAME_WIDTH + 150,
        y: CONSTANTS.GAME_HEIGHT / 2,
        xv: 0, yv: 0,
        r: 60, hp, maxHp: hp, spd: 0.8 + (level * 0.08),
        eType: 'boss', color: '#ff4455', sprite: 'bossDreadnought',
        score: 2500 + level * 500,
        angle: Math.PI, shootTimer: 80, hitFlash: 0,
        isBoss: true, isMiniBoss: true, bossName: 'DREADNOUGHT',
        phase: 0, attackTimer: 80, spiralAngle: 0, summonTimer: 9999,
        lungeTimer: 0, lungeX: 0
    };
}

/** Powerup pickup drifting left. type: weapon | shield | speed | health */
export function buildPowerup(x, y, type) {
    return {
        x, y, type,
        xv: -1.2, yv: Math.sin(x) * 0.3,
        r: 14, life: 900, phase: Math.random() * Math.PI * 2
    };
}

/** Weighted random powerup type — health (extra life) is the rare one. */
export function rollPowerupType() {
    const r = Math.random();
    if (r < 0.10) return 'health';
    if (r < 0.40) return 'shield';
    if (r < 0.70) return 'weapon';
    return 'speed';
}
