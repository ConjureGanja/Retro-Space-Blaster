/**
 * Rear-view player ships for the chase camera, built from the HD masters.
 *
 * The HD files are painted as flat plans (roof, canopy, wings all equally
 * "up"). The sequel camera sits behind the tail, so each row of that painting
 * is laid into a trapezoid: engines wide and near, nose narrow and far.
 * Left and right poses skew that trapezoid. Up shortens the nose (flying
 * away). Down stretches the plumes (backing toward the camera).
 *
 * Analogy: taking the top-down model sheet and photographing it from the
 * tail of the jet, once for each way the stick can lean.
 *
 * One graphics set — no standard/HD pair. `npm run art` makes the WebPs.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'art', 'sprites');
const OUT_W = 520;
const OUT_H = 680;

const POSES = ['back', 'left', 'right', 'up', 'down'];

async function loadShip(file) {
  const img = sharp(file, { density: 72 }).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3];
      if (a > 24) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const crop = await sharp(file, { density: 72 })
    .extract({ left: minX, top: minY, width: w, height: h })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: crop.data, w: crop.info.width, h: crop.info.height };
}

function sample(src, w, h, x, y) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= w || iy >= h) return [0, 0, 0, 0];
  const i = (iy * w + ix) * 4;
  return [src[i], src[i + 1], src[i + 2], src[i + 3]];
}

function renderPose(ship, pose) {
  const buf = Buffer.alloc(OUT_W * OUT_H * 4);
  const skew = pose === 'left' ? -0.22 : pose === 'right' ? 0.22 : 0;
  for (let y = 0; y < OUT_H; y++) {
    const v = y / (OUT_H - 1);
    let srcV = v;
    if (pose === 'up') srcV = v ** 0.72;
    if (pose === 'down') srcV = v ** 1.35;
    const srcY = srcV * (ship.h - 1);
    // Nose (v near 0) is the far, narrow end. Engines fill the near edge.
    const half = OUT_W * (0.16 + 0.3 * v);
    const center = OUT_W / 2 + skew * (v - 0.2) * OUT_W;
    const left = center - half;
    const span = half * 2;
    for (let x = 0; x < OUT_W; x++) {
      const u = (x - left) / span;
      if (u < 0 || u > 1) continue;
      let srcX = u * (ship.w - 1);
      // Banking shows a little more of the inside flank by sliding the sample.
      if (pose === 'left') srcX += ship.w * 0.04 * (1 - v);
      if (pose === 'right') srcX -= ship.w * 0.04 * (1 - v);
      const [r, g, b, a] = sample(ship.data, ship.w, ship.h, srcX, srcY);
      if (a < 16) continue;
      let rr = r;
      let gg = g;
      let bb = b;
      if (pose === 'left' && u < 0.45) {
        rr = Math.round(r * 0.72);
        gg = Math.round(g * 0.72);
        bb = Math.round(b * 0.78);
      }
      if (pose === 'right' && u > 0.55) {
        rr = Math.round(r * 0.72);
        gg = Math.round(g * 0.72);
        bb = Math.round(b * 0.78);
      }
      const i = (y * OUT_W + x) * 4;
      buf[i] = rr;
      buf[i + 1] = gg;
      buf[i + 2] = bb;
      buf[i + 3] = a;
    }
  }
  return buf;
}

for (let n = 1; n <= 5; n++) {
  const ship = await loadShip(path.join(SRC, `playership${n}HD.svg`));
  for (const pose of POSES) {
    const file = path.join(SRC, `playership${n}-${pose}.png`);
    await sharp(renderPose(ship, pose), {
      raw: { width: OUT_W, height: OUT_H, channels: 4 },
    })
      .png()
      .toFile(file);
    console.log(path.basename(file));
  }
}
