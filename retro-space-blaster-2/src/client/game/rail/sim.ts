/**
 * Headless rail-shooter simulation. No canvas, no DOM.
 *
 * The ship sits at depth 0 and moves on a 2D playfield. Everything hostile
 * is born near the horizon and drifts toward the camera. Two rules keep the
 * camera honest:
 *   1. Cross the cull line and you are removed. You are not stored "behind" the ship.
 *   2. Cross the no-fire line and your trigger locks. A telegraph that finishes
 *      past that line is swallowed.
 *
 * Analogy: a car wash. Vehicles roll toward the exit. Once they pass the
 * "last chance to spray" sign they just roll out — they don't turn around
 * and hose the driver.
 */

import {
  ARCHETYPES,
  buildVolley,
  getLevel,
  safeLane,
  type BossDef,
  type EnemyKind,
  type LevelDef,
  type PatternName,
  type ScriptEntry,
  type ShotDot,
} from './content.ts';
import type { Threat } from './dodge.ts';
import { getShip, type ShipDef } from './ships.ts';
import { assistOrigin, gunOffsets } from './reticle.ts';
import {
  DIFFICULTIES,
  EMPTY_UPGRADES,
  TUNE,
  type Difficulty,
  type DifficultyId,
  type Upgrades,
} from './tune.ts';

export type Input = {
  ax: number;
  ay: number;
  useAim: boolean;
  aimX: number;
  aimY: number;
  fire: boolean;
  special: boolean;
  /** Set by the input layer. Undefined means "chase if useAim, otherwise keys". */
  feel?: 'keys' | 'mouse' | 'chase';
  /** Rising edge. -1 left, 1 right, 0 or absent means no roll this frame. */
  roll?: -1 | 0 | 1;
};

export const IDLE: Input = {
  ax: 0,
  ay: 0,
  useAim: false,
  aimX: 0,
  aimY: 0,
  fire: false,
  special: false,
};

export type Bullet = {
  x: number;
  y: number;
  z: number;
  vz: number;
  r: number;
  damage: number;
  bornZ: number;
  friendly: boolean;
  /** A barrel roll already cashed this bullet in as a perfect dodge. */
  grazed: boolean;
};

export type Enemy = {
  id: number;
  kind: EnemyKind;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  r: number;
  vz: number;
  hold: number;
  score: number;
  fireEvery: number;
  pattern: PatternName;
  splits: boolean;
  child: boolean;
  boss: boolean;
  accent: string;
  alive: boolean;
  fireCd: number;
  windup: number;
  pending: ShotDot[];
  mode: 'cruise' | 'windup' | 'dive';
  lockX: number;
  lockY: number;
  phase: number;
  phases: [PatternName, PatternName, PatternName] | null;
  summon: EnemyKind | null;
  seed: number;
  /** Where the swoop-in is headed. x starts off to the side. */
  homeX: number;
  intro: number;
  blink: number;
  blinkTo: number;
  blinkCd: number;
  /** Bubble painted on by a living generator. Shots pop this before the hull. */
  bubble: number;
  /** Frames of the elite's reflect shield. The shot leaves on the last frame. */
  reflectT: number;
  flash: number;
  /** Sprite family. Bosses use the route id so the queen isn't just a big elite. */
  art: string;
};

export type Pickup = {
  kind: 'repair' | 'rapid' | 'spread' | 'cell';
  x: number;
  y: number;
  z: number;
  alive: boolean;
};

export type Earned = { kills: number; boss: number; pickups: number; clear: number };

export type Floater = { x: number; y: number; z: number; text: string; life: number };

export type Pilot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lives: number;
  iframe: number;
  fireCd: number;
  rollT: number;
  rollDir: -1 | 0 | 1;
  rollCd: number;
};

export type RunMode = 'waves' | 'boss' | 'clear' | 'dead';

export type Run = {
  level: LevelDef;
  diff: Difficulty;
  ship: ShipDef;
  upgrades: Upgrades;
  frame: number;
  mode: RunMode;
  player: Pilot;
  hitStop: number;
  shake: number;
  perfect: number;
  floaters: Floater[];
  did: { move: boolean; fire: boolean; roll: boolean; special: boolean };
  /** Who the guns are resting on, and how full the lock ring is (0..1). */
  lockId: number;
  lock: number;
  aimAssist: boolean;
  pings: { x: number; y: number; z: number; kind: 'hit' | 'kill'; life: number }[];
  corpses: {
    art: string;
    kind: string;
    boss: boolean;
    x: number;
    y: number;
    z: number;
    life: number;
    max: number;
  }[];
  /** White punch on a big kill. Counts down in frames. */
  boom: number;
  /** Red vignette after the player is tagged. */
  hurtT: number;
  combo: number;
  comboT: number;
  lockSung: boolean;
  energy: number;
  slow: number;
  shield: number;
  beam: number;
  specialHeld: boolean;
  buff: { rapid: number; spread: number };
  enemies: Enemy[];
  eShots: Bullet[];
  pShots: Bullet[];
  pickups: Pickup[];
  score: number;
  hits: number;
  earned: Earned;
  banner: string;
  bannerT: number;
  muzzle: number;
  god: boolean;
  invincible: boolean;
  threats: Threat[][];
  record: boolean;
  /** Patterned volleys wait their turn so two walls can't seal each other's hole. */
  salvoUntil: number;
  sfx: (name: string) => void;
  rng: () => number;
  nextId: number;
  queue: { t: number; entry: ScriptEntry; done: boolean }[];
};

