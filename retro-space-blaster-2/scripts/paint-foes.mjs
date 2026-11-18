/**
 * 128×128 front-view foe masters, plus a nearest-neighbor @2x twin.
 *
 * Same silhouettes as the first stamps: the dart, the wide wing, the bolted
 * gun, the plated tank, the needle, the seeder, the twin lobes, the crown,
 * the mine, the dish, and five bosses. This pass adds panels, shade, and
 * engine light so they read at the size the glass actually draws them.
 *
 * Analogy: the same rubber stamp, recut with a finer blade. The picture
 * got sharper. The shape did not change jobs.
 *
 * Do not touch art/sprites/rear/. Those five ships were painted by hand.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../art/sprites/foes');
const SIZE = 128;

const INK = {
  h0: [18, 24, 38, 255],
  h1: [42, 56, 82, 255],
  h2: [78, 96, 128, 255],
  h3: [150, 168, 196, 255],
  k: [10, 12, 20, 255],
  c: [70, 235, 255, 255],
  c0: [18, 90, 110, 255],
  c1: [170, 255, 255, 255],
  m: [255, 60, 180, 255],
  m0: [120, 20, 80, 255],
  y: [255, 214, 64, 255],
  y0: [140, 90, 16, 255],
  r: [255, 54, 72, 255],
  r0: [120, 16, 28, 255],
  w: [236, 248, 255, 255],
  g: [64, 255, 140, 255],
  g0: [16, 90, 48, 255],
  b: [64, 120, 255, 255],
  b0: [20, 36, 110, 255],
  o: [255, 148, 48, 255],
  o0: [140, 60, 12, 255],
  p: [196, 120, 255, 255],
  p0: [78, 28, 120, 255],
};

function board() {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  const set = (x, y, key) => {
    const ix = x | 0;
    const iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= SIZE || iy >= SIZE) return;
    const ink = INK[key];
    if (!ink) return;
    const i = (iy * SIZE + ix) * 4;
    px[i] = ink[0];
    px[i + 1] = ink[1];
    px[i + 2] = ink[2];
    px[i + 3] = ink[3];
  };
  const rect = (x, y, w, h, key) => {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) set(x + xx, y + yy, key);
  };
  const disc = (cx, cy, r, key) => {
    const rr = r * r;
    for (let yy = -r; yy <= r; yy++) {
      for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= rr) set(cx + xx, cy + yy, key);
    }
  };
  const ring = (cx, cy, r, key) => {
    const outer = r * r;
    const inner = (r - 1.2) * (r - 1.2);
    for (let yy = -r; yy <= r; yy++) {
      for (let xx = -r; xx <= r; xx++) {
        const d = xx * xx + yy * yy;
        if (d <= outer && d >= inner) set(cx + xx, cy + yy, key);
      }
    }
  };
  /** Dark rim, mid body, light crown. A sphere made of three stamps. */
  const ball = (cx, cy, r, dark, mid, light) => {
    disc(cx, cy, r, dark);
    disc(cx, cy - 1, r - 2, mid);
    disc(cx - 2, cy - 3, Math.max(2, r * 0.45), light);
  };
  const engine = (x, y, hot) => {
    disc(x, y, 5, 'k');
    disc(x, y, 3, hot ? 'y' : 'm0');
    disc(x, y, 1, hot ? 'w' : 'm');
  };
  return { px, set, rect, disc, ring, ball, engine };
}

function panels(b, x, y, w, h) {
  for (let row = 6; row < h - 2; row += 7) b.rect(x + 2, y + row, w - 4, 1, 'h0');
  for (let col = 8; col < w - 2; col += 10) b.rect(x + col, y + 3, 1, h - 6, 'k');
}

function cracks(b, cx, cy) {
  for (let i = -10; i <= 10; i++) {
    b.set(cx + i, cy + ((i * 3) % 5) - 2, 'w');
    b.set(cx + ((i * 2) % 4), cy + i, 'w');
  }
}

/** Narrow dart. Cyan nose, magenta nozzles, short wings. */
function swarmer(frame) {
  const b = board();
  b.ball(64, 70, 16, 'h0', 'h1', 'h2');
  b.rect(28, 62, 72, 8, 'h1');
  b.rect(20, 64, 10, 4, 'c');
  b.rect(98, 64, 10, 4, 'c');
  b.rect(58, 28, 12, 36, 'h2');
  b.rect(60, 22, 8, 12, frame === 'wind' ? 'y' : 'c');
  b.disc(64, 24, frame === 'wind' ? 6 : 3, frame === 'wind' ? 'w' : 'c1');
  panels(b, 52, 40, 24, 28);
  b.engine(52, 86, frame === 'wind');
  b.engine(76, 86, frame === 'wind');
  b.rect(60, 48, 8, 6, 'c0');
  b.set(63, 50, 'c1');
  b.set(66, 50, 'c1');
  if (frame === 'hit') cracks(b, 64, 58);
  if (frame === 'dead') {
    b.rect(40, 60, 48, 3, 'r');
    cracks(b, 64, 64);
  }
  return b;
}

