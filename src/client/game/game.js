/**
 * Core game model + controller: state, spawning, the per-frame update, and
 * collision resolution. Rendering lives in render.js; cosmetic FX in fx.js.
 *
 * Structure of a level (R-Type style side-scroller):
 *   - The world scrolls right; `progress` climbs toward `levelLength`.
 *   - Waves of enemies enter from the right edge and dive in from the top/
 *     bottom of the right half of the screen.
 *   - At MINIBOSS_AT (levels 2+) the DREADNOUGHT ambushes; progress pauses.
 *   - At 100% the MOTHERSHIP arrives. Killing it completes the level.
 *   - XP picked up mid-run triggers the roguelite upgrade choice.
 */

import { CONSTANTS, STATE, Runtime } from './config.js';
import { Sound } from './audio.js';
import { store } from './store.js';
import { Cloud } from './platform/cloud.js';
import { input } from './input.js';
import { FX } from './fx.js';
import { SHIPS } from './ships.js';
import {
    createShip, buildAsteroid, buildEnemy, buildBoss, buildMiniBoss,
    buildPowerup, rollPowerupType
} from './entities.js';
import { Sprites } from './sprites.js';
import { UI } from './ui.js';

const DEFAULT_UPGRADES = () => ({
    doubleShot: 0, spreadShot: 0, tailGunner: 0,
    fireRate: 0, speedMult: 1.0, laserRange: 1.0,
    sniper: false, tracer: false, bulletSize: 0, seeker: 0,
    explosive: 0, prismatic: false, bouncy: false, wobbly: false,
    flak: 0, orbitals: 0
});

const EMPTY_ENTITIES = () => ({
    ship: null, asteroids: [], enemies: [], lasers: [], enemyLasers: [],
    xpOrbs: [], explosions: [], orbitals: [], powerups: [], novas: []
});

const EMPTY_LEVEL_STATS = () => ({ kills: 0, spawned: 0, deaths: 0, startScore: 0 });

