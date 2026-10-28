/**
 * Pointer input. Mouse drives the ship; left click fires, right click time-shifts.
 * Touch is mapped onto the same fields (1 finger = move/fire, 2 fingers = time shift).
 */

import { CONSTANTS } from './config.js';

export const input = {
    mouseX: CONSTANTS.GAME_WIDTH / 2,
    mouseY: CONSTANTS.GAME_HEIGHT / 2,
    clickLeft: false,
    clickRight: false
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
    canvas.addEventListener('touchcancel', releaseAll);

    // Touch support mimicking the mouse
    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        input.mouseX = e.touches[0].clientX; input.mouseY = e.touches[0].clientY;
        if (e.touches.length === 1) input.clickLeft = true;
        if (e.touches.length >= 2) input.clickRight = true; // Two fingers for Time Shift
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        input.mouseX = e.touches[0].clientX; input.mouseY = e.touches[0].clientY;
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
        e.preventDefault();
        if (e.touches.length === 0) { input.clickLeft = false; input.clickRight = false; }
        else if (e.touches.length === 1) { input.clickRight = false; }
    }, { passive: false });
}
