/**
 * The devices must not tug the ship at the same time.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { arbitrate, type Arbiter, type MoveIntent } from './arbitrate.ts';

function part(over: Partial<MoveIntent> & Pick<MoveIntent, 'device'>): MoveIntent {
  return {
    ax: 0,
    ay: 0,
    aimX: 0,
    aimY: 0,
    useAim: false,
    engaged: false,
    ...over,
  };
}

const keyboard = (): Arbiter => ({ device: 'keyboard' });

test('a stationary mouse does not steal the wheel from the keyboard', () => {
  const parts = [
    part({ device: 'keyboard', ax: 1, engaged: false }),
    part({ device: 'mouse', useAim: true, aimX: 40, aimY: 10, engaged: false }),
  ];
  const result = arbitrate(keyboard(), parts, 'auto');
  assert.equal(result.drive.device, 'keyboard');
  assert.equal(result.drive.feel, 'keys');
  assert.equal(result.drive.ax, 1);
});

test('a real mouse move takes over, and a later key press takes it back', () => {
  const mouse = arbitrate(
    keyboard(),
    [
      part({ device: 'keyboard', ax: 0 }),
      part({ device: 'mouse', useAim: true, aimX: 20, engaged: true }),
    ],
    'auto'
  );
  assert.equal(mouse.drive.device, 'mouse');
  assert.equal(mouse.drive.feel, 'mouse');

  const keys = arbitrate(
    mouse.arbiter,
    [
      part({ device: 'keyboard', ax: -1, engaged: true }),
      part({ device: 'mouse', useAim: true, aimX: 20, engaged: false }),
    ],
    'auto'
  );
  assert.equal(keys.drive.device, 'keyboard');
  assert.equal(keys.drive.ax, -1);
  assert.equal(keys.drive.feel, 'keys');
});

test('a locked keyboard scheme ignores the mouse even when the mouse moves', () => {
  const result = arbitrate(
    { device: 'mouse' },
    [
      part({ device: 'keyboard', ax: 0.5 }),
      part({ device: 'mouse', useAim: true, aimX: 80, engaged: true }),
    ],
    'keyboard'
  );
  assert.equal(result.drive.device, 'keyboard');
  assert.equal(result.drive.feel, 'keys');
  assert.equal(result.drive.ax, 0.5);
});

test('released keys produce no leftover stick', () => {
  const result = arbitrate(
    keyboard(),
    [part({ device: 'keyboard', ax: 0, ay: 0, engaged: false })],
    'auto'
  );
  assert.equal(result.drive.ax, 0);
  assert.equal(result.drive.ay, 0);
  assert.equal(result.drive.feel, 'keys');
});

test('touch scheme ignores a keyboard that is held', () => {
  const result = arbitrate(
    keyboard(),
    [
      part({ device: 'keyboard', ax: 1, engaged: true }),
      part({ device: 'touch', ax: -0.4, engaged: false }),
    ],
    'touch'
  );
  assert.equal(result.drive.device, 'touch');
  assert.equal(result.drive.ax, -0.4);
});
