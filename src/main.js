/**
 * Entry point. Owns the requestAnimationFrame loop and bootstraps every module.
 */

import { STATE, Runtime } from './config.js';
import { initInput } from './input.js';
import { Sprites } from './sprites.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { initRenderer, draw } from './render.js';
import { FX } from './fx.js';
import { CONSTANTS } from './config.js';
import { input } from './input.js';
import { Dev } from './dev.js';

const canvas = document.getElementById('gameCanvas');

// Dev/debug hook — lets the console poke at live game state.
// RSB.dev.help() lists the debug commands (god mode, sector jumps, ...).
window.RSB = { Game, Runtime, STATE, CONSTANTS, input, Sprites, dev: Dev };

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
    initInput(canvas);
    initRenderer(canvas);
    Game.init(canvas);
    UI.bindEvents();

    // Preload sprites before the first frame so they pop in cleanly.
    await Sprites.loadAll();
    if (UI.refreshShipPreview) UI.refreshShipPreview();

    loop();
}

boot();
