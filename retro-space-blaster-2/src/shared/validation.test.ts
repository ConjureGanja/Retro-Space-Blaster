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
  SAVE_VERSION_KEY,
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
  const huge = { campaign: { notes: 'x'.repeat(MAX_SAVE_BYTES + 1) } };
  const result = validateSave(huge);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'SAVE_TOO_LARGE');
});

test('validateSave validates known fields and preserves legitimate legacy saves', () => {
  const save = {
    difficulty: 'ace',
    hd: false,
    introSeen: true,
    volMusic: '0.5',
    volSfx: 1,
    ship: 2,
    theme: 'theme-neon',
    hiscore: MAX_SCORE,
    campaign: { unlocked: ['n1', 's1'], completed: { n1: 'A' }, victory: false },
  };
  assert.deepEqual(validateSave(save), { ok: true, value: { ...save, volMusic: 0.5 } });
  assert.equal(validateSave({ ship: 'scout', campaign: {} }).ok, true);
  for (const [key, values] of Object.entries({
    difficulty: ['godmode', 1],
    hd: [0, 'true', null],
    introSeen: [1, {}],
    volMusic: [-0.1, 1.1, Infinity, NaN, '', '2', '0x1'],
    volSfx: [null, [], {}],
    hiscore: [-1, 1.5, '100', MAX_SCORE + 1],
    ship: ['', 'x'.repeat(65), {}, -1],
    theme: [[], 'x'.repeat(65), 'bad theme'],
    campaign: [
      null,
      [],
      42,
      'map',
      { unlocked: {} },
      { completed: [] },
      { completed: { n1: ['A'] } },
      { victory: 'yes' },
    ],
  })) {
    for (const value of values) {
      const result = validateSave({ [key]: value });
      assert.equal(result.ok, false, `${key}: ${JSON.stringify(value)}`);
      if (!result.ok) assert.equal(result.error.code, 'INVALID_SAVE');
    }
  }
});

test('validateSave bounds metadata and retains versioned deletions', () => {
  const version = '0001700000000000-00000000-0000-4000-8000-000000000001';
  const save = { [SAVE_VERSION_KEY]: { campaign: version } };
  assert.deepEqual(validateSave(save), { ok: true, value: save });
  for (const metadata of [
    [],
    null,
    { unknown: version },
    { campaign: 1 },
    { campaign: 'newest' },
  ]) {
    assert.equal(validateSave({ [SAVE_VERSION_KEY]: metadata }).ok, false);
  }
});

test('validateSave handles unserializable data and enforces the byte cap exactly', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.loop = cyclic;
  assert.equal(validateSave({ campaign: cyclic }).ok, false);
  assert.equal(validateSave({ campaign: { toJSON: () => [] } }).ok, false);
  const overhead = JSON.stringify({ campaign: { notes: '' } }).length;
  assert.equal(
    validateSave({ campaign: { notes: 'x'.repeat(MAX_SAVE_BYTES - overhead) } }).ok,
    true
  );
  assert.equal(validateSave({ campaign: { notes: 'é'.repeat(MAX_SAVE_BYTES) } }).ok, false);
});

test('normalizeDifficulty falls back to pilot', () => {
  assert.equal(normalizeDifficulty('ace'), 'ace');
  assert.equal(normalizeDifficulty('cadet'), 'cadet');
  assert.equal(normalizeDifficulty('godmode'), 'pilot');
  assert.equal(normalizeDifficulty(undefined), 'pilot');
});