export type RunOpts = {
  levelId?: string;
  difficulty?: DifficultyId;
  shipIdx?: number;
  seed?: number;
  boss?: boolean;
  invincible?: boolean;
  record?: boolean;
  upgrades?: Upgrades;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function playerSpeed(state: Run): number {
  return TUNE.BASE_SPEED * state.ship.speed;
}

function award(state: Run, bucket: keyof Earned, base: number): void {
  const points = Math.round(base * state.diff.scoreMult);
  state.earned[bucket] += points;
  state.score += points;
}

function spawnEnemy(
  state: Run,
  kind: EnemyKind,
  x: number,
  y: number,
  z: number,
  child: boolean
): Enemy {
  const arch = ARCHETYPES[kind];
  const hp = Math.max(1, Math.round(arch.hp * state.diff.enemyHp * (child ? 0.7 : 1)));
  const enemy: Enemy = {
    id: state.nextId++,
    kind,
    name: kind.toUpperCase(),
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    hp,
    maxHp: hp,
    shield: arch.shield,
    maxShield: arch.shield,
    r: arch.r,
    vz: arch.vz,
    hold: arch.hold,
    score: arch.score,
    fireEvery: arch.fireEvery,
    pattern: arch.pattern,
    splits: arch.splits && !child,
    child,
    boss: false,
    accent: '#ffffff',
    alive: true,
    fireCd: 28 + Math.floor(state.rng() * 36),
    windup: 0,
    pending: [],
    mode: 'cruise',
    lockX: x,
    lockY: y,
    phase: 0,
    phases: null,
    summon: null,
    seed: Math.floor(state.rng() * 100),
    homeX: x,
    intro: child ? 0 : 14,
    blink: 0,
    blinkTo: x,
    blinkCd: 80,
    bubble: 0,
    reflectT: 0,
    flash: 0,
    art: kind,
  };
  // Start off to one side and slide onto the lane, so they don't pop in.
  if (!child) enemy.x = clamp(x + (x >= 0 ? 36 : -36), -TUNE.PLAY_X - 20, TUNE.PLAY_X + 20);
  state.enemies.push(enemy);
  return enemy;
}

function living(state: Run): number {
  // Mines drift through and leave. They shouldn't hold up the next wave
  // the way a traffic cone shouldn't close the highway.
  let count = 0;
  for (const enemy of state.enemies) if (enemy.alive && enemy.kind !== 'mine') count += 1;
  return count;
}

/** Middle 60% of the roll. The wind-up and the landing can still be tagged. */
export function rollInvuln(pilot: Pilot): boolean {
  if (pilot.rollT <= 0) return false;
  const elapsed = TUNE.ROLL_FRAMES - pilot.rollT;
  return elapsed >= TUNE.ROLL_FRAMES * 0.2 && elapsed < TUNE.ROLL_FRAMES * 0.8;
}

function hurt(state: Run): void {
  if (state.god || state.invincible || state.player.iframe > 0 || state.shield > 0) return;
  if (rollInvuln(state.player)) return;
  state.player.lives -= 1;
  state.player.iframe = TUNE.IFRAME;
  state.hurtT = 16;
  state.hits += 1;
  state.shake = Math.max(state.shake, 7);
  state.sfx('playerHurt');
  if (state.player.lives === 1) state.sfx('lowHull');
  if (state.player.lives <= 0) {
    state.mode = 'dead';
    state.sfx('gameover');
  }
}

function perfectDodge(state: Run): void {
  state.perfect = 12;
  state.shake = Math.max(state.shake, 4);
  const refund = state.ship.ability.max * 0.12;
  state.energy = Math.min(state.ship.ability.max, state.energy + refund);
  state.sfx('perfect');
  pushFloater(state, state.player.x, state.player.y, 40, 'DODGE');
}

function pushFloater(state: Run, x: number, y: number, z: number, text: string): void {
  state.floaters.push({ x, y, z, text, life: 28 });
  if (state.floaters.length > 14) state.floaters.shift();
}

function killEnemy(state: Run, enemy: Enemy): void {
  if (!enemy.alive) return;
  enemy.alive = false;
  enemy.pending = [];
  const dying = enemy.boss ? 48 : 28;
  state.corpses.push({
    art: enemy.art,
    kind: enemy.kind,
    boss: enemy.boss,
    x: enemy.x,
    y: enemy.y,
    z: enemy.z,
    life: dying,
    max: dying,
  });
  state.pings.push({ x: enemy.x, y: enemy.y, z: enemy.z, kind: 'kill', life: 16 });
  state.boom = Math.max(
    state.boom,
    enemy.boss ? 10 : enemy.kind === 'tank' || enemy.kind === 'elite' ? 5 : 3
  );
  if (state.comboT > 0) state.combo += 1;
  else state.combo = 1;
  state.comboT = 70;
  if (state.combo > 1) {
    pushFloater(state, enemy.x, enemy.y - 8, enemy.z, `x${state.combo}`);
  }
  award(state, enemy.boss ? 'boss' : 'kills', enemy.score);
  state.sfx(
    enemy.boss
      ? 'bossExplode'
      : enemy.kind === 'mine' || enemy.kind === 'kamikaze'
        ? 'explodeBig'
        : 'explode'
  );
  if (enemy.splits) {
    // Children pop farther from the camera than the parent, so a death on
    // the cull line can't drop a new fighter into the lens.
    const z = clamp(enemy.z + 40, TUNE.Z_CULL + 20, TUNE.Z_SPAWN);
    spawnEnemy(state, 'swarmer', enemy.x - 22, enemy.y, z, true);
    spawnEnemy(state, 'swarmer', enemy.x + 22, enemy.y, z, true);
  }
  if (!enemy.child && !enemy.boss && enemy.kind !== 'mine' && state.rng() < 0.18) {
    const kinds = ['repair', 'rapid', 'spread', 'cell'] as const;
    const roll = kinds[Math.floor(state.rng() * kinds.length)] ?? 'cell';
    state.pickups.push({ kind: roll, x: enemy.x, y: enemy.y, z: enemy.z, alive: true });
  }
}

function damageEnemy(state: Run, enemy: Enemy, amount: number, shotX = enemy.x): void {
  if (!enemy.alive || amount <= 0) return;
  enemy.flash = 6;
  // A generator's bubble pops before the hull. The dish itself has no bubble.
  if (enemy.bubble > 0) {
    enemy.bubble -= amount;
    state.sfx('shieldHit');
    if (enemy.bubble <= 0) {
      // Negative means "popped". A living dish does not repaint it.
      enemy.bubble = -1;
      pushFloater(state, enemy.x, enemy.y, enemy.z, 'POP');
      state.sfx('shieldPop');
    }
    return;
  }
  // Tank plate only covers the nose. A shot from off to the side, the place
  // a roll puts you, goes into the hull. Breaking the plate still works too.
  const flanking = enemy.kind === 'tank' && Math.abs(shotX - enemy.x) > 26;
  if (enemy.shield > 0 && !flanking) {
    enemy.shield -= amount;
    state.sfx('shieldHit');
    pushFloater(state, enemy.x, enemy.y, enemy.z, 'SHIELD');
    if (enemy.shield > 0) return;
    amount = -enemy.shield;
    enemy.shield = 0;
    if (amount <= 0) return;
  }
  enemy.hp -= amount;
  pushFloater(state, enemy.x, enemy.y, enemy.z, String(Math.max(1, Math.round(amount))));
  state.pings.push({ x: enemy.x, y: enemy.y, z: enemy.z, kind: 'hit', life: 8 });
  if (enemy.hp > 0) state.sfx('hit');
  if (enemy.boss && state.hitStop === 0) {
    // One frame of hold on a boss hit. Chaining it on every bolt would turn
    // the fight into slow motion, which is the chrono field's job.
    state.hitStop = 1;
    state.shake = Math.max(state.shake, 5);
  }
  if (enemy.hp <= 0) {
    state.hitStop = Math.max(state.hitStop, enemy.boss ? 4 : 2);
    state.shake = Math.max(state.shake, enemy.boss ? 9 : 5);
    killEnemy(state, enemy);
  }
}

function release(state: Run, enemy: Enemy): void {
  const pending = enemy.pending;
  enemy.pending = [];
  enemy.windup = 0;
  // The wind-up finished after the shooter crossed the line. Swallow it.
  // Like a pitcher who steps over the rubber: the ball stays in the hand.
  if (enemy.z < TUNE.Z_NO_FIRE) return;
  if (enemy.pattern === 'mine') {
    const z = Math.max(TUNE.Z_NO_FIRE, enemy.z - 6);
    spawnEnemy(state, 'mine', enemy.x, enemy.y, z, true);
    state.sfx('enemyShoot');
    return;
  }
  if (pending.length === 0) return;
  if (state.eShots.length + pending.length > state.diff.shotCap) return;
  const vz = -3.35 * state.diff.bulletSpeed;
  for (const dot of pending) {
    if (Math.abs(dot.x) > TUNE.PLAY_X + 2 || Math.abs(dot.y) > TUNE.PLAY_Y + 2) continue;
    state.eShots.push({
      x: dot.x,
      y: dot.y,
      z: enemy.z,
      vz,
      r: dot.r,
      damage: 1,
      bornZ: enemy.z,
      friendly: false,
      grazed: false,
    });
  }
  state.sfx('enemyShoot');
}

function arm(state: Run, enemy: Enemy, pattern: PatternName, every: number): void {
  const patterned = pattern === 'gap-pair' || pattern === 'lanes-gap' || pattern === 'fan-gap';
  // One patterned volley in the air at a time. Like a four-way stop:
  // the next car waits until the intersection is empty.
  if (patterned && state.frame < state.salvoUntil) {
    enemy.fireCd = 10;
    return;
  }
  enemy.fireCd = Math.max(36, Math.round(every));
  if (pattern === 'mine') {
    enemy.pending = [{ x: enemy.x, y: enemy.y, r: 11 }];
    enemy.windup = 18;
    return;
  }
  if (pattern === 'none') return;
  const dots = buildVolley(pattern, {
    x: enemy.x,
    y: enemy.y,
    px: state.player.x,
    py: state.player.y,
    gap: enemy.seed + Math.floor(state.frame / 140),
    safeX: safeLane(state.frame),
  });
  if (dots.length === 0) return;
  enemy.pending = dots;
  enemy.windup = 22;
  if (patterned) {
    const travel = Math.max(40, (enemy.z - TUNE.Z_CULL) / (3.35 * state.diff.bulletSpeed));
    state.salvoUntil = state.frame + 22 + travel;
  }
}

function tickGun(state: Run, enemy: Enemy, slow: number): void {
  if (enemy.kind === 'kamikaze' || enemy.kind === 'mine') return;
  if (enemy.windup > 0) {
    enemy.windup -= slow;
    if (enemy.windup <= 0) release(state, enemy);
    return;
  }
  if (enemy.fireEvery <= 0 && !enemy.boss) return;
  enemy.fireCd -= slow;
  if (enemy.fireCd > 0) return;
  if (enemy.z < TUNE.Z_NO_FIRE) {
    enemy.fireCd = 45;
    return;
  }
  if (enemy.boss && enemy.phases) {
    const pattern = enemy.phases[enemy.phase] ?? 'aimed';
    const every = [110, 100, 92][enemy.phase] ?? 100;
    arm(state, enemy, pattern, every * state.diff.fireInterval);
    return;
  }
  arm(state, enemy, enemy.pattern, enemy.fireEvery * state.diff.fireInterval);
}

function moveEnemy(state: Run, enemy: Enemy, slow: number): void {
  if (enemy.kind === 'kamikaze' && enemy.mode === 'cruise' && enemy.z < 760) {
    enemy.mode = 'windup';
    enemy.windup = 44;
    enemy.lockX = state.player.x;
    enemy.lockY = state.player.y;
    enemy.pending = [{ x: enemy.lockX, y: enemy.lockY, r: enemy.r }];
  }
  if (enemy.kind === 'kamikaze' && enemy.mode === 'windup') {
    enemy.windup -= slow;
    enemy.vz = -0.3;
    if (enemy.windup <= 0) {
      enemy.mode = 'dive';
      enemy.pending = [];
      const frames = Math.max(1, (enemy.z - TUNE.Z_IMPACT) / 8);
      enemy.vx = (enemy.lockX - enemy.x) / frames;
      enemy.vy = (enemy.lockY - enemy.y) / frames;
      enemy.vz = -8;
    }
  }

  enemy.z += enemy.vz * slow;
  if (enemy.mode === 'dive') {
    enemy.x += enemy.vx * slow;
    enemy.y += enemy.vy * slow;
  } else if (enemy.boss) {
    enemy.x = Math.sin(state.frame * 0.02 + enemy.seed) * 34;
    enemy.y = Math.sin(state.frame * 0.015) * 16;
  } else if (enemy.kind === 'strafer' || enemy.kind === 'elite') {
    enemy.x += Math.sin(state.frame * 0.05 + enemy.seed) * 1.4;
    enemy.x = clamp(enemy.x, -110, 110);
  } else if (enemy.kind === 'swarmer') {
    enemy.x += Math.sin(state.frame * 0.07 + enemy.seed) * 0.65;
  }

  // Slide onto the lane. A ship that appears on its mark feels like a pop.
  if (enemy.intro > 0 && enemy.mode !== 'dive') {
    enemy.intro -= 1;
    enemy.x += (enemy.homeX - enemy.x) * 0.24;
  }

  // Strafer blink: the white flash is the promise, then it is somewhere else.
  if (enemy.kind === 'strafer' && enemy.mode !== 'dive' && enemy.intro <= 0) {
    if (enemy.blink > 0) {
      enemy.blink -= 1;
      if (enemy.blink === 0) enemy.x = enemy.blinkTo;
    } else if (enemy.blinkCd > 0) {
      enemy.blinkCd -= 1;
    } else if (enemy.z > TUNE.Z_NO_FIRE) {
      enemy.blink = 16;
      enemy.blinkCd = 150;
      enemy.blinkTo = clamp(enemy.homeX + (state.rng() - 0.5) * 80, -100, 100);
    }
  }

  // Elite reflect. The gold disc shows for the whole window. The bullet
  // leaves on the last frame, from in front, off the safe lane.
  if (enemy.kind === 'elite' && !enemy.boss && enemy.intro <= 0) {
    if (enemy.reflectT > 0) {
      enemy.reflectT -= 1;
      if (enemy.reflectT === 0 && enemy.z >= TUNE.Z_NO_FIRE) {
        const safe = safeLane(state.frame);
        let sx = state.player.x >= safe ? state.player.x + 60 : state.player.x - 60;
        if (Math.abs(sx - safe) < 44) sx += 70;
        sx = clamp(sx, -TUNE.PLAY_X, TUNE.PLAY_X);
        if (state.eShots.length < state.diff.shotCap) {
          state.eShots.push({
            x: sx,
            y: state.player.y,
            z: enemy.z,
            vz: -2.5 * state.diff.bulletSpeed,
            r: 7,
            damage: 1,
            bornZ: enemy.z,
            friendly: false,
            grazed: false,
          });
          state.sfx('reflect');
        }
      }
    } else if (enemy.blinkCd > 0) {
      enemy.blinkCd -= 1;
    } else if (enemy.z > TUNE.Z_NO_FIRE) {
      enemy.reflectT = 28;
      enemy.blinkCd = 210;
    }
  }

  if (enemy.flash > 0) enemy.flash -= 1;
  if (enemy.mode !== 'dive' && enemy.hold > 0 && enemy.z < enemy.hold) enemy.z = enemy.hold;
  if (enemy.z < TUNE.Z_CULL) {
    enemy.alive = false;
    enemy.pending = [];
  }
}

function bossPhase(state: Run, enemy: Enemy): void {
  if (!enemy.boss) return;
  const ratio = enemy.maxHp <= 0 ? 0 : enemy.hp / enemy.maxHp;
  const phase = ratio > 0.66 ? 0 : ratio > 0.33 ? 1 : 2;
  if (phase === enemy.phase) return;
  enemy.phase = phase;
  state.sfx('bossAlert');
  enemy.flash = 16;
  if (phase > 0 && enemy.summon && living(state) < TUNE.MAX_ACTIVE) {
    const x = phase === 1 ? -70 : 70;
    spawnEnemy(state, enemy.summon, x, enemy.y, TUNE.Z_SPAWN, false);
  }
}

function startRoll(state: Run, dir: -1 | 1): void {
  const pilot = state.player;
  if (pilot.rollT > 0 || pilot.rollCd > 0) return;
  pilot.rollT = TUNE.ROLL_FRAMES;
  pilot.rollDir = dir;
  state.did.roll = true;
  state.sfx('dash');
}

function movePlayer(state: Run, input: Input): void {
  const pilot = state.player;
  const speed = playerSpeed(state);
  const feel = input.feel ?? (input.useAim ? 'chase' : 'keys');
  if (input.roll === -1 || input.roll === 1) startRoll(state, input.roll);
  if (Math.abs(input.ax) > 0.08 || Math.abs(input.ay) > 0.08 || feel === 'mouse') {
    state.did.move = true;
  }

  if (feel === 'mouse') {
    // Deadzone: a cursor sitting on the hull does not creep the ship.
    const dx = input.aimX - pilot.x;
    const dy = input.aimY - pilot.y;
    if (Math.abs(dx) <= TUNE.MOUSE_DEAD && Math.abs(dy) <= TUNE.MOUSE_DEAD) {
      pilot.vx = 0;
      pilot.vy = 0;
    } else {
      const dist = Math.hypot(dx, dy) || 1;
      const step = Math.min(speed, dist * 0.42);
      pilot.x += (dx / dist) * step;
      pilot.y += (dy / dist) * step;
      pilot.vx = (dx / dist) * step;
      pilot.vy = (dy / dist) * step;
    }
  } else if (feel === 'chase') {
    const dx = input.aimX - pilot.x;
    const dy = input.aimY - pilot.y;
    const dist = Math.hypot(dx, dy);
    if (!input.useAim || dist === 0) {
      pilot.vx = 0;
      pilot.vy = 0;
    } else if (dist <= speed) {
      pilot.x = input.aimX;
      pilot.y = input.aimY;
      pilot.vx = dx;
      pilot.vy = dy;
    } else {
      pilot.vx = (dx / dist) * speed;
      pilot.vy = (dy / dist) * speed;
      pilot.x += pilot.vx;
      pilot.y += pilot.vy;
    }
  } else {
    // Keys: accelerate toward the stick, and drop the speed when it recenters.
    // Releasing the key must stop the ship. A leftover velocity is drift.
    const targetX = clamp(input.ax, -1, 1) * speed;
    const targetY = clamp(input.ay, -1, 1) * speed;
    const follow =
      Math.abs(input.ax) < 0.04 && Math.abs(input.ay) < 0.04 ? TUNE.KEY_RELEASE : TUNE.KEY_ACCEL;
    pilot.vx += (targetX - pilot.vx) * follow;
    pilot.vy += (targetY - pilot.vy) * follow;
    if (Math.abs(pilot.vx) < 0.08) pilot.vx = 0;
    if (Math.abs(pilot.vy) < 0.08) pilot.vy = 0;
    pilot.x += pilot.vx;
    pilot.y += pilot.vy;
  }

  // The roll is a sideways burst on top of steering, like a shoulder charge.
  if (pilot.rollT > 0) {
    const along = pilot.rollT / TUNE.ROLL_FRAMES;
    pilot.x += pilot.rollDir * speed * 2.15 * along;
    pilot.rollT -= 1;
    if (pilot.rollT <= 0) {
      pilot.rollDir = 0;
      pilot.rollCd = TUNE.ROLL_COOLDOWN;
    }
  } else if (pilot.rollCd > 0) {
    pilot.rollCd -= 1;
  }

  pilot.x = clamp(pilot.x, -TUNE.PLAY_X, TUNE.PLAY_X);
  pilot.y = clamp(pilot.y, -TUNE.PLAY_Y, TUNE.PLAY_Y);
  if (pilot.iframe > 0) pilot.iframe -= 1;
}

function updateSpecial(state: Run, input: Input): void {
  const ability = state.ship.ability;
  const regen = ability.regen * (1 + 0.35 * state.upgrades.cap);
  const pressed = input.special && !state.specialHeld;
  state.specialHeld = input.special;
  state.slow = 1;
  if (state.shield > 0) state.shield -= 1;
  if (state.beam > 0) state.beam -= 1;

  if (ability.mode === 'drain') {
    if (input.special && state.energy > 0) {
      state.energy = Math.max(0, state.energy - ability.drain);
      state.slow = ability.slowFactor;
      if (state.frame % 24 === 0) state.sfx('timeshift');
    } else {
      state.energy = Math.min(ability.max, state.energy + regen);
    }
    return;
  }

  state.energy = Math.min(ability.max, state.energy + regen);
  if (!pressed || state.energy < ability.max) return;
  state.energy = 0;
  if (ability.key === 'nova') {
    state.eShots = [];
    for (const enemy of state.enemies) damageEnemy(state, enemy, ability.damage);
    state.sfx('nova');
  } else if (ability.key === 'dash') {
    const tx = input.useAim ? input.aimX : state.player.x + input.ax * 90;
    const ty = input.useAim ? input.aimY : state.player.y - input.ay * 90;
    for (const enemy of state.enemies) {
      if (Math.hypot(enemy.x - tx, enemy.y - ty) < 36) damageEnemy(state, enemy, ability.damage);
    }
    state.player.x = clamp(tx, -TUNE.PLAY_X, TUNE.PLAY_X);
    state.player.y = clamp(ty, -TUNE.PLAY_Y, TUNE.PLAY_Y);
    state.player.iframe = 40;
    state.sfx('dash');
  } else if (ability.key === 'shield') {
    state.shield = ability.duration;
    state.sfx('shieldUp');
  } else if (ability.key === 'beam') {
    state.beam = ability.duration;
    state.sfx('beam');
  }
}

/** The ship the guns are already almost on. Far targets do not get a magnet. */
function gunLineTarget(state: Run): Enemy | null {
  let best: Enemy | null = null;
  let bestDist = 28;
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.z < TUNE.Z_MUZZLE) continue;
    const dist = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    if (dist < bestDist) {
      best = enemy;
      bestDist = dist;
    }
  }
  return best;
}