/** A wing with a cockpit. Wind frame is the blink flash. */
function strafer(frame) {
  const b = board();
  b.rect(8, 58, 112, 14, 'h0');
  b.rect(16, 54, 96, 10, 'h1');
  b.rect(8, 60, 14, 8, 'm');
  b.rect(106, 60, 14, 8, 'm');
  b.ball(64, 58, 14, 'h0', 'h2', 'h3');
  b.rect(56, 50, 16, 10, 'c0');
  b.disc(64, 54, 4, frame === 'wind' ? 'w' : 'c1');
  panels(b, 24, 56, 28, 10);
  panels(b, 76, 56, 28, 10);
  b.engine(40, 74, false);
  b.engine(88, 74, false);
  if (frame === 'wind') {
    b.rect(18, 52, 18, 18, 'w');
    b.rect(92, 52, 18, 18, 'w');
  }
  if (frame === 'hit' || frame === 'dead') cracks(b, 64, 58);
  return b;
}

/** Gun on a post. The barrel climbs and lights on the wind-up. */
function turret(frame) {
  const b = board();
  b.rect(36, 78, 56, 16, 'k');
  b.rect(28, 90, 72, 8, 'h0');
  b.ball(64, 70, 22, 'h0', 'h1', 'h2');
  panels(b, 46, 58, 36, 28);
  const barrelY = frame === 'wind' ? 18 : 28;
  b.rect(56, barrelY, 16, 36, 'h2');
  b.rect(58, barrelY - 4, 12, 8, frame === 'wind' ? 'y' : 'c');
  b.disc(64, barrelY, frame === 'wind' ? 7 : 4, frame === 'wind' ? 'w' : 'c1');
  b.rect(48, 62, 8, 6, 'b');
  b.rect(72, 62, 8, 6, 'b');
  if (frame === 'hit' || frame === 'dead') cracks(b, 64, 70);
  return b;
}

/** Blocky nose. The cyan bar is the plate you break or slide past. */
function tank(frame) {
  const b = board();
  b.rect(24, 40, 80, 52, 'h0');
  b.rect(30, 46, 68, 40, 'h1');
  panels(b, 32, 50, 64, 32);
  b.rect(18, 62, 92, 12, 'k');
  b.rect(22, 36, 84, 8, frame === 'wind' ? 'o' : 'c');
  b.rect(36, 28, 56, 10, frame === 'wind' ? 'y' : 'y0');
  b.engine(40, 96, frame === 'wind');
  b.engine(64, 98, frame === 'wind');
  b.engine(88, 96, frame === 'wind');
  b.rect(56, 58, 16, 10, 'o0');
  b.disc(64, 62, 4, 'y');
  if (frame === 'hit') {
    b.rect(22, 36, 84, 8, 'w');
    cracks(b, 64, 68);
  }
  if (frame === 'dead') cracks(b, 64, 70);
  return b;
}

/** A needle. Wind frame is the charge. */
function kamikaze(frame) {
  const b = board();
  b.rect(52, 24, 24, 70, 'h1');
  b.rect(44, 48, 40, 16, 'h0');
  b.ball(64, 56, frame === 'wind' ? 18 : 12, 'r0', 'r', 'y');
  b.disc(64, 56, frame === 'wind' ? 8 : 4, frame === 'wind' ? 'w' : 'y');
  b.rect(58, 16, 12, 16, 'h2');
  b.set(64, 14, frame === 'wind' ? 'w' : 'o');
  b.engine(52, 100, true);
  b.engine(76, 100, true);
  panels(b, 54, 70, 20, 22);
  if (frame === 'hit' || frame === 'dead') cracks(b, 64, 56);
  return b;
}

/** Round seeder. Yellow pods around a dark bay. */
function miner(frame) {
  const b = board();
  b.ball(64, 64, 28, 'h0', 'h1', 'h2');
  b.disc(64, 64, 10, 'k');
  b.disc(64, 64, frame === 'wind' ? 6 : 3, frame === 'wind' ? 'y' : 'h2');
  for (const [x, y] of [
    [40, 44],
    [88, 44],
    [36, 70],
    [92, 70],
    [64, 96],
    [64, 34],
  ]) {
    b.disc(x, y, 5, 'y0');
    b.disc(x, y, 2, 'y');
  }
  panels(b, 50, 48, 28, 20);
  if (frame === 'hit' || frame === 'dead') cracks(b, 64, 64);
  return b;
}

/** Two hulls sharing a spine. Wind frame pulls them apart. */
function splitter(frame) {
  const b = board();
  const gap = frame === 'wind' ? 10 : 2;
  b.ball(48 - gap, 64, 20, 'h0', 'h1', 'h2');
  b.ball(80 + gap, 64, 20, 'h0', 'h1', 'h2');
  b.rect(56 - gap, 60, 16 + gap * 2, 8, 'k');
  b.disc(48 - gap, 58, 4, 'g');
  b.disc(80 + gap, 58, 4, 'g');
  b.engine(40 - gap, 88, false);
  b.engine(88 + gap, 88, false);
  if (frame === 'hit' || frame === 'dead') {
    cracks(b, 48, 64);
    cracks(b, 80, 64);
  }
  return b;
}

