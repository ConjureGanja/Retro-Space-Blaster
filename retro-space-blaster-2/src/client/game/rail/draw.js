/**
 * Paint the rail shooter. This file only reads the sim and draws.
 * It never moves an enemy, spends a life, or fires a shot.
 *
 * Depth is the distance from the camera. Far things shrink toward the
 * horizon. Anything that has drifted close fades out so it cannot hide
 * the ship — a bug on the windshield, not a truck in the cabin.
 *
 * The open lane is drawn on purpose. It is the crosswalk. If you had to
 * guess which gap was safe, the pattern would be a quiz instead of a fight.
 */

import { safeLane } from './content.ts';
import { project } from './project.ts';
import { Sprites } from '../sprites.js';
import { TUNE } from './tune.ts';

const params = new URLSearchParams(location.search);
const SHOW_HIT = params.has('hitbox');

let starTheme = '';
let stars = [];

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function ensureStars(theme, reduced) {
  const key = theme.accent + (reduced ? ':low' : '');
  if (key === starTheme) return;
  starTheme = key;
  const count = reduced ? 48 : 140;
  stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: hash(i + 1) * 2 - 1,
      y: hash(i + 9) * 2 - 1,
      z: 180 + hash(i + 3) * 900,
      s: 0.6 + hash(i + 4) * 1.8,
    });
  }
}

/**
 * Distinct silhouettes. Same pixels would make eight behaviors feel like one enemy.
 */
function blot(ctx, kind, radius) {
  const r = radius;
  ctx.beginPath();
  if (kind === 'swarmer') {
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.8, r * 0.7);
    ctx.lineTo(-r * 0.8, r * 0.7);
  } else if (kind === 'strafer') {
    ctx.moveTo(-r, 0);
    ctx.lineTo(0, -r * 0.45);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r * 0.45);
  } else if (kind === 'turret') {
    ctx.rect(-r * 0.55, -r * 0.7, r * 1.1, r * 1.15);
  } else if (kind === 'tank') {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r * 0.8;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  } else if (kind === 'kamikaze') {
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.7, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.7, 0);
  } else if (kind === 'miner' || kind === 'mine') {
    ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
  } else if (kind === 'splitter') {
    ctx.arc(-r * 0.35, 0, r * 0.55, 0, Math.PI * 2);
    ctx.moveTo(r * 0.9, 0);
    ctx.arc(r * 0.35, 0, r * 0.55, 0, Math.PI * 2);
  } else if (kind === 'elite' || kind === 'boss') {
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  } else {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  ctx.closePath();
}

function drawRear(ctx, sprite, x, y, width, roll, alpha) {
  const key = `rear-${sprite}`;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(roll);
  ctx.globalAlpha = alpha;
  if (Sprites.isReady(key)) {
    const img = Sprites.get(key);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = width / Math.max(iw, ih);
    const w = iw * scale;
    const h = ih * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = '#9fd7ff';
    ctx.beginPath();
    ctx.moveTo(0, -width * 0.35);
    ctx.lineTo(width * 0.28, width * 0.22);
    ctx.lineTo(-width * 0.28, width * 0.22);
    ctx.fill();
  }
  ctx.restore();
}

