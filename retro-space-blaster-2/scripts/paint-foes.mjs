/**
 * Paint the rail-shooter's enemy masters.
 *
 * Front view, because they fly at the camera. Each file is a handful of
 * hard-edged pixels — the same idea as the ship's rear plates, not a photo.
 * npm run art turns these into WebP. Don't edit the WebP.
 *
 * Analogy: carving rubber stamps. Idle, wind-up, and the flinch are three
 * stamps of the same ship, not three different ships.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../art/sprites/foes');

const INK = {
  k: [12, 16, 28, 255],
  h: [36, 48, 72, 255],
  c: [90, 240, 255, 255],
  m: [255, 70, 190, 255],
  y: [255, 220, 70, 255],
  r: [255, 50, 70, 255],
  w: [236, 248, 255, 255],
  g: [70, 255, 140, 255],
  b: [70, 120, 255, 255],
  o: [255, 150, 50, 255],
  p: [190, 120, 255, 255],
  d: [8, 10, 16, 255],
};

function board(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, key) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= size || iy >= size) return;
    const ink = INK[key];
    if (!ink) return;
    const i = (iy * size + ix) * 4;
    px[i] = ink[0];
    px[i + 1] = ink[1];
    px[i + 2] = ink[2];
    px[i + 3] = ink[3];
  };
  const rect = (x, y, w, h, key) => {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) set(x + xx, y + yy, key);
  };
  const disc = (cx, cy, r, key) => {
    for (let yy = -r; yy <= r; yy++) {
      for (let xx = -r; xx <= r; xx++) {
        if (xx * xx + yy * yy <= r * r) set(cx + xx, cy + yy, key);
      }
    }
  };
  return { px, size, set, rect, disc };
}

function wing(b, y, span, key, tip) {
  b.rect(16 - span, y, span * 2, 2, key);
  b.set(16 - span, y, tip);
  b.set(15 + span, y, tip);
}

/** Small dart. The wind frame lights the nose. */
function swarmer(frame) {
  const b = board(32);
  wing(b, 14, 8, 'h', 'c');
  b.rect(14, 8, 4, 14, 'h');
  b.rect(15, 6, 2, 4, frame === 'wind' ? 'y' : 'c');
  b.set(15, 20, 'm');
  b.set(16, 20, 'm');
  if (frame === 'hit') b.rect(14, 10, 4, 4, 'w');
  return b;
}

/** Wide and thin. Wind frame is the blink flash. */
function strafer(frame) {
  const b = board(32);
  b.rect(4, 14, 24, 3, 'h');
  b.rect(8, 12, 16, 2, 'k');
  b.set(4, 14, 'm');
  b.set(27, 14, 'm');
  b.rect(14, 13, 4, 4, 'c');
  if (frame === 'wind') {
    b.rect(6, 13, 4, 5, 'w');
    b.rect(22, 13, 4, 5, 'w');
  }
  if (frame === 'hit') b.rect(12, 13, 8, 4, 'w');
  return b;
}

/** A gun bolted to a post. */
function turret(frame) {
  const b = board(32);
  b.rect(10, 18, 12, 4, 'k');
  b.rect(12, 10, 8, 10, 'h');
  b.rect(14, frame === 'wind' ? 4 : 6, 4, 6, frame === 'wind' ? 'y' : 'c');
  b.rect(13, 12, 6, 3, 'b');
  if (frame === 'hit') b.rect(12, 10, 8, 6, 'w');
  return b;
}

/** Heavy nose with a shield bar. The wind frame opens the vents. */
function tank(frame) {
  const b = board(32);
  b.rect(8, 10, 16, 12, 'h');
  b.rect(6, 14, 20, 4, 'k');
  b.rect(11, 8, 10, 3, frame === 'wind' ? 'o' : 'y');
  b.set(10, 16, 'o');
  b.set(21, 16, 'o');
  if (frame !== 'hit') b.rect(7, 12, 18, 1, 'c');
  if (frame === 'hit') b.rect(10, 12, 12, 6, 'w');
  return b;
}

/** Needle. Wind frame is the charge glow. */
function kamikaze(frame) {
  const b = board(32);
  b.rect(14, 6, 4, 16, 'h');
  b.rect(12, 14, 8, 3, 'k');
  const glow = frame === 'wind' ? 'r' : 'o';
  b.disc(16, 10, frame === 'wind' ? 4 : 2, glow);
  b.set(15, 22, 'y');
  b.set(16, 22, 'y');
  if (frame === 'hit') b.rect(13, 8, 6, 8, 'w');
  return b;
}

