/**
 * DOM adapter. The rules live in taps.ts and arbitrate.ts so they can be
 * tested without a browser. This file only listens and asks those two.
 *
 * A held key is steering. A second press, after a release, inside a quarter
 * of a second, is a roll. The mouse does not get a vote while it is sitting
 * still, and the keys do not get a vote while they are up.
 *
 * Analogy: two people reaching for one steering wheel. Whoever grabbed it
 * last drives. Resting a hand nearby does not count as grabbing.
 */

import {
  arbitrate,
  type Arbiter,
  type DeviceName,
  type MoveIntent,
  type Scheme,
} from './arbitrate.ts';
import { unproject } from './project.ts';
import { freshTaps, notePress, type TapDir, type TapMemory } from './taps.ts';

export type ControlState = {
  ax: number;
  ay: number;
  fire: boolean;
  special: boolean;
  useAim: boolean;
  aimX: number;
  aimY: number;
  pauseEdge: boolean;
  feel: 'keys' | 'mouse' | 'chase';
  roll: -1 | 0 | 1;
  device: DeviceName;
};

export type ControlOptions = {
  scheme: Scheme;
  autoFire: boolean;
  /** Dedicated roll key. It rolls toward wherever you are already steering. */
  rollKey: 'q' | 'e' | 'r';
};

const keys = new Set<string>();
let stickX = 0;
let stickY = 0;
let stickEngaged = false;
let fireMouse = false;
let fireTouch = false;
let specialMouse = false;
let specialTouch = false;
let aimX = 0;
let aimY = 0;
let mouseEngaged = false;
let pauseEdge = false;
let padPauseWas = false;
let keyTaps: TapMemory = freshTaps();
let flickTaps: TapMemory = freshTaps();
let padTaps: TapMemory = freshTaps();
let prevPadFlick = 0;
let prevLeft = false;
let prevRight = false;
let prevFlick = 0;
let buttonRoll: -1 | 0 | 1 = 0;
let lastHoriz: TapDir = 1;
let arbiter: Arbiter = { device: 'keyboard' };
let options: ControlOptions = { scheme: 'auto', autoFire: false, rollKey: 'q' };
let rollKeyWas = false;
let bumpLWas = false;
let bumpRWas = false;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function setControlOptions(next: ControlOptions): void {
  options = next;
}

export function activeDevice(): DeviceName {
  return arbiter.device;
}

export function setStick(x: number, y: number): void {
  const nx = clamp(x, -1, 1);
  const ny = clamp(y, -1, 1);
  stickEngaged = Math.hypot(nx - stickX, ny - stickY) > 0.08;
  stickX = nx;
  stickY = ny;
}

/** Phone ROLL button. Uses the stick direction, or the last dodge if the stick is centered. */
export function requestTouchRoll(): void {
  buttonRoll = Math.abs(stickX) > 0.25 ? (stickX < 0 ? -1 : 1) : lastHoriz;
}

export function setTouchFire(down: boolean): void {
  fireTouch = down;
}

export function setTouchSpecial(down: boolean): void {
  specialTouch = down;
}

