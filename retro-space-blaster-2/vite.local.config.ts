/**
 * Local browser play-test config (`npm run local`).
 *
 * WHAT: Serves src/client with hot reload at http://localhost:5173/game.html
 *       — no Reddit account, no upload, no Devvit CLI.
 * WHY:  Tweaking enemy speeds or CSS doesn't need a full Reddit round-trip.
 *       The game's cloud layer (src/client/game/platform/cloud.js) notices
 *       there's no /api server and quietly falls back to localStorage.
 *
 * Analogy: a rehearsal in the garage before the gig. Same songs, same
 *          instruments — just no stage, no crowd, no sound guy.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  publicDir: '../../public',
  server: {
    port: 5173,
    open: '/game.html',
  },
});