function refreshLock(state: Run): void {
  const target = gunLineTarget(state);
  if (!target) {
    state.lockId = 0;
    state.lock = Math.max(0, state.lock - 0.04);
    if (state.lock <= 0) state.lockSung = false;
    return;
  }
  if (target.id === state.lockId) {
    state.lock = Math.min(1, state.lock + 0.025);
    if (state.lock >= 1 && !state.lockSung) {
      state.lockSung = true;
      state.sfx('lock');
    }
  } else {
    state.lockId = target.id;
    state.lock = 0.08;
    state.lockSung = false;
  }
}

function playerFire(state: Run, input: Input): void {
  const pilot = state.player;
  if (pilot.fireCd > 0) pilot.fireCd -= 1;
  if (!input.fire || pilot.fireCd > 0) return;
  let delay = Math.max(8, state.ship.fireDelay - state.upgrades.fire * 2);
  if (state.buff.rapid > 0) delay = Math.max(8, Math.round(delay * 0.62));
  pilot.fireCd = delay;
  const spread = state.upgrades.spread + (state.buff.spread > 0 ? 1 : 0);
  const target = state.aimAssist ? gunLineTarget(state) : null;
  const origin = assistOrigin(pilot.x, pilot.y, target, state.aimAssist);
  // The crosshair uses this same origin and these same offsets. If you
  // change a barrel here, change reticle.ts too. They are one promise.
  for (const ox of gunOffsets(spread)) {
    state.pShots.push({
      x: clamp(origin.x + ox, -TUNE.PLAY_X, TUNE.PLAY_X),
      y: origin.y,
      z: TUNE.Z_MUZZLE,
      vz: 22,
      r: 6,
      damage: state.ship.damage,
      bornZ: TUNE.Z_MUZZLE,
      friendly: true,
      grazed: false,
    });
  }
  state.muzzle = 5;
  // Each ship has its own barrel note so a stream of shots doesn't become one buzz.
  const barrel = ['shoot', 'shootTalon', 'shootWraith', 'shootAegis', 'shootVulcan'][
    state.ship.idx - 1
  ];
  state.sfx(barrel || 'shoot');
}

