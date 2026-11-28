/**
 * Touch controls for phones/tablets: a floating thumbstick on the left,
 * FIRE + SPECIAL buttons on the right, and a pause button.
 *
 * WHY a separate layer instead of "finger = cursor": dragging a finger over
 * the ship hides the very thing you're steering, and you can't fire and use
 * a special at the same time with one finger. Twin-thumb controls are what
 * every mobile shooter players already know.
 * Analogy: a game controller split down the middle — left half steers,
 * right half shoots.
 *
 * Everything here writes into the shared `input` object, so game.js doesn't
 * care whether a mouse or a thumb is driving.
 */

import { input } from './input.js';
import { Runtime, STATE } from './config.js';

const $ = id => document.getElementById(id);

/** Pointer capture keeps a drag/hold tied to its element even when the
 *  finger slides off it. Some webviews refuse it; the control still works. */
function capture(el, id) {
    try { el.setPointerCapture(id); } catch { /* not capturable — fine */ }
}

const STICK_RADIUS = 56;  // px the knob can travel from the stick's center
const STICK_DEADZONE = 0.12; // ignore tiny thumb wobble near the center

let stickPointer = null; // pointerId of the thumb on the stick, if any

/** Short buzz on Android (iOS Safari has no vibrate API — it just no-ops). */
export function haptic(ms) {
    if (input.mode === 'touch' && 'vibrate' in navigator) {
        try { navigator.vibrate(ms); } catch { /* blocked in some webviews */ }
    }
}

/**
 * Switch between mouse and touch layouts. Decided by the LAST input used, so a
 * touchscreen laptop works with either — like a car that's both automatic and
 * manual depending on which pedal you press.
 */
function setMode(mode) {
    if (input.mode === mode) return;
    input.mode = mode;
    document.body.classList.toggle('is-touch', mode === 'touch');
    if (mode === 'mouse') resetStick();
}

function resetStick() {
    input.stickX = 0; input.stickY = 0;
    const stick = $('touch-stick');
    if (stick) {
        stick.classList.remove('engaged');
        stick.style.removeProperty('--sx');
        stick.style.removeProperty('--sy');
        $('touch-knob').style.translate = '0 0';
    }
}

/**
 * Make a button behave like a held key: down on press, up on release,
 * cancel, or the finger sliding off the screen. Pointer capture means the
 * release still arrives even if the thumb drifts off the button.
 */
function bindHoldButton(el, onDown, onUp) {
    el.addEventListener('pointerdown', e => {
        e.preventDefault();
        capture(el, e.pointerId);
        el.classList.add('pressed');
        onDown();
    });
    const release = () => { el.classList.remove('pressed'); onUp(); };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    el.addEventListener('contextmenu', e => e.preventDefault()); // long-press menu
}

/**
 * @param {{ onPause: () => void }} hooks
 */
