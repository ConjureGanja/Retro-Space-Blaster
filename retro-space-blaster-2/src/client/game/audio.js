/**
 * Mixer for the rail shooter.
 *
 * Menu music is the original StartMenuMusic.mp3. The fight loops
 * Whispers of Tomorrow, the track that used to sit unused in
 * art/music-unused/. To swap either song, change the src on #menu-bgm or
 * #bgm in game.html. To add a sound, add a row to CUES and call Sound.play.
 *
 * The browser will not start audio until a click or a key. Sound.init()
 * unlocks it. Menu and fight crossfade. Pause and a boss intro duck the
 * music instead of cutting it. Too many noises at once are dropped so the
 * speakers don't turn into a wall.
 *
 * Analogy: a small club mixer. Two songs on the faders, a handful of
 * mics, and a hand that turns a mic down when the room is already loud.
 */

let audioCtx;
let masterGain;
let bgmElement;
let menuBgmElement;
let musicVolume = 0.5;
let sfxVolume = 0.8;
let duck = 1;
let voices = 0;
let shootFlip = false;
const CAP = 8;

const bgm = () => bgmElement || (bgmElement = document.getElementById('bgm'));
const menuBgm = () => menuBgmElement || (menuBgmElement = document.getElementById('menu-bgm'));

function musicLevel() {
  return Math.max(0, Math.min(1, musicVolume * duck));
}

/** Slide a track's volume. A new slide cancels the one already on that element. */
function ramp(el, to, ms) {
  if (!el) return;
  const from = el.volume;
  const start = performance.now();
  const tick = (now) => {
    if (el._ramp !== tick) return;
    const t = Math.min(1, (now - start) / ms);
    el.volume = from + (to - from) * t;
    if (t < 1) requestAnimationFrame(tick);
  };
  el._ramp = tick;
  requestAnimationFrame(tick);
}

function applyMusic() {
  const level = musicLevel();
  const fight = bgm();
  const menu = menuBgm();
  if (fight && !fight.paused) ramp(fight, level, 180);
  if (menu && !menu.paused) ramp(menu, level, 180);
}

/**
 * One voice. Quiet cues are the first to be refused when the room is full.
 * Big explosions always get in.
 */
function tone(type, freq, freqTo, dur, gain, delay = 0) {
  if (!audioCtx || !masterGain) return;
  const important = gain >= 0.14;
  if (voices >= CAP && !important) return;
  voices += 1;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.connect(g);
  g.connect(masterGain);
  const now = audioCtx.currentTime + delay;
  o.frequency.setValueAtTime(Math.max(40, freq), now);
  if (freqTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), now + dur);
  g.gain.setValueAtTime(gain, now);
  g.gain.linearRampToValueAtTime(0.0001, now + dur);
  o.start(now);
  o.stop(now + dur + 0.02);
  o.onended = () => {
    voices = Math.max(0, voices - 1);
  };
}

function shoot(base) {
  shootFlip = !shootFlip;
  const freq = base * (shootFlip ? 1 : 1.16);
  tone('square', freq, freq * 0.28, 0.09, 0.05);
}

