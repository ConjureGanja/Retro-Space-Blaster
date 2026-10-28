#!/usr/bin/env node
/**
 * Art pipeline: art/sprites/*  →  public/assets/sprites/*.webp
 *
 * WHAT
 *   Renders every source sprite (SVG / PNG / JPG) to a compressed WebP that the
 *   game actually ships. Runs automatically before `npm run dev`, `build`,
 *   `local` and `deploy`; only re-renders files whose source changed.
 *
 * WHY
 *   The "HD" SVGs are wrappers around huge embedded PNGs (plus C2PA metadata
 *   from the art tool) — boss-SuperMegaMothershipHD.svg alone is 19 MB. But
 *   src/client/game/sprites.js downsamples every sprite to ≤640px wide the
 *   moment it loads, so all those extra pixels were thrown away on arrival.
 *   Rendering them once at 1280px (2× what the game uses) keeps them visually
 *   identical in-game while shrinking ~57 MB of art to ~2 MB. On Reddit mobile
 *   that's the difference between "tap → playing" and "tap → staring at a
 *   loading screen on 4G".
 *
 *   Analogy: you shot the commercial in 8K RAW (art/sprites — the master
 *   files, kept forever in git), but you deliver a 1080p H.264 to the TV
 *   station (public/assets/sprites — rebuilt any time, never hand-edited).
 *
 * HOW TO ADD ART
 *   1. Drop the file in art/sprites/ (keep the original — it's the master).
 *   2. Reference it in code as `/assets/sprites/<same-name>.webp`.
 *   3. Run `npm run art` (or any dev/build script — it runs this for you).
 *
 * The output folder is .gitignored on purpose: generated files in git drift
 * out of sync with their sources. CI regenerates them on every build.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'art', 'sprites');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'sprites');

// Bump this when the encode settings below change, so every file re-renders.
const PIPELINE_VERSION = 1;

/** Default output width. 2× the 640px trim cap in sprites.js = crisp on HiDPI. */
const SPRITE_WIDTH = 1280;

/**
 * Full-screen backgrounds (CSS `background: cover`) get a bigger render.
 * Key = source file name, value = output width in px.
 */
const WIDTH_OVERRIDES = {
  'startmenubg.svg': 1920,
  'Retro Space Blasters.png': 1920,
};

/** Backgrounds have no transparency — encode them a little harder. */
const OPAQUE = new Set(['startmenubg.svg', 'Retro Space Blasters.png']);

const SOURCE_EXT = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp']);
const STAMP_FILE = path.join(OUT_DIR, '.pipeline-version');

/** Tiny promise pool — sharp is multi-threaded already; 4 files at once is plenty. */
async function runPool(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: limit }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

async function mtime(file) {
  try {
    return (await fs.stat(file)).mtimeMs;
  } catch {
    return 0; // missing file = "infinitely old" → re-render
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // If the encode settings changed since the last run, force a full rebuild.
  const stamp = await fs.readFile(STAMP_FILE, 'utf8').catch(() => '');
  const forceAll = stamp.trim() !== String(PIPELINE_VERSION) || process.argv.includes('--force');

  const sources = (await fs.readdir(SRC_DIR)).filter((f) =>
    SOURCE_EXT.has(path.extname(f).toLowerCase())
  );

  let rendered = 0;
  let inBytes = 0;
  let outBytes = 0;

  await runPool(sources, 4, async (file) => {
    const src = path.join(SRC_DIR, file);
    const out = path.join(OUT_DIR, `${path.parse(file).name}.webp`);
    const srcStat = await fs.stat(src);
    inBytes += srcStat.size;

    // Skip files that are already up to date (output newer than source).
    if (!forceAll && (await mtime(out)) >= srcStat.mtimeMs) {
      // Await first, THEN add: `total += await x` reads `total` before the
      // await, so parallel workers would overwrite each other's sums.
      const { size } = await fs.stat(out);
      outBytes += size;
      return;
    }

    const width = WIDTH_OVERRIDES[file] ?? SPRITE_WIDTH;
    const isSvg = file.toLowerCase().endsWith('.svg');

    // SVGs: pick a render density so the *rasterised* width is ~`width`
    // up front (rendering at 72dpi then upscaling would look soft).
    // Every source frame here is 1920px wide; meta.width covers any other size.
    let input;
    if (isSvg) {
      const meta = await sharp(src, { limitInputPixels: false }).metadata();
      const density = Math.max(1, Math.round((72 * width) / (meta.width || 1920)));
      input = sharp(src, { density, limitInputPixels: false });
    } else {
      input = sharp(src, { limitInputPixels: false });
    }

    await input
      .resize({ width, withoutEnlargement: !isSvg })
      .webp(
        OPAQUE.has(file)
          ? { quality: 80, effort: 5 }
          : { quality: 88, alphaQuality: 100, effort: 5 }
      )
      .toFile(out);

    rendered++;
    const { size } = await fs.stat(out);
    outBytes += size;
  });

  await fs.writeFile(STAMP_FILE, String(PIPELINE_VERSION));

  const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
  console.log(
    `[art] ${sources.length} sprites (${rendered} rendered, ${sources.length - rendered} up to date) ` +
      `· ${mb(inBytes)} source → ${mb(outBytes)} shipped`
  );
}

main().catch((err) => {
  console.error('[art] failed:', err);
  process.exit(1);
});
