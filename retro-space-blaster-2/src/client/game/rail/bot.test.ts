/**
 * Autopilot survival. Pilot (normal) must clear every level and boss.
 * Cadet and Ace are reported too — Ace is allowed to be meaner, but a
 * timeout or a broken camera rule still fails the suite.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { playLevel, type PlayResult } from './bot.ts';
import { LEVELS } from './content.ts';
import type { DifficultyId } from './tune.ts';

const SEEDS = [1, 2];
const DIFFICULTIES: DifficultyId[] = ['cadet', 'pilot', 'ace'];

function runMatrix(): PlayResult[] {
  const results: PlayResult[] = [];
  for (const difficulty of DIFFICULTIES) {
    for (const level of LEVELS) {
      for (const seed of SEEDS) results.push(playLevel(level.id, difficulty, seed));
    }
  }
  return results;
}

const results = runMatrix();

function rate(rows: PlayResult[], mode: PlayResult['mode']): number {
  if (rows.length === 0) return 0;
  return rows.filter((row) => row.mode === mode).length / rows.length;
}

test('autopilot report', () => {
  console.log('\nAutopilot results (Falcon, 2 seeds)');
  for (const difficulty of DIFFICULTIES) {
    const rows = results.filter((row) => row.difficulty === difficulty);
    const cleared = rate(rows, 'clear');
    const dead = rate(rows, 'dead');
    const timed = rate(rows, 'timeout');
    console.log(
      `  ${difficulty.padEnd(6)}  clear ${(cleared * 100).toFixed(0)}%  dead ${(dead * 100).toFixed(0)}%  timeout ${(timed * 100).toFixed(0)}%  (${rows.length} runs)`
    );
    for (const level of LEVELS) {
      const levelRows = rows.filter((row) => row.levelId === level.id);
      const bits = levelRows
        .map((row) => `${row.mode} hits=${row.hits} lives=${row.lives} frames=${row.frames}`)
        .join(' | ');
      console.log(`    ${level.id.padEnd(8)} ${bits}`);
    }
  }
  assert.ok(results.length === LEVELS.length * DIFFICULTIES.length * SEEDS.length);
});

test('camera rules hold for every autopilot run', () => {
  for (const row of results) {
    assert.deepEqual(
      row.audit,
      [],
      `${row.difficulty} ${row.levelId} seed ${row.seed}: ${row.audit.join('; ')}`
    );
  }
});

test('the autopilot clears normal difficulty on every level', () => {
  const pilot = results.filter((row) => row.difficulty === 'pilot');
  const failed = pilot.filter((row) => row.mode !== 'clear');
  assert.deepEqual(
    failed.map((row) => `${row.levelId}#${row.seed}:${row.mode}:hits${row.hits}`),
    []
  );
});
