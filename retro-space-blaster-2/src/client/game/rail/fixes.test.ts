/**
 * Regression tests for bugs found in review of the integration PR.
 *
 * Analogy: a sign on a door that once stuck. Each test is there so the same
 * door cannot quietly jam again.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { LANE_BEAT_FRAMES, safeLaneForBeat } from './content.ts';
import { project, unproject } from './project.ts';
import { IDLE, createRun, laneOf, step, type Run } from './sim.ts';
import { TUNE } from './tune.ts';

test('phase dash goes the way you steer, up is negative y', () => {
  const run = createRun({ shipIdx: 3, seed: 1 });
  run.energy = run.ship.ability.max;
  run.player.x = 0;
  run.player.y = 0;
  step(run, { ...IDLE, ay: -1, feel: 'keys', special: true });
  assert.ok(run.player.y < -20, `dashed to y=${run.player.y}, expected upward`);
});

/** A hostile shot that stays put, so the test controls exactly where it is. */
function parkedShot(x: number): Run['eShots'][number] {
  return {
    x,
    y: 0,
    z: 500,
    vz: 0,
    r: 4,
    damage: 1,
    bornZ: 500,
    friendly: false,
    grazed: false,
  };
}

/**
 * Step with only the parked shot alive, so natural enemy fire cannot muddy the
 * result. Enemies are cleared before every step for the same reason.
 */
function stepWithOnly(run: Run, shot: Run['eShots'][number], frames: number): void {
  for (let i = 0; i < frames; i += 1) {
    run.enemies = [];
    run.eShots = [shot];
    step(run, IDLE);
  }
}

test('the shown lane holds while a live shot sits in the lane about to light up', () => {
  const run = createRun({ seed: 1 });
  // Beat 1 lights the center lane (x = 0). An aimed shot is parked right there.
  const before = laneOf(run);
  stepWithOnly(run, parkedShot(0), LANE_BEAT_FRAMES + 60);
  assert.equal(laneOf(run), before, 'lane moved into a live shot');
});

test('a slowed shot still holds the lane after any fixed timer would have expired', () => {
  const run = createRun({ seed: 1 });
  run.salvoUntil = 0;
  stepWithOnly(run, parkedShot(10), LANE_BEAT_FRAMES + 20);
  assert.equal(laneOf(run), safeLaneForBeat(0));
});

test('once the shot is gone the lane catches up', () => {
  const run = createRun({ seed: 1 });
  stepWithOnly(run, parkedShot(0), LANE_BEAT_FRAMES + 20);
  run.eShots = [];
  run.enemies = [];
  step(run, IDLE);
  assert.equal(laneOf(run), safeLaneForBeat(1));
});

test('a shot far from the next lane does not freeze the lane', () => {
  const run = createRun({ seed: 1 });
  stepWithOnly(run, parkedShot(130), LANE_BEAT_FRAMES + 2);
  assert.equal(laneOf(run), safeLaneForBeat(1));
});

test('every legal ship position projects inside a landscape phone screen', () => {
  for (const [w, h] of [
    [844, 390],
    [667, 375],
    [1280, 720],
  ] as const) {
    for (const x of [-TUNE.PLAY_X, TUNE.PLAY_X]) {
      for (const y of [-TUNE.PLAY_Y, TUNE.PLAY_Y]) {
        const p = project(x, y, 0, w, h);
        assert.ok(p.x >= 0 && p.x <= w, `x ${p.x} off a ${w}px screen`);
        assert.ok(p.y >= 0 && p.y <= h, `y ${p.y} off a ${h}px screen`);
      }
    }
  }
});

test('unproject is the exact inverse of project on the ship plane', () => {
  const [w, h] = [844, 390];
  const p = project(60, -30, 0, w, h);
  const back = unproject(p.x, p.y, w, h);
  assert.ok(Math.abs(back.x - 60) < 1e-6 && Math.abs(back.y + 30) < 1e-6);
});
