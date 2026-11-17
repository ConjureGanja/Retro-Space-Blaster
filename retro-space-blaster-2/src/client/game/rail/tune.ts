/**
 * Tuning for the rail shooter.
 *
 * The old game scrolled a flat floor to the right, then a chase camera was
 * bolted on. Anything that flew past the ship's x ended up between the lens
 * and the hull, still shooting. This file is the replacement rulebook:
 * depth only increases away from the camera, and two painted lines on that
 * depth — cull and no-fire — are not suggestions.
 *
 * Analogy: a finish-line tape. Racers are pulled into the pits when they
 * break it. They do not keep driving through the camera truck.
 */

export const TUNE = {
  /** How far ahead "far" is. Bigger focal length = less dramatic perspective. */
  FOCAL: 420,
  /** Spawn depth. The horizon, not the bumper. */
  Z_SPAWN: 980,
  /** Past this, an enemy may not start a new shot. Still well in front of the ship. */
  Z_NO_FIRE: 340,
  /** A shot or body in this slice can hurt the ship. It is still ahead of the lens. */
  Z_IMPACT: 210,
  /** Active threats are removed here. Nothing alive is stored closer than this. */
  Z_CULL: 150,
  /** Sprites closer than this fade so they can't paint over the ship. */
  Z_FADE: 320,
  /** Player weapon muzzle. Ahead of the cull line, flying away from the camera. */
  Z_MUZZLE: 190,

  PLAY_X: 148,
  PLAY_Y: 78,
  /** A bit smaller than the painted ship. The sprite is the costume; this is the body. */
  PLAYER_R: 10,
  BASE_SPEED: 5.5,
  /** Frames of mercy after a hit. Long enough to leave the thing that hit you. */
  IFRAME: 84,
  /** Hard cap so a bug can't fill the screen with metal. */
  MAX_ACTIVE: 12,

  /** Pixel spread of one world unit at the ship's depth. Tuned for a 1280-wide view. */
  X_SPREAD: 3.15,
  Y_SPREAD: 2.35,
  /** Where the ship sits down the glass, as a fraction of the view height. */
  SHIP_Y: 0.66,
  HORIZON_Y: 0.18,
} as const;

export type DifficultyId = 'cadet' | 'pilot' | 'ace';

export type Difficulty = {
  id: DifficultyId;
  label: string;
  lives: number;
  enemyHp: number;
  /** Multiplies the frames between enemy shots. Above 1 is calmer. */
  fireInterval: number;
  bulletSpeed: number;
  /** Multiplies wave timestamps. Below 1 brings the next wave in sooner. */
  wavePace: number;
  scoreMult: number;
  shotCap: number;
  blurb: string;
};

/**
 * Same three contracts as the first game: cadet is the scenic route, pilot is
 * the baseline, ace is hazard pay. Shot cap is new — it's the bouncer at the
 * door, so a busy wave can't stack an undodgeable wall.
 */
export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  cadet: {
    id: 'cadet',
    label: 'CADET',
    lives: 5,
    enemyHp: 0.75,
    fireInterval: 1.35,
    bulletSpeed: 0.85,
    wavePace: 1.08,
    scoreMult: 0.75,
    shotCap: 10,
    blurb: 'Extra lives, slower enemy guns, and room to look at the scenery.',
  },
  pilot: {
    id: 'pilot',
    label: 'PILOT',
    lives: 3,
    enemyHp: 1,
    fireInterval: 1,
    bulletSpeed: 1,
    wavePace: 1,
    scoreMult: 1,
    shotCap: 14,
    blurb: 'The standard contract. Fair gaps, three lives, full score.',
  },
  ace: {
    id: 'ace',
    label: 'ACE',
    lives: 2,
    enemyHp: 1.3,
    fireInterval: 0.82,
    bulletSpeed: 1.12,
    wavePace: 0.92,
    scoreMult: 1.5,
    shotCap: 16,
    blurb: 'Tougher hulls, snappier guns, and half again the pay.',
  },
};

export type Upgrades = {
  fire: number;
  spread: number;
  hull: number;
  cap: number;
};

export const EMPTY_UPGRADES: Upgrades = { fire: 0, spread: 0, hull: 0, cap: 0 };
