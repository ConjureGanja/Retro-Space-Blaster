/**
 * Public game API — called by the webview at /api/*.
 *
 * Every handler follows the same shape:
 *   1. Who's asking?    (context.userId / username — set by Reddit, unforgeable)
 *   2. Is it allowed?   (logged in? rate limit?)
 *   3. Is it valid?     (src/shared/validation.ts — never trust the body)
 *   4. Do the work      (Redis)
 *   5. Typed response   (src/shared/api.ts)
 *
 * Analogy: a bank teller. Check ID, check the line isn't being spammed,
 * check the slip is filled in correctly, *then* touch the money.
 */
import { Hono, type Context as HonoContext } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { context } from '@devvit/web/server';
import type {
  ErrorResponse,
  InitResponse,
  LeaderboardResponse,
  SaveResponse,
  ScoreResponse,
} from '../../shared/api.ts';
import {
  MAX_SAVE_BYTES,
  normalizeDifficulty,
  validateSave,
  validateScore,
  type SaveResult,
} from '../../shared/validation.ts';
import { getBest, getTop, submit } from '../core/leaderboard.ts';
import { loadSave, writeSave } from '../core/saves.ts';
import { allow } from '../core/rate-limit.ts';
import { keys } from '../core/keys.ts';

export const api = new Hono();

const fail = (c: HonoContext, status: 400 | 401 | 413 | 429 | 500, message: string) =>
  c.json<ErrorResponse>({ status: 'error', message }, status);

const saveFailure = (c: HonoContext, result: Extract<SaveResult, { ok: false }>) =>
  fail(c, result.error.code === 'SAVE_TOO_LARGE' ? 413 : 400, result.error.message);

// Bound the envelope as well as the save. Like a mail slot, this rejects a
// giant parcel before anyone opens it (including chunked requests without a length).
api.use(
  '/save',
  bodyLimit({ maxSize: MAX_SAVE_BYTES + 1024, onError: (c) => fail(c, 413, 'body too large') })
);
api.use('/score', bodyLimit({ maxSize: 1024, onError: (c) => fail(c, 413, 'body too large') }));

/** Parse a JSON body without throwing on garbage input. */
async function readJson(c: HonoContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/** GET /api/init — username, cloud save, best score and leaderboard in one trip. */
api.get('/init', async (c) => {
  const { postId, userId, username } = context;
  if (!postId) return fail(c, 400, 'postId missing from context');

  try {
    const [save, best, leaderboard] = await Promise.all([
      userId ? loadSave(userId) : Promise.resolve(null),
      username ? getBest(username) : Promise.resolve(0),
      getTop(),
    ]);
    return c.json<InitResponse>({
      type: 'init',
      postId,
      username: username ?? null,
      subreddit: context.subredditName,
      save,
      best,
      leaderboard,
    });
  } catch (error) {
    console.error('[api/init]', error);
    return fail(c, 500, 'init failed');
  }
});

/** GET /api/leaderboard — used by the lightweight feed splash. */
api.get('/leaderboard', async (c) => {
  const { username } = context;
  try {
    const [best, leaderboard] = await Promise.all([
      username ? getBest(username) : Promise.resolve(0),
      getTop(),
    ]);
    return c.json<LeaderboardResponse>({
      type: 'leaderboard',
      username: username ?? null,
      best,
      leaderboard,
    });
  } catch (error) {
    console.error('[api/leaderboard]', error);
    return fail(c, 500, 'leaderboard failed');
  }
});

/** POST /api/save — merge the caller's versioned save. Body: { save: {...} } */
api.post('/save', async (c) => {
  const { userId } = context;
  if (!userId) return fail(c, 401, 'log in to save progress');

  // Validate BEFORE touching Redis (incl. the rate counter): a malformed
  // request is rejected for free and can't burn the player's quota.
  const body = await readJson(c);
  const save = typeof body === 'object' && body !== null && 'save' in body ? body.save : undefined;
  const result = validateSave(save);
  if (!result.ok) return saveFailure(c, result);

  try {
    // The client debounces to ~1 upload per 1.5s; 30/min leaves plenty of slack.
    if (!(await allow(keys.saveRate(userId), 30, 60))) return fail(c, 429, 'saving too often');
    const saved = await writeSave(userId, result.value);
    if (!saved.ok) return saveFailure(c, saved);
    return c.json<SaveResponse>({ type: 'save', ok: true });
  } catch (error) {
    console.error('[api/save]', error);
    return fail(c, 500, 'save failed');
  }
});

/** POST /api/score — submit a run score. Body: { score: number, difficulty?: string } */
api.post('/score', async (c) => {
  const { userId, username } = context;
  if (!userId || !username) return fail(c, 401, 'log in to post scores');

  // Validate first (see /save) — bad input never reaches Redis.
  const body = await readJson(c);
  const raw = typeof body === 'object' && body !== null ? body : {};
  const scoreResult = validateScore('score' in raw ? raw.score : undefined);
  if (!scoreResult.ok) return fail(c, 400, scoreResult.error);
  const difficulty = normalizeDifficulty('difficulty' in raw ? raw.difficulty : undefined);

  try {
    // A run ends at most every few seconds; 10/min stops scripted spam.
    if (!(await allow(keys.scoreRate(userId), 10, 60))) return fail(c, 429, 'too many scores');
    const { best, improved } = await submit(username, scoreResult.value);
    if (improved) console.log(`[score] u/${username} new best ${best} (${difficulty})`);
    return c.json<ScoreResponse>({
      type: 'score',
      best,
      improved,
      leaderboard: await getTop(),
    });
  } catch (error) {
    console.error('[api/score]', error);
    return fail(c, 500, 'score failed');
  }
});
