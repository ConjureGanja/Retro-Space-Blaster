import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FAR_SCALE,
  HALF_WIDTH,
  HORIZON_Y,
  LOOK_AHEAD,
  SHIP_SCREEN_FRAC,
  VIEW_H,
  VIEW_W,
  clientToWorld,
  fitView,
  getCamera,
  project,
  setCamera,
  unproject,
} from './plane.ts';

const EPS = 1e-4;

test('the ship sits low, centered, and much larger than one world pixel', () => {
  setCamera(400, 300);
  const ship = project(400, 300);
  assert.ok(Math.abs(ship.x - VIEW_W / 2) < EPS);
  assert.ok(ship.y > VIEW_H * (2 / 3));
  assert.ok(ship.y < VIEW_H * 0.8);
  assert.ok(Math.abs(ship.y - VIEW_H * SHIP_SCREEN_FRAC) < 2);
  // Old lens was about 1 view pixel per world pixel. This crop is several times closer.
  assert.ok(ship.scale > 5);
});

test('the road ahead shrinks hard toward the horizon', () => {
  setCamera(400, 300);
  const ship = project(400, 300);
  const far = project(400 + LOOK_AHEAD, 300);
  assert.ok(far.y < ship.y);
  assert.ok(Math.abs(far.y - HORIZON_Y) < 2);
  assert.ok(far.scale < ship.scale * 0.4);
  assert.ok(far.scale / ship.scale < FAR_SCALE / 0.5);
});

test('the visible corridor fills the glass at the ship', () => {
  setCamera(400, 300);
  const right = project(400, 300 + HALF_WIDTH);
  const left = project(400, 300 - HALF_WIDTH);
  assert.ok(Math.abs(right.x - VIEW_W) < 1);
  assert.ok(Math.abs(left.x - 0) < 1);
});

test('project then unproject returns the same floor mark', () => {
  setCamera(250, 400);
  for (const dx of [-60, 0, 40, 180, 400]) {
    for (const dy of [-90, 0, 30, 100]) {
      const x = 250 + dx;
      const y = 400 + dy;
      const p = project(x, y);
      const back = unproject(p.x, p.y);
      assert.ok(Math.abs(back.x - x) < 1e-2, `x ${x} -> ${back.x}`);
      assert.ok(Math.abs(back.y - y) < 1e-2, `y ${y} -> ${back.y}`);
    }
  }
});

test('a finger in the sky aims at the far end of the filmed road', () => {
  setCamera(500, 360);
  const frame = fitView(VIEW_W, VIEW_H, 1);
  const sky = clientToWorld(VIEW_W / 2, 0, { left: 0, top: 0 }, frame);
  assert.ok(Math.abs(sky.x - (500 + LOOK_AHEAD)) < 1);
  assert.ok(Math.abs(sky.y - 360) < 1);
  assert.equal(getCamera().x, 500);
});

test('the picture covers the window instead of shrinking to fit inside it', () => {
  const tall = fitView(390, 844, 2);
  const drawnW = VIEW_W * tall.scale;
  const drawnH = VIEW_H * tall.scale;
  assert.ok(drawnW >= 390 - EPS);
  assert.ok(drawnH >= 844 - EPS);
  assert.ok(tall.offsetX < 0);
  assert.ok(Math.abs(tall.offsetY) < 1);
});
