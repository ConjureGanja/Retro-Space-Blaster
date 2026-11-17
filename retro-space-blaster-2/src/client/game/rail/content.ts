/**
 * Levels, enemy roster, and the shot patterns they are allowed to throw.
 *
 * Every pattern is a handful of dots on the playfield with a hole you can
 * sit in. Nothing here aims from behind the ship: the sim refuses to spawn
 * a volley once the shooter has crossed the no-fire line.
 *
 * Analogy: a drill sergeant laying cones. The gaps are the point of the
 * exercise. A drill with no gap is just a wall, and walls aren't in this file.
 */

import type { DifficultyId, Upgrades } from './tune.ts';

export type EnemyKind =
  'swarmer' | 'strafer' | 'turret' | 'tank' | 'kamikaze' | 'miner' | 'splitter' | 'elite' | 'mine';

export type PatternName = 'aimed' | 'gap-pair' | 'lanes-gap' | 'fan-gap' | 'mine' | 'none';

export type Archetype = {
  hp: number;
  r: number;
  vz: number;
  /** Hold at this depth. 0 means "keep coming until the cull line." */
  hold: number;
  score: number;
  fireEvery: number;
  pattern: PatternName;
  shield: number;
  splits: boolean;
};

/**
 * Eight fighters plus the mine they leave behind. Numbers are pilot-baseline;
 * the difficulty block scales HP and the gap between shots.
 */
export const ARCHETYPES: Record<EnemyKind, Archetype> = {
  swarmer: {
    hp: 2,
    r: 13,
    vz: -2.5,
    hold: 0,
    score: 80,
    fireEvery: 190,
    pattern: 'aimed',
    shield: 0,
    splits: false,
  },
  strafer: {
    hp: 6,
    r: 16,
    vz: -2.1,
    hold: 560,
    score: 140,
    fireEvery: 140,
    pattern: 'gap-pair',
    shield: 0,
    splits: false,
  },
  turret: {
    hp: 8,
    r: 15,
    vz: -1.5,
    hold: 500,
    score: 160,
    fireEvery: 130,
    pattern: 'aimed',
    shield: 0,
    splits: false,
  },
  tank: {
    hp: 14,
    r: 22,
    vz: -1.25,
    hold: 500,
    score: 240,
    fireEvery: 150,
    pattern: 'gap-pair',
    shield: 8,
    splits: false,
  },
  kamikaze: {
    hp: 3,
    r: 12,
    vz: -1.4,
    hold: 0,
    score: 110,
    fireEvery: 0,
    pattern: 'none',
    shield: 0,
    splits: false,
  },
  miner: {
    hp: 6,
    r: 16,
    vz: -1.7,
    hold: 580,
    score: 150,
    fireEvery: 170,
    pattern: 'mine',
    shield: 0,
    splits: false,
  },
  splitter: {
    hp: 7,
    r: 17,
    vz: -2,
    hold: 0,
    score: 170,
    fireEvery: 170,
    pattern: 'aimed',
    shield: 0,
    splits: true,
  },
  elite: {
    hp: 12,
    r: 18,
    vz: -1.8,
    hold: 470,
    score: 280,
    fireEvery: 120,
    pattern: 'fan-gap',
    shield: 0,
    splits: false,
  },
  mine: {
    hp: 1,
    r: 11,
    vz: -1.45,
    hold: 0,
    score: 30,
    fireEvery: 0,
    pattern: 'none',
    shield: 0,
    splits: false,
  },
};

export type ShotDot = { x: number; y: number; r: number };

/**
 * The lane every patterned volley must leave empty right now.
 * It steps slowly — a ship can walk there before the next step.
 * Half the beats sit on the center line so guns still have a shot at a boss.
 */
export function safeLane(frame: number): number {
  const lanes = [-80, 0, 80, 0];
  return lanes[Math.floor(frame / 140) % lanes.length] ?? 0;
}

/**
 * Build one volley in playfield coordinates.
 * Dots that land in the safe lane are dropped. Aimed shots that would
 * land there are nudged aside, so "stand in the open lane" is a real answer.
 * Analogy: a crosswalk. The cars stop for the stripes, not for wherever you feel like standing.
 */
