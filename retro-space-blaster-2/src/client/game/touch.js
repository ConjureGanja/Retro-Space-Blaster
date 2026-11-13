/**
 * Phone controls for the chase-camera game.
 *
 * A sideways phone gets a move pad on the left thumb and FIRE / SPECIAL
 * on the right. FIRE holds the same flag as a mouse's left button, so the
 * shot cadence is still the ship's fireDelay. A tall phone is asked to
 * rotate, and the fight pauses until it does.
 *
 * Analogy: a handheld console. You don't play it standing on its end,
 * and the fire button is a real button, not "whatever your thumb is doing."
 */

import { STATE, Runtime } from './config.js';
import { Sound } from './audio.js';
import { input, setAim } from './input.js';

let heldForPortrait = false;

function wantsTouch() {
    const params = new URLSearchParams(location.search);
    if (params.has('touch')) return true;
    return window.matchMedia('(pointer: coarse)').matches;
}

function portrait() {
    return window.innerHeight > window.innerWidth + 24;
}

/**
 * Ask the browser to lie the phone on its side. Many browsers refuse unless
 * the page is fullscreen or the call came from a tap, so a refusal just
 * leaves the rotate card up.
 */
function tryLockLandscape() {
    const orientation = screen.orientation;
    if (!orientation || typeof orientation.lock !== 'function') return;
    orientation.lock('landscape').catch(() => {});
}

function applyOrientation() {
    const touch = document.body.classList.contains('touch-ui');
    const need = touch && portrait();
    document.body.classList.toggle('need-rotate', need);
    if (need) tryLockLandscape();

    if (need && Runtime.state === STATE.PLAYING) {
        heldForPortrait = true;
        Runtime.state = STATE.PAUSED;
        Sound.pauseBGM();
    } else if (!need && heldForPortrait) {
        heldForPortrait = false;
        if (Runtime.state === STATE.PAUSED) {
            Runtime.state = STATE.PLAYING;
            Sound.resumeBGM();
        }
    }
}

/** Hold a button the same way a mouse button is held. */
function holdButton(el, flag) {
    let down = false;
    const press = (e) => {
        e.preventDefault();
        e.stopPropagation();
        down = true;
        input[flag] = true;
        el.classList.add('held');
        if (e.pointerId !== undefined) el.setPointerCapture(e.pointerId);
    };
    const release = (e) => {
        if (!down) return;
        if (e) e.preventDefault();
        down = false;
        input[flag] = false;
        el.classList.remove('held');
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
}

function bindMovePad(canvas) {
    const pad = document.getElementById('touch-move');
    const aim = (touch) => setAim(canvas, touch.clientX, touch.clientY);
    pad.addEventListener('touchstart', (e) => {
        e.preventDefault();
        aim(e.changedTouches[0]);
    }, { passive: false });
    pad.addEventListener('touchmove', (e) => {
        e.preventDefault();
        aim(e.touches[0]);
    }, { passive: false });
}

/**
 * Turn on the thumb controls when this looks like a phone (or ?touch=1).
 * A mouse player never sees them.
 */
export function initTouch(canvas) {
    if (!wantsTouch()) return;
    document.body.classList.add('touch-ui');
    holdButton(document.getElementById('btn-fire'), 'clickLeft');
    holdButton(document.getElementById('btn-special'), 'clickRight');
    bindMovePad(canvas);
    window.addEventListener('resize', applyOrientation);
    window.addEventListener('orientationchange', applyOrientation);
    // A tap is the gesture some browsers require before they will lock.
    document.getElementById('rotate-overlay').addEventListener('pointerdown', (e) => {
        e.preventDefault();
        tryLockLandscape();
    });
    applyOrientation();
}

/** Keep the move pad off the hangar buttons until a run is actually going. */
export function syncTouchMode(playing) {
    if (document.body.classList.contains('playing') === playing) return;
    document.body.classList.toggle('playing', playing);
}
