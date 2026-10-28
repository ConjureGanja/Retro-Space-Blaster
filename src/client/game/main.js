/**
 * Entry point for the expanded game view (game.html).
 * Owns the requestAnimationFrame loop and bootstraps every module.
 */

// Self-hosted pixel font. Reddit's webview blocks third-party requests, so
// the old Google Fonts @import would silently fall back to a system font.
// Bundling it means Vite ships the .woff2 alongside the game.
import '@fontsource/press-start-2p/400.css';
import '../styles/main.css';

import { STATE, Runtime } from './config.js';
import { initInput } from './input.js';
import { Sprites } from './sprites.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { initRenderer, draw } from './render.js';
import { FX } from './fx.js';
import { CONSTANTS } from './config.js';
import { input } from './input.js';
import { store } from './store.js';

const canvas = document.getElementById('gameCanvas');

/**
 * Debug console (RSB.dev.*) is only attached to non-production builds:
 *   - `npm run local`  → Vite dev server        (MODE = 'development')
 *   - `npm run dev`    → devvit playtest build  (MODE = 'development', see devvit.json)
 *   - `npm run deploy` → devvit upload build    (MODE = 'production')  → no RSB
 * WHY: RSB.dev.score(999999) + god mode would let anyone with devtools
 * top the public leaderboard. Shipping cheats to players is like leaving the
 * director's cut on the theatre projector. Dev.js is dynamically imported, so
 * it isn't even in the production bundle.
 */
async function attachDevTools() {
    if (import.meta.env.MODE === 'production') return;
    const { Dev } = await import('./dev.js');
    window.RSB = { Game, Runtime, STATE, CONSTANTS, input, Sprites, dev: Dev };
    console.info('[RSB] dev build — run RSB.dev.help() for debug commands');
}

/**
 * Fixed-timestep loop: the simulation always advances at 60 steps/second,
 * no matter how fast the screen refreshes.
 *
 * WHY: every speed, timer and spawn rate in the game is tuned "per frame at
 * 60fps". Stepping once per requestAnimationFrame made a 144 Hz monitor run
 * the whole game 2.4x faster than a 60 Hz phone — unfair now that scores land
 * on a shared leaderboard. Here an accumulator banks real elapsed time and
 * spends it in exact 1/60s steps; rendering still happens every frame (it's
 * read-only, so drawing the same state twice is harmless).
 *
 * Analogy: a metronome for the band. The lighting rig (renderer) can flash as
 * often as it likes, but the drummer (simulation) only plays on the click.
 */
const STEP_MS = 1000 / 60;
// If a frame stalls (tab switch, GC hitch), catch up at most this many steps,
// then drop the backlog — otherwise one hiccup snowballs into a freeze
// (the classic "spiral of death").
const MAX_STEPS_PER_FRAME = 5;
let lastTime = null;
let accumulator = 0;

function step() {
    Game.tick++;
    if (Runtime.state === STATE.PLAYING) {
        Game.update();
    } else {
        FX.updateAmbient(); // drifting starfield behind menus
    }
}

function loop(now) {
    if (lastTime === null) lastTime = now;
    // Clamp huge gaps (e.g. returning to a backgrounded tab) to 250 ms.
    accumulator += Math.min(now - lastTime, 250);
    lastTime = now;

    let steps = 0;
    while (accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
        step();
        accumulator -= STEP_MS;
        steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

    draw();
    requestAnimationFrame(loop);
}

async function boot() {
    // 1. Pull the player's save (localStorage + Reddit cloud save) BEFORE the
    //    menus read settings — otherwise the hangar would flash defaults.
    await store.hydrate();

    initInput(canvas);
    initRenderer(canvas);
    Game.init(canvas);
    UI.bindEvents();

    // 2. Preload the standard sprite set before the first frame so art pops
    //    in cleanly. HD art streams in only if the player has HD enabled.
    await Sprites.loadAll();
    if (Runtime.useHD) void Sprites.loadHD().then(() => UI.refreshShipPreview?.());
    if (UI.refreshShipPreview) UI.refreshShipPreview();

    void attachDevTools();
    requestAnimationFrame(loop);
}

boot();