export function buildVolley(
  pattern: PatternName,
  ctx: { x: number; y: number; px: number; py: number; gap: number; safeX: number }
): ShotDot[] {
  const r = 7;
  const keep = (dot: ShotDot) => Math.abs(dot.x - ctx.safeX) > 42;
  if (pattern === 'aimed') {
    let x = ctx.px;
    if (Math.abs(x - ctx.safeX) < 42) x += x <= ctx.safeX ? -52 : 52;
    return [{ x, y: ctx.py, r }];
  }
  if (pattern === 'gap-pair') {
    return [
      { x: ctx.x - 48, y: ctx.y, r },
      { x: ctx.x + 48, y: ctx.y, r },
    ].filter(keep);
  }
  if (pattern === 'lanes-gap' || pattern === 'fan-gap') {
    const lanes = pattern === 'lanes-gap' ? [-120, -40, 40, 120] : [-100, -50, 0, 50, 100];
    const rows = pattern === 'lanes-gap' ? [-34, 0, 34] : [0];
    const skip = ((ctx.gap % lanes.length) + lanes.length) % lanes.length;
    const dots: ShotDot[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (i === skip) continue;
      const lane = lanes[i];
      if (lane === undefined) continue;
      for (const row of rows) dots.push({ x: lane, y: row, r });
    }
    return dots.filter(keep);
  }
  return [];
}

export type Theme = {
  skyTop: string;
  skyBottom: string;
  ground: string;
  grid: string;
  accent: string;
  star: string;
  fog: string;
};

export type ScriptEntry =
  | { t: number; spawn: EnemyKind; x: number; y: number }
  | { t: number; pickup: 'repair' | 'rapid' | 'spread' | 'cell'; x: number; y: number }
  | { t: number; event: string; text: string; duration: number };

export type BossDef = {
  name: string;
  hp: number;
  accent: string;
  phases: [PatternName, PatternName, PatternName];
  summon: EnemyKind;
};

export type LevelDef = {
  id: string;
  name: string;
  sector: string;
  briefing: string;
  theme: Theme;
  bossAt: number;
  boss: BossDef;
  script: ScriptEntry[];
};

const nebula: Theme = {
  skyTop: '#14081f',
  skyBottom: '#3a1458',
  ground: '#1a0c28',
  grid: '#c46bff',
  accent: '#e7a6ff',
  star: '#f4d8ff',
  fog: '#6a2a8a',
};
const belt: Theme = {
  skyTop: '#140c06',
  skyBottom: '#4a2a10',
  ground: '#241408',
  grid: '#ffb15a',
  accent: '#ffd29a',
  star: '#ffe6c4',
  fog: '#8a5a28',
};
const station: Theme = {
  skyTop: '#061018',
  skyBottom: '#123044',
  ground: '#0c1c28',
  grid: '#7ee7ff',
  accent: '#bff6ff',
  star: '#e7fbff',
  fog: '#2a6a88',
};
const ice: Theme = {
  skyTop: '#06121a',
  skyBottom: '#1a3e55',
  ground: '#102430',
  grid: '#b7f4ff',
  accent: '#e8fdff',
  star: '#ffffff',
  fog: '#7fd0e6',
};
const hive: Theme = {
  skyTop: '#0c1008',
  skyBottom: '#243014',
  ground: '#141a0c',
  grid: '#c6ff5a',
  accent: '#e6ff9a',
  star: '#f4ffd2',
  fog: '#6a8a28',
};

/**
 * Five routes. Times are frames at 60Hz on Pilot (about 30–40s of traffic,
 * then the boss). Cadet stretches them; Ace tightens them.
 */
