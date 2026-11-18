/**
 * The crosshair is a promise about the bullet, not a decoration.
 * Where the mark sits is where the shot still is when it reaches that depth.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { assistOrigin, reticleMarks } from './reticle.ts';
import { IDLE, createRun, step } from './sim.ts';

const SHIPS = [1, 2, 3, 4, 5];
const SPREADS = [0, 1, 2];

test('every barrel mark matches the bullet at the reticle depth', () => {
  for (const shipIdx of SHIPS) {
    for (const spread of SPREADS) {
      const state = createRun({
        shipIdx,
        seed: 1,
        levelId: 'nebula',
        upgrades: { fire: 0, spread, hull: 0, cap: 0 },
      });
      state.player.x = 12;
      state.player.y = -5;
      step(state, { ...IDLE, fire: true });
      const marks = reticleMarks(state.player.x, state.player.y, spread);
      assert.equal(state.pShots.length, marks.length, `ship ${shipIdx} spread ${spread}`);
      for (const shot of state.pShots) {
        // Fly the bolt out to a depth in front of the ship. X and Y stay put.
        const travel = 560;
        shot.z = travel;
        const mark = marks.find(
          (item) => Math.abs(item.x - shot.x) < 0.02 && Math.abs(item.y - shot.y) < 0.02
        );
        assert.ok(mark, `shot ${shot.x},${shot.y} has no mark for ship ${shipIdx}`);
        assert.ok(Math.abs(shot.x - mark.x) < 0.02);
        assert.ok(Math.abs(shot.y - mark.y) < 0.02);
      }
      const primary = marks.find((item) => item.primary);
      assert.ok(primary);
      assert.ok(Math.abs(primary.x - 12) < 0.02);
    }
  }
});

test('aim assist only nudges a barrel that is already close, and the mark follows', () => {
  const nudged = assistOrigin(10, 0, { x: 22, y: 0 }, true);
  assert.ok(nudged.x > 10 && nudged.x <= 16);
  assert.equal(nudged.y, 0);
  const far = assistOrigin(10, 0, { x: 80, y: 0 }, true);
  assert.equal(far.x, 10);
  const off = assistOrigin(10, 0, { x: 22, y: 0 }, false);
  assert.equal(off.x, 10);

  const state = createRun({
    shipIdx: 1,
    seed: 1,
    boss: true,
    upgrades: { fire: 0, spread: 1, hull: 0, cap: 0 },
  });
  const boss = state.enemies[0];
  assert.ok(boss);
  boss.x = 20;
  boss.y = 0;
  boss.z = 500;
  state.player.x = 10;
  state.player.y = 0;
  state.aimAssist = true;
  step(state, { ...IDLE, fire: true });
  // The boss slides on the first tick. The guns and the mark both read
  // wherever it ended, so the comparison uses that point, not the setup.
  const origin = assistOrigin(10, 0, { x: boss.x, y: boss.y }, true);
  const marks = reticleMarks(origin.x, origin.y, 1);
  assert.equal(state.pShots.length, marks.length);
  for (const shot of state.pShots) {
    const mark = marks.find(
      (item) => Math.abs(item.x - shot.x) < 0.05 && Math.abs(item.y - shot.y) < 0.05
    );
    assert.ok(mark);
    shot.z = 500;
    assert.ok(Math.abs(shot.x - mark.x) < 0.05);
  }
});
