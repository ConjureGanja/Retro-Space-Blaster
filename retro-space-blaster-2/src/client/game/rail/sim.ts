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
};

export type Pickup = {
  kind: 'repair' | 'rapid' | 'spread' | 'cell';
  x: number;
  y: number;
  z: number;
  alive: boolean;
};

export type Earned = { kills: number; boss: number; pickups: number; clear: number };

export type RunMode = 'waves' | 'boss' | 'clear' | 'dead';

export type Run = {
  level: LevelDef;
  diff: Difficulty;
  ship: ShipDef;
  upgrades: Upgrades;
  frame: number;
  mode: RunMode;
  player: { x: number; y: number; lives: number; iframe: number; fireCd: number };
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
  };
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

function hurt(state: Run): void {
  if (state.god || state.invincible || state.player.iframe > 0 || state.shield > 0) return;
  state.player.lives -= 1;
  state.player.iframe = TUNE.IFRAME;
  state.hits += 1;
  state.sfx('explode');
  if (state.player.lives <= 0) state.mode = 'dead';
}

function killEnemy(state: Run, enemy: Enemy): void {
  if (!enemy.alive) return;
  enemy.alive = false;
  enemy.pending = [];
  award(state, enemy.boss ? 'boss' : 'kills', enemy.score);
  state.sfx('explode');
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

function damageEnemy(state: Run, enemy: Enemy, amount: number): void {
  if (!enemy.alive || amount <= 0) return;
  if (enemy.shield > 0) {
    enemy.shield -= amount;
    if (enemy.shield > 0) return;
    amount = -enemy.shield;
    enemy.shield = 0;
    if (amount <= 0) return;
  }
  enemy.hp -= amount;
  if (enemy.hp <= 0) killEnemy(state, enemy);
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
  if (phase > 0 && enemy.summon && living(state) < TUNE.MAX_ACTIVE) {
    const x = phase === 1 ? -70 : 70;
    spawnEnemy(state, enemy.summon, x, enemy.y, TUNE.Z_SPAWN, false);
  }
}

function movePlayer(state: Run, input: Input): void {
  const pilot = state.player;
  const speed = playerSpeed(state);
  const keyed = Math.abs(input.ax) > 0.02 || Math.abs(input.ay) > 0.02;
  if (keyed && !input.useAim) {
    pilot.x += clamp(input.ax, -1, 1) * speed;
    pilot.y += clamp(input.ay, -1, 1) * speed;
  } else if (input.useAim) {
    const dx = input.aimX - pilot.x;
    const dy = input.aimY - pilot.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= speed || dist === 0) {
      pilot.x = input.aimX;
      pilot.y = input.aimY;
    } else {
      pilot.x += (dx / dist) * speed;
      pilot.y += (dy / dist) * speed;
    }
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

function playerFire(state: Run, input: Input): void {
  const pilot = state.player;
  if (pilot.fireCd > 0) pilot.fireCd -= 1;
  if (!input.fire || pilot.fireCd > 0) return;
  let delay = Math.max(8, state.ship.fireDelay - state.upgrades.fire * 2);
  if (state.buff.rapid > 0) delay = Math.max(8, Math.round(delay * 0.62));
  pilot.fireCd = delay;
  const spread = state.upgrades.spread + (state.buff.spread > 0 ? 1 : 0);
  const offsets = [0];
  if (spread >= 1) offsets.push(-18, 18);
  if (spread >= 2) offsets.push(-34, 34);
  for (const ox of offsets) {
    state.pShots.push({
      x: clamp(pilot.x + ox, -TUNE.PLAY_X, TUNE.PLAY_X),
      y: pilot.y,
      z: TUNE.Z_MUZZLE,
      vz: 22,
      r: 6,
      damage: state.ship.damage,
      bornZ: TUNE.Z_MUZZLE,
      friendly: true,
    });
  }
  state.muzzle = 5;
  state.sfx('shoot');
}

function collide(state: Run): void {
  const pilot = state.player;
  for (const shot of state.pShots) {
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      if (Math.abs(shot.z - enemy.z) > 40) continue;
      if (Math.hypot(shot.x - enemy.x, shot.y - enemy.y) > enemy.r + shot.r) continue;
      damageEnemy(state, enemy, shot.damage);
      shot.z = 9999;
      break;
    }
  }
  for (const shot of state.eShots) {
    if (shot.z < TUNE.Z_CULL || shot.z > TUNE.Z_IMPACT) continue;
    if (Math.hypot(shot.x - pilot.x, shot.y - pilot.y) <= shot.r + TUNE.PLAYER_R) hurt(state);
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
      lives: diff.lives + upgrades.hull,
      iframe: 0,
      fireCd: 0,
    },
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
  state.frame += 1;
  if (state.bannerT > 0) state.bannerT -= 1;
  if (state.muzzle > 0) state.muzzle -= 1;
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

  for (const shot of state.pShots) shot.z += shot.vz;
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