/** Crown and a gold plate. Wind frame is the reflect bubble. */
function elite(frame) {
  const b = board();
  b.ball(64, 70, 24, 'h0', 'h1', 'h2');
  panels(b, 48, 58, 32, 28);
  b.rect(40, 36, 8, 18, 'y0');
  b.rect(60, 24, 8, 28, 'y');
  b.rect(80, 36, 8, 18, 'y0');
  b.disc(58, 28, 3, 'y');
  b.disc(70, 28, 3, 'y');
  b.rect(52, 62, 24, 12, 'c0');
  b.disc(64, 66, 4, 'c1');
  b.engine(46, 98, false);
  b.engine(82, 98, false);
  if (frame === 'wind') b.ring(64, 66, 30, 'y');
  if (frame === 'wind') b.ring(64, 66, 26, 'w');
  if (frame === 'hit' || frame === 'dead') cracks(b, 64, 70);
  return b;
}

/** Spiked charge. */
function mine(frame) {
  const b = board();
  b.ball(64, 64, frame === 'wind' ? 30 : 24, 'o0', 'o', 'y');
  b.disc(64, 64, 8, 'y');
  b.disc(64, 64, 3, frame === 'wind' ? 'w' : 'r');
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    const x = 64 + Math.cos(a) * 34;
    const y = 64 + Math.sin(a) * 34;
    b.rect(x - 2, y - 2, 5, 5, 'r');
  }
  if (frame === 'hit' || frame === 'dead') cracks(b, 64, 64);
  return b;
}

/** The dish that paints bubbles. The ring is the tell. */
function generator(frame) {
  const b = board();
  b.rect(40, 70, 48, 28, 'h1');
  panels(b, 44, 76, 40, 18);
  b.ball(64, 58, 18, 'b0', 'b', 'c');
  b.ring(64, 50, frame === 'wind' ? 28 : 22, frame === 'wind' ? 'c1' : 'c');
  b.disc(64, 50, 4, 'w');
  b.rect(20, 86, 88, 6, 'k');
  b.engine(36, 100, false);
  b.engine(92, 100, false);
  if (frame === 'hit' || frame === 'dead') cracks(b, 64, 70);
  return b;
}

/** Big wing, accent core. Wind frame floods the core. Hit cracks the nose. */
function boss(accent, accent0, frame) {
  const b = board();
  b.rect(8, 58, 112, 16, 'h0');
  b.rect(16, 52, 96, 12, 'h1');
  b.ball(64, 64, 26, 'h0', 'h1', 'h2');
  panels(b, 46, 50, 36, 30);
  b.rect(4, 60, 16, 10, accent);
  b.rect(108, 60, 16, 10, accent);
  b.rect(52, 28, 24, 22, frame === 'wind' ? 'y' : accent0);
  b.disc(64, 36, frame === 'wind' ? 12 : 7, frame === 'wind' ? 'w' : accent);
  b.engine(36, 96, frame === 'wind');
  b.engine(64, 100, frame === 'wind');
  b.engine(92, 96, frame === 'wind');
  b.rect(28, 70, 12, 6, 'm');
  b.rect(88, 70, 12, 6, 'm');
  if (frame === 'wind') b.ring(64, 60, 36, accent);
  if (frame === 'hit' || frame === 'dead') cracks(b, 64, 60);
  return b;
}

const SMALL = { swarmer, strafer, turret, tank, kamikaze, miner, splitter, elite, mine, generator };
const BOSSES = {
  nebula: ['p', 'p0'],
  belt: ['o', 'o0'],
  station: ['c', 'c0'],
  ice: ['w', 'c'],
  hive: ['g', 'g0'],
};
const FRAMES = ['idle', 'wind', 'hit', 'dead'];

async function writePair(name, image) {
  const base = path.join(OUT, `${name}.png`);
  const png = await sharp(image.px, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png()
    .toBuffer();
  await fs.writeFile(base, png);
  // The @2x file is the same stamp, doubled with nearest-neighbor so a
  // HiDPI glass gets real squares instead of a blur. The pipeline prefers it.
  const big = await sharp(png)
    .resize(SIZE * 2, SIZE * 2, { kernel: 'nearest' })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(OUT, `${name}@2x.png`), big);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  for (const [name, paint] of Object.entries(SMALL)) {
    for (const frame of FRAMES) await writePair(`${name}-${frame}`, paint(frame));
  }
  for (const [name, colors] of Object.entries(BOSSES)) {
    for (const frame of FRAMES)
      await writePair(`${name}-${frame}`, boss(colors[0], colors[1], frame));
  }
  console.log('[foes] painted 128px masters and @2x twins into art/sprites/foes');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
