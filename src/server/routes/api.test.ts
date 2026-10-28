import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { MAX_SAVE_BYTES } from '../../shared/validation.ts';

let limiterThrows = false;
let calls = 0;
const context = { userId: 'user', username: 'pilot', postId: 'post', subredditName: 'space' };
let saved: string | undefined;
const redis = {
  incrBy: async () => {
    calls++;
    if (limiterThrows) throw new Error('Redis unavailable');
    return 1;
  },
  expire: async () => undefined,
  get: async () => saved,
  watch: async () => ({
    unwatch: async () => undefined,
    multi: async () => undefined,
    set: async (_key: string, value: string) => {
      saved = value;
    },
    exec: async () => ['OK'],
  }),
  zScore: async () => 100,
  zRange: async () => [],
};
Reflect.set(globalThis, '__apiTestRuntime', { context, redis });
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@devvit/web/server') {
      return {
        url: 'data:text/javascript,export const {context,redis}=globalThis.__apiTestRuntime;',
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
const { api } = await import('./api.ts');

beforeEach(() => {
  calls = 0;
  saved = undefined;
  limiterThrows = false;
});

const post = (path: string, body: unknown) =>
  api.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('save validation maps invalid fields to 400 and size errors to 413', async () => {
  const invalid = await post('/save', { save: { hd: 'true' } });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { status: 'error', message: 'invalid save field: hd' });
  const oversized = await post('/save', {
    save: { campaign: { notes: 'x'.repeat(MAX_SAVE_BYTES) } },
  });
  assert.equal(oversized.status, 413);
  assert.equal(calls, 0, 'validation must not consume rate quota');
});

test('both routes reject oversized bodies before parsing or touching Redis', async () => {
  for (const [path, size] of [
    ['/save', MAX_SAVE_BYTES + 1024],
    ['/score', 1024],
  ] satisfies Array<[string, number]>) {
    for (const withLength of [false, true]) {
      const body = 'not JSON'.repeat(size);
      const response = await api.request(path, {
        method: 'POST',
        headers: withLength ? { 'Content-Length': String(body.length) } : {},
        body,
      });
      assert.equal(response.status, 413);
      assert.deepEqual(await response.json(), { status: 'error', message: 'body too large' });
    }
  }
  assert.equal(calls, 0);
});

test('rate limiter backend failures use route-specific 500 envelopes', async () => {
  limiterThrows = true;
  for (const [path, body, message] of [
    ['/save', { save: { hd: true } }, 'save failed'],
    ['/score', { score: 100 }, 'score failed'],
  ] satisfies Array<[string, unknown, string]>) {
    const response = await post(path, body);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { status: 'error', message });
  }
});

test('valid save and score requests keep their response contracts', async () => {
  const response = await post('/save', { save: { hd: true } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { type: 'save', ok: true });
  const score = await post('/score', { score: 50, difficulty: 'ace' });
  assert.equal(score.status, 200);
  assert.deepEqual(await score.json(), {
    type: 'score',
    best: 100,
    improved: false,
    leaderboard: [],
  });
});
