/**
 * Pointer input. Mouse drives the ship; left click fires, right click uses the
 * ship's special. Touch devices use the on-screen thumbstick + buttons in
 * touch.js, which write into the same object (stickX/stickY, clickLeft/Right).
 */

import { CONSTANTS } from './config.js';

export const input = {
    mouseX: CONSTANTS.GAME_WIDTH / 2,
    mouseY: CONSTANTS.GAME_HEIGHT / 2,
    clickLeft: false,
    clickRight: false,
    // 'mouse' = ship chases the cursor; 'touch' = ship flies by thumbstick.
    mode: 'mouse',
    // Thumbstick deflection, -1..1 on each axis (0,0 = centered / released).
    stickX: 0,
    stickY: 0
};

export function initInput(canvas) {
    canvas.addEventListener('mousemove', e => { input.mouseX = e.clientX; input.mouseY = e.clientY; });
    canvas.addEventListener('mousedown', e => { if (e.button === 0) input.clickLeft = true; if (e.button === 2) input.clickRight = true; });
    canvas.addEventListener('mouseup',   e => { if (e.button === 0) input.clickLeft = false; if (e.button === 2) input.clickRight = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault()); // Stop right-click menu

    // Releases must be heard EVERYWHERE, not just on the canvas: if the button
    // goes up over a menu overlay (e.g. the upgrade picker that pops mid-fight)
    // or outside the game, a canvas-only listener never sees it and the ship
    // keeps firing / Chrono Field keeps draining with no button held.
    // Analogy: a dead-man's switch — let go anywhere and the train stops.
    window.addEventListener('mouseup', e => {
        if (e.button === 0) input.clickLeft = false;
        if (e.button === 2) input.clickRight = false;
    });
    // Losing focus (alt-tab, Reddit's UI taking over, tab hidden) drops any
    // held input — the matching mouseup may never arrive at all.
    const releaseAll = () => { input.clickLeft = false; input.clickRight = false; };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
    // Touch input lives in touch.js (thumbstick + buttons), so the canvas
    // only needs to handle the mouse.
}
