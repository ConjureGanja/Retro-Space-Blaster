/**
 * Menus, shop, and the HUD for the rail shooter.
 *
 * The sim stays a pure function of (state, input). This file is the lobby:
 * it picks a ship, spends credits, and only then asks the sim to start.
 * Analogy: the counter at the range. You buy the lane, then you shoot.
 * The counter does not move the targets.
 */

import { Sound } from '../audio.js';
import { STATE, Runtime } from '../config.js';
import { Cloud } from '../platform/cloud.js';
import { store } from '../store.js';
import { botIntent } from './bot.ts';
import { activeDevice, setControlOptions } from './controls.ts';
import { LEVELS, SHOP, getLevel, gradeFor, nextLevelId } from './content.ts';
import { drawFrame } from './draw.js';
import { SHIPS } from './ships.ts';
import { createRun, step } from './sim.ts';
import { DIFFICULTIES } from './tune.ts';

const DIFF_ORDER = ['cadet', 'pilot', 'ace'];

let screen = 'title';
let run = null;
let fighting = false;
let userPaused = false;
let useBot = false;
let pauseAt = 0;
let menuFrame = 0;
let reduced = false;
let scheme = 'auto';
let autoFire = false;
let rollKey = 'q';
let xhairOn = true;
let xstyle = 'cross';
let xcolor = 'cyan';
let assist = false;
let demoRoll = false;
let demoSent = false;
let diffId = 'pilot';
let shipIdx = 1;
let levelId = 'nebula';
let root = null;

function campaign() {
  const saved = store.get('campaign', null);
  const base = {
    unlocked: ['nebula'],
    completed: {},
    victory: false,
    credits: 0,
    upgrades: { fire: 0, spread: 0, hull: 0, cap: 0 },
  };
  if (!saved || typeof saved !== 'object') return base;
  const upgrades = saved.upgrades && typeof saved.upgrades === 'object' ? saved.upgrades : {};
  return {
    ...base,
    ...saved,
    unlocked:
      Array.isArray(saved.unlocked) && saved.unlocked.length ? saved.unlocked : base.unlocked,
    completed: saved.completed && typeof saved.completed === 'object' ? saved.completed : {},
    upgrades: { ...base.upgrades, ...upgrades },
  };
}

function saveCampaign(data) {
  store.set('campaign', data);
}

function ship() {
  return SHIPS.find((entry) => entry.idx === shipIdx) || SHIPS[0];
}

function applyTheme(theme) {
  document.body.classList.remove('theme-neon', 'theme-magenta', 'theme-classic');
  document.body.classList.add(theme || 'theme-neon');
}

function show(name) {
  screen = name;
  if (!root) return;
  for (const el of root.querySelectorAll('.screen')) el.classList.remove('on');
  const next = root.querySelector(`[data-screen="${name}"]`);
  if (next) next.classList.add('on');
  const hud = root.querySelector('.hud');
  if (hud) hud.classList.toggle('on', fighting && (name === 'hud' || name === 'pause'));
  if (name === 'hangar') paintHangar();
  if (name === 'map') paintMap();
  if (name === 'shop') paintShop();
  if (name === 'board') paintBoard();
  if (name === 'settings') paintSettings();
  if (name === 'title') paintTitle();
}

function paintTitle() {
  const node = root && root.querySelector('[data-screen="title"] .hi');
  if (node) node.textContent = `HI-SCORE  ${Number(store.get('hiscore', 0)) || 0}`;
}

function paintHangar() {
  const def = ship();
  const card = root.querySelector('[data-screen="hangar"]');
  if (!card || !def) return;
  const rear = card.querySelector('.rear');
  const hd = card.querySelector('.hd');
  if (rear) rear.src = `/assets/sprites/rear/${def.sprite}.webp`;
  if (hd) hd.src = `/assets/sprites/${def.sprite}HD.webp`;
  const name = card.querySelector('.ship-name');
  const role = card.querySelector('.ship-role');
  const ability = card.querySelector('.ability');
  if (name) name.textContent = def.name;
  if (role) role.textContent = def.role;
  if (ability) ability.textContent = `${def.ability.name} — ${def.ability.desc}`;
  const diff = DIFFICULTIES[diffId] || DIFFICULTIES.pilot;
  const button = card.querySelector('[data-act="diff"]');
  if (button) button.textContent = `DIFFICULTY  ${diff.label}`;
  const blurb = card.querySelector('.blurb');
  if (blurb) blurb.textContent = diff.blurb;
}

