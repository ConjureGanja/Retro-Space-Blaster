import { redis } from '@devvit/web/server';
import type { LeaderboardEntry } from '../../shared/api.ts';
import { keys } from './keys.ts';

/** How many rows the game + splash show. */
export const TOP_N = 10;

/**
 * Top N scores, highest first.
 * Redis sorted sets keep members ordered by score at write time, so this read
 * is O(log n + N) no matter how many players the subreddit has.
 */
export async function getTop(limit = TOP_N): Promise<LeaderboardEntry[]> {
  const rows = await redis.zRange(keys.leaderboard(), 0, limit - 1, {
    by: 'rank',
    reverse: true,
  });
  return rows.map((row, i) => ({ rank: i + 1, username: row.member, score: row.score }));
}

/** A player's current best (0 if they've never posted a score). */
export async function getBest(username: string): Promise<number> {
  return (await redis.zScore(keys.leaderboard(), username)) ?? 0;
}

/** How many times to retry a submission that lost a race with another write. */
const MAX_TX_ATTEMPTS = 5;

/**
 * Record a score, keeping only the player's best — atomically.
 *
 * WHY A TRANSACTION: "read best, then write if higher" is two steps. Two
 * requests at once could both read 100, then write 300 and 200 in that order,
 * leaving 200 as the "best". Redis' ZADD GT flag would fix this in one command
 * but the Devvit client doesn't expose it, so we use optimistic locking:
 *   WATCH the leaderboard → read → MULTI/ZADD/EXEC.
 * If anything touched the leaderboard between WATCH and EXEC, Redis aborts
 * the EXEC and we simply try again with fresh data.
 *
 * Analogy: editing a shared doc with "someone else changed this — reload?"
 * You never save over a version you didn't see.
 */
export async function submit(
  username: string,
  score: number
): Promise<{ best: number; improved: boolean }> {
  const key = keys.leaderboard();
  for (let attempt = 0; attempt < MAX_TX_ATTEMPTS; attempt++) {
    const tx = await redis.watch(key);
    const previous = (await redis.zScore(key, username)) ?? 0;
    if (score <= previous) {
      await tx.unwatch();
      return { best: previous, improved: false };
    }
    await tx.multi();
    await tx.zAdd(key, { member: username, score });
    let result: unknown;
    try {
      result = await tx.exec();
    } catch {
      result = null; // some clients throw on an aborted transaction — same as a conflict
    }
    // A conflicting write makes EXEC return null/empty — retry with fresh data.
    if (Array.isArray(result) && result.length > 0) return { best: score, improved: true };
  }
  throw new Error(`leaderboard submit for ${username} kept conflicting`);
}