function paintBubbles(state: Run): void {
  const gens = state.enemies.filter((enemy) => enemy.alive && enemy.kind === 'generator');
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.kind === 'generator' || enemy.boss || enemy.kind === 'mine') continue;
    const covered = gens.some(
      (gen) => Math.hypot(gen.x - enemy.x, gen.y - enemy.y) < 68 && Math.abs(gen.z - enemy.z) < 150
    );
    if (enemy.bubble < 0) {
      if (!covered) enemy.bubble = 0;
      continue;
    }
    if (covered && enemy.bubble === 0) enemy.bubble = 4;
    if (!covered) enemy.bubble = 0;
  }
}

function collide(state: Run): void {
  const pilot = state.player;
  paintBubbles(state);
  for (const shot of state.pShots) {
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      if (Math.abs(shot.z - enemy.z) > 40) continue;
      if (Math.hypot(shot.x - enemy.x, shot.y - enemy.y) > enemy.r + shot.r) continue;
      // Reflect window eats the bolt. The telegraphed return shot is separate,
      // so a reflected hit still has travel time and a hole to sit in.
      if (enemy.reflectT > 0 && enemy.kind === 'elite' && !enemy.boss) {
        shot.z = 9999;
        enemy.flash = 4;
        state.sfx('reflect');
        break;
      }
      damageEnemy(state, enemy, shot.damage, shot.x);
      shot.z = 9999;
      break;
    }
  }
  for (const shot of state.eShots) {
    if (shot.z < TUNE.Z_CULL || shot.z > TUNE.Z_IMPACT) continue;
    if (Math.hypot(shot.x - pilot.x, shot.y - pilot.y) > shot.r + TUNE.PLAYER_R) continue;
    if (rollInvuln(pilot)) {
      if (!shot.grazed) {
        shot.grazed = true;
        perfectDodge(state);
      }
      continue;
    }
    hurt(state);
  }
  // Only divers and mines occupy your lane as a body hit. Everything else
  // is removed at the cull line, so sharing an x with a ship you are shooting
  // is not a crash. Analogy: you can fly under a bridge. You cannot fly
  // through the truck that's aimed at your windshield.
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.boss) continue;
    if (enemy.kind !== 'kamikaze' && enemy.kind !== 'mine') continue;
    if (enemy.z < TUNE.Z_CULL || enemy.z > TUNE.Z_IMPACT) continue;
    if (Math.hypot(enemy.x - pilot.x, enemy.y - pilot.y) <= enemy.r + TUNE.PLAYER_R) {
      hurt(state);
      killEnemy(state, enemy);
    }
  }
  if (state.beam > 0) {
    for (const enemy of state.enemies) {
      if (Math.hypot(enemy.x - pilot.x, enemy.y - pilot.y) < 28) {
        damageEnemy(state, enemy, state.ship.ability.damage);
      }
    }
  }
  if (state.shield > 0) {
    for (const enemy of state.enemies) {
      if (enemy.z > 460) continue;
      if (Math.hypot(enemy.x - pilot.x, enemy.y - pilot.y) < enemy.r + 18) {
        damageEnemy(state, enemy, 0.35);
      }
    }
  }
  for (const pickup of state.pickups) {
    if (!pickup.alive) continue;
    pickup.z -= 2.1 * state.slow;
    if (pickup.z < TUNE.Z_CULL) {
      pickup.alive = false;
      continue;
    }
    if (pickup.z > TUNE.Z_IMPACT) continue;
    if (Math.hypot(pickup.x - pilot.x, pickup.y - pilot.y) > 28) continue;
    pickup.alive = false;
    award(state, 'pickups', 40);
    state.sfx('powerup');
    if (pickup.kind === 'repair') pilot.lives += 1;
    if (pickup.kind === 'rapid') state.buff.rapid = 360;
    if (pickup.kind === 'spread') state.buff.spread = 360;
    if (pickup.kind === 'cell') {
      state.energy = Math.min(state.ship.ability.max, state.energy + state.ship.ability.max * 0.45);
    }
  }
}

