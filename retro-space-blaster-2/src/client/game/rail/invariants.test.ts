/**
 * The camera rules, stated as tests. If a future change lets a live enemy
 * or a live enemy shot sit closer than the cull line — or birth a shot from
 * past the no-fire line — these fail before a player has to discover it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVELS } from './content.ts';
import { IDLE, audit, createRun, step } from './sim.ts';
import { TUNE } from './tune.ts';

test('a threat already past the cull line is removed and cannot shoot', () => {
  const state = createRun({ levelId: 'nebula', boss: true, seed: 1 });
  const boss = state.enemies[0];
  assert.ok(boss);
  boss.z = TUNE.Z_CULL - 40;
  boss.windup = 1;
  boss.pending = [{ x: 0, y: 0, r: 7 }];
  boss.fireCd = 0;
  step(state, IDLE);
  assert.deepEqual(audit(state), []);
  assert.equal(
    state.enemies.some((enemy) => enemy.z < TUNE.Z_CULL),
    false
  );
  assert.equal(
    state.eShots.some((shot) => shot.bornZ < TUNE.Z_NO_FIRE),
    false
  );
});

test('an enemy shot already behind the cull line does not survive the step', () => {
  const state = createRun({ levelId: 'station', seed: 2 });
  state.eShots.push({
    x: 0,
    y: 0,
    z: TUNE.Z_CULL - 8,
    vz: -4,
    r: 7,
    damage: 1,
    bornZ: TUNE.Z_NO_FIRE,
    friendly: false,
  });
  step(state, IDLE);
  assert.deepEqual(audit(state), []);
  assert.equal(state.eShots.length, 0);
});

test('audit flags a shot that was born past the no-fire line', () => {
  const state = createRun({ levelId: 'ice', seed: 3 });
  state.eShots.push({
    x: 0,
    y: 0,
    z: 400,
    vz: -4,
    r: 7,
    damage: 1,
    bornZ: TUNE.Z_NO_FIRE - 12,
    friendly: false,
  });
  const problems = audit(state);
  assert.ok(problems.some((line) => line.includes('no-fire')));
});

test('scripted waves and a boss never park a live threat behind the ship', () => {
  for (const level of LEVELS) {
    const waves = createRun({ levelId: level.id, difficulty: 'pilot', seed: 4 });
    for (let frame = 0; frame < 700; frame++) {
      step(waves, IDLE);
      const problems = audit(waves);
      assert.deepEqual(problems, [], `${level.id} waves: ${problems.join('; ')}`);
    }
    const boss = createRun({
      levelId: level.id,
      difficulty: 'ace',
      boss: true,
      seed: 5,
      invincible: true,
    });
    for (let frame = 0; frame < 500; frame++) {
      step(boss, IDLE);
      const problems = audit(boss);
      assert.deepEqual(problems, [], `${level.id} boss: ${problems.join('; ')}`);
    }
  }
});
