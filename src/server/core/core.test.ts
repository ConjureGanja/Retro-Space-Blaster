/**
 * Server logic tests against an in-memory fake of Devvit's Redis.
 *
 * WHY A FAKE: the real Redis only exists inside Reddit's runtime. The modules
 * under test accept their Redis as an optional parameter typed from the real
 * client (LeaderboardDb / CounterDb), so this fake is checked by the COMPILER
 * against the real API — if Devvit changes a signature, this file stops
 * compiling instead of silently drifting. It also lets us stage the nasty
 * cases (a write conflict mid-transaction, a counter that lost its expiry)
 * that are near-impossible to trigger on demand live.
 * Analogy: a crash-test dummy built to the exact measurements of a real
 * driver — you can stage the collision you want, as often as you like.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { submit, getBest, type LeaderboardDb, type LeaderboardTx } from './leaderboard.ts';
import { allow, type CounterDb } from './rate-limit.ts';

type Member = { member: string; score: number };

const zsets = new Map<string, Map<string, number>>();
const counters = new Map<string, number>();
const ttls = new Map<string, number>();
/** When > 0, the next N EXECs report a conflict (as if another write landed). */
let conflicts = 0;
let execCalls = 0;

const zset = (key: string): Map<string, number> => {
  let set = zsets.get(key);
  if (!set) {
    set = new Map();
    zsets.set(key, set);
  }
  return set;
};

const fakeLeaderboard: LeaderboardDb = {
  zScore: async (key: string, member: string) => zset(key).get(member),
  zRange: async (key: string) =>
    [...zset(key)].map(([member, score]) => ({ member, score })).sort((a, b) => b.score - a.score),
  watch: async (): Promise<LeaderboardTx> => {
    const queued: Array<() => void> = [];
    return {
      unwatch: async () => undefined,
      multi: async () => undefined,
      zAdd: async (key: string, ...members: Member[]) => {
        for (const m of members) queued.push(() => zset(key).set(m.member, m.score));
      },
      exec: async () => {
        execCalls++;
        if (conflicts > 0) {
          conflicts--;
          return null; // aborted: someone else wrote the watched key
        }
        queued.forEach((run) => run());
        return queued.map(() => 1);
      },
    };
  },
};

const fakeCounters: CounterDb = {
  incrBy: async (key: string, by: number) => {
    const next = (counters.get(key) ?? 0) + by;
    counters.set(key, next);
    return next;
  },
  expire: async (key: string, seconds: number) => {
    ttls.set(key, seconds);
  },
  expireTime: async (key: string) => (ttls.has(key) ? 1_900_000_000 : -1),
};

beforeEach(() => {
  zsets.clear();
  counters.clear();
  ttls.clear();
  conflicts = 0;
  execCalls = 0;
});

test('submit keeps the best score and ignores lower ones', async () => {
  assert.deepEqual(await submit('alex', 300, fakeLeaderboard), { best: 300, improved: true });
  assert.deepEqual(await submit('alex', 200, fakeLeaderboard), { best: 300, improved: false });
  assert.equal(await getBest('alex', fakeLeaderboard), 300);
});

test('submit retries after a transaction conflict instead of losing the write', async () => {
  conflicts = 2; // first two EXECs collide with another writer
  assert.deepEqual(await submit('alex', 500, fakeLeaderboard), { best: 500, improved: true });
  assert.equal(execCalls, 3);
  assert.equal(await getBest('alex', fakeLeaderboard), 500);
});

test('submit gives up (throws) rather than looping forever', async () => {
  conflicts = 99;
  await assert.rejects(() => submit('alex', 500, fakeLeaderboard));
});

test('allow() permits up to the limit, then refuses', async () => {
  const results: boolean[] = [];
  for (let i = 0; i < 4; i++) results.push(await allow('k', 3, 60, fakeCounters));
  assert.deepEqual(results, [true, true, true, false]);
  assert.equal(ttls.get('k'), 60);
});

test('allow() self-heals a counter that lost its expiry', async () => {
  counters.set('stuck', 50); // over the limit and NO ttl — would lock out forever
  assert.equal(await allow('stuck', 3, 60, fakeCounters), false);
  assert.equal(ttls.get('stuck'), 60, 'a TTL is restored so the lockout ends');
});