function spawnDue(state: Run): void {
  for (const item of state.queue) {
    if (item.done || item.t > state.frame) continue;
    const entry = item.entry;
    if ('spawn' in entry) {
      if (living(state) >= TUNE.MAX_ACTIVE) {
        item.t = state.frame + 12;
        continue;
      }
      item.done = true;
      spawnEnemy(state, entry.spawn, entry.x, entry.y, TUNE.Z_SPAWN, false);
      continue;
    }
    item.done = true;
    if ('pickup' in entry) {
      state.pickups.push({
        kind: entry.pickup,
        x: entry.x,
        y: entry.y,
        z: TUNE.Z_SPAWN,
        alive: true,
      });
    } else if ('event' in entry) {
      state.banner = entry.text;
      state.bannerT = entry.duration;
    }
  }
  if (state.mode === 'waves' && state.frame >= state.level.bossAt) {
    const pests = state.enemies.some((enemy) => enemy.alive);
    if (!pests || state.frame >= state.level.bossAt + 420) startBoss(state);
  }
}

function startBoss(state: Run): void {
  if (state.mode === 'boss') return;
  state.mode = 'boss';
  const def: BossDef = state.level.boss;
  const boss = spawnEnemy(state, 'elite', 0, 0, 620, false);
  const hp = Math.max(20, Math.round(def.hp * state.diff.enemyHp));
  boss.boss = true;
  boss.name = def.name;
  boss.hp = hp;
  boss.maxHp = hp;
  boss.r = 32;
  boss.hold = 620;
  boss.z = 620;
  boss.vz = 0;
  boss.score = 2000;
  boss.accent = def.accent;
  boss.phases = def.phases;
  boss.summon = def.summon;
  boss.pattern = def.phases[0];
  boss.fireEvery = 68;
  boss.fireCd = 36;
  boss.shield = 0;
  boss.maxShield = 0;
  boss.splits = false;
  boss.art = state.level.id;
  boss.intro = 0;
  boss.homeX = 0;
  state.sfx('bossAlert');
}