export const LEVELS: LevelDef[] = [
  {
    id: 'nebula',
    name: 'VIOLET NEBULA',
    sector: 'SECTOR 1',
    briefing: 'Ion clouds and a flock that learned to share one brain. Hold the lanes.',
    theme: nebula,
    bossAt: 2100,
    boss: {
      name: 'NEBULA WARDEN',
      hp: 78,
      accent: '#e7a6ff',
      phases: ['aimed', 'lanes-gap', 'fan-gap'],
      summon: 'swarmer',
    },
    script: [
      { t: 30, spawn: 'swarmer', x: -100, y: 10 },
      { t: 30, spawn: 'swarmer', x: -35, y: -20 },
      { t: 30, spawn: 'swarmer', x: 35, y: 24 },
      { t: 30, spawn: 'swarmer', x: 100, y: -8 },
      { t: 520, spawn: 'strafer', x: -70, y: 16 },
      { t: 520, spawn: 'strafer', x: 75, y: -18 },
      { t: 860, pickup: 'cell', x: 0, y: 10 },
      { t: 980, spawn: 'swarmer', x: -110, y: 30 },
      { t: 980, spawn: 'swarmer', x: -55, y: -28 },
      { t: 1000, spawn: 'swarmer', x: 0, y: 8 },
      { t: 1000, spawn: 'swarmer', x: 55, y: -24 },
      { t: 1020, spawn: 'swarmer', x: 110, y: 20 },
      { t: 1180, event: 'storm', text: 'ION STORM', duration: 220 },
      { t: 1360, spawn: 'elite', x: 0, y: 0 },
      { t: 1680, spawn: 'strafer', x: -40, y: 22 },
      { t: 1700, spawn: 'swarmer', x: -90, y: -16 },
      { t: 1700, spawn: 'swarmer', x: 90, y: 18 },
      { t: 1720, pickup: 'rapid', x: 20, y: -10 },
    ],
  },
  {
    id: 'belt',
    name: 'ASTEROID BELT',
    sector: 'SECTOR 2',
    briefing: 'Divers telegraph, then commit. Mines drift. Neither follows you home.',
    theme: belt,
    bossAt: 2200,
    boss: {
      name: 'BELT BREAKER',
      hp: 84,
      accent: '#ffb15a',
      phases: ['gap-pair', 'fan-gap', 'lanes-gap'],
      summon: 'kamikaze',
    },
    script: [
      { t: 40, spawn: 'kamikaze', x: -80, y: 20 },
      { t: 70, spawn: 'kamikaze', x: 80, y: -16 },
      { t: 360, spawn: 'miner', x: -20, y: 8 },
      { t: 420, spawn: 'swarmer', x: -60, y: -24 },
      { t: 420, spawn: 'swarmer', x: 60, y: 26 },
      { t: 780, spawn: 'kamikaze', x: 0, y: 30 },
      { t: 820, spawn: 'kamikaze', x: -110, y: -10 },
      { t: 900, event: 'shower', text: 'ROCK SHOWER', duration: 240 },
      { t: 940, spawn: 'mine', x: -100, y: 0 },
      { t: 940, spawn: 'mine', x: -20, y: 28 },
      { t: 940, spawn: 'mine', x: 60, y: -24 },
      { t: 1080, spawn: 'mine', x: 110, y: 10 },
      { t: 1280, spawn: 'miner', x: 40, y: -12 },
      { t: 1500, spawn: 'elite', x: -30, y: 6 },
      { t: 1760, spawn: 'kamikaze', x: 50, y: 18 },
      { t: 1800, spawn: 'swarmer', x: -80, y: -20 },
      { t: 1800, spawn: 'swarmer', x: 0, y: 24 },
      { t: 1680, pickup: 'repair', x: -10, y: 0 },
    ],
  },
  {
    id: 'station',
    name: 'ORBITAL STATION',
    sector: 'SECTOR 3',
    briefing: 'Guns bolted to the gantry. A tank with a vent you can see coming.',
    theme: station,
    bossAt: 2300,
    boss: {
      name: 'STATION CORE',
      hp: 90,
      accent: '#7ee7ff',
      phases: ['aimed', 'gap-pair', 'lanes-gap'],
      summon: 'turret',
    },
    script: [
      { t: 40, spawn: 'turret', x: -100, y: 22 },
      { t: 40, spawn: 'turret', x: 100, y: -18 },
      { t: 480, spawn: 'strafer', x: 0, y: 10 },
      { t: 760, spawn: 'tank', x: -30, y: 0 },
      { t: 980, event: 'batteries', text: 'BATTERIES ONLINE', duration: 200 },
      { t: 1040, spawn: 'turret', x: -120, y: -8 },
      { t: 1040, spawn: 'turret', x: 120, y: 16 },
      { t: 1320, spawn: 'swarmer', x: -50, y: 28 },
      { t: 1320, spawn: 'swarmer', x: 50, y: -26 },
      { t: 1560, spawn: 'tank', x: 36, y: 6 },
      { t: 1780, pickup: 'spread', x: 0, y: 12 },
      { t: 1900, spawn: 'elite', x: 10, y: -8 },
    ],
  },
  {
    id: 'ice',
    name: 'ICE MOON',
    sector: 'SECTOR 4',
    briefing: 'Splitters shed twins. The twins are the small ones. Shoot them too.',
    theme: ice,
    bossAt: 2200,
    boss: {
      name: 'GLACIER WYRM',
      hp: 88,
      accent: '#d8fbff',
      phases: ['fan-gap', 'lanes-gap', 'aimed'],
      summon: 'splitter',
    },
    script: [
      { t: 40, spawn: 'splitter', x: -40, y: 8 },
      { t: 80, spawn: 'splitter', x: 55, y: -14 },
      { t: 460, spawn: 'strafer', x: -80, y: 20 },
      { t: 460, spawn: 'strafer', x: 80, y: -20 },
      { t: 860, event: 'whiteout', text: 'WHITEOUT', duration: 220 },
      { t: 980, spawn: 'elite', x: -20, y: 4 },
      { t: 1240, spawn: 'splitter', x: 0, y: 16 },
      { t: 1280, spawn: 'kamikaze', x: -90, y: -12 },
      { t: 1320, spawn: 'kamikaze', x: 90, y: 18 },
      { t: 1560, pickup: 'cell', x: 16, y: -6 },
      { t: 1700, spawn: 'strafer', x: 0, y: -8 },
      { t: 1880, spawn: 'elite', x: 30, y: 12 },
    ],
  },
  {
    id: 'hive',
    name: 'HIVE CORE',
    sector: 'SECTOR 5',
    briefing: 'Everything you met on the way in, then the thing that sent them.',
    theme: hive,
    bossAt: 2500,
    boss: {
      name: 'HIVE QUEEN',
      hp: 96,
      accent: '#d6ff6a',
      phases: ['aimed', 'fan-gap', 'lanes-gap'],
      summon: 'elite',
    },
    script: [
      { t: 30, spawn: 'swarmer', x: -90, y: 16 },
      { t: 30, spawn: 'swarmer', x: 90, y: -16 },
      { t: 280, spawn: 'kamikaze', x: -40, y: 24 },
      { t: 320, spawn: 'kamikaze', x: 40, y: -22 },
      { t: 560, spawn: 'miner', x: 0, y: 6 },
      { t: 860, spawn: 'splitter', x: -60, y: -10 },
      { t: 900, spawn: 'turret', x: 110, y: 12 },
      { t: 1100, event: 'breach', text: 'HULL BREACH', duration: 200 },
      { t: 1200, spawn: 'tank', x: -16, y: 0 },
      { t: 1500, spawn: 'elite', x: 24, y: 8 },
      { t: 1760, spawn: 'strafer', x: -70, y: -18 },
      { t: 1760, spawn: 'strafer', x: 70, y: 18 },
      { t: 1980, pickup: 'repair', x: 0, y: 0 },
      { t: 2100, spawn: 'swarmer', x: -110, y: 8 },
      { t: 2100, spawn: 'swarmer', x: 0, y: -20 },
      { t: 2100, spawn: 'swarmer', x: 110, y: 20 },
    ],
  },
];

