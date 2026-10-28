import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';

/**
 * Subreddit menu actions (registered under "menu" in devvit.json).
 * Mods see "Post Retro Space Blaster" in the subreddit's ⋯ menu.
 */
export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();
    return c.json<UiResponse>(
      { navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}` },
      200
    );
  } catch (error) {
    console.error('[menu/post-create]', error);
    return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
  }
});
