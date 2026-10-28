import { reddit } from '@devvit/web/server';

/**
 * Create a new playable game post in the current subreddit.
 * The post renders the `default` entrypoint from devvit.json (splash.html);
 * tapping LAUNCH opens the `game` entrypoint (game.html) in expanded mode.
 */
export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: 'Retro Space Blaster — can you save the Spiral Arm Turnpike?',
  });
};
