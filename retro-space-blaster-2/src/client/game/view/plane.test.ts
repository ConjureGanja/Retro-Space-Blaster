import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEPTH_SPAN,
  FAR_SCALE,
  HORIZON_Y,
  VIEW_H,
  VIEW_W,
  WORLD_H,
  WORLD_W,
  clientToWorld,
  depthScale,
  fitView,
  project,
  unproject,
} from './plane.ts';

const EPS = 1e-6;

test('near edge is full size at the bottom and the far edge is 72% at the horizon', () => {
  assert.ok(Math.abs(depthScale(0) - 1) < EPS);
  assert.ok(Math.abs(depthScale(WORLD_W) - FAR_SCALE) < EPS);
  const near = project(0, WORLD_H / 2);
  const far = project(WORLD_W, WORLD_H / 2);
  assert.ok(Math.abs(near.y - VIEW_H) < EPS);
  assert.ok(Math.abs(far.y - HORIZON_Y) < EPS);
  assert.ok(Math.abs(near.scale - 1) < EPS);
  assert.ok(Math.abs(far.scale - FAR_SCALE) < EPS);
  assert.ok(far.y < near.y);
});

test('lateral axis maps left to right and the near edge spans the world height', () => {
  const left = project(0, 0);
  const right = project(0, WORLD_H);
  const mid = project(0, WORLD_H / 2);
  assert.ok(Math.abs(left.x - (VIEW_W - WORLD_H) / 2) < EPS);
  assert.ok(Math.abs(right.x - (VIEW_W + WORLD_H) / 2) < EPS);
  assert.ok(Math.abs(mid.x - VIEW_W / 2) < EPS);
  assert.ok(Math.abs(right.x - left.x - WORLD_H) < EPS);
});

test('project then unproject returns the same floor mark', () => {
  for (const x of [0, 120, 640, 1000, WORLD_W]) {
    for (const y of [-40, 0, 180, 360, 720, 800]) {
      const p = project(x, y);
      const back = unproject(p.x, p.y);
      assert.ok(Math.abs(back.x - x) < 1e-4, `x ${x} -> ${back.x}`);
      assert.ok(Math.abs(back.y - y) < 1e-4, `y ${y} -> ${back.y}`);
    }
  }
});

test('sky and the near margin clamp onto the ends of the road', () => {
  const sky = unproject(VIEW_W / 2, 0);
  const pastNear = unproject(VIEW_W / 2, VIEW_H + 40);
  assert.ok(Math.abs(sky.x - WORLD_W) < 1e-4);
  assert.ok(Math.abs(pastNear.x - 0) < 1e-4);
});

test('forward motion on the center line moves up the glass', () => {
  const a = project(200, WORLD_H / 2);
  const b = project(800, WORLD_H / 2);
  assert.ok(b.y < a.y);
  assert.ok(Math.abs(b.x - a.x) < 1e-6);
});

test('letterbox keeps the view square to the window', () => {
  const wide = fitView(1920, 1080, 2);
  assert.ok(wide.scale > 0);
  const drawnW = VIEW_W * wide.scale;
  const drawnH = VIEW_H * wide.scale;
  assert.ok(drawnW <= 1920 + EPS);
  assert.ok(drawnH <= 1080 + EPS);
  assert.ok(Math.abs(wide.offsetX * 2 + drawnW - 1920) < 1e-4);
  assert.ok(Math.abs(wide.offsetY * 2 + drawnH - 1080) < 1e-4);

  const back = clientToWorld(
    wide.offsetX + (VIEW_W / 2) * wide.scale,
    wide.offsetY + HORIZON_Y * wide.scale,
    {
      left: 0,
      top: 0,
    },
    wide
  );
  assert.ok(Math.abs(back.x - WORLD_W) < 1e-3);
  assert.ok(Math.abs(back.y - WORLD_H / 2) < 1e-3);
});

test('ships past the near edge keep moving off the bottom of the glass', () => {
  const past = project(-200, WORLD_H / 2);
  assert.ok(past.scale > 1);
  assert.ok(past.y > VIEW_H);
});

test('depth span matches the round-circle pitch', () => {
  assert.ok(Math.abs(DEPTH_SPAN - FAR_SCALE * WORLD_W) < EPS);
  assert.ok(Math.abs(VIEW_H - HORIZON_Y - DEPTH_SPAN) < EPS);
});
