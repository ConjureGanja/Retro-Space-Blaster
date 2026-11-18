import assert from 'node:assert/strict';
import test from 'node:test';
import { easeRoll, MAX_ROLL } from './roll.ts';

test('roll eases toward a sideways shove and back to level', () => {
  let roll = 0;
  for (let i = 0; i < 40; i++) roll = easeRoll(roll, 6.5);
  assert.ok(roll > MAX_ROLL * 0.95);
  assert.ok(roll <= MAX_ROLL + 1e-6);

  let mid = 0;
  for (let i = 0; i < 8; i++) mid = easeRoll(mid, 3.2);
  assert.ok(mid > 0.05 && mid < MAX_ROLL * 0.7);

  for (let i = 0; i < 40; i++) roll = easeRoll(roll, 0);
  assert.equal(roll, 0);
});

test('a left shove rolls the other way', () => {
  let roll = 0;
  for (let i = 0; i < 30; i++) roll = easeRoll(roll, -6.5);
  assert.ok(roll < 0);
});
