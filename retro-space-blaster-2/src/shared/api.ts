/**
 * The API contract between the webview (src/client) and the Devvit server
 * (src/server). Both sides import these types, so if a response shape changes
 * the TypeScript build breaks on whichever side forgot to update.
 *
 * Analogy: the call sheet everyone on set works from. If the director moves
 * the shoot to 6am, every department sees the same change on the same page.
 */

/** One row on the leaderboard. */
export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
};

/**
 * Save blob synced per Reddit account. Values are loosely typed on purpose —
 * the game owns their meaning; shared validation enforces known field shapes
 * and size. Optional __versions metadata allows per-key merges and deletions.
 */
export type SaveData = Record<string, unknown>;

/** GET /api/init — everything the game needs at boot, in one round-trip. */
export type InitResponse = {
  type: 'init';
  postId: string;
  /** null when the viewer is logged out. */
  username: string | null;
  /** Saves + leaderboard are per subreddit install; the client scopes its cache by this. */
  subreddit: string;
  save: SaveData | null;
  best: number;
  leaderboard: LeaderboardEntry[];
};

/** POST /api/save body. */
export type SaveRequest = { save: SaveData };
export type SaveResponse = { type: 'save'; ok: true };

/** POST /api/score body. */
export type ScoreRequest = { score: number; difficulty?: string };
export type ScoreResponse = {
  type: 'score';
  /** Player's best after this submission. */
  best: number;
  /** True if this submission beat their previous best. */
  improved: boolean;
  leaderboard: LeaderboardEntry[];
};

/** GET /api/leaderboard — lightweight call used by the feed splash. */
export type LeaderboardResponse = {
  type: 'leaderboard';
  username: string | null;
  best: number;
  leaderboard: LeaderboardEntry[];
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