export function initControls(canvas: HTMLCanvasElement): void {
  const aimFromEvent = (event: MouseEvent, fromMove: boolean) => {
    const rect = canvas.getBoundingClientRect();
    const point = unproject(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height
    );
    if (fromMove && Math.hypot(point.x - aimX, point.y - aimY) > 1.2) mouseEngaged = true;
    aimX = point.x;
    aimY = point.y;
  };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.key.toLowerCase());
    if (event.key === 'Escape' || event.key.toLowerCase() === 'p') pauseEdge = true;
    if (event.key.startsWith('Arrow') || event.key === ' ') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.key.toLowerCase());
  });
  window.addEventListener('blur', () => {
    keys.clear();
    fireMouse = false;
    specialMouse = false;
    stickX = 0;
    stickY = 0;
  });

  canvas.addEventListener('mousemove', (event) => aimFromEvent(event, true));
  canvas.addEventListener('mousedown', (event) => {
    aimFromEvent(event, false);
    if (event.button === 0) fireMouse = true;
    if (event.button === 2) {
      // Right-click on a side of the glass rolls that way. Center is the special.
      const dir: -1 | 0 | 1 = aimX < -12 ? -1 : aimX > 12 ? 1 : 0;
      if (dir !== 0) buttonRoll = dir;
      else specialMouse = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (document.body.classList.contains('touch-ui')) return;
    if (event.button === 0) fireMouse = false;
    if (event.button === 2) specialMouse = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

function tapEdge(down: boolean, wasDown: boolean, dir: TapDir): -1 | 0 | 1 {
  if (!down || wasDown) return 0;
  const next = notePress(keyTaps, dir, performance.now());
  keyTaps = next.memory;
  return next.roll;
}

function flickEdge(dir: -1 | 0 | 1): -1 | 0 | 1 {
  if (dir === 0 || prevFlick !== 0) return 0;
  const next = notePress(flickTaps, dir, performance.now());
  flickTaps = next.memory;
  lastHoriz = dir;
  return next.roll;
}

export function readControls(): ControlState {
  const left = keys.has('arrowleft') || keys.has('a');
  const right = keys.has('arrowright') || keys.has('d');
  const up = keys.has('arrowup') || keys.has('w');
  const down = keys.has('arrowdown') || keys.has('s');
  let ax = 0;
  let ay = 0;
  if (left) ax -= 1;
  if (right) ax += 1;
  if (up) ay -= 1;
  if (down) ay += 1;
  if (ax < 0) lastHoriz = -1;
  if (ax > 0) lastHoriz = 1;

  let roll: -1 | 0 | 1 = 0;
  const leftRoll = tapEdge(left, prevLeft, -1);
  const rightRoll = tapEdge(right, prevRight, 1);
  if (leftRoll) roll = leftRoll;
  if (rightRoll) roll = rightRoll;
  prevLeft = left;
  prevRight = right;

  const rollKeyDown = keys.has(options.rollKey);
  if (rollKeyDown && !rollKeyWas) roll = lastHoriz;
  rollKeyWas = rollKeyDown;

  const stickDir: -1 | 0 | 1 = stickX < -0.72 ? -1 : stickX > 0.72 ? 1 : 0;
  const stickRoll = flickEdge(stickDir);
  if (stickRoll) roll = stickRoll;
  prevFlick = stickDir;

  let firePad = false;
  let specialPad = false;
  let padPause = false;
  let padAx = 0;
  let padAy = 0;
  let padEngaged = false;
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad) continue;
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    if (Math.abs(lx) > 0.18) padAx += lx;
    if (Math.abs(ly) > 0.18) padAy += ly;
    if (Math.hypot(lx, ly) > 0.22) padEngaged = true;
    const padDir: -1 | 0 | 1 = lx < -0.72 ? -1 : lx > 0.72 ? 1 : 0;
    if (padDir !== 0 && prevPadFlick === 0) {
      const flicked = notePress(padTaps, padDir, performance.now());
      padTaps = flicked.memory;
      if (flicked.roll) roll = flicked.roll;
      lastHoriz = padDir;
    }
    prevPadFlick = padDir;
    const buttons = pad.buttons;
    const bumpL = Boolean(buttons[4]?.pressed);
    const bumpR = Boolean(buttons[5]?.pressed);
    if (bumpL && !bumpLWas) roll = -1;
    if (bumpR && !bumpRWas) roll = 1;
    bumpLWas = bumpL;
    bumpRWas = bumpR;
    if (buttons[0]?.pressed || buttons[7]?.pressed) firePad = true;
    if (buttons[1]?.pressed || buttons[6]?.pressed) specialPad = true;
    if (buttons[9]?.pressed) padPause = true;
  }
  if (padPause && !padPauseWas) pauseEdge = true;
  padPauseWas = padPause;

  if (buttonRoll !== 0) {
    roll = buttonRoll;
    lastHoriz = buttonRoll;
    buttonRoll = 0;
  }

  // A key that is down owns the wheel. A mouse shiver during that hold is ignored,
  // otherwise the cursor and the key pull in two directions.
  if (left || right || up || down) mouseEngaged = false;

  const parts: MoveIntent[] = [
    { device: 'keyboard', ax, ay, aimX, aimY, useAim: false, engaged: left || right || up || down },
    { device: 'mouse', ax: 0, ay: 0, aimX, aimY, useAim: true, engaged: mouseEngaged },
    {
      device: 'touch',
      ax: stickX,
      ay: stickY,
      aimX,
      aimY,
      useAim: false,
      engaged: stickEngaged || Math.abs(stickX) > 0.12 || Math.abs(stickY) > 0.12,
    },
    { device: 'gamepad', ax: padAx, ay: padAy, aimX, aimY, useAim: false, engaged: padEngaged },
  ];
  const picked = arbitrate(arbiter, parts, options.scheme);
  arbiter = picked.arbiter;
  mouseEngaged = false;
  stickEngaged = false;

  const pause = pauseEdge;
  pauseEdge = false;
  return {
    ax: picked.drive.ax,
    ay: picked.drive.ay,
    fire: options.autoFire || fireMouse || fireTouch || firePad || keys.has(' ') || keys.has('z'),
    special: specialMouse || specialTouch || specialPad || keys.has('x') || keys.has('shift'),
    useAim: picked.drive.feel === 'mouse',
    aimX: picked.drive.aimX,
    aimY: picked.drive.aimY,
    pauseEdge: pause,
    feel: picked.drive.feel,
    roll,
    device: picked.drive.device,
  };
}