function finishIfClear(state: Run): void {
  if (state.mode !== 'boss') return;
  if (state.enemies.some((enemy) => enemy.alive && enemy.boss)) return;
  state.enemies = [];
  state.eShots = [];
  state.mode = 'clear';
  award(state, 'clear', 600);
  if (state.hits === 0) award(state, 'clear', 800);
  state.sfx('fanfare');
}

function recordThreats(state: Run): void {
  if (!state.record) return;
  const hot: Threat[] = [];
  for (const shot of state.eShots) {
    if (shot.z <= TUNE.Z_IMPACT) hot.push({ x: shot.x, y: shot.y, r: shot.r + TUNE.PLAYER_R });
  }
  for (const enemy of state.enemies) {
    if (!enemy.alive || (enemy.kind !== 'kamikaze' && enemy.kind !== 'mine')) continue;
    if (enemy.z > TUNE.Z_IMPACT) continue;
    hot.push({ x: enemy.x, y: enemy.y, r: enemy.r + TUNE.PLAYER_R });
  }
  state.threats.push(hot);
}

export function createRun(opts: RunOpts = {}): Run {
  const diff = DIFFICULTIES[opts.difficulty ?? 'pilot'];
  const level = getLevel(opts.levelId ?? 'nebula');
  const ship = getShip(opts.shipIdx ?? 1);
  const upgrades = opts.upgrades ?? { ...EMPTY_UPGRADES };
  const state: Run = {
    level,
    diff,
    ship,
    upgrades,
    frame: 0,
    mode: 'waves',
    player: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      lives: diff.lives + upgrades.hull,
      iframe: 0,
      fireCd: 0,
      rollT: 0,
      rollDir: 0,
      rollCd: 0,
    },
    hitStop: 0,
    shake: 0,
    perfect: 0,
    floaters: [],
    did: { move: false, fire: false, roll: false, special: false },
    lockId: 0,
    lock: 0,
    aimAssist: false,
    pings: [],
    corpses: [],
    boom: 0,
    hurtT: 0,
    combo: 0,
    comboT: 0,
    lockSung: false,
    energy: ship.ability.mode === 'drain' ? ship.ability.max : 0,
    slow: 1,
    shield: 0,
    beam: 0,
    specialHeld: false,
    buff: { rapid: 0, spread: 0 },
    enemies: [],
    eShots: [],
    pShots: [],
    pickups: [],
    score: 0,
    hits: 0,
    earned: { kills: 0, boss: 0, pickups: 0, clear: 0 },
    banner: '',
    bannerT: 0,
    muzzle: 0,
    god: false,
    invincible: opts.invincible === true,
    threats: [],
    record: opts.record === true,
    salvoUntil: 0,
    sfx: () => {},
    rng: mulberry32(opts.seed ?? 1),
    nextId: 1,
    queue: level.script.map((entry) => ({
      t: Math.round(entry.t * diff.wavePace),
      entry,
      done: opts.boss === true,
    })),
  };
  if (opts.boss) startBoss(state);
  return state;
}

