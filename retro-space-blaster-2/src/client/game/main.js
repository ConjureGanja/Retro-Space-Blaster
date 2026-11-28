/**
 * Boot for the rail shooter. The sim advances on a fixed 60Hz clock.
 * Drawing can happen as often as the screen wants; it doesn't get a vote
 * on how fast the bullets move.
 *
 * Analogy: a metronome for the band. The lights can flicker faster than
 * the drummer, but the drummer only hits on the click.
 */

import '@fontsource/press-start-2p/400.css';
import '../styles/main.css';
import '../styles/rail.css';

import { STATE, Runtime } from './config.js';
import { Sprites } from './sprites.js';
import { store } from './store.js';
import { initControls, readControls } from './rail/controls.ts';
import { bootQuery, devApi, drawShell, fightVisible, mountShell, tickShell } from './rail/shell.js';
import { initTouch, syncTouchMode } from './touch.js';

const canvas = document.getElementById('gameCanvas');

const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;
let lastTime = null;
let accumulator = 0;

function frame(now) {
  if (lastTime === null) lastTime = now;
  let elapsed = now - lastTime;
  lastTime = now;
  // A tab hidden for a minute should not fast-forward the fight.
  if (elapsed > 250) elapsed = 250;
  accumulator += elapsed;
  let steps = 0;
  while (accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
    accumulator -= STEP_MS;
    steps += 1;
    // Why here: pause and roll are one-shot edges. Reading them on a paint that
    // runs no step (every other frame on a 120/144 Hz screen) would swallow them.
    // Analogy: a mail slot that only opens when the postman is actually at the
    // door, so letters wait on the mat instead of being thrown away.
    tickShell(readControls());
  }
  syncTouchMode(fightVisible() && Runtime.state === STATE.PLAYING);
  drawShell(canvas);
  requestAnimationFrame(frame);
}

async function boot() {
  await store.hydrate();
  initControls(canvas);
  initTouch(canvas);
  mountShell();
  void Sprites.loadAll();
  bootQuery(new URLSearchParams(location.search));
  if (import.meta.env.MODE !== 'production') {
    const dev = devApi();
    window.RSB = { dev, Runtime, STATE };
    dev.help();
  }
  requestAnimationFrame(frame);
}

void boot();
