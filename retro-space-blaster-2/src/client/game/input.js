/**
 * Pointer input. Mouse drives the ship; left click fires, right click time-shifts.
 * Touch is mapped onto the same fields (1 finger = move/fire, 2 fingers = time shift).
 */

import { WORLD_H, clientToWorld } from './view/plane.ts';
import { getFrame } from './view/frame.ts';

export const input = {
    // Spawn point, not the middle of the floor. With a chase camera the
    // ship flies to this mark, so starting it on the ship keeps the fighter
    // planted until the player actually aims.
    mouseX: 120,
    mouseY: WORLD_H / 2,
    clickLeft: false,
    clickRight: false
};

let clientX = null;
let clientY = null;

/**
 * Pointer → sim coordinates.
 *
 * Why unproject: the picture is tilted and letterboxed, the ship still
 * chases a point on the flat floor. Feeding CSS pixels straight in would
 * make the cursor and the hit circle disagree.
 * Analogy: a remote control that aims at the TV bezel instead of the show.
 */
function aim(canvas, x, y) {
    const world = clientToWorld(x, y, canvas.getBoundingClientRect(), getFrame());
    input.mouseX = world.x;
    input.mouseY = world.y;
}

function remember(canvas, x, y) {
    clientX = x;
    clientY = y;
    aim(canvas, x, y);
}

/**
 * Re-aim from the last finger every frame.
 *
 * Why not only on mousemove: the camera is bolted to the ship, so the same
 * pixel on the glass is a new floor mark after the ship moves. Holding the
 * cursor forward has to keep meaning "fly forward".
 * Analogy: a steering wheel stays turned when you stop wiggling it.
 */
export function syncPointer(canvas) {
    if (clientX === null || !canvas) return;
    aim(canvas, clientX, clientY);
}

export function initInput(canvas) {
    canvas.addEventListener('mousemove', e => { remember(canvas, e.clientX, e.clientY); });
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
        remember(canvas, e.touches[0].clientX, e.touches[0].clientY);
        if (e.touches.length === 1) input.clickLeft = true;
        if (e.touches.length >= 2) input.clickRight = true; // Two fingers for Time Shift
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        remember(canvas, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
        e.preventDefault();
        if (e.touches.length === 0) { input.clickLeft = false; input.clickRight = false; }
        else if (e.touches.length === 1) { input.clickRight = false; }
    }, { passive: false });
}
