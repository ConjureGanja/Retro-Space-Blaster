/**
 * Turn the painted foe masters into the frames the game draws.
 *
 * The masters in art/foe-masters/ are the same kind of pixel painting as the
 * rear player ships: metal ramps, panel lines, rim light, glowing nozzles.
 * This script does not invent a new ship. It cleans the painting (black
 * becomes clear, nearest-neighbor down to 256, the size of playership1.png)
 * and then cuts that painting into the frames.
 *
 * Analogy: one photograph of a mug, then a flipbook of the same mug falling
 * off the table. The mug doesn't change species between pages.
 *
 *   node scripts/bake-foes.mjs
 *   npm run art
 *
 * Do not touch art/sprites/rear/. Those five ships stay hand-painted.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASTERS = path.join(ROOT, 'art', 'foe-masters');
const OUT = path.join(ROOT, 'art', 'sprites', 'foes');
const SIZE = 256;

const NAMES = [
  'swarmer',
  'strafer',
  'turret',
  'tank',
  'kamikaze',
  'miner',
  'splitter',
  'elite',
  'mine',
  'generator',
  'nebula',
  'belt',
  'station',
  'ice',
  'hive',
];
const BOSSES = new Set(['nebula', 'belt', 'station', 'ice', 'hive']);

function idx(x, y) {
  return (y * SIZE + x) * 4;
}

function blank() {
  return Buffer.alloc(SIZE * SIZE * 4);
}

function clone(buf) {
  return Buffer.from(buf);
}

/** Near-black JPEG backdrop becomes clear. A dim fringe fades instead of leaving a box. */
function keyBlack(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 16) data[i + 3] = 0;
    else if (max < 36 && max - min < 14) data[i + 3] = Math.round(((max - 16) / 20) * 180);
  }
}

function cropBox(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a < 20) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX <= minX) return { left: 0, top: 0, width, height };
  const pad = 8;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const right = Math.min(width, maxX + pad + 1);
  const bottom = Math.min(height, maxY + pad + 1);
  return { left, top, width: right - left, height: bottom - top };
}

async function loadMaster(name) {
  const file = path.join(MASTERS, `foe-${name}.jpg`);
  const raw = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  keyBlack(raw.data);
  const box = cropBox(raw.data, raw.info.width, raw.info.height);
  const cropped = await sharp(raw.data, {
    raw: { width: raw.info.width, height: raw.info.height, channels: 4 },
  })
    .extract(box)
    .resize(SIZE, SIZE, {
      fit: 'contain',
      kernel: 'nearest',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer();
  return cropped;
}

function chroma(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** Engine and core pixels. The flicker frame only touches these, like a bulb. */
function glowMask(src) {
  const mask = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = idx(x, y);
      if (src[i + 3] < 40) continue;
      const c = chroma(src[i], src[i + 1], src[i + 2]);
      const bright = (src[i] + src[i + 1] + src[i + 2]) / 3;
      if (c > 70 && bright > 120) mask[y * SIZE + x] = 1;
    }
  }
  return mask;
}

function flicker(src) {
  const out = clone(src);
  const mask = glowMask(src);
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const i = p * 4;
    out[i] = Math.min(255, out[i] + 36);
    out[i + 1] = Math.min(255, out[i + 1] + 18);
    out[i + 2] = Math.min(255, out[i + 2] + 28);
  }
  return out;
}

function wind(src) {
  const out = clone(src);
  const mask = glowMask(src);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = idx(x, y);
      if (out[i + 3] < 30) continue;
      const hot = mask[y * SIZE + x] || y < SIZE * 0.34;
      if (!hot) continue;
      const lift = mask[y * SIZE + x] ? 48 : 16;
      out[i] = Math.min(255, out[i] + lift);
      out[i + 1] = Math.min(255, out[i + 1] + lift * 0.7);
      out[i + 2] = Math.min(255, out[i + 2] + lift * 0.45);
    }
  }
  return out;
}

function crack(out, x0, y0, x1, y1, color) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t + Math.sin(s * 0.7) * 1.2);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
    const i = idx(x, y);
    if (out[i + 3] < 40) continue;
    out[i] = color[0];
    out[i + 1] = color[1];
    out[i + 2] = color[2];
    out[i + 3] = 255;
  }
}

function hit(src) {
  const out = clone(src);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] < 40) continue;
    out[i] = Math.min(255, out[i] + 50);
    out[i + 1] = Math.min(255, out[i + 1] + 50);
    out[i + 2] = Math.min(255, out[i + 2] + 50);
  }
  crack(out, 70, 40, 180, 210, [255, 255, 255]);
  crack(out, 190, 50, 80, 200, [255, 244, 210]);
  return out;
}