export function initTouch({ onPause }) {
    // Start in touch mode on phones/tablets; desktops start with the mouse.
    const coarse = matchMedia('(pointer: coarse)').matches;
    input.mode = '';
    setMode(coarse ? 'touch' : 'mouse');

    window.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') setMode('touch');
        else if (e.pointerType === 'mouse') setMode('mouse');
    }, { capture: true });
    // Losing focus mid-drag means the pointerup may never arrive, so the stick
    // would stay deflected and the ship would keep flying on return. input.js
    // already drops the mouse buttons on blur; this drops the thumbstick too.
    // Analogy: letting go of the wheel when you leave the car.
    window.addEventListener('blur', releaseTouch);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) releaseTouch();
    });
    window.addEventListener('mousemove', e => {
        // Touch browsers fire a fake mousemove after taps — ignore those
        // (they report zero movement).
        if (e.movementX || e.movementY) setMode('mouse');
    });

    // ---------------- Floating thumbstick ----------------
    // The stick rests at a default spot so players can see it, then jumps to
    // wherever the thumb lands in the left zone — no hunting for a tiny target.
    const zone = $('touch-stick-zone');
    const stick = $('touch-stick');
    const knob = $('touch-knob');
    let originX = 0, originY = 0;

    zone.addEventListener('pointerdown', e => {
        if (stickPointer !== null) return; // one thumb drives at a time
        e.preventDefault();
        stickPointer = e.pointerId;
        capture(zone, e.pointerId);
        const r = zone.getBoundingClientRect();
        originX = e.clientX; originY = e.clientY;
        stick.style.setProperty('--sx', `${originX - r.left}px`);
        stick.style.setProperty('--sy', `${originY - r.top}px`);
        stick.classList.add('engaged');
        knob.style.translate = '0 0';
    });

    zone.addEventListener('pointermove', e => {
        if (e.pointerId !== stickPointer) return;
        let dx = e.clientX - originX, dy = e.clientY - originY;
        const dist = Math.hypot(dx, dy);
        if (dist > STICK_RADIUS) {
            // Drag the stick's origin along behind the thumb once it hits the
            // rim, so a big swipe never "runs out" of stick.
            const over = dist - STICK_RADIUS;
            originX += (dx / dist) * over; originY += (dy / dist) * over;
            const r = zone.getBoundingClientRect();
            stick.style.setProperty('--sx', `${originX - r.left}px`);
            stick.style.setProperty('--sy', `${originY - r.top}px`);
            dx = e.clientX - originX; dy = e.clientY - originY;
        }
        knob.style.translate = `${dx}px ${dy}px`;

        // Normalize to 0..1 and remap past the deadzone so steering starts
        // gently instead of jumping straight to 12% speed.
        const mag = Math.min(Math.hypot(dx, dy) / STICK_RADIUS, 1);
        if (mag < STICK_DEADZONE) { input.stickX = 0; input.stickY = 0; return; }
        const scaled = (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE);
        const len = Math.hypot(dx, dy);
        input.stickX = (dx / len) * scaled;
        input.stickY = (dy / len) * scaled;
    });

    const endStick = e => {
        if (e.pointerId !== stickPointer) return;
        stickPointer = null;
        resetStick();
    };
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);
    zone.addEventListener('lostpointercapture', endStick);

    // ---------------- Buttons ----------------
    bindHoldButton($('touch-fire'),
        () => { input.clickLeft = true; haptic(8); },
        () => { input.clickLeft = false; });
    bindHoldButton($('touch-special'),
        () => { input.clickRight = true; haptic(15); },
        () => { input.clickRight = false; });

    $('touch-pause').addEventListener('click', () => onPause());

    // ---------------- Orientation ----------------
    // Portrait is blocked by a CSS overlay (see #rotate-overlay). If a player
    // rotates to portrait mid-fight, pause so they don't die while the
    // "turn your phone" screen covers the action.
    const portrait = matchMedia('(orientation: portrait)');
    portrait.addEventListener('change', () => {
        if (portrait.matches && input.mode === 'touch' && Runtime.state === STATE.PLAYING) {
            onPause();
        }
    });
}

/**
 * Let go of everything. Called when play stops (pause, level-up, game over):
 * the controls get hidden, and a hidden button may never hear its finger
 * lift — so we lift it for them.
 * Analogy: a lathe's kill switch — leaving the bench always stops the spindle.
 */
export function releaseTouch() {
    if (input.mode !== 'touch') return;
    stickPointer = null;
    resetStick();
    input.clickLeft = false;
    input.clickRight = false;
    document.querySelectorAll('#touch-controls .pressed').forEach(el => el.classList.remove('pressed'));
}

/**
 * Ask the browser to lock to landscape. Only works in fullscreen on Android
 * (and never on iOS / inside some webviews), so failure is expected and
 * silent — the rotate overlay is the real safety net.
 */
export function tryLockLandscape() {
    if (input.mode !== 'touch') return;
    try {
        const o = screen.orientation;
        if (o && typeof o.lock === 'function') o.lock('landscape').catch(() => {});
    } catch { /* unsupported */ }
}

/** Show the ship's special on the touch button: name, color, charge ring. */
export function updateTouchSpecial(def, pct) {
    const btn = $('touch-special');
    if (!btn) return;
    btn.style.setProperty('--charge', `${Math.max(0, Math.min(100, pct))}%`);
    btn.style.setProperty('--ab-color', def.color);
    const label = $('touch-special-label');
    if (label.textContent !== def.name) label.textContent = def.name;
    // Drain abilities (Chrono) are usable whenever there's any charge;
    // cooldown abilities only at 100%.
    const ready = def.mode === 'drain' ? pct > 5 : pct >= 100;
    btn.classList.toggle('ready', ready);
}
