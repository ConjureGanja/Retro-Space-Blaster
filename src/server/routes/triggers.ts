import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';

/**
 * Event triggers (registered under "triggers" in devvit.json).
 * On install, drop a first game post so the subreddit isn't empty.
 */
export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const input = await c.req.json<OnAppInstallRequest>();
    const post = await createPost();
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Post created in r/${context.subredditName} with id ${post.id} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error('[triggers/on-app-install]', error);
    return c.json<TriggerResponse>({ status: 'error', message: 'Failed to create post' }, 400);
  }
});