const CUES = {
  shoot: () => shoot(640),
  shootTalon: () => shoot(420),
  shootWraith: () => shoot(760),
  shootAegis: () => shoot(520),
  shootVulcan: () => shoot(560),
  shoot_heavy: () => tone('triangle', 300, 50, 0.2, 0.08),
  shoot_flak: () => tone('square', 400, 50, 0.1, 0.08),
  hit: () => tone('square', 880, 440, 0.05, 0.04),
  shieldHit: () => tone('triangle', 520, 300, 0.08, 0.05),
  shieldPop: () => tone('sine', 700, 140, 0.18, 0.08),
  reflect: () => tone('square', 980, 220, 0.12, 0.07),
  explode: () => tone('sawtooth', 140, 36, 0.32, 0.16),
  explodeBig: () => tone('sawtooth', 90, 28, 0.48, 0.2),
  bossExplode: () => {
    tone('sawtooth', 70, 24, 0.7, 0.22);
    tone('square', 180, 50, 0.4, 0.08, 0.08);
  },
  playerHurt: () => tone('sawtooth', 160, 40, 0.28, 0.16),
  lowHull: () => tone('square', 220, 180, 0.35, 0.1),
  enemyShoot: () => tone('sawtooth', 220, 60, 0.15, 0.05),
  pickup: () => tone('sine', 880, 1200, 0.08, 0.04),
  powerup: () => {
    tone('square', 523, 523, 0.08, 0.07);
    tone('square', 784, 784, 0.08, 0.07, 0.08);
    tone('square', 1047, 1047, 0.12, 0.07, 0.16);
  },
  ding: () => tone('sine', 1318, 1318, 0.1, 0.08),
  hover: () => tone('sine', 990, 990, 0.04, 0.03),
  click: () => tone('square', 660, 880, 0.06, 0.05),
  back: () => tone('square', 440, 280, 0.08, 0.05),
  levelStart: () => {
    tone('square', 392, 392, 0.1, 0.08);
    tone('square', 523, 523, 0.14, 0.08, 0.1);
  },
  fanfare: () => {
    tone('square', 523, 523, 0.12, 0.08);
    tone('square', 659, 659, 0.12, 0.08, 0.12);
    tone('square', 784, 784, 0.12, 0.08, 0.24);
    tone('square', 1047, 1047, 0.28, 0.08, 0.36);
  },
  fanfare_bad: () => tone('sawtooth', 392, 220, 0.55, 0.1),
  gameover: () => tone('sawtooth', 196, 60, 0.7, 0.14),
  levelup: () => {
    tone('square', 440, 440, 0.1, 0.08);
    tone('square', 554, 554, 0.1, 0.08, 0.1);
    tone('square', 659, 659, 0.2, 0.08, 0.2);
  },
  timeshift: () => tone('sine', 400, 50, 0.5, 0.12),
  nova: () => tone('sawtooth', 60, 40, 0.55, 0.2),
  dash: () => tone('sine', 200, 1600, 0.14, 0.1),
  perfect: () => tone('square', 880, 1760, 0.14, 0.08),
  lock: () => tone('square', 740, 1180, 0.12, 0.07),
  shieldUp: () => tone('triangle', 300, 900, 0.25, 0.09),
  beam: () => tone('sawtooth', 80, 140, 0.6, 0.08),
  bossAlert: () => {
    tone('square', 220, 174, 0.28, 0.1);
    tone('square', 220, 174, 0.28, 0.1, 0.3);
  },
};

export const Sound = {
  init() {
    if (!audioCtx) {
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
      masterGain.gain.value = sfxVolume;
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  },

  setVolume(musicVol, sfxVol) {
    musicVolume = musicVol;
    sfxVolume = sfxVol;
    if (masterGain) masterGain.gain.value = sfxVol;
    applyMusic();
  },

  /** Quiet the song without stopping it. Pause and the boss sting use this. */
  duck(on) {
    duck = on ? 0.35 : 1;
    applyMusic();
  },

  /** Fight music, fading in as the menu song fades out. */
  startBGM() {
    const menu = menuBgm();
    const fight = bgm();
    if (menu && !menu.paused) ramp(menu, 0, 500);
    if (fight) {
      fight.volume = 0;
      fight.currentTime = 0;
      fight.play().catch(() => {});
      ramp(fight, musicLevel(), 700);
    }
    if (menu) {
      window.setTimeout(() => {
        if (menu.volume < 0.02) {
          menu.pause();
          menu.currentTime = 0;
        }
      }, 560);
    }
  },

  stopBGM() {
    const fight = bgm();
    if (!fight) return;
    ramp(fight, 0, 400);
    window.setTimeout(() => {
      if (fight.volume < 0.02) {
        fight.pause();
        fight.currentTime = 0;
      }
    }, 460);
  },

  pauseBGM() {
    this.duck(true);
  },
  resumeBGM() {
    this.duck(false);
    const fight = bgm();
    if (fight && fight.paused) fight.play().catch(() => {});
  },

  /**
   * Menu music. The first call often happens before a gesture and the
   * browser refuses it. The title screen retries on the first pointer or key.
   */
  startMenuBGM() {
    const fight = bgm();
    const menu = menuBgm();
    if (fight && !fight.paused) ramp(fight, 0, 450);
    if (!menu) return;
    menu.volume = menu.paused ? 0 : menu.volume;
    if (menu.paused) menu.play().catch(() => {});
    ramp(menu, musicLevel(), 600);
  },

  stopMenuBGM() {
    const menu = menuBgm();
    if (!menu) return;
    ramp(menu, 0, 350);
    window.setTimeout(() => {
      if (menu.volume < 0.02) {
        menu.pause();
        menu.currentTime = 0;
      }
    }, 400);
  },

  play(name) {
    if (name === 'bossAlert') {
      duck = 0.4;
      applyMusic();
      window.setTimeout(() => {
        duck = 1;
        applyMusic();
      }, 1200);
    }
    const cue = CUES[name];
    if (cue) cue();
  },
};