export function getLevel(id: string): LevelDef {
  const found =
    LEVELS.find((level) => level.id === id) ?? LEVELS.find((level) => level.id === 'nebula');
  if (!found) throw new Error('level list is empty');
  return found;
}

export const LEVEL_ORDER = LEVELS.map((level) => level.id);

export function nextLevelId(id: string): string | null {
  const index = LEVEL_ORDER.indexOf(id);
  if (index < 0) return null;
  return LEVEL_ORDER[index + 1] ?? null;
}

export const SHOP: { id: keyof Upgrades; name: string; desc: string; cost: number; max: number }[] =
  [
    { id: 'fire', name: 'OVERCLOCK', desc: 'Shorter pause between your shots.', cost: 28, max: 4 },
    {
      id: 'spread',
      name: 'SPLIT LENS',
      desc: 'A side barrel. Two, if you pay twice.',
      cost: 42,
      max: 2,
    },
    {
      id: 'hull',
      name: 'HULL PLATE',
      desc: 'One extra hit at the start of every level.',
      cost: 36,
      max: 2,
    },
    { id: 'cap', name: 'CAPACITOR', desc: 'The special meter fills faster.', cost: 22, max: 3 },
  ];

export type ShopId = (typeof SHOP)[number]['id'];

/** Grade from hits taken on a cleared level. Dead runs don't get one. */
export function gradeFor(hits: number): 'A' | 'B' | 'C' | 'D' {
  if (hits <= 0) return 'A';
  if (hits <= 2) return 'B';
  if (hits <= 4) return 'C';
  return 'D';
}

export const DIFFICULTY_ORDER: DifficultyId[] = ['cadet', 'pilot', 'ace'];
