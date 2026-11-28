/**
 * A cautious autopilot used by the playability tests.
 *
 * It does not cheat: same speed, same hitbox, same trigger delay as Falcon.
 * Each frame it samples places it can actually reach and keeps the one that
 * isn't about to be tagged, preferring the spot that still lines its guns up.
 *
 * Analogy: a student driver who checks the mirrors, then aims the car at the
 * gap rather than at the oncoming truck.
 */

import { audit, createRun, laneOf, playerSpeed, step, type Input, type Run } from './sim.ts';
import { TUNE } from './tune.ts';

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

type Point = { x: number; y: number };

function along(from: Point, to: Point, maxStep: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001 || maxStep >= dist) return { x: to.x, y: to.y };
  return { x: from.x + (dx / dist) * maxStep, y: from.y + (dy / dist) * maxStep };
}

function dangerAt(state: Run, point: Point): number {
  const speed = playerSpeed(state);
  let danger = 0;
  const pilot = state.player;
  // Extra pixels past the real hit circle. Sitting on the paint gets you clipped
  // when the next frame doesn't land exactly on the sample.
  const margin = 12;
  for (const shot of state.eShots) {
    const inSlab = shot.z <= TUNE.Z_IMPACT;
    const eta = inSlab ? 0 : (shot.z - TUNE.Z_IMPACT) / Math.abs(shot.vz || 1);
    if (!inSlab && eta > 150) continue;
    const at = along(pilot, point, speed * (inSlab ? 1 : eta));
    const gap = Math.hypot(at.x - shot.x, at.y - shot.y) - (shot.r + TUNE.PLAYER_R + margin);
    if (gap < 0) danger += 120;
    else if (gap < 14) danger += 14 - gap;
  }
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    if (enemy.kind !== 'kamikaze' && enemy.kind !== 'mine') continue;
    // A diver hasn't promised a lane until the wind-up starts. After that,
    // the locked point is the truck; the current x is a decoy.
    if (enemy.kind === 'kamikaze' && enemy.mode === 'cruise') continue;
    const aimX = enemy.kind === 'kamikaze' ? enemy.lockX : enemy.x;
    const aimY = enemy.kind === 'kamikaze' ? enemy.lockY : enemy.y;
    const eta =
      enemy.kind === 'kamikaze' && enemy.mode === 'windup'
        ? enemy.windup + Math.max(0, (enemy.z - TUNE.Z_IMPACT) / 8)
        : (enemy.z - TUNE.Z_IMPACT) / Math.max(0.8, Math.abs(enemy.vz));
    // Far hazards aren't a reason to abandon the shot you're lining up.
    if (eta < -1 || eta > 80) continue;
    const dx = point.x - pilot.x;
    const dy = point.y - pilot.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.min(dist, speed * Math.max(0, eta));
    const px = dist < 0.001 ? pilot.x : pilot.x + (dx / dist) * step;
    const py = dist < 0.001 ? pilot.y : pilot.y + (dy / dist) * step;
    const gap = Math.hypot(px - aimX, py - aimY) - (enemy.r + TUNE.PLAYER_R + 6);
    if (gap < 0) danger += enemy.kind === 'kamikaze' ? 90 : 50;
  }
  return danger;
}

/** Who the guns should be lined up on. Closer threats first, boss if the lane is empty. */
function aimPoint(state: Run): Point {
  let best: { x: number; y: number; z: number } | null = null;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    if (enemy.kind === 'kamikaze' && enemy.mode !== 'cruise') continue;
    // A bubbled hull is a decoy. Shoot the dish, or wait until the bubble pops.
    if (enemy.bubble > 0) continue;
    const rank = enemy.kind === 'generator' ? enemy.z - 80 : enemy.boss ? enemy.z - 120 : enemy.z;
    if (!best || rank < best.z) best = { x: enemy.x, y: enemy.y, z: rank };
  }
  if (!best) return { x: state.player.x, y: state.player.y };
  return { x: best.x, y: best.y };
}

export function botIntent(state: Run): Input {
  const target = aimPoint(state);
  const lane = laneOf(state);
  const samples: Point[] = [
    { x: state.player.x, y: state.player.y },
    target,
    { x: lane, y: state.player.y },
    { x: lane, y: 0 },
  ];
  for (const dist of [24, 52, 88]) {
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      samples.push({
        x: clamp(state.player.x + Math.cos(angle) * dist, -TUNE.PLAY_X, TUNE.PLAY_X),
        y: clamp(state.player.y + Math.sin(angle) * dist, -TUNE.PLAY_Y, TUNE.PLAY_Y),
      });
    }
  }
  for (const x of [-120, -60, 0, 60, 120]) {
    for (const y of [-40, 0, 40]) samples.push({ x, y });
  }

  let best = samples[0] ?? { x: 0, y: 0 };
  let bestScore = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const danger = dangerAt(state, sample);
    const align = Math.hypot(sample.x - target.x, sample.y - target.y);
    const score = danger * 200 + align;
    if (score < bestScore) {
      bestScore = score;
      best = sample;
    }
  }
  // Roll when the spot we're in is bad and a sideways burst is cleaner.
  // Same speed limit as a person: only if the roll is off cooldown.
  let roll: -1 | 0 | 1 = 0;
  if (state.player.rollT <= 0 && state.player.rollCd <= 0) {
    const here = dangerAt(state, { x: state.player.x, y: state.player.y });
    if (here > 40) {
      const left = dangerAt(state, {
        x: clamp(state.player.x - 70, -TUNE.PLAY_X, TUNE.PLAY_X),
        y: state.player.y,
      });
      const right = dangerAt(state, {
        x: clamp(state.player.x + 70, -TUNE.PLAY_X, TUNE.PLAY_X),
        y: state.player.y,
      });
      if (Math.min(left, right) + 10 < here) roll = left <= right ? -1 : 1;
    }
  }
  return {
    ax: 0,
    ay: 0,
    useAim: true,
    aimX: best.x,
    aimY: best.y,
    fire: true,
    special: false,
    feel: 'chase',
    roll,
  };
}

export type PlayResult = {
  levelId: string;
  difficulty: string;
  seed: number;
  mode: 'clear' | 'dead' | 'timeout';
  frames: number;
  lives: number;
  hits: number;
  score: number;
  audit: string[];
};

/** Fly one level with the autopilot. Stops on clear, death, a broken rule, or the frame cap. */
export function playLevel(
  levelId: string,
  difficulty: 'cadet' | 'pilot' | 'ace',
  seed: number
): PlayResult {
  const state = createRun({ levelId, difficulty, shipIdx: 1, seed });
  const cap = 14000;
  let frames = 0;
  let problems: string[] = [];
  while (state.mode !== 'clear' && state.mode !== 'dead' && frames < cap) {
    step(state, botIntent(state));
    frames += 1;
    problems = audit(state);
    if (problems.length > 0) break;
  }
  let mode: PlayResult['mode'] = 'timeout';
  if (problems.length === 0 && (state.mode === 'clear' || state.mode === 'dead')) mode = state.mode;
  return {
    levelId,
    difficulty,
    seed,
    mode,
    frames,
    lives: state.player.lives,
    hits: state.hits,
    score: state.score,
    audit: problems,
  };
}
