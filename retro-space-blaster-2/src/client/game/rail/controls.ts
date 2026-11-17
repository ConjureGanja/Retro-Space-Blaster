/**
 * Keyboard, mouse, gamepad, and the phone stick all land in one struct
 * per frame. The sim never reads the DOM.
 *
 * Touch drag is a joystick, not a cursor on the left half of the glass.
 * A thumb on the left edge would otherwise trap the ship over there.
 * Analogy: a ball-top arcade stick. You push it; you don't point at a pixel.
 */

import { unproject } from './project.ts';

export type ControlState = {
  ax: number;
  ay: number;
  fire: boolean;
  special: boolean;
  useAim: boolean;
  aimX: number;
  aimY: number;
  pauseEdge: boolean;
};

const keys = new Set<string>();
let stickX = 0;
let stickY = 0;
let fireMouse = false;
let fireTouch = false;
let specialMouse = false;
let specialTouch = false;
let mouseAim = false;
let aimX = 0;
let aimY = 0;
let pauseEdge = false;
let padPauseWas = false;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function setStick(x: number, y: number): void {
  stickX = clamp(x, -1, 1);
  stickY = clamp(y, -1, 1);
}

export function setTouchFire(down: boolean): void {
  fireTouch = down;
}

export function setTouchSpecial(down: boolean): void {
  specialTouch = down;
}

function keyAxis(): boolean {
  return (
    keys.has('arrowleft') ||
    keys.has('arrowright') ||
    keys.has('arrowup') ||
    keys.has('arrowdown') ||
    keys.has('a') ||
    keys.has('d') ||
    keys.has('w') ||
    keys.has('s')
  );
}

export function initControls(canvas: HTMLCanvasElement): void {
  const aimFromEvent = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const point = unproject(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height
    );
    aimX = point.x;
    aimY = point.y;
    mouseAim = true;
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

  canvas.addEventListener('mousemove', aimFromEvent);
  canvas.addEventListener('mousedown', (event) => {
    aimFromEvent(event);
    if (event.button === 0) fireMouse = true;
    if (event.button === 2) specialMouse = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (document.body.classList.contains('touch-ui')) return;
    if (event.button === 0) fireMouse = false;
    if (event.button === 2) specialMouse = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

export function readControls(): ControlState {
  let ax = stickX;
  let ay = stickY;
  if (keys.has('arrowleft') || keys.has('a')) ax -= 1;
  if (keys.has('arrowright') || keys.has('d')) ax += 1;
  if (keys.has('arrowup') || keys.has('w')) ay -= 1;
  if (keys.has('arrowdown') || keys.has('s')) ay += 1;

  let firePad = false;
  let specialPad = false;
  let padPause = false;
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad) continue;
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    if (Math.abs(lx) > 0.18) ax += lx;
    if (Math.abs(ly) > 0.18) ay += ly;
    const buttons = pad.buttons;
    if (buttons[0]?.pressed || buttons[7]?.pressed) firePad = true;
    if (buttons[1]?.pressed || buttons[2]?.pressed || buttons[6]?.pressed) specialPad = true;
    if (buttons[9]?.pressed) padPause = true;
  }
  if (padPause && !padPauseWas) pauseEdge = true;
  padPauseWas = padPause;

  // Gamepad and keys steer. A mouse-only player keeps "fly toward the cursor."
  const steering = Math.hypot(stickX, stickY) > 0.08 || keyAxis() || Math.abs(ax - stickX) > 0.2;
  const pause = pauseEdge;
  pauseEdge = false;
  return {
    ax: clamp(ax, -1, 1),
    ay: clamp(ay, -1, 1),
    fire: fireMouse || fireTouch || firePad || keys.has(' ') || keys.has('z'),
    special: specialMouse || specialTouch || specialPad || keys.has('x') || keys.has('shift'),
    useAim: mouseAim && !steering,
    aimX,
    aimY,
    pauseEdge: pause,
  };
}
