/**
 * Dodgeability. A pattern is legal when a ship, moving no faster than it
 * really can, has a route that never overlaps a live hit circle.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVELS } from './content.ts';
import { pathExists, type Threat } from './dodge.ts';
import { IDLE, createRun, playerSpeed, step } from './sim.ts';
import { TUNE } from './tune.ts';

const bounds = { x: TUNE.PLAY_X, y: TUNE.PLAY_Y };

test('a floor covered in overlapping circles is not dodgeable', () => {
  const threats: Threat[] = [];
  for (let x = -TUNE.PLAY_X; x <= TUNE.PLAY_X; x += 16) {
    for (let y = -TUNE.PLAY_Y; y <= TUNE.PLAY_Y; y += 16) {
      threats.push({ x, y, r: 18 });
    }
  }
  assert.equal(pathExists([threats], 5.5, { x: 0, y: 0 }, bounds), false);
});

test('a gap that slides slower than the ship stays reachable', () => {
  // A corridor of clear air between two walls. It starts on the ship and
  // walks right slower than the ship can fly, so a route can stay inside it.
  const frames: Threat[][] = [];
  for (let frame = 0; frame < 80; frame++) {
    const gap = frame * 1.2;
    const row: Threat[] = [];
    for (let y = -bounds.y; y <= bounds.y; y += 20) {
      row.push({ x: gap - 70, y, r: 26 });
      row.push({ x: gap + 70, y, r: 26 });
    }
    frames.push(row);
  }
  assert.equal(pathExists(frames, 5.5, { x: 0, y: 0 }, bounds), true);
});

test('every boss pattern leaves a path the ship can reach', () => {
  for (const level of LEVELS) {
    const state = createRun({
      levelId: level.id,
      difficulty: 'ace',
      boss: true,
      invincible: true,
      record: true,
      seed: 2,
    });
    for (let frame = 0; frame < 720; frame++) step(state, IDLE);
    const speed = playerSpeed(state);
    const ok = pathExists(state.threats, speed, { x: 0, y: 0 }, bounds);
    assert.equal(ok, true, `${level.boss.name} left no reachable gap`);
  }
});