function paintMap() {
  const camp = campaign();
  const list = root.querySelector('.nodes');
  if (!list) return;
  list.replaceChildren();
  for (const level of LEVELS) {
    const open = camp.unlocked.includes(level.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pill node${open ? '' : ' locked'}${level.id === levelId ? ' picked' : ''}`;
    const grade = camp.completed[level.id] ? `  ${camp.completed[level.id]}` : '';
    button.textContent = `${open ? level.sector : 'LOCKED'}  ${level.name}${grade}`;
    button.disabled = !open;
    button.addEventListener('click', () => {
      levelId = level.id;
      Sound.play('ding');
      paintMap();
      const brief = root.querySelector('.brief');
      if (brief) brief.textContent = level.briefing;
    });
    list.appendChild(button);
  }
  const brief = root.querySelector('.brief');
  const selected = getLevel(levelId);
  if (brief) brief.textContent = selected.briefing;
  const launch = root.querySelector('[data-act="launch"]');
  if (launch) launch.disabled = !camp.unlocked.includes(levelId);
}

function paintShop() {
  const camp = campaign();
  const list = root.querySelector('.shop-list');
  const credits = root.querySelector('.credits');
  if (credits) credits.textContent = `CREDITS  ${camp.credits}`;
  if (!list) return;
  list.replaceChildren();
  for (const item of SHOP) {
    const owned = camp.upgrades[item.id] || 0;
    const row = document.createElement('div');
    row.className = 'shop-item';
    const label = document.createElement('div');
    label.textContent = `${item.name}  ${owned}/${item.max} — ${item.desc}`;
    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = 'pill';
    buy.textContent = owned >= item.max ? 'MAX' : `${item.cost} CR`;
    buy.disabled = owned >= item.max || camp.credits < item.cost;
    buy.addEventListener('click', () => {
      const fresh = campaign();
      if ((fresh.upgrades[item.id] || 0) >= item.max || fresh.credits < item.cost) return;
      fresh.credits -= item.cost;
      fresh.upgrades[item.id] = (fresh.upgrades[item.id] || 0) + 1;
      saveCampaign(fresh);
      Sound.play('levelup');
      paintShop();
    });
    row.append(label, buy);
    list.appendChild(row);
  }
}

function paintSettings() {
  const music = root.querySelector('#sb2-music');
  const sfx = root.querySelector('#sb2-sfx');
  const box = root.querySelector('#sb2-reduced');
  if (music) music.value = String(store.get('volMusic', 0.5));
  if (sfx) sfx.value = String(store.get('volSfx', 0.8));
  if (box) box.checked = reduced;
  const schemeBtn = root.querySelector('#sb2-scheme');
  const fireBtn = root.querySelector('#sb2-autofire');
  const rollBtn = root.querySelector('#sb2-rollkey');
  if (schemeBtn) schemeBtn.textContent = `CONTROLS  ${scheme.toUpperCase()}`;
  if (fireBtn) fireBtn.textContent = `AUTO-FIRE  ${autoFire ? 'ON' : 'OFF'}`;
  if (rollBtn) rollBtn.textContent = `ROLL KEY  ${rollKey.toUpperCase()}`;
  const xhairBtn = root.querySelector('#sb2-xhair');
  const styleBtn = root.querySelector('#sb2-xstyle');
  const colorBtn = root.querySelector('#sb2-xcolor');
  const assistBtn = root.querySelector('#sb2-assist');
  if (xhairBtn) xhairBtn.textContent = `CROSSHAIR  ${xhairOn ? 'ON' : 'OFF'}`;
  if (styleBtn) styleBtn.textContent = `RETICLE  ${xstyle.toUpperCase()}`;
  if (colorBtn) colorBtn.textContent = `COLOR  ${xcolor.toUpperCase()}`;
  if (assistBtn) assistBtn.textContent = `AIM ASSIST  ${assist ? 'ON' : 'OFF'}`;
  setControlOptions({ scheme, autoFire, rollKey });
}

function paintBoard() {
  const list = root.querySelector('.board-list');
  if (!list) return;
  list.replaceChildren();
  const rows = Array.isArray(Cloud.leaderboard) ? Cloud.leaderboard : [];
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'dim';
    empty.textContent = Cloud.online
      ? 'No scores on this board yet.'
      : 'Scores post when you play this install on Reddit. Local runs stay on this machine.';
    list.appendChild(empty);
    return;
  }
  rows.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'board-row';
    const who = document.createElement('span');
    who.textContent = `${index + 1}  ${entry.username || 'pilot'}`;
    const score = document.createElement('span');
    score.textContent = String(entry.score ?? 0);
    row.append(who, score);
    list.appendChild(row);
  });
}

function tally(mode) {
  if (!run) return;
  const box = root.querySelector(`[data-screen="${mode}"] .tally`);
  const title = root.querySelector(`[data-screen="${mode}"] h1`);
  const grade = root.querySelector(`[data-screen="${mode}"] .grade`);
  if (title) {
    title.textContent = mode === 'results' ? `${run.level.name} CLEAR` : 'HULL BREACHED';
  }
  if (grade) {
    const letter = mode === 'results' ? gradeFor(run.hits) : 'F';
    grade.textContent = letter;
    grade.className = `grade ${letter}`;
  }
  if (!box) return;
  const lines = [
    ['KILLS', run.earned.kills],
    ['BOSS', run.earned.boss],
    ['PICKUPS', run.earned.pickups],
    ['CLEAR', run.earned.clear],
    ['HITS TAKEN', run.hits],
    ['TOTAL', run.score],
  ];
  box.replaceChildren();
  for (const [label, value] of lines) {
    const row = document.createElement('div');
    const a = document.createElement('span');
    const b = document.createElement('span');
    a.textContent = label;
    b.textContent = String(value);
    row.append(a, b);
    box.appendChild(row);
  }
}

function rememberScore() {
  if (!run) return;
  const best = Number(store.get('hiscore', 0)) || 0;
  if (run.score > best) store.set('hiscore', run.score);
  void Cloud.submitScore(run.score, diffId);
}

function onClear() {
  fighting = false;
  userPaused = false;
  Runtime.state = STATE.MENU;
  Sound.stopBGM();
  Sound.play('fanfare');
  const camp = campaign();
  const grade = gradeFor(run.hits);
  const rank = { A: 4, B: 3, C: 2, D: 1 };
  const prev = camp.completed[levelId];
  if (!prev || (rank[grade] || 0) > (rank[prev] || 0)) camp.completed[levelId] = grade;
  const next = nextLevelId(levelId);
  if (next && !camp.unlocked.includes(next)) camp.unlocked.push(next);
  camp.credits += 12 + Math.floor(run.score / 55);
  if (levelId === 'hive') camp.victory = true;
  saveCampaign(camp);
  rememberScore();
  show('results');
  tally('results');
  const victory = root.querySelector('.victory-line');
  if (victory) {
    victory.textContent = levelId === 'hive' ? 'The core is dark. The run is yours.' : '';
  }
}

function onDead() {
  fighting = false;
  userPaused = false;
  Runtime.state = STATE.MENU;
  Sound.stopBGM();
  Sound.play('fanfare_bad');
  rememberScore();
  show('over');
  tally('over');
}

export function beginLevel(id, opts = {}) {
  const camp = campaign();
  if (!camp.unlocked.includes(id) && !opts.force) return;
  levelId = id;
  run = createRun({
    levelId: id,
    difficulty: diffId,
    shipIdx,
    seed: opts.seed || (Math.floor(performance.now()) % 90000) + 1,
    boss: opts.boss === true,
    upgrades: camp.upgrades,
  });
  run.sfx = (name) => Sound.play(name);
  fighting = true;
  userPaused = false;
  useBot = opts.bot === true;
  pauseAt = opts.pauseAt || 0;
  demoRoll = opts.demoRoll === true;
  demoSent = false;
  Runtime.state = STATE.PLAYING;
  Runtime.shipSpriteName = ship().sprite;
  Sound.startBGM();
  show('hud');
}

function togglePause() {
  if (!fighting) return;
  userPaused = !userPaused;
  if (userPaused) {
    Runtime.state = STATE.PAUSED;
    Sound.pauseBGM();
    show('pause');
  } else {
    Runtime.state = STATE.PLAYING;
    Sound.resumeBGM();
    show('hud');
  }
}

function syncHud() {
  if (!run || !root) return;
  const score = root.querySelector('.hud-score');
  const lives = root.querySelector('.hud-lives');
  const sector = root.querySelector('.hud-sector');
  const special = root.querySelector('.special-fill');
  const boss = root.querySelector('.boss-fill');
  const bossName = root.querySelector('.boss-name');
  const progress = root.querySelector('.progress-fill');
  const banner = root.querySelector('.banner');
  if (score) score.textContent = `SCORE  ${run.score}`;
  if (lives) lives.textContent = `HULL  ${run.player.lives}${run.god ? '  GOD' : ''}`;
  if (sector) sector.textContent = run.level.sector;
  const max = run.ship.ability.max || 1;
  if (special) special.style.width = `${Math.max(0, Math.min(100, (run.energy / max) * 100))}%`;
  const bossEnemy = run.enemies.find((enemy) => enemy.boss);
  const bossWrap = root.querySelector('.boss-wrap');
  if (bossWrap) bossWrap.style.display = bossEnemy ? 'block' : 'none';
  if (bossEnemy && boss && bossName) {
    bossName.textContent = bossEnemy.name;
    boss.style.width = `${Math.max(0, (bossEnemy.hp / bossEnemy.maxHp) * 100)}%`;
  }
  if (progress) {
    const ratio = run.mode === 'boss' ? 1 : Math.min(1, run.frame / run.level.bossAt);
    progress.style.width = `${ratio * 100}%`;
  }
  if (banner) banner.textContent = run.bannerT > 0 ? run.banner : '';
  const rollFill = root.querySelector('.roll-fill');
  if (rollFill) {
    const ready =
      run.player.rollT > 0
        ? run.player.rollT / 18
        : run.player.rollCd > 0
          ? 1 - run.player.rollCd / 46
          : 1;
    rollFill.style.width = `${Math.max(0, Math.min(1, ready)) * 100}%`;
  }
  const coach = root.querySelector('.coach');
  if (coach) {
    const done = Number(store.get('coach', 0)) >= 4;
    if (useBot || done) coach.textContent = '';
    else if (!run.did.move) coach.textContent = 'MOVE — WASD, ARROWS, OR MOUSE';
    else if (!run.did.fire) coach.textContent = 'FIRE — Z OR LEFT CLICK';
    else if (!run.did.roll) coach.textContent = 'ROLL — DOUBLE TAP LEFT OR RIGHT';
    else if (!run.did.special) coach.textContent = 'SPECIAL — X, SHIFT, OR RIGHT CLICK';
    else {
      coach.textContent = '';
      store.set('coach', 4);
    }
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label, act) {
  const node = el('button', 'pill', label);
  node.type = 'button';
  node.dataset.act = act;
  return node;
}

function build() {
  root = document.createElement('div');
  root.id = 'sb2';

  const title = el('section', 'screen on');
  title.dataset.screen = 'title';
  title.append(
    el('h1', '', 'SPACE BLASTER 2'),
    el('p', 'dim', 'Behind the ship. Forward only.'),
    el('p', 'hi', 'HI-SCORE  0'),
    el('p', 'blink', 'PRESS ANY BUTTON')
  );
  title.addEventListener('pointerdown', () => {
    Sound.init();
    Sound.startMenuBGM();
    show('hangar');
  });

  const hangar = el('section', 'screen');
  hangar.dataset.screen = 'hangar';
  const card = el('div', 'card');
  const rear = document.createElement('img');
  rear.className = 'rear';
  rear.alt = 'Ship from behind';
  const hd = document.createElement('img');
  hd.className = 'hd';
  hd.alt = 'Ship from above';
  const info = el('div');
  info.append(
    el('div', 'ship-name', 'FALCON'),
    el('div', 'ship-role dim', 'Interceptor'),
    el('p', 'ability dim', '')
  );
  card.append(rear, hd, info);
  hangar.append(el('h1', '', 'HANGAR'), card, el('div', 'row', ''));
  const hangarRow = hangar.querySelector('.row');
  hangarRow.append(
    button('PREV SHIP', 'prev-ship'),
    button('NEXT SHIP', 'next-ship'),
    button('DIFFICULTY  PILOT', 'diff')
  );
  hangar.append(
    el('p', 'blurb dim', ''),
    button('STAR MAP', 'map'),
    button('SETTINGS', 'settings'),
    button('TOP PILOTS', 'board')
  );

  const map = el('section', 'screen');
  map.dataset.screen = 'map';
  map.append(el('h1', '', 'ROUTE'), el('div', 'nodes'), el('p', 'brief dim', ''), el('div', 'row'));
  map
    .querySelector('.row')
    .append(button('LAUNCH', 'launch'), button('SHOP', 'shop'), button('HANGAR', 'hangar'));

  const shop = el('section', 'screen');
  shop.dataset.screen = 'shop';
  shop.append(
    el('h1', '', 'YARD'),
    el('p', 'credits', 'CREDITS  0'),
    el('div', 'shop-list'),
    button('BACK', 'map')
  );

  const settings = el('section', 'screen');
  settings.dataset.screen = 'settings';
  const form = el('div', 'settings');
  form.append(el('label', '', 'MUSIC'));
  const music = document.createElement('input');
  music.type = 'range';
  music.id = 'sb2-music';
  music.min = '0';
  music.max = '1';
  music.step = '0.05';
  form.append(el('label', '', 'SFX'));
  const sfx = document.createElement('input');
  sfx.type = 'range';
  sfx.id = 'sb2-sfx';
  sfx.min = '0';
  sfx.max = '1';
  sfx.step = '0.05';
  const reducedLabel = el('label', '', ' REDUCED EFFECTS');
  const reducedBox = document.createElement('input');
  reducedBox.type = 'checkbox';
  reducedBox.id = 'sb2-reduced';
  reducedLabel.prepend(reducedBox);
  const schemeBtn = button('CONTROLS  AUTO', 'scheme');
  schemeBtn.id = 'sb2-scheme';
  const fireBtn = button('AUTO-FIRE  OFF', 'autofire');
  fireBtn.id = 'sb2-autofire';
  const rollBtn = button('ROLL KEY  Q', 'rollkey');
  rollBtn.id = 'sb2-rollkey';
  const xhairBtn = button('CROSSHAIR  ON', 'xhair');
  xhairBtn.id = 'sb2-xhair';
  const styleBtn = button('RETICLE  CROSS', 'xstyle');
  styleBtn.id = 'sb2-xstyle';
  const colorBtn = button('COLOR  CYAN', 'xcolor');
  colorBtn.id = 'sb2-xcolor';
  const assistBtn = button('AIM ASSIST  OFF', 'assist');
  assistBtn.id = 'sb2-assist';
  form.append(
    music,
    sfx,
    reducedLabel,
    schemeBtn,
    fireBtn,
    rollBtn,
    xhairBtn,
    styleBtn,
    colorBtn,
    assistBtn
  );
  form.append(
    el(
      'p',
      'dim',
      'The last device you touch drives the ship. A still mouse does not fight the keys. Double-tap left or right to barrel-roll. Q rolls toward your steer. Right-click the side of the glass does too. Bumpers roll on a pad. Phone: flick the stick twice, or tap ROLL.'
    )
  );
  settings.append(el('h1', '', 'SETTINGS'), form, button('BACK', 'hangar'));

  const board = el('section', 'screen');
  board.dataset.screen = 'board';
  board.append(el('h1', '', 'TOP PILOTS'), el('div', 'board-list'), button('BACK', 'hangar'));

  const hud = el('div', 'hud');
  const top = el('div', 'hud-top');
  top.append(
    el('div', 'hud-score', 'SCORE  0'),
    el('div', 'hud-lives', 'HULL  3'),
    el('div', 'hud-sector', 'SECTOR')
  );
  const bars = el('div', 'bars');
  const progLabel = el('div', 'bar-label', 'ROUTE');
  const prog = el('div', 'bar');
  prog.append(el('span', 'progress-fill'));
  const specLabel = el('div', 'bar-label', 'SPECIAL');
  const spec = el('div', 'bar');
  spec.append(el('span', 'special-fill'));
  const rollLabel = el('div', 'bar-label', 'ROLL');
  const rollBar = el('div', 'bar');
  rollBar.append(el('span', 'roll-fill'));
  const bossWrap = el('div', 'boss-wrap');
  bossWrap.append(el('div', 'bar-label boss-name', 'BOSS'), el('div', 'bar boss'));
  bossWrap.querySelector('.bar').append(el('span', 'boss-fill'));
  bars.append(progLabel, prog, specLabel, spec, rollLabel, rollBar, bossWrap);
  hud.append(top, bars, el('div', 'banner', ''), el('div', 'coach', ''));

  const pause = el('section', 'screen');
  pause.dataset.screen = 'pause';
  pause.append(el('h1', '', 'PAUSED'), button('RESUME', 'resume'), button('ROUTE', 'quit'));

  const results = el('section', 'screen');
  results.dataset.screen = 'results';
  results.append(
    el('h1', '', 'CLEAR'),
    el('div', 'grade', 'A'),
    el('div', 'tally'),
    el('p', 'victory-line dim', ''),
    button('YARD', 'shop'),
    button('ROUTE', 'map')
  );

  const over = el('section', 'screen');
  over.dataset.screen = 'over';
  over.append(
    el('h1', '', 'HULL BREACHED'),
    el('div', 'grade F', 'F'),
    el('div', 'tally'),
    button('RETRY', 'retry'),
    button('ROUTE', 'map')
  );

  const bestiary = el('section', 'screen');
  bestiary.dataset.screen = 'bestiary';
  const grid = el('div', 'bestiary');
  const stamps = [
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
  for (const name of stamps) {
    for (const frame of ['idle', 'wind', 'hit', 'dead']) {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = `/assets/sprites/foes/${name}-${frame}.webp`;
      img.alt = `${name} ${frame}`;
      img.width = 96;
      img.height = 96;
      fig.append(img, el('figcaption', '', `${name} ${frame}`));
      grid.append(fig);
    }
  }
  bestiary.append(el('h1', '', 'STAMPS'), grid, button('HANGAR', 'hangar'));

  root.append(title, hangar, map, shop, settings, board, hud, pause, results, over, bestiary);
  document.getElementById('game-container').appendChild(root);

  root.addEventListener('click', (event) => {
    const act = event.target instanceof Element ? event.target.closest('[data-act]') : null;
    if (!act) return;
    Sound.init();
    const kind = act.dataset.act;
    if (kind === 'prev-ship' || kind === 'next-ship') {
      const dir = kind === 'next-ship' ? 1 : -1;
      const ids = SHIPS.map((entry) => entry.idx);
      const index = Math.max(0, ids.indexOf(shipIdx));
      shipIdx = ids[(index + dir + ids.length) % ids.length];
      store.set('ship', shipIdx);
      Sound.play('ding');
      paintHangar();
    } else if (kind === 'scheme') {
      const order = ['auto', 'keyboard', 'mouse', 'touch'];
      scheme = order[(order.indexOf(scheme) + 1) % order.length];
      store.set('scheme', scheme);
      paintSettings();
    } else if (kind === 'autofire') {
      autoFire = !autoFire;
      store.set('autoFire', autoFire);
      paintSettings();
    } else if (kind === 'rollkey') {
      const order = ['q', 'e', 'r'];
      rollKey = order[(order.indexOf(rollKey) + 1) % order.length];
      store.set('rollKey', rollKey);
      paintSettings();
    } else if (kind === 'xhair') {
      xhairOn = !xhairOn;
      store.set('xhair', xhairOn);
      paintSettings();
    } else if (kind === 'xstyle') {
      const order = ['cross', 'chevron', 'dot'];
      xstyle = order[(Math.max(0, order.indexOf(xstyle)) + 1) % order.length];
      store.set('xstyle', xstyle);
      paintSettings();
    } else if (kind === 'xcolor') {
      const order = ['cyan', 'green', 'amber', 'white', 'magenta'];
      xcolor = order[(Math.max(0, order.indexOf(xcolor)) + 1) % order.length];
      store.set('xcolor', xcolor);
      paintSettings();
    } else if (kind === 'assist') {
      assist = !assist;
      store.set('assist', assist);
      paintSettings();
    } else if (kind === 'diff') {
      const index = Math.max(0, DIFF_ORDER.indexOf(diffId));
      diffId = DIFF_ORDER[(index + 1) % DIFF_ORDER.length];
      store.set('difficulty', diffId);
      Sound.play('ding');
      paintHangar();
    } else if (kind === 'map') show('map');
    else if (kind === 'hangar') show('hangar');
    else if (kind === 'shop') show('shop');
    else if (kind === 'settings') show('settings');
    else if (kind === 'board') show('board');
    else if (kind === 'launch') beginLevel(levelId);
    else if (kind === 'resume') togglePause();
    else if (kind === 'quit') {
      fighting = false;
      userPaused = false;
      Runtime.state = STATE.MENU;
      Sound.stopBGM();
      Sound.startMenuBGM();
      show('map');
    } else if (kind === 'retry') beginLevel(levelId, { force: true });
  });

  music.addEventListener('input', () => {
    store.set('volMusic', Number(music.value));
    Sound.setVolume(Number(music.value), Number(sfx.value));
  });
  sfx.addEventListener('input', () => {
    store.set('volSfx', Number(sfx.value));
    Sound.setVolume(Number(music.value), Number(sfx.value));
  });
  reducedBox.addEventListener('change', () => {
    reduced = reducedBox.checked;
    document.body.classList.toggle('reduced', reduced);
    store.set('reduced', reduced);
  });
}

function loadSettings() {
  const savedDiff = store.get('difficulty', 'pilot');
  if (typeof savedDiff === 'string' && DIFFICULTIES[savedDiff]) diffId = savedDiff;
  const savedShip = Number(store.get('ship', 1));
  if (SHIPS.some((entry) => entry.idx === savedShip)) shipIdx = savedShip;
  reduced = store.get('reduced', false) === true;
  const savedScheme = store.get('scheme', 'auto');
  if (
    savedScheme === 'auto' ||
    savedScheme === 'keyboard' ||
    savedScheme === 'mouse' ||
    savedScheme === 'touch'
  ) {
    scheme = savedScheme;
  }
  autoFire = store.get('autoFire', false) === true;
  const savedRoll = store.get('rollKey', 'q');
  if (savedRoll === 'q' || savedRoll === 'e' || savedRoll === 'r') rollKey = savedRoll;
  if (store.get('xhair', true) === false) xhairOn = false;
  const savedStyle = store.get('xstyle', 'cross');
  if (savedStyle === 'cross' || savedStyle === 'chevron' || savedStyle === 'dot')
    xstyle = savedStyle;
  const savedColor = store.get('xcolor', 'cyan');
  if (
    savedColor === 'cyan' ||
    savedColor === 'green' ||
    savedColor === 'amber' ||
    savedColor === 'white' ||
    savedColor === 'magenta'
  ) {
    xcolor = savedColor;
  }
  assist = store.get('assist', false) === true;
  setControlOptions({ scheme, autoFire, rollKey });
  document.body.classList.toggle('reduced', reduced);
  applyTheme(
    typeof store.get('theme', 'theme-neon') === 'string'
      ? store.get('theme', 'theme-neon')
      : 'theme-neon'
  );
  const music = Number(store.get('volMusic', 0.5));
  const sfx = Number(store.get('volSfx', 0.8));
  Sound.setVolume(Number.isFinite(music) ? music : 0.5, Number.isFinite(sfx) ? sfx : 0.8);
}

export function mountShell() {
  document.body.classList.add('sb2');
  loadSettings();
  build();
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (screen === 'title') {
      Sound.init();
      Sound.startMenuBGM();
      show('hangar');
    }
  });
  show('title');
}

/**
 * Dev-only screenshot hooks (?screen= ?play= ?boss ?bot ?pause=).
 * Production builds ignore them so a shared link can't skip the route.
 */
export function bootQuery(params) {
  if (import.meta.env.MODE === 'production') return;
  const wanted = params.get('screen');
  const play = params.get('play');
  if (wanted === 'results' || wanted === 'over') {
    // A still of the tally. Don't write the save — this is a photograph, not a run.
    run = createRun({ levelId: 'hive', difficulty: diffId, shipIdx, seed: 1 });
    run.score = 12500;
    run.hits = wanted === 'over' ? 6 : 1;
    run.earned = { kills: 5400, boss: 3000, pickups: 400, clear: wanted === 'over' ? 0 : 3700 };
    fighting = false;
    Runtime.state = STATE.MENU;
    show(wanted);
    tally(wanted);
    return;
  }
  if (play) {
    beginLevel(play, {
      force: true,
      boss: params.has('boss'),
      bot: params.has('bot'),
      pauseAt: Number(params.get('pause') || 0),
      seed: Number(params.get('seed') || 1),
      demoRoll: params.get('demo') === 'roll',
    });
  }
  if (wanted === 'pause') {
    if (!fighting) beginLevel('nebula', { force: true, bot: true, pauseAt: 40, seed: 1 });
    else if (!userPaused) togglePause();
    return;
  }
  if (wanted && !play) show(wanted);
}

export function tickShell(input) {
  menuFrame += 1;
  if (!run) return;
  // The same input object is reused for every 60Hz step inside one paint.
  // Without this, holding Esc would flip pause five times in a single frame.
  if (input.pauseEdge && fighting && screen !== 'title') {
    input.pauseEdge = false;
    togglePause();
  }
  if (!fighting || userPaused || Runtime.state !== STATE.PLAYING) return;
  const simInput = useBot
    ? botIntent(run)
    : {
        ax: input.ax,
        ay: input.ay,
        useAim: input.useAim,
        aimX: input.aimX,
        aimY: input.aimY,
        fire: input.fire,
        special: input.special,
        feel: input.feel,
        roll: input.roll,
      };
  if (demoRoll && !demoSent && run.frame >= 28) {
    simInput.roll = 1;
    demoSent = true;
  }
  setControlOptions({ scheme, autoFire, rollKey });
  run.aimAssist = assist;
  run.xhair = { on: xhairOn, style: xstyle, color: xcolor };
  step(run, simInput);
  if (pauseAt > 0 && run.frame >= pauseAt) {
    pauseAt = 0;
    if (!userPaused) togglePause();
  }
  if (run.mode === 'clear') onClear();
  else if (run.mode === 'dead') onDead();
  else syncHud();
}

export function drawShell(canvas) {
  drawFrame(canvas, fighting || screen === 'pause' ? run : null, menuFrame, reduced);
}

export function fightVisible() {
  return fighting;
}

export function devApi() {
  return {
    level(id) {
      beginLevel(id || levelId || 'nebula', { force: true });
    },
    boss() {
      beginLevel(levelId || 'nebula', { force: true, boss: true });
    },
    god() {
      if (!run) return false;
      run.god = !run.god;
      return run.god;
    },
    lives(n) {
      if (!run) return;
      run.player.lives = n;
    },
    help() {
      console.info(
        'RSB.dev.level(id)  RSB.dev.boss()  RSB.dev.god()  RSB.dev.lives(n)  RSB.dev.state()'
      );
    },
    state() {
      if (!run) return null;
      return {
        x: run.player.x,
        y: run.player.y,
        rollT: run.player.rollT,
        rollCd: run.player.rollCd,
        device: activeDevice(),
      };
    },
  };
}
