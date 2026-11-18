/**
 * The roll must answer a double tap and ignore a single tap or a late one.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { DOUBLE_TAP_MS, freshTaps, notePress } from './taps.ts';

test('a single press does not roll', () => {
  const first = notePress(freshTaps(), -1, 1000);
  assert.equal(first.roll, 0);
  assert.equal(first.memory.lastDir, -1);
});

test('a second press of the same direction inside the window rolls', () => {
  const first = notePress(freshTaps(), 1, 1000);
  const second = notePress(first.memory, 1, 1000 + DOUBLE_TAP_MS);
  assert.equal(second.roll, 1);
  // The pair is spent. The next press is the start of a new pair.
  const third = notePress(second.memory, 1, 1000 + DOUBLE_TAP_MS + 40);
  assert.equal(third.roll, 0);
});

test('the same timestamp is not a second tap', () => {
  const first = notePress(freshTaps(), -1, 500);
  const held = notePress(first.memory, -1, 500);
  assert.equal(held.roll, 0);
});

test('a press just outside the window does not roll', () => {
  const first = notePress(freshTaps(), -1, 0);
  const late = notePress(first.memory, -1, DOUBLE_TAP_MS + 1);
  assert.equal(late.roll, 0);
  assert.equal(late.memory.lastDir, -1);
});

test('the opposite direction starts a new pair', () => {
  const left = notePress(freshTaps(), -1, 0);
  const right = notePress(left.memory, 1, 100);
  assert.equal(right.roll, 0);
  assert.equal(right.memory.lastDir, 1);
});

test('left then left rolls left', () => {
  const a = notePress(freshTaps(), -1, 10);
  const b = notePress(a.memory, -1, 180);
  assert.equal(b.roll, -1);
});