export const Game = {
    level: 1, lives: 3, score: 0, xp: 0, xpNeeded: 100,
    timeScale: 1.0,
    tick: 0,
    canvas: null,

    // Side-scroller run state
    progress: 0, levelLength: CONSTANTS.LEVEL_LENGTH,
    minibossSpawned: false,
    waveTimer: 60,
    levelStats: EMPTY_LEVEL_STATS(),
    prevRight: false, // for edge-triggering the ability on right-click

    // Kill-chain combo: kills in quick succession multiply score (up to x5)
    combo: { count: 0, timer: 0 },

    // Dev flags — only ever set from the console via RSB.dev (see dev.js)
    debug: { god: false },

    upgrades: DEFAULT_UPGRADES(),
    entities: EMPTY_ENTITIES(),

    init(canvas) {
        this.canvas = canvas;
        window.addEventListener('resize', () => this.resize());
        this.resize();
        FX.initStars(CONSTANTS.GAME_WIDTH, CONSTANTS.GAME_HEIGHT);
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        CONSTANTS.GAME_WIDTH = this.canvas.width;
        CONSTANTS.GAME_HEIGHT = this.canvas.height;
        FX.initStars(CONSTANTS.GAME_WIDTH, CONSTANTS.GAME_HEIGHT);
    },

    // Campaign run state: score/lives/upgrades persist across map nodes until
    // a game over (the star map itself always persists — see map.js).
    runActive: false,
    currentNode: null,
    nodeMods: {},

    /** Fresh campaign run: difficulty-based lives, zeroed score/xp/upgrades. */
    initRun() {
        this.lives = Runtime.difficulty.lives;
        this.score = 0; this.xp = 0; this.xpNeeded = 100;
        this.upgrades = DEFAULT_UPGRADES();
        this.runActive = true;
    },

    /** After a game over: the run resets — but CADET keeps its upgrades. */
    resetRunAfterDeath() {
        const kept = Runtime.difficulty.keepUpgradesOnDeath ? this.upgrades : null;
        this.initRun();
        if (kept) this.upgrades = kept;
    },

    /** Launch a star-map node. The node's sector drives all level scaling. */
    startNode(node) {
        Sound.init();
        if (!this.runActive) this.initRun();
        this.currentNode = node;
        this.level = node.sector;
        this.beginLevel();
    },

    /** Reset per-level run state and kick off the music. Keeps score/lives/upgrades. */
    beginLevel() {
        UI.hideAll();
        this.entities = EMPTY_ENTITIES();
        this.entities.ship = createShip(Runtime.shipDef || SHIPS[0]);
        this.rebuildOrbitals();
        const mods = this.currentNode ? this.currentNode.mods : {};
        this.nodeMods = mods;
        this.progress = 0;
        this.levelLength = Math.round(
            (CONSTANTS.LEVEL_LENGTH + (this.level - 1) * CONSTANTS.LEVEL_LENGTH_GROWTH) * (mods.lengthMult || 1)
        );
        this.minibossSpawned = !!mods.noMiniboss; // pre-"spawned" = never ambushes
        this.waveTimer = 80; // short breather before the first wave
        this.levelStats = EMPTY_LEVEL_STATS();
        this.levelStats.startScore = this.score;
        this.combo = { count: 0, timer: 0 };
        Runtime.camera = { x: 0, y: 0 };
        Runtime.bossActive = false;
        UI.hideBossHUD();
        FX.reset();

        Sound.startBGM();
        UI.updateHUD();
        UI.showSectorToast(this.currentNode);
        Runtime.state = STATE.PLAYING;
    },

    /** (Re)build orbital drones from the upgrade count — called on level start
     *  and whenever the PLASMA DRONES upgrade is taken. */
    rebuildOrbitals() {
        this.entities.orbitals = [];
        const count = this.upgrades.orbitals;
        if (!count) return;
        const dist = 50 + count * 8;
        const size = 5 + count * 2;
        const speed = 0.05 + count * 0.005;
        for (let i = 0; i < count; i++) {
            this.entities.orbitals.push({ angle: (i / count) * Math.PI * 2, dist, size, speed });
        }
    },

    /** Combined score multiplier: node modifier × difficulty. */
    scoreFactor() {
        return (this.nodeMods.scoreMult || 1) * Runtime.difficulty.scoreMult;
    },

    // ------------------------------------------------------------------
    // Spawning
    // ------------------------------------------------------------------

    trackSpawn(enemy) {
        this.levelStats.spawned++;
        this.entities.enemies.push(enemy);
    },

    /** Pick and spawn a wave pattern appropriate to the level and node type. */
    spawnWave() {
        // Themed nodes lean hard on their signature enemy
        if (this.nodeMods.waveBias && Math.random() < 0.70) {
            this.spawnBiasWave(this.nodeMods.waveBias);
            return;
        }

        // Node-type overrides — no waveBias, but the TYPE label drives the feel
        const nodeType = this.currentNode?.type;
        if (nodeType === 'PATROL')   { this.spawnPatrolWave(); return; }
        if (nodeType === 'SIEGE')    { this.spawnSiegeWave();  return; }
        if (nodeType === 'SKIRMISH') { this.spawnSkirmishWave(); return; }

        // Default: level-scaled mixed engagement
        const W = CONSTANTS.GAME_WIDTH, H = CONSTANTS.GAME_HEIGHT, M = CONSTANTS.SPAWN_MARGIN;
        const lvl = this.level;
        const r = Math.random();

        if (r < 0.28) {
            // Swarmer chain snaking in on a sine wave
            const count = 5 + Math.min(lvl, 5);
            const baseY = H * (0.15 + Math.random() * 0.70);
            for (let i = 0; i < count; i++) {
                this.trackSpawn(buildEnemy('swarmer', W + M + i * 52, baseY, lvl, { wavePhase: i * 0.55 }));
            }
        } else if (r < 0.52 && lvl >= 2) {
            // Chargers ambush from the top/bottom of the right half
            const count = 2 + Math.floor(Math.random() * 3);
            const fromTop = Math.random() < 0.5;
            for (let i = 0; i < count; i++) {
                const x = W * (0.50 + Math.random() * 0.38);
                const y = fromTop ? -M - i * 45 : H + M + i * 45;
                this.trackSpawn(buildEnemy('charger', x, y, lvl, { diveDir: fromTop ? 1 : -1 }));
            }
        } else if (r < 0.67 && lvl >= 3) {
            // Heavy escort: a tank with a sniper covering it
            this.trackSpawn(buildEnemy('tank', W + M, H * (0.25 + Math.random() * 0.5), lvl));
            this.trackSpawn(buildEnemy('sniper', W + M + 90, H * Math.random(), lvl));
        } else if (r < 0.80 && lvl >= 2) {
            this.trackSpawn(buildEnemy('sniper', W + M, H * (0.12 + Math.random() * 0.76), lvl));
            if (lvl >= 4 && Math.random() < 0.5) {
                this.trackSpawn(buildEnemy('sniper', W + M + 60, H * (0.12 + Math.random() * 0.76), lvl));
            }
        } else {
            // Saucer patrol — 2-3 at once
            const count = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < count; i++) {
                this.trackSpawn(buildEnemy('saucer', W + M + i * 75, H * Math.random(), lvl));
            }
        }
    },

    /** PATROL — orderly V-formation sweeps; calm but purposeful. */
    spawnPatrolWave() {
        const W = CONSTANTS.GAME_WIDTH, H = CONSTANTS.GAME_HEIGHT, M = CONSTANTS.SPAWN_MARGIN;
        const lvl = this.level;
        const count = 3 + Math.floor(Math.random() * 3);
        const centerY = H * (0.3 + Math.random() * 0.4);
        for (let i = 0; i < count; i++) {
            const offset = (i - Math.floor(count / 2)) * 42;
            // Stagger entry so the formation flies in cleanly
            this.trackSpawn(buildEnemy('saucer', W + M + Math.abs(offset) * 0.7, centerY + offset, lvl));
        }
    },

    /** SIEGE — heavy armor with sniper support; slow grind. */
    spawnSiegeWave() {
        const W = CONSTANTS.GAME_WIDTH, H = CONSTANTS.GAME_HEIGHT, M = CONSTANTS.SPAWN_MARGIN;
        const lvl = this.level;
        this.trackSpawn(buildEnemy('tank', W + M, H * (0.28 + Math.random() * 0.44), lvl));
        if (Math.random() < 0.75) {
            this.trackSpawn(buildEnemy('sniper', W + M + 100, H * (0.12 + Math.random() * 0.38), lvl));
            this.trackSpawn(buildEnemy('sniper', W + M + 100, H * (0.50 + Math.random() * 0.38), lvl));
        }
    },

    /** SKIRMISH — fast saucer + swarmer bursts; quick chaos. */
    spawnSkirmishWave() {
        const W = CONSTANTS.GAME_WIDTH, H = CONSTANTS.GAME_HEIGHT, M = CONSTANTS.SPAWN_MARGIN;
        const lvl = this.level;
        const r = Math.random();
        if (r < 0.5) {
            // Quick swarmer burst
            const count = 4 + Math.floor(Math.random() * 4);
            const baseY = H * (0.2 + Math.random() * 0.6);
            for (let i = 0; i < count; i++) {
                this.trackSpawn(buildEnemy('swarmer', W + M + i * 48, baseY, lvl, { wavePhase: i * 0.5 }));
            }
        } else {
            // Fast saucer drive-by
            const count = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < count; i++) {
                this.trackSpawn(buildEnemy('saucer', W + M + i * 60, H * Math.random(), lvl));
            }
        }
    },

    spawnAsteroid() {
        this.entities.asteroids.push(buildAsteroid(undefined, undefined, undefined, this.level));
    },

    dropXP(x, y, amount) {
        for (let i = 0; i < amount; i++) {
            this.entities.xpOrbs.push({
                x, y, xv: (Math.random() - 0.5) * 4, yv: (Math.random() - 0.5) * 4,
                life: 600 // ~10 seconds to collect
            });
        }
    },

    maybeDropPowerup(x, y, chance = CONSTANTS.POWERUP_DROP_CHANCE) {
        if (Math.random() < chance) {
            this.entities.powerups.push(buildPowerup(x, y, rollPowerupType()));
        }
    },

    /** Current score multiplier from the kill chain (x1..x5). */
    comboMult() {
        return Math.min(5, 1 + Math.floor(this.combo.count / 5));
    },

    /** Register a kill in the chain and return the multiplier to score it at. */
    bumpCombo() {
        this.combo.count++;
        this.combo.timer = 110; // ~1.8s window — keep killing to sustain the chain
        return this.comboMult();
    },

    // AoE explosion from the HIGH EXPLOSIVE upgrade.
    triggerExplosion(x, y) {
        if (this.upgrades.explosive > 0) {
            // Radius = a 60px base + 15px per HIGH EXPLOSIVE pick (upgrades.js),
            // so the first pick matches the old ~75px blast and stacking pays off.
            this.entities.explosions.push({ x, y, r: 1, maxR: 60 + this.upgrades.explosive, life: 15 });
            Sound.play('explode');
        }
    },

    // ------------------------------------------------------------------
    // Per-frame update
    // ------------------------------------------------------------------

    update() {
        const ship = this.entities.ship;
        this.timeScale = 1.0;

        this.updateShip(ship);
        this.updateRun();

        this.updateLasers();
        this.updateAsteroids();
        this.updateEnemies(ship);
        this.updateEnemyLasers();
        this.updateOrbitals(ship);
        this.updateExplosions();
        this.updateNovas();
        this.updatePowerups(ship);

        FX.update(this.timeScale, ship);

        // Combo window ticks down; the chain breaks when it hits zero
        if (this.combo.timer > 0 && --this.combo.timer === 0) this.combo.count = 0;

        this.checkCollisions();
        this.updateXPOrbs(ship);
        this.checkLevelUp();
        this.handleDeath(ship);

        UI.updateHUD();
    },

    /**
     * Node-type-based scroll speed multiplier. Each TYPE label on the star map
     * produces a meaningfully different pace: PATROL is leisurely, AMBUSH is a sprint.
     */
    getNodeScrollSpeed() {
        const base = CONSTANTS.SCROLL_SPEED;
        if (!this.currentNode) return base;
        const typeMultipliers = {
            'PATROL':   0.65,   // leisurely sweep — enemies in formation, room to breathe
            'SKIRMISH': 1.15,   // quick raid — short, punchy
            'ASSAULT':  1.00,   // full engagement — standard pace
            'SIEGE':    0.60,   // slow grind into a fortified position
            'HAZARD':   0.85,   // dense field — careful navigation
            'SWARM':    1.30,   // swarmer blitz — move fast or get buried
            'AMBUSH':   1.40,   // charger ambush — chaos at speed
            'FINALE':   0.85,   // dramatic approach, then the big boss
            'SECRET':   0.70    // gold rush — collect, don't rush
        };
        const mult = typeMultipliers[this.currentNode.type] || 1.0;
        return base * mult * (this.nodeMods.scrollMult || 1.0);
    },

    /** Advance the level track, spawn waves, and trigger boss encounters. */
    updateRun() {
        if (Runtime.bossActive) return;
        const mods = this.nodeMods;

        const scrollSpd = this.getNodeScrollSpeed();
        this.progress += scrollSpd;
        // Drive the starfield at the node's scroll speed so fast nodes feel fast visually.
        FX.scrollRate = scrollSpd * 5;
        const frac = this.progress / this.levelLength;

        // Dreadnought ambush partway through (sector 2+, or any bossRush node)
        if (!this.minibossSpawned && (this.level >= 2 || mods.bossRush) && frac >= CONSTANTS.MINIBOSS_AT) {
            this.minibossSpawned = true;
            Runtime.bossActive = true;
            Sound.play('bossAlert');
            FX.addShake(12);
            this.entities.enemies.push(buildMiniBoss(this.level));
            return;
        }

        // The end of the run: mothership — or, on patrol nodes, a clean getaway
        if (frac >= 1) {
            if (mods.noBoss) { this.completeLevel(); return; }
            Runtime.bossActive = true;
            Sound.play('bossAlert');
            FX.addShake(16);
            this.entities.enemies.push(buildBoss(this.level, { finale: !!mods.finale }));
            return;
        }

        // Wave pacing — quickens with level and as the run progresses (much tighter than before)
        this.waveTimer -= 1;
        if (this.waveTimer <= 0) {
            if (mods.goldRush) this.spawnGoldRush();
            else this.spawnWave();
            const base = Math.max(90 - this.level * 8 - frac * 28, 28) + Math.random() * 28;
            this.waveTimer = base * Runtime.difficulty.wavePace * (mods.goldRush ? 0.45 : 1);
        }
        if (Math.random() < (0.005 + this.level * 0.0012) * (mods.asteroidMult || 1)) this.spawnAsteroid();
    },

    /** Bonus-node spawner: veins of XP orbs and powerups with a token escort. */
    spawnGoldRush() {
        const W = CONSTANTS.GAME_WIDTH, H = CONSTANTS.GAME_HEIGHT;
        const baseY = H * (0.15 + Math.random() * 0.7);
        for (let i = 0; i < 6; i++) {
            this.entities.xpOrbs.push({
                x: W + 30 + i * 42, y: baseY + Math.sin(i * 0.8) * 45,
                xv: -2.2, yv: 0, life: 1200
            });
        }
        if (Math.random() < 0.5) this.entities.powerups.push(buildPowerup(W + 60, H * Math.random(), rollPowerupType()));
        if (Math.random() < 0.35) this.trackSpawn(buildEnemy('saucer', W + CONSTANTS.SPAWN_MARGIN, H * Math.random(), this.level));
    },

    /** Themed wave for waveBias nodes (swarm nests, sniper fields, ambush lanes). */
    spawnBiasWave(bias) {
        const W = CONSTANTS.GAME_WIDTH, H = CONSTANTS.GAME_HEIGHT, M = CONSTANTS.SPAWN_MARGIN;
        const lvl = this.level;
        if (bias === 'swarmer') {
            // Two interleaved sine chains for density
            const count = 7 + Math.min(lvl, 7);
            const baseY = H * (0.2 + Math.random() * 0.6);
            for (let i = 0; i < count; i++) {
                this.trackSpawn(buildEnemy('swarmer', W + M + i * 46, baseY, lvl, { wavePhase: i * 0.55 }));
            }
            if (Math.random() < 0.5) {
                const baseY2 = H * (0.15 + Math.random() * 0.7);
                for (let i = 0; i < Math.floor(count * 0.6); i++) {
                    this.trackSpawn(buildEnemy('swarmer', W + M + 23 + i * 46, baseY2, lvl, { wavePhase: i * 0.55 + 0.3 }));
                }
            }
        } else if (bias === 'sniper') {
            // Static-field cluster — multiple snipers at staggered depths
            const count = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < count; i++) {
                this.trackSpawn(buildEnemy('sniper', W + M + i * 70, H * (0.1 + Math.random() * 0.80), lvl));
            }
        } else if (bias === 'charger') {
            // Ambush from BOTH top AND bottom simultaneously
            const countTop = 2 + Math.floor(Math.random() * 2);
            const countBot = 1 + Math.floor(Math.random() * 2);
            for (let i = 0; i < countTop; i++) {
                const x = W * (0.45 + Math.random() * 0.42);
                this.trackSpawn(buildEnemy('charger', x, -M - i * 42, lvl, { diveDir: 1 }));
            }
            for (let i = 0; i < countBot; i++) {
                const x = W * (0.45 + Math.random() * 0.42);
                this.trackSpawn(buildEnemy('charger', x, H + M + i * 42, lvl, { diveDir: -1 }));
            }
        }
    },

    updateShip(ship) {
        if (!ship || ship.dead || ship.explodeTime) return;

        if (ship.spawnGrace > 0) ship.spawnGrace--;
        if (ship.muzzleFlash > 0) ship.muzzleFlash--;
        for (const k of Object.keys(ship.buffs)) if (ship.buffs[k] > 0) ship.buffs[k]--;

        // --- Mouse tracking movement (ship always faces right, R-Type style) ---
        ship.a = 0;
        const dx = input.mouseX - ship.x;
        const dy = input.mouseY - ship.y;
        const distToMouse = Math.hypot(dx, dy);

        const speedBuff = ship.buffs.speed > 0 ? 1.5 : 1;
        const speedLimit = CONSTANTS.MOVE_MAX_SPEED * this.upgrades.speedMult
            * ship.shipDef.stats.speed * speedBuff;
        if (distToMouse > CONSTANTS.MOVE_DEADZONE) {
            // Desired velocity points at the cursor and scales with distance,
            // so the ship slows as it arrives instead of overshooting.
            const desiredSpeed = Math.min(distToMouse * CONSTANTS.MOVE_APPROACH, speedLimit);
            const tvx = (dx / distToMouse) * desiredSpeed;
            const tvy = (dy / distToMouse) * desiredSpeed;
            ship.xv += (tvx - ship.xv) * CONSTANTS.MOVE_ACCEL;
            ship.yv += (tvy - ship.yv) * CONSTANTS.MOVE_ACCEL;
        } else {
            ship.xv *= 0.8; ship.yv *= 0.8;
        }

        ship.xv *= CONSTANTS.MOVE_FRICTION;
        ship.yv *= CONSTANTS.MOVE_FRICTION;
        ship.thrust = Math.min(Math.hypot(ship.xv, ship.yv) / speedLimit, 1);

        this.updateAbility(ship);

        ship.x += ship.xv; ship.y += ship.yv;

        // Constrain ship to screen
        const padding = ship.r;
        if (ship.x < padding) { ship.x = padding; ship.xv = 0; }
        if (ship.x > CONSTANTS.GAME_WIDTH - padding) { ship.x = CONSTANTS.GAME_WIDTH - padding; ship.xv = 0; }
        if (ship.y < padding) { ship.y = padding; ship.yv = 0; }
        if (ship.y > CONSTANTS.GAME_HEIGHT - padding) { ship.y = CONSTANTS.GAME_HEIGHT - padding; ship.yv = 0; }

        // Hyper beam damage-over-time corridor
        if (ship.beamTime > 0) this.updateBeam(ship);

        // Fire
        if (ship.laserTimer > 0) ship.laserTimer--;
        if (input.clickLeft && ship.laserTimer <= 0) this.fire(ship);
    },

    // ------------------------------------------------------------------
    // Ship special abilities (right-click, defined per-ship in ships.js)
    // ------------------------------------------------------------------

    updateAbility(ship) {
        const def = ship.shipDef.ability;
        const ab = ship.ability;
        const rightHeld = input.clickRight;
        const rightPressed = rightHeld && !this.prevRight;
        this.prevRight = rightHeld;

        if (def.mode === 'drain') { // CHRONO FIELD — hold to slow time
            if (rightHeld && ab.energy > 0) {
                this.timeScale = def.slowFactor;
                ab.energy = Math.max(0, ab.energy - def.drain);
                ab.active = 1;
                if (this.tick % 25 === 0) Sound.play('timeshift');
            } else {
                ab.active = 0;
                ab.energy = Math.min(ab.energy + def.regen, def.max);
            }
        } else { // cooldown abilities
            if (rightPressed && ab.energy >= def.max) {
                ab.energy = 0;
                this.triggerAbility(ship, def);
            } else if (ab.energy < def.max) {
                ab.energy = Math.min(ab.energy + def.regen, def.max);
            }
        }
    },

    triggerAbility(ship, def) {
        const W = CONSTANTS.GAME_WIDTH, H = CONSTANTS.GAME_HEIGHT;

        if (def.key === 'nova') {
            Sound.play('nova');
            FX.addShake(22);
            this.entities.novas.push({ x: ship.x, y: ship.y, r: 20, maxR: Math.max(W, H), life: 45, maxLife: 45, color: def.color });
            this.entities.enemyLasers.length = 0;
            for (let j = this.entities.asteroids.length - 1; j >= 0; j--) this.destroyAsteroid(j);
            for (let j = this.entities.enemies.length - 1; j >= 0; j--) {
                const e = this.entities.enemies[j];
                e.hp -= def.damage;
                e.hitFlash = 8;
                if (e.hp <= 0) this.destroyEnemy(j);
            }
        }

        if (def.key === 'dash') {
            Sound.play('dash');
            const tx = Math.min(Math.max(input.mouseX, ship.r), W - ship.r);
            const ty = Math.min(Math.max(input.mouseY, ship.r), H - ship.r);
            // Damage everything near the dash path
            const x1 = ship.x, y1 = ship.y, ddx = tx - x1, ddy = ty - y1;
            const len2 = ddx * ddx + ddy * ddy || 1;
            const nearPath = (px, py) => {
                const t = Math.max(0, Math.min(1, ((px - x1) * ddx + (py - y1) * ddy) / len2));
                return Math.hypot(px - (x1 + t * ddx), py - (y1 + t * ddy));
            };
            for (let j = this.entities.enemies.length - 1; j >= 0; j--) {
                const e = this.entities.enemies[j];
                if (nearPath(e.x, e.y) < e.r + 35) {
                    e.hp -= def.damage; e.hitFlash = 8;
                    if (e.hp <= 0) this.destroyEnemy(j);
                }
            }
            for (let j = this.entities.asteroids.length - 1; j >= 0; j--) {
                const a = this.entities.asteroids[j];
                if (nearPath(a.x, a.y) < a.r + 35) this.destroyAsteroid(j);
            }
            // Ghost trail
            for (let i = 0; i < 14; i++) {
                const t = i / 14;
                FX.addParticle({ x: x1 + ddx * t, y: y1 + ddy * t, xv: 0, yv: 0, life: 18, maxLife: 18, size: 4, color: def.color });
            }
            ship.x = tx; ship.y = ty;
            ship.spawnGrace = Math.max(ship.spawnGrace, def.graceFrames);
        }

        if (def.key === 'shield') {
            Sound.play('shieldUp');
            ship.buffs.shield = Math.max(ship.buffs.shield, def.duration);
        }

        if (def.key === 'beam') {
            Sound.play('beam');
            ship.beamTime = def.duration;
            FX.addShake(6);
        }
    },

    /** HYPER BEAM: continuous damage in a corridor ahead of the ship. */
    updateBeam(ship) {
        ship.beamTime--;
        const halfWidth = 30;
        const dmg = 0.25;
        for (let j = this.entities.enemies.length - 1; j >= 0; j--) {
            const e = this.entities.enemies[j];
            if (e.x > ship.x && Math.abs(e.y - ship.y) < halfWidth + e.r) {
                e.hp -= dmg; e.hitFlash = 2;
                if (Math.random() < 0.3) FX.createParticles(e.x, e.y, 1, '#ff6655');
                if (e.hp <= 0) this.destroyEnemy(j);
            }
        }
        for (let j = this.entities.asteroids.length - 1; j >= 0; j--) {
            const a = this.entities.asteroids[j];
            if (a.x > ship.x && Math.abs(a.y - ship.y) < halfWidth + a.r) {
                a.hp -= dmg;
                if (a.hp <= 0) this.destroyAsteroid(j);
            }
        }
        for (let j = this.entities.enemyLasers.length - 1; j >= 0; j--) {
            const l = this.entities.enemyLasers[j];
            if (l.x > ship.x && Math.abs(l.y - ship.y) < halfWidth) this.entities.enemyLasers.splice(j, 1);
        }
    },

    // ------------------------------------------------------------------
    // Weapons
    // ------------------------------------------------------------------

    fire(ship) {
        const rapid = ship.buffs.rapid > 0 ? 0.5 : 1;
        ship.laserTimer = ship.shipDef.stats.fireDelay * (1.0 - this.upgrades.fireRate) * rapid;
        ship.muzzleFlash = 4;
        Sound.play(this.upgrades.bulletSize > 0 ? 'shoot_heavy' : 'shoot');

        const dmg = ship.shipDef.stats.damage + (this.upgrades.bulletSize * 0.5);
        const spawnLaser = (angleOffset, isFlak = false) => {
            const angle = ship.a + angleOffset;
            const spd = isFlak ? 11 + Math.random() * 5 : 16;
            const color = this.upgrades.prismatic ? `hsl(${Math.random() * 360}, 100%, 50%)` : '#44ff44';
            this.entities.lasers.push({
                x: ship.x + Math.cos(ship.a) * 20, y: ship.y + Math.sin(ship.a) * 20,
                xv: Math.cos(angle) * spd, yv: Math.sin(angle) * spd,
                dist: 0, life: isFlak ? 20 + Math.random() * 10 : 9999,
                color, isFlak, dmg, hitList: []
            });
        };

        // Base + double shot (parallel lines)
        const dCount = this.upgrades.doubleShot;
        if (dCount === 0) spawnLaser(0);
        else {
            for (let i = -dCount; i <= dCount; i++) {
                if (i === 0 && dCount % 2 !== 0) continue;
                spawnLaser(i * 0.1);
            }
        }

        // Spread shot
        for (let i = 0; i < this.upgrades.spreadShot; i++) {
            spawnLaser(-0.2 - (i * 0.1));
            spawnLaser(0.2 + (i * 0.1));
        }

        // Tail gunner
        for (let i = 0; i < this.upgrades.tailGunner; i++) {
            spawnLaser(Math.PI + (i * 0.1));
            if (i > 0) spawnLaser(Math.PI - (i * 0.1));
        }

        // Flak cannon
        for (let i = 0; i < this.upgrades.flak; i++) {
            spawnLaser((Math.random() - 0.5) * 0.8, true);
            if (i === 0) Sound.play('shoot_flak');
        }
    },

    updateLasers() {
        const lasers = this.entities.lasers;
        for (let i = lasers.length - 1; i >= 0; i--) {
            const l = lasers[i];

            // Phase wobble
            if (this.upgrades.wobbly && !l.isFlak) {
                const perpAngle = Math.atan2(l.yv, l.xv) + Math.PI / 2;
                const wobbleAmt = Math.sin(l.dist * 0.1) * 2;
                l.x += Math.cos(perpAngle) * wobbleAmt;
                l.y += Math.sin(perpAngle) * wobbleAmt;
            }

            // Seeker missiles
            if (this.upgrades.seeker > 0 && !l.isFlak) {
                let nearest = null, minDist = 300;
                this.entities.asteroids.forEach(a => { const d = Math.hypot(a.x - l.x, a.y - l.y); if (d < minDist) { minDist = d; nearest = a; } });
                this.entities.enemies.forEach(e => { const d = Math.hypot(e.x - l.x, e.y - l.y); if (d < minDist) { minDist = d; nearest = e; } });
                if (nearest) {
                    const targetAngle = Math.atan2(nearest.y - l.y, nearest.x - l.x);
                    const currentAngle = Math.atan2(l.yv, l.xv);
                    let angleDiff = targetAngle - currentAngle;
                    while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    const newAngle = currentAngle + (angleDiff * this.upgrades.seeker);
                    const speed = Math.hypot(l.xv, l.yv);
                    l.xv = Math.cos(newAngle) * speed;
                    l.yv = Math.sin(newAngle) * speed;
                }
            }

            l.x += l.xv; l.y += l.yv;
            l.dist += Math.hypot(l.xv, l.yv);

            if (this.upgrades.tracer && Math.random() < 0.5) {
                FX.addParticle({ x: l.x, y: l.y, xv: 0, yv: 0, life: 10, maxLife: 10, size: 2, color: l.color });
            }

            // Bounce off screen edges
            if (this.upgrades.bouncy) {
                if (l.x < 0 || l.x > CONSTANTS.GAME_WIDTH) l.xv *= -1;
                if (l.y < 0 || l.y > CONSTANTS.GAME_HEIGHT) l.yv *= -1;
            }

            const maxDist = (CONSTANTS.GAME_WIDTH * 0.9) * this.upgrades.laserRange;
            if (l.isFlak) l.life--;
            if (l.dist > maxDist || l.life <= 0) lasers.splice(i, 1);
        }
    },

    // ------------------------------------------------------------------
    // Enemies / asteroids / bosses
    // ------------------------------------------------------------------

    updateAsteroids() {
        for (let i = this.entities.asteroids.length - 1; i >= 0; i--) {
            const a = this.entities.asteroids[i];
            a.x += a.xv * this.timeScale; a.y += a.yv * this.timeScale; a.a += a.rot * this.timeScale;
            if (a.hitFlash > 0) a.hitFlash--;
            if (a.x < CONSTANTS.CULL_LEFT || a.y < -400 || a.y > CONSTANTS.GAME_HEIGHT + 400) {
                this.entities.asteroids.splice(i, 1);
            }
        }
    },

    updateEnemies(ship) {
        let bossAlive = null;

        for (let i = this.entities.enemies.length - 1; i >= 0; i--) {
            const e = this.entities.enemies[i];
            if (e.hitFlash > 0) e.hitFlash--;

            if (e.isBoss) {
                bossAlive = e;
                this.updateBoss(e, ship);
                continue;
            }

            this.moveEnemy(e, ship);
            this.enemyShoot(e, ship);

            // Cull once well offscreen left / top / bottom
            if (e.x < CONSTANTS.CULL_LEFT || e.y < -350 || e.y > CONSTANTS.GAME_HEIGHT + 350) {
                this.entities.enemies.splice(i, 1);
            }
        }

        if (bossAlive) {
            UI.showBossHUD(bossAlive.bossName, Math.max(0, bossAlive.hp / bossAlive.maxHp), !!bossAlive.isMiniBoss);
        } else if (Runtime.bossActive) {
            // Boss died this frame (destroyEnemy handles the consequences)
            UI.hideBossHUD();
        }
    },

    moveEnemy(e, ship) {
        const ts = this.timeScale;
        const px = ship && !ship.dead ? ship.x : CONSTANTS.GAME_WIDTH * 0.2;
        const py = ship && !ship.dead ? ship.y : CONSTANTS.GAME_HEIGHT / 2;

        if (e.move === 'sine') {
            e.x -= e.spd * ts;
            e.wavePhase += 0.06 * ts;
            e.y = e.baseY + Math.sin(e.wavePhase) * 70;
            e.angle = Math.PI;
        } else if (e.move === 'dive') {
            e.diveTimer = (e.diveTimer || 0) + ts;
            if (e.diveTimer < 5) { // initial velocity into the screen
                e.xv = -e.spd * 0.4;
                e.yv = e.diveDir * e.spd;
            }
            if (e.diveTimer < 80) { // steer toward the player, then commit
                const want = Math.atan2(py - e.y, px - e.x);
                const cur = Math.atan2(e.yv, e.xv);
                let diff = want - cur;
                while (diff <= -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                const na = cur + diff * 0.08 * ts;
                e.xv = Math.cos(na) * e.spd; e.yv = Math.sin(na) * e.spd;
            }
            e.x += e.xv * ts; e.y += e.yv * ts;
            e.angle = Math.atan2(e.yv, e.xv);
        } else if (e.move === 'hold') {
            if (e.x > e.holdX) e.x -= e.spd * ts;
            else {
                e.x = e.holdX + Math.sin(this.tick * 0.03 + e.wavePhase) * 12;
                const dy = py - e.y;
                e.y += Math.max(-1.2, Math.min(1.2, dy * 0.01)) * ts;
            }
            e.angle = Math.atan2(py - e.y, px - e.x);
        } else { // drift
            e.x -= e.spd * ts;
            const dy = py - e.y;
            e.y += Math.max(-0.8, Math.min(0.8, dy * 0.008)) * e.spd * ts;
            e.angle = Math.PI;
        }
    },

    enemyShoot(e, ship) {
        if (!ship || ship.dead || e.eType === 'swarmer' || e.eType === 'charger') return;
        e.shootTimer -= this.timeScale;
        if (e.shootTimer > 0) return;
        // Don't fire from offscreen
        if (e.x > CONSTANTS.GAME_WIDTH || e.x < 0) { e.shootTimer = 30; return; }

        const angle = Math.atan2(ship.y - e.y, ship.x - e.x);
        const fi = Runtime.difficulty.fireInterval, bs = Runtime.difficulty.bulletSpeed;
        if (e.eType === 'tank') {
            for (let j = -1; j <= 1; j++) {
                const a = angle + j * 0.20;
                this.entities.enemyLasers.push({ x: e.x, y: e.y, xv: Math.cos(a) * 4.5 * bs, yv: Math.sin(a) * 4.5 * bs, r: 6, color: '#ffaa44' });
            }
            e.shootTimer = (140 + Math.random() * 50) * fi;
        } else if (e.eType === 'sniper') {
            this.entities.enemyLasers.push({ x: e.x, y: e.y, xv: Math.cos(angle) * 10.5 * bs, yv: Math.sin(angle) * 10.5 * bs, r: 4, color: '#66ffff' });
            e.shootTimer = (75 + Math.random() * 45) * fi;
        } else {
            const a = angle + (Math.random() - 0.5) * 0.18;
            this.entities.enemyLasers.push({ x: e.x, y: e.y, xv: Math.cos(a) * 5.0 * bs, yv: Math.sin(a) * 5.0 * bs, r: 5, color: '#ff9900', sprite: 'bulletSaucer' });
            e.shootTimer = (110 + Math.random() * 60) * fi;
        }
        Sound.play('enemyShoot');
    },

    /** Boss AI: entry, vertical patrol, and phase-based attack patterns. */
    updateBoss(e, ship) {
        const ts = this.timeScale;
        const W = CONSTANTS.GAME_WIDTH, H = CONSTANTS.GAME_HEIGHT;
        const hpFrac = e.hp / e.maxHp;
        const stage = hpFrac > 0.66 ? 1 : hpFrac > 0.33 ? 2 : 3;
        const anchorX = W * (e.isMiniBoss ? 0.82 : 0.78);

        // Entry from the right, then patrol
        if (!e.arrived) {
            e.x -= e.spd * 2 * ts;
            if (e.x <= anchorX) { e.arrived = true; e.baseY = H / 2; }
            return;
        }

        // SUPER MOTHERSHIP shield: the ring spins (faster when pressed), and a
        // stream of bolts pours out through the opening — a rotating lighthouse
        // beam. The gap is the only way to hurt it, and the riskiest place to be.
        if (e.shield) {
            const sp = e.shield;
            if (sp.active) {
                sp.angle += sp.spin * (stage >= 2 ? 1.5 : 1) * ts;
                if (this.tick % 12 === 0 && ship && !ship.dead) {
                    const bs = Runtime.difficulty.bulletSpeed;
                    const a = sp.angle + (Math.random() - 0.5) * 0.1;
                    this.entities.enemyLasers.push({
                        x: e.x + Math.cos(sp.angle) * sp.r, y: e.y + Math.sin(sp.angle) * sp.r,
                        xv: Math.cos(a) * 4.5 * bs, yv: Math.sin(a) * 4.5 * bs,
                        r: 5, color: '#88ddff'
                    });
                }
                if (hpFrac <= 0.5) {
                    // SHIELD DOWN — shatter with drama, then the gloves come off
                    sp.active = false;
                    FX.spawnSpriteExplosion(e.x, e.y, sp.r * 2.4);
                    FX.spawnShockwave(e.x, e.y, sp.r * 1.8, '#88ddff');
                    FX.createParticles(e.x, e.y, 70, '#88ddff');
                    FX.addShake(22);
                    FX.spawnFloatText(e.x, e.y - sp.r - 20, 'SHIELD DOWN!', '#88ddff');
                    Sound.play('nova');
                }
            }
        }

        // Vertical bob (faster when enraged) + occasional lunge toward the player
        e.phase += (stage === 3 ? 0.022 : 0.012) * ts;
        e.y = e.baseY + Math.sin(e.phase) * H * 0.28;

        if (stage === 3 && !e.isMiniBoss) {
            if (e.lungeTimer <= 0 && Math.random() < 0.004) {
                e.lungeTimer = 120; // dash left across the screen and back
                e.lungeX = e.x;
            }
            if (e.lungeTimer > 0) {
                e.lungeTimer -= ts;
                const t = e.lungeTimer / 120;
                e.x = anchorX - Math.sin((1 - t) * Math.PI) * W * 0.45;
            } else {
                e.x = anchorX;
            }
        } else {
            e.x = anchorX;
        }

        if (!ship || ship.dead) return;
        const aimAngle = Math.atan2(ship.y - e.y, ship.x - e.x);

        // Attack patterns
        e.attackTimer -= ts;
        if (e.attackTimer <= 0) {
            e.altFire = !e.altFire;
            const fi = Runtime.difficulty.fireInterval;
            const spd = (4 + this.level * 0.3) * Runtime.difficulty.bulletSpeed;
            if (e.isMiniBoss) {
                if (e.altFire) this.bossSpread(e, aimAngle, 3, 0.25, spd);
                else this.bossRadial(e, 8, spd * 0.8);
                e.attackTimer = (90 - stage * 10) * fi;
            } else if (stage === 1) {
                if (e.altFire) this.bossSpread(e, aimAngle, 3, 0.22, spd);
                else this.bossRadial(e, 10, spd * 0.75);
                e.attackTimer = 95 * fi;
            } else if (stage === 2) {
                if (e.altFire) this.bossSpread(e, aimAngle, 5, 0.18, spd);
                else this.bossRadial(e, 14, spd * 0.8);
                e.attackTimer = 75 * fi;
            } else {
                // Enraged: begin a spiral barrage
                e.spiralTicks = 110;
                e.attackTimer = 190 * fi;
            }
            Sound.play('enemyShoot');
        }

        // Spiral barrage emitter (phase 3)
        if (e.spiralTicks > 0) {
            e.spiralTicks -= ts;
            e.spiralAngle += 0.33 * ts;
            if (this.tick % 5 === 0) {
                const spd = (3.5 + this.level * 0.2) * Runtime.difficulty.bulletSpeed;
                for (let k = 0; k < 2; k++) {
                    const a = e.spiralAngle + k * Math.PI;
                    this.entities.enemyLasers.push({ x: e.x, y: e.y, xv: Math.cos(a) * spd, yv: Math.sin(a) * spd, r: 6, color: '#cc44ff' });
                }
            }
        }

        // Swarmer summons (mothership, stage 2+)
        if (!e.isMiniBoss && stage >= 2) {
            e.summonTimer -= ts;
            if (e.summonTimer <= 0 && this.entities.enemies.length < 14) {
                e.summonTimer = 420;
                for (let k = 0; k < 3; k++) {
                    this.trackSpawn(buildEnemy('swarmer', e.x - 40, e.y + (k - 1) * 50, this.level, { wavePhase: k * 0.7 }));
                }
                FX.createParticles(e.x - 40, e.y, 16, '#ffff00');
            }
        }
    },

    bossSpread(e, aimAngle, count, spread, spd) {
        const half = Math.floor(count / 2);
        for (let j = -half; j <= half; j++) {
            const a = aimAngle + j * spread;
            this.entities.enemyLasers.push({ x: e.x - e.r * 0.5, y: e.y, xv: Math.cos(a) * spd, yv: Math.sin(a) * spd, r: 7, color: '#ff6688' });
        }
    },

    bossRadial(e, count, spd) {
        const offset = Math.random() * Math.PI * 2;
        for (let j = 0; j < count; j++) {
            const a = offset + (j / count) * Math.PI * 2;
            this.entities.enemyLasers.push({ x: e.x, y: e.y, xv: Math.cos(a) * spd, yv: Math.sin(a) * spd, r: 6, color: '#cc66ff' });
        }
    },

    updateEnemyLasers() {
        const list = this.entities.enemyLasers;
        const W = CONSTANTS.GAME_WIDTH, H = CONSTANTS.GAME_HEIGHT;
        for (let i = list.length - 1; i >= 0; i--) {
            const l = list[i];
            l.x += l.xv * this.timeScale; l.y += l.yv * this.timeScale;
            if (l.x < -100 || l.x > W + 150 || l.y < -100 || l.y > H + 100) list.splice(i, 1);
        }
    },

    updateOrbitals(ship) {
        this.entities.orbitals.forEach(o => {
            if (ship && !ship.dead) {
                o.angle += o.speed * this.timeScale;
                o.x = ship.x + Math.cos(o.angle) * o.dist;
                o.y = ship.y + Math.sin(o.angle) * o.dist;
                if (Math.random() < 0.3) FX.createParticles(o.x, o.y, 1, '#ccff00');
            }
        });
    },

    updateExplosions() {
        for (let i = this.entities.explosions.length - 1; i >= 0; i--) {
            const ex = this.entities.explosions[i];
            // Grow to maxR over the blast's 15-frame life. (Previously a flat
            // +5/frame, which ignored maxR — extra HIGH EXPLOSIVE picks did nothing.)
            ex.r = Math.min(ex.maxR, ex.r + ex.maxR / 15); ex.life--;
            for (let j = this.entities.asteroids.length - 1; j >= 0; j--) {
                const a = this.entities.asteroids[j];
                if (Math.hypot(a.x - ex.x, a.y - ex.y) < ex.r + a.r) this.destroyAsteroid(j);
            }
            for (let j = this.entities.enemies.length - 1; j >= 0; j--) {
                const e = this.entities.enemies[j];
                if (Math.hypot(e.x - ex.x, e.y - ex.y) < ex.r + e.r) {
                    e.hp -= 2 * this.timeScale;
                    if (e.hp <= 0) this.destroyEnemy(j);
                }
            }
            if (ex.life <= 0) this.entities.explosions.splice(i, 1);
        }
    },

    updateNovas() {
        for (let i = this.entities.novas.length - 1; i >= 0; i--) {
            const n = this.entities.novas[i];
            n.r += (n.maxR - n.r) * 0.12;
            n.life--;
            if (n.life <= 0) this.entities.novas.splice(i, 1);
        }
    },

    updatePowerups(ship) {
        for (let i = this.entities.powerups.length - 1; i >= 0; i--) {
            const p = this.entities.powerups[i];
            p.phase += 0.08;
            p.x += p.xv * this.timeScale;
            p.y += Math.sin(p.phase) * 0.5;
            p.life--;

            if (ship && !ship.dead && Math.hypot(ship.x - p.x, ship.y - p.y) < ship.r + p.r + 6) {
                this.applyPowerup(ship, p.type);
                this.entities.powerups.splice(i, 1);
                continue;
            }
            if (p.life <= 0 || p.x < CONSTANTS.CULL_LEFT) this.entities.powerups.splice(i, 1);
        }
    },

    applyPowerup(ship, type) {
        Sound.play('powerup');
        const labels = {
            weapon: ['RAPID FIRE!', '#ffcc00'],
            shield: ['SHIELD!', '#44aaff'],
            speed:  ['SPEED BOOST!', '#66ffcc'],
            health: ['+1 LIFE!', '#ff5555']
        };
        const [text, color] = labels[type];
        FX.spawnFloatText(ship.x, ship.y - 30, text, color);
        if (type === 'weapon') ship.buffs.rapid = CONSTANTS.POWERUP_DURATION;
        if (type === 'speed')  ship.buffs.speed = CONSTANTS.POWERUP_DURATION;
        if (type === 'shield') ship.buffs.shield = Math.max(ship.buffs.shield, 300);
        if (type === 'health') this.lives++;
    },

    updateXPOrbs(ship) {
        for (let i = this.entities.xpOrbs.length - 1; i >= 0; i--) {
            const xp = this.entities.xpOrbs[i];
            xp.x += xp.xv; xp.y += xp.yv; xp.life--;
            if (ship && !ship.dead) {
                const d = Math.hypot(ship.x - xp.x, ship.y - xp.y);
                if (d < 150) { xp.xv += (ship.x - xp.x) * 0.05; xp.yv += (ship.y - xp.y) * 0.05; }
                if (d < ship.r + 10) {
                    this.xp += 10;
                    Sound.play('pickup');
                    this.entities.xpOrbs.splice(i, 1);
                    continue;
                }
            }
            if (xp.life <= 0) this.entities.xpOrbs.splice(i, 1);
        }
    },

    /** XP threshold reached → roguelite upgrade choice (pauses the action). */
    checkLevelUp() {
        if (this.xp >= this.xpNeeded && Runtime.state === STATE.PLAYING) {
            this.xp -= this.xpNeeded;
            this.xpNeeded = Math.floor(this.xpNeeded * 1.4);
            UI.showLevelUp();
        }
    },

    handleDeath(ship) {
        if (ship && ship.explodeTime > 0) {
            ship.explodeTime--;
            if (ship.explodeTime === 0) {
                this.lives--;
                this.levelStats.deaths++;
                if (this.lives <= 0) {
                    Sound.stopBGM();
                    const hi = store.get('hiscore', 0);
                    if (this.score > hi) { store.set('hiscore', this.score); this.newRecord = true; }
                    else this.newRecord = false;
                    // Post the run to the subreddit leaderboard (no-op offline).
                    void Cloud.submitScore(this.score, Runtime.difficulty.id);
                    UI.showGameOver();
                } else {
                    const respawn = createShip(ship.shipDef);
                    // Keep ability charge so death doesn't also reset the special
                    respawn.ability.energy = ship.ability.energy;
                    this.entities.ship = respawn;
                }
            }
        }
    },

    // ------------------------------------------------------------------
    // Collisions
    // ------------------------------------------------------------------

    checkCollisions() {
        const ship = this.entities.ship;
        const lasers = this.entities.lasers;

        // Player lasers vs everything
        for (let i = lasers.length - 1; i >= 0; i--) {
            const l = lasers[i];
            let hit = false;
            const hitRadiusBonus = this.upgrades.bulletSize * 2;
            const dmg = l.dmg || 1;

            // Vs asteroids (piercing lasers track hit entities by reference so
            // splices elsewhere in the array can't confuse the bookkeeping)
            for (let j = this.entities.asteroids.length - 1; j >= 0; j--) {
                const a = this.entities.asteroids[j];
                if (l.hitList.includes(a)) continue;
                if (Math.hypot(l.x - a.x, l.y - a.y) < a.r + hitRadiusBonus) {
                    a.hp -= dmg;
                    a.hitFlash = 4;
                    this.triggerExplosion(l.x, l.y);
                    if (a.hp <= 0) this.destroyAsteroid(j);
                    else FX.createParticles(a.x, a.y, 5, '#fff');
                    if (this.upgrades.sniper) l.hitList.push(a);
                    else { lasers.splice(i, 1); hit = true; }
                    break;
                }
            }
            if (hit) continue;

            // Vs enemies
            for (let j = this.entities.enemies.length - 1; j >= 0; j--) {
                const e = this.entities.enemies[j];
                if (l.hitList.includes(e)) continue;

                // Super boss spinning shield: absorb shots that hit the ring
                // anywhere but the opening (the opening tracks the art via
                // Sprites.ringGap, so what you see is exactly what you get).
                if (e.shield && e.shield.active) {
                    const d = Math.hypot(l.x - e.x, l.y - e.y);
                    const band = 22 + hitRadiusBonus;
                    if (Math.abs(d - e.shield.r) < band) {
                        const gap = Sprites.ringGap('superShield');
                        let diff = Math.atan2(l.y - e.y, l.x - e.x) - e.shield.angle;
                        while (diff <= -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        if (Math.abs(diff) > gap.half * 0.9) {
                            FX.createParticles(l.x, l.y, 6, '#88ddff');
                            FX.spawnShockwave(l.x, l.y, 22, '#88ddff');
                            Sound.play('ding');
                            lasers.splice(i, 1);
                            hit = true;
                            break;
                        }
                    }
                }

                if (Math.hypot(l.x - e.x, l.y - e.y) < e.r + 5 + hitRadiusBonus) {
                    e.hp -= dmg;
                    e.hitFlash = 4;
                    this.triggerExplosion(l.x, l.y);
                    if (e.hp <= 0) this.destroyEnemy(j);
                    else FX.createParticles(e.x, e.y, 5, e.color);
                    if (this.upgrades.sniper) l.hitList.push(e);
                    else { lasers.splice(i, 1); hit = true; }
                    break;
                }
            }
            if (hit) continue;

            // Vs enemy lasers
            for (let j = this.entities.enemyLasers.length - 1; j >= 0; j--) {
                const el = this.entities.enemyLasers[j];
                if (Math.hypot(l.x - el.x, l.y - el.y) < 10 + hitRadiusBonus) {
                    this.triggerExplosion(l.x, l.y);
                    this.entities.enemyLasers.splice(j, 1);
                    if (!this.upgrades.sniper) { lasers.splice(i, 1); hit = true; }
                    FX.createParticles(l.x, l.y, 5, '#fff');
                    break;
                }
            }
        }

        // Orbital collisions
        this.entities.orbitals.forEach(o => {
            for (let j = this.entities.asteroids.length - 1; j >= 0; j--) {
                const a = this.entities.asteroids[j];
                if (Math.hypot(o.x - a.x, o.y - a.y) < a.r + o.size) this.destroyAsteroid(j);
            }
            for (let j = this.entities.enemies.length - 1; j >= 0; j--) {
                const e = this.entities.enemies[j];
                if (Math.hypot(o.x - e.x, o.y - e.y) < e.r + o.size) {
                    e.hp -= 0.5 * this.timeScale;
                    e.hitFlash = 3;
                    if (e.hp <= 0) this.destroyEnemy(j);
                }
            }
        });

        if (!ship || ship.dead || ship.explodeTime) return;

        // AEGIS SHIELD (or shield powerup): invulnerable + ramming damage
        if (ship.buffs.shield > 0) {
            for (let j = this.entities.asteroids.length - 1; j >= 0; j--) {
                const a = this.entities.asteroids[j];
                if (Math.hypot(ship.x - a.x, ship.y - a.y) < ship.r + a.r + 12) this.destroyAsteroid(j);
            }
            for (let j = this.entities.enemies.length - 1; j >= 0; j--) {
                const e = this.entities.enemies[j];
                if (Math.hypot(ship.x - e.x, ship.y - e.y) < ship.r + e.r + 12) {
                    e.hp -= 0.4; e.hitFlash = 3;
                    if (e.hp <= 0) this.destroyEnemy(j);
                }
            }
            for (let j = this.entities.enemyLasers.length - 1; j >= 0; j--) {
                const l = this.entities.enemyLasers[j];
                if (Math.hypot(ship.x - l.x, ship.y - l.y) < ship.r + 14) this.entities.enemyLasers.splice(j, 1);
            }
            return;
        }

        // Ship hitbox (spawnGrace = brief invulnerability after respawn/dash)
        if (ship.spawnGrace <= 0) {
            this.entities.asteroids.forEach(a => { if (Math.hypot(ship.x - a.x, ship.y - a.y) < ship.r + a.r) this.killShip(); });
            this.entities.enemies.forEach(e => { if (Math.hypot(ship.x - e.x, ship.y - e.y) < ship.r + e.r) this.killShip(); });
            for (let i = 0; i < this.entities.enemyLasers.length; i++) {
                const l = this.entities.enemyLasers[i];
                if (Math.hypot(ship.x - l.x, ship.y - l.y) < ship.r) { this.killShip(); this.entities.enemyLasers.splice(i, 1); break; }
            }
        }
    },

    // ------------------------------------------------------------------
    // Destruction + level completion
    // ------------------------------------------------------------------

    destroyAsteroid(idx) {
        const a = this.entities.asteroids[idx];
        this.entities.asteroids.splice(idx, 1);
        const mult = this.bumpCombo();
        const pts = Math.round(100 * mult * this.scoreFactor());
        FX.createParticles(a.x, a.y, 18, '#aaa');
        FX.spawnSpriteExplosion(a.x, a.y, a.r * 4.5);
        FX.spawnShockwave(a.x, a.y, a.r * 2.2, '#cccccc');
        FX.addShake(Math.min(a.r * 0.14, 6));
        FX.spawnFloatText(a.x, a.y, '+' + pts + (mult > 1 ? ' x' + mult : ''), mult > 1 ? '#ffcc00' : '#ffffff');
        Sound.play('explode');
        this.score += pts;
        this.dropXP(a.x, a.y, a.r > 30 ? 3 : 1);
        if (a.r > 25) {
            this.entities.asteroids.push(buildAsteroid(a.x, a.y, a.r / 2, this.level));
            this.entities.asteroids.push(buildAsteroid(a.x, a.y, a.r / 2, this.level));
        }
    },

    destroyEnemy(idx) {
        const e = this.entities.enemies[idx];
        this.entities.enemies.splice(idx, 1);
        const mult = this.bumpCombo();
        const pts = Math.round(e.score * mult * this.scoreFactor());
        FX.createParticles(e.x, e.y, e.isBoss ? 60 : 24, e.color || '#ff0000');
        FX.spawnSpriteExplosion(e.x, e.y, e.isBoss ? (e.isFinale ? 480 : 320) : e.eType === 'tank' ? 130 : 90);
        FX.spawnShockwave(e.x, e.y, e.r * 2.8, e.color || '#ff4444');
        FX.addShake(e.isBoss ? 24 : (e.eType === 'tank' ? 12 : 5));
        FX.spawnFloatText(e.x, e.y, '+' + pts + (mult > 1 ? ' x' + mult : ''), mult > 1 ? '#ffcc00' : (e.color || '#ffaa00'));
        Sound.play('explode');
        this.score += pts;

        if (e.isBoss) {
            this.onBossDefeated(e);
            return;
        }

        this.levelStats.kills++;
        this.dropXP(e.x, e.y, e.eType === 'tank' ? 8 : 4);
        this.maybeDropPowerup(e.x, e.y);
    },

    onBossDefeated(e) {
        Runtime.bossActive = false;
        UI.hideBossHUD();
        this.dropXP(e.x, e.y, e.isMiniBoss ? 20 : 40);

        if (e.isMiniBoss) {
            // Dreadnought down — guaranteed powerups, the run resumes
            this.entities.powerups.push(buildPowerup(e.x, e.y - 30, rollPowerupType()));
            this.entities.powerups.push(buildPowerup(e.x, e.y + 30, rollPowerupType()));
            return;
        }

        // Mothership (or the Overmind) down — level complete!
        this.completeLevel();
    },

    /** Shared end-of-node path: boss kills and patrol-node clean getaways. */
    completeLevel() {
        Sound.stopBGM();
        Runtime.state = STATE.LEVEL_COMPLETE;
        this.entities.enemyLasers.length = 0;
        const results = this.buildLevelResults();
        const hi = store.get('hiscore', 0);
        if (this.score > hi) { store.set('hiscore', this.score); results.newRecord = true; }
        // Score carries across nodes within a run, so every clear is a valid
        // leaderboard checkpoint — the server only keeps the player's best.
        void Cloud.submitScore(this.score, Runtime.difficulty.id);
        UI.showLevelComplete(results);
    },

    /** Tally + letter grade for the level-complete screen. */
    buildLevelResults() {
        const s = this.levelStats;
        const ratio = s.spawned > 0 ? s.kills / s.spawned : 1;
        const perf = ratio - s.deaths * 0.2;

        let grade;
        if (s.deaths === 0 && ratio >= CONSTANTS.GRADE_A) grade = 'A';
        else if (perf >= CONSTANTS.GRADE_B) grade = 'B';
        else if (perf >= CONSTANTS.GRADE_C) grade = 'C';
        else grade = 'D';
        if (s.deaths === 0 && grade === 'D') grade = 'C'; // surviving untouched is never a D

        const killBonus = Math.round(s.kills * 50 * this.scoreFactor());
        const perfectBonus = s.deaths === 0 ? Math.round(1000 * this.level * this.scoreFactor()) : 0;
        this.score += killBonus + perfectBonus;

        return {
            level: this.level,
            node: this.currentNode,
            kills: s.kills, spawned: s.spawned, deaths: s.deaths,
            killBonus, perfectBonus, grade,
            totalScore: this.score
        };
    },

    killShip() {
        if (this.debug.god) return; // god mode: shrug it off, no FX
        const ship = this.entities.ship;
        ship.explodeTime = 30;
        ship.beamTime = 0;
        if (this.combo.count >= 5) FX.spawnFloatText(ship.x, ship.y - 45, 'CHAIN BROKEN', '#ff8888');
        this.combo.count = 0; this.combo.timer = 0;
        FX.createParticles(ship.x, ship.y, 50, '#44ff44');
        FX.spawnShockwave(ship.x, ship.y, 120, '#44ff44');
        FX.addShake(18);
        Sound.play('explode');
    }
};
