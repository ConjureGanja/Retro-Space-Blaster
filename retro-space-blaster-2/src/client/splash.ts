/**
 * Feed splash logic: greet the player, show the subreddit's top pilots,
 * and open the full game in expanded mode when LAUNCH is tapped.
 */
import '@fontsource/press-start-2p/400.css';
import './splash.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import type { LeaderboardEntry, LeaderboardResponse } from '../shared/api';

const $ = <T extends HTMLElement>(id: string): T | null => document.querySelector<T>(`#${id}`);

/**
 * Expanded mode = the full-screen game view. Reddit requires this to come
 * from a real user gesture (a click), so we pass the click event straight
 * through. 'game' must match an entrypoint name in devvit.json.
 */
$('launch')?.addEventListener('click', (event) => {
  requestExpandedMode(event, 'game');
});

/**
 * `context` is injected by Reddit's webview host. Outside Reddit (e.g. the
 * `npm run local` preview) it's undefined, so read it defensively — the
 * splash should never white-screen just because it's previewed elsewhere.
 */
function currentUsername(): string | undefined {
  try {
    return context?.username;
  } catch {
    return undefined;
  }
}

const greeting = $('greeting');
if (greeting) {
  const username = currentUsername();
  greeting.textContent = username
    ? `Welcome back, u/${username}`
    : 'Log in to save progress & post scores';
}

/**
 * Build leaderboard rows with textContent (never innerHTML): usernames are
 * user-controlled text, and innerHTML would let a crafted name inject markup.
 */
function renderBoard(rows: LeaderboardEntry[], me: string | null): void {
  const list = $('board-list');
  if (!list) return;
  list.replaceChildren();

  if (rows.length === 0) {
    const li = document.createElement('li');
    li.className = 'board-empty';
    li.textContent = 'No scores yet — be the first!';
    list.append(li);
    return;
  }

  for (const row of rows.slice(0, 5)) {
    const li = document.createElement('li');
    if (row.username === me) li.classList.add('is-me');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `#${row.rank}`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = row.username;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = row.score.toLocaleString();
    li.append(rank, name, score);
    list.append(li);
  }
}

async function loadBoard(): Promise<void> {
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: LeaderboardResponse = await res.json();
    renderBoard(data.leaderboard, data.username);
  } catch (error) {
    console.error('[splash] leaderboard unavailable', error);
    renderBoard([], null);
  }
}

void loadBoard();
