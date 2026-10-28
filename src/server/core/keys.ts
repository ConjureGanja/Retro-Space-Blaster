/**
 * Every Redis key the app uses, in one place.
 *
 * WHY: scattered string literals like `'lb:' + x` are how two features end up
 * fighting over the same key. A single key "phone book" makes collisions
 * obvious and gives a migration path (bump the version prefix) if a data
 * format ever changes.
 *
 * Devvit gives each app installation (each subreddit) its own Redis
 * namespace, so these keys are already per-subreddit — r/A's leaderboard
 * never sees r/B's scores.
 */
export const keys = {
  /** JSON save blob for one Reddit account. */
  save: (userId: string) => `v1:save:${userId}`,
  /** Sorted set: member = username, score = that player's best run. */
  leaderboard: () => 'v1:lb:best',
  /** Rolling counter used to rate-limit score submissions. */
  scoreRate: (userId: string) => `v1:rl:score:${userId}`,
  /** Rolling counter used to rate-limit save uploads. */
  saveRate: (userId: string) => `v1:rl:save:${userId}`,
} as const;
