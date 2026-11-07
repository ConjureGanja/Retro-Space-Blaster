import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeSave, type SaveDb, type SaveTx } from './saves.ts';
import { MAX_SAVE_BYTES } from '../../shared/validation.ts';

let raw: string | undefined;
let revision = 0;
let conflict: (() => void) | undefined;
const db: SaveDb = {
  get: async () => raw,
  watch: async (): Promise<SaveTx> => {
    const observed = revision;
    let queued = '';
    let closed = false;
    return {
      unwatch: async () => {
        assert.equal(closed, false, 'EXEC already closed this transaction');
      },
      multi: async () => undefined,
      set: async (_key, value) => {
        queued = value;
      },
      exec: async () => {
        closed = true;
        conflict?.();
        conflict = undefined;
        if (observed !== revision) return null;
        raw = queued;
        revision++;
        return ['OK'];
      },
    };
  },
};
const stamp = (n: number) => `000170000000000${n}-00000000-0000-4000-8000-000000000001`;
const save = (field: string, value: unknown, n: number) => ({
  [field]: value,
  __versions: { [field]: stamp(n) },
});

beforeEach(() => {
  raw = undefined;
  revision = 0;
  conflict = undefined;
});

test('stale full snapshots preserve newer unrelated fields and high scores', async () => {
  await writeSave('user', save('campaign', { victory: true }, 2), db);
  await writeSave(
    'user',
    {
      campaign: { victory: false },
      hd: true,
      __versions: { campaign: stamp(1), hd: stamp(3) },
    },
    db
  );
  assert.deepEqual((await loadSave('user', db))?.campaign, { victory: true });
  assert.equal((await loadSave('user', db))?.hd, true);
  await writeSave('user', save('hiscore', 100, 4), db);
  await writeSave('user', save('hiscore', 10, 5), db);
  assert.equal((await loadSave('user', db))?.hiscore, 100);
});

test('tombstones survive stale and legacy uploads, while newer edits can restore values', async () => {
  await writeSave('user', save('hd', true, 1), db);
  await writeSave('user', { __versions: { hd: stamp(2) } }, db);
  await writeSave('user', save('hd', true, 1), db);
  await writeSave('user', { hd: true, theme: 'theme-neon' }, db);
  assert.equal('hd' in ((await loadSave('user', db)) ?? {}), false);
  assert.equal((await loadSave('user', db))?.theme, 'theme-neon');
  await writeSave('user', save('hd', false, 3), db);
  assert.equal((await loadSave('user', db))?.hd, false);
});

test('transaction retries merge a concurrent update instead of replacing it', async () => {
  conflict = () => {
    raw = JSON.stringify(save('campaign', { victory: true }, 2));
    revision++;
  };
  await writeSave('user', save('hd', true, 3), db);
  assert.deepEqual((await loadSave('user', db))?.campaign, { victory: true });
  assert.equal((await loadSave('user', db))?.hd, true);
});

test('merged saves are size-checked before committing', async () => {
  raw = JSON.stringify({ campaign: { notes: 'x'.repeat(MAX_SAVE_BYTES - 40) } });
  const before = raw;
  const result = await writeSave('user', save('theme', 'theme-neon', 1), db);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'SAVE_TOO_LARGE');
  assert.equal(raw, before);
});

test('stored invalid saves are not returned to clients', async () => {
  raw = JSON.stringify({ campaign: false });
  assert.equal(await loadSave('user', db), null);
});