function hurt(src, heavy) {
  const out = clone(src);
  const dim = heavy ? 0.62 : 0.8;
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] < 20) continue;
    const glow = chroma(out[i], out[i + 1], out[i + 2]) > 80;
    if (glow) continue;
    out[i] = Math.round(out[i] * dim);
    out[i + 1] = Math.round(out[i + 1] * dim);
    out[i + 2] = Math.round(out[i + 2] * dim);
  }
  crack(out, 40, 30, 210, 220, [255, 120, 60]);
  crack(out, 200, 36, 60, 200, [255, 220, 160]);
  if (heavy) {
    crack(out, 128, 20, 128, 230, [255, 80, 40]);
    crack(out, 30, 128, 226, 140, [255, 160, 80]);
  }
  return out;
}

function chunksOf(src, cells) {
  const cell = SIZE / cells;
  const list = [];
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const x0 = Math.round(gx * cell);
      const y0 = Math.round(gy * cell);
      const x1 = Math.round((gx + 1) * cell);
      const y1 = Math.round((gy + 1) * cell);
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) if (src[idx(x, y) + 3] > 30) n++;
      }
      if (n > 20) list.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return list;
}

/** Big pieces, not confetti. A plate should leave as a plate. */
function regionsFor(src, kind) {
  const half = SIZE / 2;
  if (kind === 'splitter') {
    return [
      { x: 0, y: 0, w: half, h: SIZE },
      { x: half, y: 0, w: half, h: SIZE },
    ];
  }
  if (kind === 'tank') {
    return [
      { x: 0, y: 0, w: half, h: Math.round(SIZE * 0.46) },
      { x: half, y: 0, w: half, h: Math.round(SIZE * 0.46) },
      { x: 0, y: Math.round(SIZE * 0.46), w: SIZE, h: Math.round(SIZE * 0.54) },
    ];
  }
  if (kind === 'turret') {
    return [
      { x: Math.round(SIZE * 0.28), y: 0, w: Math.round(SIZE * 0.44), h: Math.round(SIZE * 0.52) },
      { x: 0, y: Math.round(SIZE * 0.48), w: SIZE, h: Math.round(SIZE * 0.52) },
    ];
  }
  if (kind === 'strafer') {
    return [
      { x: 0, y: 0, w: Math.round(SIZE * 0.3), h: SIZE },
      { x: Math.round(SIZE * 0.3), y: 0, w: Math.round(SIZE * 0.4), h: SIZE },
      { x: Math.round(SIZE * 0.7), y: 0, w: Math.round(SIZE * 0.3), h: SIZE },
    ];
  }
  if (kind === 'elite') {
    return [
      { x: Math.round(SIZE * 0.3), y: 0, w: Math.round(SIZE * 0.4), h: Math.round(SIZE * 0.28) },
      { x: 0, y: Math.round(SIZE * 0.28), w: half, h: Math.round(SIZE * 0.72) },
      { x: half, y: Math.round(SIZE * 0.28), w: half, h: Math.round(SIZE * 0.72) },
    ];
  }
  if (kind === 'mine' || kind === 'miner') return chunksOf(src, 4);
  if (BOSSES.has(kind)) return chunksOf(src, 3);
  return chunksOf(src, 2);
}

/**
 * Where each piece of this ship goes on this page of the flipbook.
 * The motion is the personality: a splitter parts, a mine rings, a tank
 * throws its plates, a dish falls inward and then bursts.
 */
