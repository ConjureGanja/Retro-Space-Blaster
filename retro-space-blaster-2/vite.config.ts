/**
 * Production / Reddit build config.
 *
 * WHAT: The official Devvit Vite plugin reads devvit.json and builds two
 *       bundles at once — dist/client (the webview: splash + game) and
 *       dist/server/index.cjs (the Hono API that runs on Reddit's servers).
 * WHY:  One command, two outputs, and the plugin refuses to compile if client
 *       code accidentally imports server code (secrets can't leak that way).
 *
 * Analogy: a film crew shooting the A-camera and B-camera in one take. You
 *          call "action" once (vite build) and get both angles, already synced.
 *
 * Note: this plugin only supports `vite build`. For a quick play-test in a
 * normal browser, use `npm run local` (see vite.local.config.ts).
 */
import { defineConfig } from 'vite';
import { devvit } from '@devvit/start/vite';

export default defineConfig({
  plugins: [devvit()],
});