/**
 * Advance one 60Hz tick. Safe to call after clear/dead — it refuses to
 * keep simulating a run that's already over, so a stuck menu can't farm score.
 */
export function step(state: Run, input: Input): void {
  if (state.mode === 'clear' || state.mode === 'dead') return;
  // Hit-stop is a tiny freeze so a kill reads. The world holds its breath.
  if (state.hitStop > 0) {
    state.hitStop -= 1;
    state.shake *= 0.86;
    return;
  }
  state.frame += 1;
  if (input.fire) state.did.fire = true;
  if (input.special) state.did.special = true;
  if (state.shake > 0) state.shake *= 0.82;
  if (state.perfect > 0) state.perfect -= 1;
  for (const floater of state.floaters) floater.life -= 1;
  state.floaters = state.floaters.filter((floater) => floater.life > 0);
  for (const ping of state.pings) ping.life -= 1;
  state.pings = state.pings.filter((ping) => ping.life > 0);
  for (const corpse of state.corpses) corpse.life -= 1;
  state.corpses = state.corpses.filter((corpse) => corpse.life > 0);
  if (state.bannerT > 0) state.bannerT -= 1;
  if (state.muzzle > 0) state.muzzle -= 1;
  if (state.boom > 0) state.boom -= 1;
  if (state.hurtT > 0) state.hurtT -= 1;
  if (state.comboT > 0) state.comboT -= 1;
  else state.combo = 0;
  if (state.buff.rapid > 0) state.buff.rapid -= 1;
  if (state.buff.spread > 0) state.buff.spread -= 1;

  movePlayer(state, input);
  updateSpecial(state, input);
  const slow = state.slow;
  spawnDue(state);

  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    moveEnemy(state, enemy, slow);
    if (!enemy.alive) continue;
    bossPhase(state, enemy);
    tickGun(state, enemy, slow);
  }
  playerFire(state, input);

  refreshLock(state);
  const locked = state.enemies.find((enemy) => enemy.alive && enemy.id === state.lockId) ?? null;
  for (const shot of state.pShots) {
    shot.z += shot.vz;
    // A full lock with aim-assist on bends the bolt a little toward the
    // target. It is a nudge, not a seeker. The bolt still has to be close.
    if (state.aimAssist && state.lock >= 1 && locked) {
      shot.x += clamp(locked.x - shot.x, -0.35, 0.35);
      shot.y += clamp(locked.y - shot.y, -0.35, 0.35);
    }
  }
  for (const shot of state.eShots) shot.z += shot.vz * slow;

  collide(state);

  state.enemies = state.enemies.filter((enemy) => enemy.alive && enemy.z >= TUNE.Z_CULL);
  state.eShots = state.eShots.filter((shot) => shot.z >= TUNE.Z_CULL && shot.z < 1600);
  state.pShots = state.pShots.filter((shot) => shot.z < 1400);
  state.pickups = state.pickups.filter((pickup) => pickup.alive);

  finishIfClear(state);
  recordThreats(state);
}

/**
 * Invariants the playtests fail on. An active enemy or enemy shot closer
 * than the cull line, or a shot whose birth depth is past the no-fire line.
 */
export function audit(state: Run): string[] {
  const problems: string[] = [];
  for (const enemy of state.enemies) {
    if (enemy.z < TUNE.Z_CULL)
      problems.push(`${enemy.kind} behind the cull at z=${enemy.z.toFixed(1)}`);
  }
  for (const shot of state.eShots) {
    if (shot.z < TUNE.Z_CULL) problems.push(`enemy shot behind the cull at z=${shot.z.toFixed(1)}`);
    if (shot.bornZ < TUNE.Z_NO_FIRE) {
      problems.push(`enemy shot born past the no-fire line at z=${shot.bornZ.toFixed(1)}`);
    }
    if (Math.abs(shot.x) > TUNE.PLAY_X + 8 || Math.abs(shot.y) > TUNE.PLAY_Y + 8) {
      problems.push('enemy shot fired from off the playfield');
    }
  }
  return problems;
}
