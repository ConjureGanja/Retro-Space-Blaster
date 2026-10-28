import { redis } from '@devvit/web/server';
import type { LeaderboardEntry } from '../../shared/api';
import { keys } from './keys';

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

/**
 * Record a score, keeping only the player's best.
 * (Redis' ZADD GT flag would do this atomically, but it isn't exposed by the
 * Devvit client, so we compare first. Worst case under a race: the lower of
 * two near-simultaneous scores wins once — harmless, and the next run fixes it.)
 */
export async function submit(
  username: string,
  score: number
): Promise<{ best: number; improved: boolean }> {
  const previous = await getBest(username);
  if (score <= previous) return { best: previous, improved: false };
  await redis.zAdd(keys.leaderboard(), { member: username, score });
  return { best: score, improved: true };
}