function drawSafeLane(ctx, frame, theme, w, h) {
  const lane = safeLane(frame);
  const half = 36;
  ctx.save();
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.16;
  ctx.beginPath();
  let started = false;
  for (const z of [900, 700, 500, 320, 200]) {
    const left = project(lane - half, 0, z, w, h);
    if (!started) {
      ctx.moveTo(left.x, left.y);
      started = true;
    } else ctx.lineTo(left.x, left.y);
  }
  for (const z of [200, 320, 500, 700, 900]) {
    const right = project(lane + half, 0, z, w, h);
    ctx.lineTo(right.x, right.y);
  }
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx, enemy, w, h, frame) {
  const p = project(enemy.x, enemy.y, enemy.z, w, h);
  const radius = Math.max(6, enemy.r * p.scale * TUNE.X_SPREAD * 0.85);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = enemy.boss ? 1 : p.alpha;
  ctx.fillStyle = enemy.boss ? enemy.accent : enemy.kind === 'mine' ? '#ffd27a' : '#d7fff0';
  ctx.strokeStyle = enemy.accent || '#9dffc8';
  ctx.lineWidth = enemy.boss ? 3 : 1.5;
  if (enemy.kind === 'kamikaze' && enemy.mode === 'windup') {
    ctx.strokeStyle = frame % 8 < 4 ? '#ff5a6a' : '#ffd0d6';
  }
  blot(ctx, enemy.boss ? 'boss' : enemy.kind, radius);
  ctx.fill();
  ctx.stroke();
  if (enemy.maxShield > 0 && enemy.shield > 0) {
    ctx.globalAlpha *= 0.85;
    ctx.strokeStyle = '#9af6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  ctx.restore();

  if (enemy.pending.length && enemy.windup > 0) {
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(frame * 0.3));
    for (const dot of enemy.pending) {
      const mark = project(dot.x, dot.y, Math.max(enemy.z, TUNE.Z_CULL), w, h);
      ctx.save();
      ctx.globalAlpha = 0.35 + pulse * 0.45;
      ctx.strokeStyle = enemy.kind === 'kamikaze' ? '#ff5a6a' : '#ffe14a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mark.x, mark.y, 8 + pulse * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawShot(ctx, shot, w, h, friendly) {
  const p = project(shot.x, shot.y, shot.z, w, h);
  const len = friendly ? 14 * p.scale : 11 * p.scale;
  ctx.save();
  ctx.globalAlpha = friendly ? 0.95 : Math.min(1, p.alpha + 0.25);
  ctx.fillStyle = friendly ? '#b8f6ff' : '#ffcf4a';
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = friendly ? 8 : 12;
  ctx.fillRect(p.x - 1.5, p.y - len / 2, 3, Math.max(4, len));
  ctx.restore();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import('./sim.ts').Run | null} run
 * @param {number} menuFrame
 * @param {boolean} reduced
 */
export function drawFrame(canvas, run, menuFrame, reduced) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, canvas.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || window.innerHeight);
  const pw = Math.floor(w * dpr);
  const ph = Math.floor(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const theme = run
    ? run.level.theme
    : {
        skyTop: '#14081f',
        skyBottom: '#2a1248',
        ground: '#120818',
        grid: '#c46bff',
        accent: '#e7a6ff',
        star: '#ffe9ff',
        fog: '#6a2a8a',
      };
  const frame = run ? run.frame : menuFrame;
  ensureStars(theme, reduced);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, theme.skyTop);
  sky.addColorStop(0.55, theme.skyBottom);
  sky.addColorStop(1, theme.ground);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  if (!reduced) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    const scroll = frame * 6;
    for (let i = 0; i < 14; i++) {
      const z = 180 + ((i * 80 + scroll) % 980);
      const left = project(-170, 0, z, w, h);
      const right = project(170, 0, z, w, h);
      ctx.globalAlpha = 0.05 + 0.2 * left.scale;
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }
    for (const x of [-120, -60, 0, 60, 120]) {
      ctx.beginPath();
      let moved = false;
      for (let z = 200; z <= 1000; z += 80) {
        const p = project(x, 0, z, w, h);
        if (!moved) {
          ctx.moveTo(p.x, p.y);
          moved = true;
        } else ctx.lineTo(p.x, p.y);
      }
      ctx.globalAlpha = 0.16;
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const star of stars) {
    const z = 160 + ((star.z + frame * 2.2) % 980);
    const p = project(star.x * 160, star.y * 70, z, w, h);
    ctx.globalAlpha = 0.35 + 0.65 * p.scale;
    ctx.fillStyle = theme.star;
    ctx.fillRect(p.x, p.y, star.s, star.s);
  }
  ctx.globalAlpha = 1;

  if (run) drawSafeLane(ctx, frame, theme, w, h);

  if (!run) return;

  const far = [];
  const near = [];
  for (const enemy of run.enemies) {
    if (enemy.z < 280) near.push(enemy);
    else far.push(enemy);
  }
  far.sort((a, b) => b.z - a.z);
  near.sort((a, b) => b.z - a.z);
  for (const enemy of far) drawEnemy(ctx, enemy, w, h, frame);
  for (const shot of run.eShots) if (shot.z >= 280) drawShot(ctx, shot, w, h, false);
  for (const shot of run.pShots) drawShot(ctx, shot, w, h, true);
  for (const pickup of run.pickups) {
    const p = project(pickup.x, pickup.y, pickup.z, w, h);
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle =
      pickup.kind === 'repair' ? '#9dffb0' : pickup.kind === 'cell' ? '#9af6ff' : '#ffe27a';
    ctx.translate(p.x, p.y);
    ctx.rotate(frame * 0.04);
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
  }

  const pilot = run.player;
  const shipAt = project(pilot.x, pilot.y, 0, w, h);
  const span = w * 0.2;
  const roll = Math.max(-0.4, Math.min(0.4, (pilot.x - (drawFrame.shownX || 0)) * -0.015));
  drawFrame.shownX = (drawFrame.shownX || 0) + (pilot.x - (drawFrame.shownX || 0)) * 0.18;
  const blink = pilot.iframe > 0 && frame % 8 < 4;
  if (!blink)
    drawRear(ctx, run.ship.sprite, shipAt.x, shipAt.y, span, roll, run.shield > 0 ? 0.85 : 1);
  if (run.shield > 0) {
    ctx.save();
    ctx.strokeStyle = '#9dffc2';
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(shipAt.x, shipAt.y, span * 0.38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (run.beam > 0) {
    const tip = project(pilot.x, pilot.y, 900, w, h);
    ctx.save();
    ctx.strokeStyle = '#ff6a5a';
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(shipAt.x, shipAt.y - span * 0.2);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.restore();
  }
  if (run.muzzle > 0) {
    ctx.save();
    ctx.globalAlpha = run.muzzle / 5;
    ctx.fillStyle = '#e8fbff';
    ctx.fillRect(shipAt.x - 2, shipAt.y - span * 0.42, 4, 12);
    ctx.restore();
  }
  if (SHOW_HIT) {
    ctx.save();
    ctx.strokeStyle = '#7cffb2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(shipAt.x, shipAt.y, TUNE.PLAYER_R * TUNE.X_SPREAD, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const enemy of near) drawEnemy(ctx, enemy, w, h, frame);
  for (const shot of run.eShots) if (shot.z < 280) drawShot(ctx, shot, w, h, false);

  if (run.slow < 0.9 && !reduced) {
    ctx.save();
    ctx.fillStyle = '#7af0ff';
    ctx.globalAlpha = 0.06;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
