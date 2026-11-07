/**
 * Devvit server entry — bundled by Vite to dist/server/index.cjs and run by
 * Reddit (Node.js, serverless). The webview can only reach it through /api/*.
 *
 * Route map:
 *   /api/*       → routes/api.ts       public game API (init, save, score, leaderboard)
 *   /internal/*  → menu / triggers     called by Reddit itself, never by players
 *
 * Analogy: /api is the box-office window customers walk up to;
 * /internal is the stage door only the crew (Reddit) has a key for.
 */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api.ts';
import { menu } from './routes/menu.ts';
import { triggers } from './routes/triggers.ts';

const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/triggers', triggers);

app.route('/api', api);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
