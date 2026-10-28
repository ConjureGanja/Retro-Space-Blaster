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

function loop() {
    Game.tick++;
    if (Runtime.state === STATE.PLAYING) {
        Game.update();
    } else {
        FX.updateAmbient(); // drifting starfield behind menus
    }
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
    loop();
}

boot();
