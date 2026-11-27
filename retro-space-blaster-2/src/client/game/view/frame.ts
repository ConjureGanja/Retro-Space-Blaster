/**
 * The current letterbox, shared by the renderer and the pointer.
 *
 * Why one holder: the finger and the picture have to use the same fit.
 * If the renderer letterboxed a 16:9 window and the mouse still used raw
 * CSS pixels, the ship would chase a point the player isn't pointing at.
 * Analogy: the box office and the usher reading off the same seating chart.
 */

import { fitView, type Frame } from './plane.ts';

let frame: Frame = fitView(1280, 720, 1);

export function setFrame(next: Frame): void {
  frame = next;
}

export function getFrame(): Frame {
  return frame;
}