function pieceMotion(kind, frame, piece) {
  const p = frame / 7;
  const cx = piece.x + piece.w / 2 - SIZE / 2;
  const cy = piece.y + piece.h / 2 - SIZE / 2;
  const len = Math.hypot(cx, cy) || 1;
  let dx;
  let dy;
  let alpha;
  if (BOSSES.has(kind)) {
    const q = Math.max(0, (p - 0.22) / 0.78);
    dx = cx * q * 1.15;
    dy = cy * q * 0.85 + (piece.y < SIZE / 2 ? -18 : 14) * q;
    alpha = 1 - q * 0.8;
    return { dx, dy, alpha };
  }
  if (kind === 'splitter') {
    dx = (piece.x + piece.w / 2 < SIZE / 2 ? -1 : 1) * p * 78;
    dy = p * 8;
    alpha = 1 - p * 0.25;
  } else if (kind === 'generator') {
    const pull = frame < 4 ? -p * 36 : (p - 0.4) * 110;
    dx = (cx / len) * pull;
    dy = (cy / len) * pull;
    alpha = frame < 6 ? 1 : 0.45;
  } else if (kind === 'mine') {
    dx = (cx / len) * p * 92;
    dy = (cy / len) * p * 92;
    alpha = 1 - p * 0.65;
  } else if (kind === 'tank') {
    const plate = piece.y < SIZE * 0.45;
    dx = cx * p * (plate ? 1.5 : 0.35);
    dy = (plate ? -70 : 18) * p;
    alpha = plate ? 1 - p * 0.15 : 1 - p * 0.8;
  } else if (kind === 'turret') {
    const barrel = piece.y < SIZE * 0.48;
    dx = barrel ? p * 36 : cx * p * 0.25;
    dy = barrel ? p * 64 : p * 6;
    alpha = 1 - p * (barrel ? 0.2 : 0.7);
  } else if (kind === 'strafer') {
    const wing = Math.abs(cx) > 36;
    dx = wing ? Math.sign(cx || 1) * p * 96 : cx * p * 0.15;
    dy = wing ? p * 14 : p * 4;
    alpha = 1 - p * 0.35;
  } else if (kind === 'kamikaze') {
    dx = (cx / len) * p * 100;
    dy = (cy / len) * p * 100;
    alpha = frame < 2 ? 1 : 1 - (frame - 1) / 6;
  } else if (kind === 'miner') {
    const pod = len > 48;
    dx = (cx / len) * p * (pod ? 100 : 24);
    dy = (cy / len) * p * (pod ? 100 : 16);
    alpha = 1 - p * 0.45;
  } else if (kind === 'elite') {
    const crown = piece.y < SIZE * 0.3;
    dx = crown ? cx * 0.15 : cx * p * 0.9;
    dy = crown ? -p * 78 : p * 10;
    alpha = 1 - p * 0.4;
  } else {
    dx = cx * p * 1.05;
    dy = cy * p * 0.55 + (piece.x % 48 === 0 ? -8 : 8) * p;
    alpha = 1 - p * 0.7;
  }
  return { dx, dy, alpha };
}

function stampPiece(dst, src, piece, dx, dy, alpha) {
  for (let y = piece.y; y < piece.y + piece.h; y++) {
    for (let x = piece.x; x < piece.x + piece.w; x++) {
      const si = idx(x, y);
      if (src[si + 3] < 24) continue;
      const tx = Math.round(x + dx);
      const ty = Math.round(y + dy);
      if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) continue;
      const di = idx(tx, ty);
      const a = (src[si + 3] / 255) * alpha;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = Math.max(dst[di + 3], Math.round(a * 255));
    }
  }
}

function ring(dst, radius, color, width = 2) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (Math.abs(d - radius) > width) continue;
      const i = idx(x, y);
      dst[i] = color[0];
      dst[i + 1] = color[1];
      dst[i + 2] = color[2];
      dst[i + 3] = Math.max(dst[i + 3], 220);
    }
  }
}

function deathFrame(src, kind, frame) {
  const out = blank();
  const pieces = regionsFor(src, kind);
  if (frame < 2 && BOSSES.has(kind)) {
    const cracked = hurt(src, frame === 1);
    for (let i = 0; i < out.length; i++) out[i] = cracked[i];
    return out;
  }
  for (const piece of pieces) {
    const motion = pieceMotion(kind, frame, piece);
    stampPiece(out, src, piece, motion.dx, motion.dy, motion.alpha);
  }
  if (kind === 'mine' || kind === 'kamikaze' || BOSSES.has(kind)) {
    const color =
      kind === 'kamikaze' ? [255, 170, 60] : BOSSES.has(kind) ? [255, 230, 160] : [255, 120, 40];
    ring(out, 18 + frame * 14, color, kind === 'mine' ? 3 : 2);
  }
  if (kind === 'generator' && frame >= 4) ring(out, 10 + (frame - 4) * 16, [120, 230, 255], 2);
  if (frame === 0 && (kind === 'kamikaze' || kind === 'mine')) {
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] < 20) continue;
      out[i] = Math.min(255, out[i] + 80);
      out[i + 1] = Math.min(255, out[i + 1] + 60);
      out[i + 2] = Math.min(255, out[i + 2] + 30);
    }
  }
  return out;
}

async function writePng(name, data) {
  const png = await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await fs.writeFile(path.join(OUT, `${name}.png`), png);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const old = await fs.readdir(OUT);
  await Promise.all(
    old.filter((file) => file.endsWith('.png')).map((file) => fs.rm(path.join(OUT, file)))
  );
  for (const name of NAMES) {
    const master = await loadMaster(name);
    await writePng(`${name}-idle`, master);
    await writePng(`${name}-flicker`, flicker(master));
    await writePng(`${name}-wind`, wind(master));
    await writePng(`${name}-hit`, hit(master));
    if (BOSSES.has(name)) {
      await writePng(`${name}-hurt`, hurt(master, false));
      await writePng(`${name}-hurt2`, hurt(master, true));
    }
    for (let frame = 0; frame < 8; frame++) {
      await writePng(`${name}-die-${frame}`, deathFrame(master, name, frame));
    }
    console.log(`[foes] ${name}`);
  }
  console.log('[foes] baked 256px frames into art/sprites/foes');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
