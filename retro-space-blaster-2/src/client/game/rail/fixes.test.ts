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
import { IDLE, createRun, laneOf, step } from './sim.ts';
import { TUNE } from './tune.ts';

test('phase dash goes the way you steer, up is negative y', () => {
  const run = createRun({ shipIdx: 3, seed: 1 });
  run.energy = run.ship.ability.max;
  run.player.x = 0;
  run.player.y = 0;
  step(run, { ...IDLE, ay: -1, feel: 'keys', special: true });
  assert.ok(run.player.y < -20, `dashed to y=${run.player.y}, expected upward`);
});

test('the shown safe lane holds while a patterned volley is in the air', () => {
  const run = createRun({ seed: 1 });
  run.salvoUntil = LANE_BEAT_FRAMES * 3;
  const before = laneOf(run);
  for (let i = 0; i < LANE_BEAT_FRAMES * 2; i += 1) step(run, IDLE);
  assert.equal(laneOf(run), before, 'lane moved under an in-flight volley');
});

test('the safe lane catches up once the volleys are gone', () => {
  const run = createRun({ seed: 1 });
  run.salvoUntil = 0;
  for (let i = 0; i < LANE_BEAT_FRAMES + 2; i += 1) step(run, IDLE);
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
