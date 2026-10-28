/**
 * Unit tests for the server's input bouncer. Run with `npm run test:unit`.
 * Uses Node's built-in test runner — zero extra dependencies.
 *
 * Each test is one "would a cheater try this?" scenario. If you loosen a rule
 * in validation.ts, a test here should fail and make you think twice.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SAVE_BYTES,
  MAX_SCORE,
  normalizeDifficulty,
  validateSave,
  validateScore,
} from './validation.ts';

test('validateScore accepts ordinary whole scores', () => {
  assert.deepEqual(validateScore(0), { ok: true, value: 0 });
  assert.deepEqual(validateScore(123_456), { ok: true, value: 123_456 });
  assert.deepEqual(validateScore(MAX_SCORE), { ok: true, value: MAX_SCORE });
});

test('validateScore rejects forged or broken values', () => {
  for (const bad of [-1, 1.5, NaN, Infinity, MAX_SCORE + 1, '9999', null, undefined, {}]) {
    assert.equal(validateScore(bad).ok, false, `should reject ${String(bad)}`);
  }
});

test('validateSave keeps only whitelisted keys', () => {
  const result = validateSave({
    theme: 'theme-neon',
    hiscore: 5000,
    isAdmin: true, // not a save key — must be dropped
    __proto__: { polluted: true },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, { theme: 'theme-neon', hiscore: 5000 });
    assert.equal('isAdmin' in result.value, false);
  }
});

test('validateSave rejects non-objects', () => {
  for (const bad of [null, 'save', 42, [1, 2, 3], undefined]) {
    assert.equal(validateSave(bad).ok, false, `should reject ${JSON.stringify(bad)}`);
  }
});

test('validateSave rejects oversized saves', () => {
  const huge = { campaign: 'x'.repeat(MAX_SAVE_BYTES + 1) };
  assert.equal(validateSave(huge).ok, false);
});

test('normalizeDifficulty falls back to pilot', () => {
  assert.equal(normalizeDifficulty('ace'), 'ace');
  assert.equal(normalizeDifficulty('cadet'), 'cadet');
  assert.equal(normalizeDifficulty('godmode'), 'pilot');
  assert.equal(normalizeDifficulty(undefined), 'pilot');
});
