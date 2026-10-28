/**
 * Server logic tests against an in-memory fake of Devvit's Redis.
 *
 * WHY A FAKE: the real Redis only exists inside Reddit's runtime. We swap the
 * handful of methods our code calls for a tiny Map-backed stand-in, which lets
 * us force the nasty cases (a write conflict mid-transaction, a counter that
 * lost its expiry) that would be near-impossible to trigger on demand live.
 * Analogy: a crash-test dummy — not a real driver, but you can stage the
 * exact collision you want to study, as often as you like.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { redis } from '@devvit/web/server';
import { submit, getBest } from './leaderboard.ts';
import { allow } from './rate-limit.ts';

type FakeState = {
  zsets: Map<string, Map<string, number>>;
  counters: Map<string, number>;
  ttls: Map<string, number>;
  /** When > 0, the next N EXECs report a conflict (as if another write landed). */
  conflicts: number;
  execCalls: number;
};

const state: FakeState = {
  zsets: new Map(),
  counters: new Map(),
  ttls: new Map(),
  conflicts: 0,
  execCalls: 0,
};

const zset = (key: string) => {
  let set = state.zsets.get(key);
  if (!set) state.zsets.set(key, (set = new Map()));
  return set;
};

/** Replace the Redis methods our code uses with the fake. */
function installFake(): void {
  const r = redis as unknown as Record<string, unknown>;
  r.zScore = async (key: string, member: string) => zset(key).get(member);
  r.incrBy = async (key: string, by: number) => {
    const next = (state.counters.get(key) ?? 0) + by;
    state.counters.set(key, next);
    return next;
  };
  r.expire = async (key: string, seconds: number) => {
    state.ttls.set(key, seconds);
  };
  r.expireTime = async (key: string) => (state.ttls.has(key) ? 1_900_000_000 : -1);
  r.watch = async () => {
    const queued: Array<() => void> = [];
    return {
      unwatch: async () => {},
      multi: async () => {},
      zAdd: async (key: string, m: { member: string; score: number }) => {
        queued.push(() => zset(key).set(m.member, m.score));
      },
      exec: async () => {
        state.execCalls++;
        if (state.conflicts > 0) {
          state.conflicts--;
          return null; // aborted: someone else wrote the watched key
        }
        queued.forEach((run) => run());
        return queued.map(() => 1);
      },
    };
  };
}

beforeEach(() => {
  state.zsets.clear();
  state.counters.clear();
  state.ttls.clear();
  state.conflicts = 0;
  state.execCalls = 0;
  installFake();
});

test('submit keeps the best score and ignores lower ones', async () => {
  assert.deepEqual(await submit('alex', 300), { best: 300, improved: true });
  assert.deepEqual(await submit('alex', 200), { best: 300, improved: false });
  assert.equal(await getBest('alex'), 300);
});

test('submit retries after a transaction conflict instead of losing the write', async () => {
  state.conflicts = 2; // first two EXECs collide with another writer
  assert.deepEqual(await submit('alex', 500), { best: 500, improved: true });
  assert.equal(state.execCalls, 3);
  assert.equal(await getBest('alex'), 500);
});

test('submit gives up (throws) rather than looping forever', async () => {
  state.conflicts = 99;
  await assert.rejects(() => submit('alex', 500));
});

test('allow() permits up to the limit, then refuses', async () => {
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await allow('k', 3, 60));
  assert.deepEqual(results, [true, true, true, false]);
  assert.equal(state.ttls.get('k'), 60);
});

test('allow() self-heals a counter that lost its expiry', async () => {
  state.counters.set('stuck', 50); // over the limit and NO ttl — would lock out forever
  assert.equal(await allow('stuck', 3, 60), false);
  assert.equal(state.ttls.get('stuck'), 60, 'a TTL is restored so the lockout ends');
});
