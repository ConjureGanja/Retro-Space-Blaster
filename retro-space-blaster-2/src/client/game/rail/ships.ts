/**
 * The five fighters from the first game, with the same jobs and the same
 * specials. Combat code reads this file. The painted tails live in
 * art/sprites/rear/playership1.png … playership5.png (and the @2x twins).
 * Those pictures were drawn by hand — don't regenerate them.
 *
 * Analogy: the same five pilots, a new cockpit. The name on the jacket
 * didn't change because the runway did.
 */

export type AbilityKey = 'chrono' | 'nova' | 'dash' | 'shield' | 'beam';

export type ShipDef = {
  idx: number;
  name: string;
  role: string;
  sprite: string;
  speed: number;
  fireDelay: number;
  damage: number;
  color: string;
  ability: {
    key: AbilityKey;
    name: string;
    desc: string;
    color: string;
    mode: 'drain' | 'cooldown';
    max: number;
    regen: number;
    drain: number;
    slowFactor: number;
    damage: number;
    duration: number;
  };
};

export const SHIPS: ShipDef[] = [
  {
    idx: 1,
    name: 'FALCON',
    role: 'Interceptor',
    sprite: 'playership1',
    speed: 1.05,
    fireDelay: 18,
    damage: 1,
    color: '#66aaff',
    ability: {
      key: 'chrono',
      name: 'CHRONO FIELD',
      desc: 'Hold to slow incoming fire. You still move at full speed.',
      color: '#00ffff',
      mode: 'drain',
      max: 240,
      regen: 0.5,
      drain: 1,
      slowFactor: 0.35,
      damage: 0,
      duration: 0,
    },
  },
  {
    idx: 2,
    name: 'TALON',
    role: 'Heavy Gunship',
    sprite: 'playership2',
    speed: 0.85,
    fireDelay: 24,
    damage: 2,
    color: '#ffaa44',
    ability: {
      key: 'nova',
      name: 'NOVA BLAST',
      desc: 'A shockwave that wipes enemy shots and bruises every hull ahead.',
      color: '#ffaa00',
      mode: 'cooldown',
      max: 720,
      regen: 1,
      drain: 0,
      slowFactor: 1,
      damage: 8,
      duration: 0,
    },
  },
  {
    idx: 3,
    name: 'WRAITH',
    role: 'Phase Fighter',
    sprite: 'playership3',
    speed: 1.15,
    fireDelay: 16,
    damage: 1,
    color: '#cc88ff',
    ability: {
      key: 'dash',
      name: 'PHASE DASH',
      desc: 'Blink to where you are aiming and shed the shots you crossed.',
      color: '#cc66ff',
      mode: 'cooldown',
      max: 300,
      regen: 1,
      drain: 0,
      slowFactor: 1,
      damage: 5,
      duration: 0,
    },
  },
  {
    idx: 4,
    name: 'AEGIS',
    role: 'Bulwark',
    sprite: 'playership4',
    speed: 0.9,
    fireDelay: 20,
    damage: 1.5,
    color: '#66ff88',
    ability: {
      key: 'shield',
      name: 'AEGIS SHIELD',
      desc: 'Four seconds where hits bounce. Ram anything that fills the lane.',
      color: '#44ff88',
      mode: 'cooldown',
      max: 840,
      regen: 1,
      drain: 0,
      slowFactor: 1,
      damage: 4,
      duration: 240,
    },
  },
  {
    idx: 5,
    name: 'VULCAN',
    role: 'Artillery',
    sprite: 'playership5',
    speed: 0.95,
    fireDelay: 20,
    damage: 1.5,
    color: '#ff6655',
    ability: {
      key: 'beam',
      name: 'HYPER BEAM',
      desc: 'Two seconds of a piercing lance down the lane you are holding.',
      color: '#ff4444',
      mode: 'cooldown',
      max: 600,
      regen: 1,
      drain: 0,
      slowFactor: 1,
      damage: 0.45,
      duration: 120,
    },
  },
];

export function getShip(idx: number): ShipDef {
  const found = SHIPS.find((ship) => ship.idx === idx) ?? SHIPS.find((ship) => ship.idx === 1);
  if (!found) throw new Error('ship roster is empty');
  return found;
}