/** Round belly, yellow seeds. */
function miner(frame) {
  const b = board(32);
  b.disc(16, 15, 7, 'h');
  b.disc(16, 15, 3, 'k');
  b.set(10, 12, 'y');
  b.set(21, 12, 'y');
  b.set(12, 20, 'y');
  b.set(19, 20, 'y');
  if (frame === 'wind') b.disc(16, 15, 2, 'y');
  if (frame === 'hit') b.disc(16, 15, 4, 'w');
  return b;
}

/** Two lobes. Wind frame pulls them apart. */
function splitter(frame) {
  const b = board(32);
  const gap = frame === 'wind' ? 3 : 1;
  b.disc(16 - 4 - gap, 15, 5, 'h');
  b.disc(16 + 3 + gap, 15, 5, 'h');
  b.set(12 - gap, 14, 'g');
  b.set(19 + gap, 14, 'g');
  if (frame === 'hit') {
    b.disc(12, 15, 3, 'w');
    b.disc(20, 15, 3, 'w');
  }
  return b;
}

/** Crown and a gold plate. Wind frame is the reflect shield. */
function elite(frame) {
  const b = board(32);
  b.rect(10, 12, 12, 10, 'h');
  b.rect(8, 15, 16, 3, 'k');
  b.set(12, 8, 'y');
  b.set(16, 6, 'y');
  b.set(19, 8, 'y');
  b.rect(14, 14, 4, 3, 'c');
  if (frame === 'wind') b.disc(16, 14, 8, 'y');
  if (frame === 'hit') b.rect(11, 12, 10, 6, 'w');
  return b;
}

/** A drifting charge. */
function mine(frame) {
  const b = board(32);
  b.disc(16, 16, 5, frame === 'hit' ? 'w' : 'o');
  b.disc(16, 16, 2, 'y');
  b.set(16, 8, 'r');
  b.set(16, 23, 'r');
  b.set(8, 16, 'r');
  b.set(23, 16, 'r');
  if (frame === 'wind') b.disc(16, 16, 7, 'y');
  return b;
}

/** A dish that paints a bubble on its friends. */
function generator(frame) {
  const b = board(32);
  b.rect(12, 14, 8, 8, 'h');
  b.disc(16, 12, 5, frame === 'wind' ? 'c' : 'b');
  b.rect(8, 18, 16, 2, 'k');
  b.set(15, 11, 'w');
  b.set(16, 11, 'w');
  if (frame === 'hit') b.rect(12, 14, 8, 6, 'w');
  return b;
}

function boss(accent, frame) {
  const b = board(48);
  const mid = 24;
  b.rect(mid - 8, 14, 16, 18, 'h');
  b.rect(6, 20, 36, 4, 'k');
  b.rect(4, 21, 4, 2, accent);
  b.rect(40, 21, 4, 2, accent);
  b.rect(mid - 3, 10, 6, 6, frame === 'wind' ? 'y' : accent);
  b.rect(mid - 6, 28, 4, 3, 'm');
  b.rect(mid + 2, 28, 4, 3, 'm');
  if (frame === 'wind') b.disc(mid, 18, 10, accent);
  if (frame === 'hit') b.rect(mid - 8, 16, 16, 10, 'w');
  return b;
}

const SMALL = {
  swarmer,
  strafer,
  turret,
  tank,
  kamikaze,
  miner,
  splitter,
  elite,
  mine,
  generator,
};

const BOSSES = {
  nebula: 'p',
  belt: 'o',
  station: 'c',
  ice: 'w',
  hive: 'g',
};

async function write(name, boardImage) {
  const file = path.join(OUT, `${name}.png`);
  await sharp(boardImage.px, {
    raw: { width: boardImage.size, height: boardImage.size, channels: 4 },
  })
    .png()
    .toFile(file);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  for (const [name, paint] of Object.entries(SMALL)) {
    for (const frame of ['idle', 'wind', 'hit']) await write(`${name}-${frame}`, paint(frame));
  }
  for (const [name, accent] of Object.entries(BOSSES)) {
    for (const frame of ['idle', 'wind', 'hit'])
      await write(`${name}-${frame}`, boss(accent, frame));
  }
  console.log('[foes] painted enemy masters into art/sprites/foes');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
