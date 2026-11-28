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

import { laneOf } from './sim.ts';
import { project, spreadFor } from './project.ts';
import { assistOrigin, reticleMarks } from './reticle.ts';
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

function drawRear(ctx, sprite, x, y, width, roll, alpha, squash = 1) {
  const key = `rear-${sprite}`;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(roll);
  // Squash through zero and out the other side. That is a barrel roll
  // drawn with one picture: edge-on in the middle, mirrored on the way back.
  ctx.scale(squash, 1);
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

function drawSafeLane(ctx, frame, theme, w, h, lane) {
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

function foeKey(enemy, frame) {
  const family = enemy.boss ? enemy.art : enemy.kind;
  // Damage states are the same painting with cracks. The engines still glow.
  let frameName = 'idle';
  if (enemy.boss && enemy.hp < enemy.maxHp * 0.34) frameName = 'hurt2';
  else if (enemy.boss && enemy.hp < enemy.maxHp * 0.67) frameName = 'hurt';
  else if (enemy.flash > 0) frameName = 'hit';
  else if (enemy.windup > 0 || enemy.mode === 'windup' || enemy.reflectT > 0 || enemy.blink > 8) {
    frameName = 'wind';
  } else if (Math.floor(frame / 8) % 2 === 1) frameName = 'flicker';
  const key = `foe-${family}-${frameName}`;
  return Sprites.isReady(key) ? key : `foe-${family}-idle`;
}

function drawEnemy(ctx, enemy, w, h, frame) {
  const p = project(enemy.x, enemy.y, enemy.z, w, h);
  const radius = Math.max(8, enemy.r * p.scale * spreadFor(w, h).x * 0.95);
  const intro = enemy.intro > 0 ? 0.45 + (1 - enemy.intro / 14) * 0.55 : 1;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = (enemy.boss ? 1 : p.alpha) * (enemy.blink > 10 ? 0.35 : 1);
  const key = foeKey(enemy, frame);
  if (Sprites.isReady(key)) {
    ctx.imageSmoothingEnabled = false;
    const img = Sprites.get(key);
    const iw = img.naturalWidth || img.width || 32;
    const ih = img.naturalHeight || img.height || 32;
    // Big enough that the 128px stamp's panels show, small enough that the
    // picture does not become the hitbox. Collision still uses enemy.r.
    const size = Math.min(
      w * (enemy.boss ? 0.26 : 0.16),
      radius * (enemy.boss ? 3.6 : 4.8) * intro
    );
    const scale = size / Math.max(iw, ih);
    ctx.drawImage(img, (-iw * scale) / 2, (-ih * scale) / 2, iw * scale, ih * scale);
  } else {
    ctx.fillStyle = enemy.boss ? enemy.accent : '#d7fff0';
    ctx.strokeStyle = enemy.accent || '#9dffc8';
    blot(ctx, enemy.boss ? 'boss' : enemy.kind, radius * intro);
    ctx.fill();
    ctx.stroke();
  }
  if (enemy.flash > 0) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (enemy.bubble > 0) {
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#7ef0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (enemy.reflectT > 0) {
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = frame % 6 < 3 ? '#ffe14a' : '#fff6c2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  if ((enemy.maxShield > 0 && enemy.shield > 0) || (enemy.kind === 'tank' && enemy.shield > 0)) {
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#9af6ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 4, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }
  if (enemy.boss || enemy.maxHp >= 8) {
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#04120c';
    ctx.fillRect(-radius, -radius - 8, radius * 2, 3);
    ctx.fillStyle = enemy.boss ? '#ff5d6c' : '#7dffb2';
    ctx.fillRect(-radius, -radius - 8, radius * 2 * ratio, 3);
  }
  ctx.restore();

  if (enemy.kind === 'strafer' && enemy.blink > 0) {
    const mark = project(enemy.blinkTo, enemy.y, enemy.z, w, h);
    ctx.save();
    ctx.strokeStyle = '#ff7ad9';
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(mark.x - 8, mark.y - 8, 16, 16);
    ctx.restore();
  }

  if ((enemy.pending.length && enemy.windup > 0) || enemy.mode === 'windup') {
    const dots = enemy.pending.length ? enemy.pending : [{ x: enemy.lockX, y: enemy.lockY }];
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(frame * 0.35));
    for (const dot of dots) {
      const mark = project(dot.x, dot.y, Math.max(enemy.z * 0.35, TUNE.Z_CULL), w, h);
      ctx.save();
      ctx.globalAlpha = 0.4 + pulse * 0.5;
      ctx.strokeStyle = enemy.kind === 'kamikaze' ? '#ff5a6a' : '#ffe14a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mark.x, mark.y, 7 + pulse * 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mark.x - 12, mark.y);
      ctx.lineTo(mark.x + 12, mark.y);
      ctx.moveTo(mark.x, mark.y - 12);
      ctx.lineTo(mark.x, mark.y + 12);
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

const XCOLOR = {
  cyan: '#7ef6ff',
  green: '#7dffb2',
  amber: '#ffe27a',
  white: '#f4fbff',
  magenta: '#ff7ad9',
};
let crossSmooth = null;

/**
 * The crosshair is drawn at the bullet's x,y on the target's depth.
 * The lag is only paint. The mark the tests check is the world point.
 */
function drawCrosshair(ctx, run, w, h, frame, reduced) {
  const prefs = run.xhair || { on: true, style: 'cross', color: 'cyan' };
  if (!prefs.on) return;
  const pilot = run.player;
  const spread = (run.upgrades?.spread || 0) + (run.buff?.spread > 0 ? 1 : 0);
  const target =
    (run.enemies || []).find((enemy) => enemy.alive && enemy.id === run.lockId) || null;
  const origin = assistOrigin(
    pilot.x,
    pilot.y,
    run.aimAssist && target ? target : null,
    !!run.aimAssist
  );
  const marks = reticleMarks(origin.x, origin.y, spread);
  const depth = target && target.z > 180 ? target.z : 560;
  const primary = marks.find((mark) => mark.primary) || marks[0];
  if (!primary) return;
  const at = project(primary.x, primary.y, depth, w, h);
  if (!crossSmooth) crossSmooth = { x: at.x, y: at.y };
  crossSmooth.x += (at.x - crossSmooth.x) * 0.38;
  crossSmooth.y += (at.y - crossSmooth.y) * 0.38;
  const color = XCOLOR[prefs.color] || XCOLOR.cyan;
  const locked = !!(target && run.lock > 0.12);
  const hot = locked ? '#ff5d6c' : color;
  const bloom = (run.muzzle > 0 ? 1.55 : 1) * (locked ? 0.9 : 1);
  const gap = 11 * bloom;
  const arm = 18 * bloom;
  ctx.save();
  ctx.translate(crossSmooth.x, crossSmooth.y);
  ctx.strokeStyle = hot;
  ctx.fillStyle = hot;
  ctx.lineWidth = reduced ? 2 : 3;
  if (!reduced) {
    ctx.shadowColor = hot;
    ctx.shadowBlur = 10;
  }
  if (prefs.style === 'dot') {
    ctx.beginPath();
    ctx.arc(0, 0, 3 * bloom, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 11 * bloom, 0, Math.PI * 2);
    ctx.stroke();
  } else if (prefs.style === 'chevron') {
    const s = 9 * bloom;
    ctx.beginPath();
    ctx.moveTo(-s, -s);
    ctx.lineTo(-s * 0.25, -s);
    ctx.moveTo(-s, -s);
    ctx.lineTo(-s, -s * 0.25);
    ctx.moveTo(s, -s);
    ctx.lineTo(s * 0.25, -s);
    ctx.moveTo(s, -s);
    ctx.lineTo(s, -s * 0.25);
    ctx.moveTo(-s, s);
    ctx.lineTo(-s * 0.25, s);
    ctx.moveTo(-s, s);
    ctx.lineTo(-s, s * 0.25);
    ctx.moveTo(s, s);
    ctx.lineTo(s * 0.25, s);
    ctx.moveTo(s, s);
    ctx.lineTo(s, s * 0.25);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-gap - arm, 0);
    ctx.lineTo(-gap, 0);
    ctx.moveTo(gap, 0);
    ctx.lineTo(gap + arm, 0);
    ctx.moveTo(0, -gap - arm);
    ctx.lineTo(0, -gap);
    ctx.moveTo(0, gap);
    ctx.lineTo(0, gap + arm);
    ctx.stroke();
  }
  ctx.restore();

  for (const mark of marks) {
    if (mark.primary) continue;
    const side = project(mark.x, mark.y, depth, w, h);
    ctx.save();
    ctx.strokeStyle = hot;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(side.x - 4, side.y - 4, 8, 8);
    ctx.restore();
  }

  if (!target || !locked) return;
  const body = project(target.x, target.y, target.z, w, h);
  const radius = 16 + (1 - run.lock) * 14;
  ctx.save();
  ctx.strokeStyle = hot;
  ctx.fillStyle = hot;
  ctx.lineWidth = 2;
  if (!reduced) {
    ctx.shadowColor = hot;
    ctx.shadowBlur = 8;
  }
  ctx.beginPath();
  ctx.arc(
    body.x,
    body.y,
    radius,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * Math.max(0.05, run.lock)
  );
  ctx.stroke();
  ctx.font = '9px "Press Start 2P", monospace';
  const label =
    target.bubble > 0
      ? 'SHIELD'
      : target.reflectT > 0
        ? 'REFLECT'
        : `${Math.max(0, Math.ceil(target.hp))}`;
  ctx.fillText(label, body.x + radius + 8, body.y + 3);
  if (target.bubble > 0 || (target.kind === 'tank' && target.shield > 0)) {
    ctx.beginPath();
    ctx.arc(body.x, body.y - radius - 10, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (target.reflectT > 0) ctx.fillText('!', body.x - 3, body.y - radius - 8);
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
  if (run && run.shake > 0.4 && !reduced) {
    const kick = run.shake;
    // Why run.frame: the local `frame` const is declared further down, so reading it
    // here hit the temporal dead zone and threw, freezing the render loop on any hit.
    // Analogy: reading the clock on a wall that has not been built yet.
    ctx.translate(Math.sin(run.frame * 1.7) * kick, Math.cos(run.frame * 1.3) * kick * 0.6);
  }

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

  if (run) drawSafeLane(ctx, frame, theme, w, h, laneOf(run));

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
  const bank = Math.max(-0.35, Math.min(0.35, -(pilot.vx || 0) * 0.04));
  drawFrame.shownX = pilot.x;
  let squash = 1;
  if (pilot.rollT > 0) {
    const elapsed = TUNE.ROLL_FRAMES - pilot.rollT;
    const spin = (elapsed / TUNE.ROLL_FRAMES) * Math.PI * 2 * (pilot.rollDir || 1);
    const raw = Math.cos(spin);
    squash = Math.abs(raw) < 0.12 ? 0.12 * Math.sign(raw || 1) : raw;
    if (!reduced) {
      for (let ghost = 3; ghost >= 1; ghost--) {
        const older = Math.cos(spin - ghost * 0.45);
        const gx = shipAt.x - (pilot.rollDir || 1) * ghost * 16;
        drawRear(ctx, run.ship.sprite, gx, shipAt.y, span, bank, 0.18, older);
      }
    }
  }
  const blink = pilot.iframe > 0 && frame % 8 < 4;
  const thrust = Math.min(1, Math.hypot(pilot.vx || 0, pilot.vy || 0) / 6);
  if (thrust > 0.15 || pilot.rollT > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35 + thrust * 0.5;
    ctx.fillStyle = '#7ee7ff';
    const flame = 10 + thrust * 16 + (pilot.rollT > 0 ? 8 : 0);
    ctx.fillRect(shipAt.x - span * 0.12, shipAt.y + span * 0.16, 6, flame);
    ctx.fillRect(shipAt.x + span * 0.08, shipAt.y + span * 0.16, 6, flame);
    ctx.restore();
  }
  if (!blink) {
    drawRear(
      ctx,
      run.ship.sprite,
      shipAt.x,
      shipAt.y,
      span,
      bank,
      run.shield > 0 ? 0.85 : 1,
      squash
    );
  }
  if (run.perfect > 0) {
    ctx.save();
    ctx.strokeStyle = '#fff6b0';
    ctx.globalAlpha = run.perfect / 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(shipAt.x, shipAt.y, span * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
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
    ctx.arc(shipAt.x, shipAt.y, TUNE.PLAYER_R * spreadFor(w, h).x, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const enemy of near) drawEnemy(ctx, enemy, w, h, frame);
  for (const shot of run.eShots) if (shot.z < 280) drawShot(ctx, shot, w, h, false);

  for (const corpse of run.corpses || []) {
    const mark = project(corpse.x, corpse.y, corpse.z, w, h);
    const span = corpse.max || 28;
    const age = 1 - corpse.life / span;
    const step = Math.min(7, Math.floor(age * 8));
    const key = `foe-${corpse.art}-die-${step}`;
    const radius = corpse.boss ? Math.min(w * 0.22, 150) : Math.min(w * 0.14, 96);
    if (Sprites.isReady(key)) {
      const img = Sprites.get(key);
      ctx.save();
      ctx.globalAlpha = Math.max(0.15, 1 - age * 0.35);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, mark.x - radius / 2, mark.y - radius / 2, radius, radius);
      ctx.restore();
    }
    if (reduced) continue;
    // The ring is the shockwave. A mine's ring is wider. A dish's is cyan.
    const ringColor = corpse.kind === 'generator' ? '#7ef6ff' : corpse.boss ? '#ffe9a8' : '#ffb060';
    ctx.save();
    ctx.strokeStyle = ringColor;
    ctx.globalAlpha = 1 - age;
    ctx.lineWidth = corpse.boss ? 3 : 2;
    ctx.beginPath();
    ctx.arc(
      mark.x,
      mark.y,
      6 + age * (corpse.boss ? 78 : corpse.kind === 'mine' ? 52 : 34),
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
  }
  for (const ping of run.pings || []) {
    const mark = project(ping.x, ping.y, ping.z, w, h);
    ctx.save();
    ctx.strokeStyle = ping.kind === 'kill' ? '#fff6b0' : '#ffffff';
    ctx.globalAlpha = ping.life / 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ping.kind === 'kill') {
      ctx.moveTo(mark.x - 8, mark.y - 8);
      ctx.lineTo(mark.x + 8, mark.y + 8);
      ctx.moveTo(mark.x + 8, mark.y - 8);
      ctx.lineTo(mark.x - 8, mark.y + 8);
    } else {
      ctx.moveTo(mark.x - 6, mark.y);
      ctx.lineTo(mark.x - 2, mark.y + 4);
      ctx.lineTo(mark.x + 7, mark.y - 5);
    }
    ctx.stroke();
    ctx.restore();
  }
  drawCrosshair(ctx, run, w, h, frame, reduced);

  for (const floater of run.floaters || []) {
    const mark = project(
      floater.x,
      floater.y - (28 - floater.life) * 0.4,
      Math.max(floater.z, 40),
      w,
      h
    );
    ctx.save();
    ctx.globalAlpha = Math.min(1, floater.life / 12);
    ctx.fillStyle = floater.text === 'DODGE' ? '#fff6b0' : '#ffffff';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(floater.text, mark.x, mark.y);
    ctx.restore();
  }

  if (run.slow < 0.9 && !reduced) {
    ctx.save();
    ctx.fillStyle = '#7af0ff';
    ctx.globalAlpha = 0.06;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (!reduced && run.boom > 0) {
    ctx.save();
    ctx.fillStyle = '#fff4d2';
    ctx.globalAlpha = run.boom / 26;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (run.hurtT > 0) {
    ctx.save();
    ctx.fillStyle = '#ff2a3a';
    ctx.globalAlpha = (run.hurtT / 16) * (reduced ? 0.12 : 0.32);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
