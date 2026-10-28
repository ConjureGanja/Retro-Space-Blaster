/**
 * Lightweight Web Audio synth + BGM control.
 * SFX are generated (no samples); level BGM streams assets/music/bgm.mp3 and
 * the main menu loops assets/music/StartMenuMusic.mp3.
 * Call Sound.init() from a user gesture (e.g. clicking START) to unlock audio.
 */

let audioCtx;
let masterGain;
let bgmElement;
let menuBgmElement;
let musicVolume = 0.5;
let sfxVolume = 0.8;

const bgm = () => bgmElement || (bgmElement = document.getElementById('bgm'));
const menuBgm = () => menuBgmElement || (menuBgmElement = document.getElementById('menu-bgm'));

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
        if (bgm()) bgm().volume = musicVol;
        if (menuBgm()) menuBgm().volume = musicVol;
    },

    /** Restart the level music from the top (called at the start of each level). */
    startBGM() {
        this.stopMenuBGM();
        const el = bgm();
        if (el) {
            el.volume = musicVolume;
            el.currentTime = 0;
            el.play().catch(() => {});
        }
    },

    /** Hard stop — level over, game over, or back to menu. */
    stopBGM() {
        const el = bgm();
        if (el) { el.pause(); el.currentTime = 0; }
    },

    pauseBGM()  { if (bgm()) bgm().pause(); },
    resumeBGM() { if (bgm()) bgm().play().catch(() => {}); },

    /**
     * Menu music. Safe to call repeatedly — resumes only if paused. The first
     * call happens at boot and may be blocked by the browser's autoplay policy;
     * UI retries on the first pointer/key input.
     */
    startMenuBGM() {
        const el = menuBgm();
        if (!el) return;
        el.volume = musicVolume;
        if (el.paused) el.play().catch(() => {});
    },

    stopMenuBGM() {
        const el = menuBgm();
        if (el) { el.pause(); el.currentTime = 0; }
    },

    play(t) {
        if (!audioCtx) return;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(masterGain);
        const now = audioCtx.currentTime;

        if (t === 'shoot')       { o.frequency.setValueAtTime(600, now); o.frequency.exponentialRampToValueAtTime(100, now+0.1); g.gain.setValueAtTime(0.05,now); g.gain.linearRampToValueAtTime(0,now+0.1); o.start(now); o.stop(now+0.1); }
        if (t === 'shoot_heavy') { o.type='triangle'; o.frequency.setValueAtTime(300, now); o.frequency.linearRampToValueAtTime(50, now+0.2); g.gain.setValueAtTime(0.08,now); g.gain.linearRampToValueAtTime(0,now+0.2); o.start(now); o.stop(now+0.2); }
        if (t === 'shoot_flak')  { o.type='square'; o.frequency.setValueAtTime(400, now); o.frequency.exponentialRampToValueAtTime(50, now+0.1); g.gain.setValueAtTime(0.08,now); g.gain.linearRampToValueAtTime(0,now+0.1); o.start(now); o.stop(now+0.1); }
        if (t === 'explode')     { o.type='sawtooth'; o.frequency.setValueAtTime(100, now); o.frequency.linearRampToValueAtTime(10, now+0.4); g.gain.setValueAtTime(0.2,now); g.gain.linearRampToValueAtTime(0,now+0.4); o.start(now); o.stop(now+0.4); }
        if (t === 'timeshift')   { o.type='sine'; o.frequency.setValueAtTime(400, now); o.frequency.exponentialRampToValueAtTime(50, now+0.5); g.gain.setValueAtTime(0.2,now); g.gain.linearRampToValueAtTime(0,now+0.5); o.start(now); o.stop(now+0.5); }
        if (t === 'levelup')     { o.type='square'; o.frequency.setValueAtTime(440, now); o.frequency.setValueAtTime(554, now+0.1); o.frequency.setValueAtTime(659, now+0.2); g.gain.setValueAtTime(0.1,now); g.gain.linearRampToValueAtTime(0,now+0.5); o.start(now); o.stop(now+0.5); }
        if (t === 'enemyShoot')  { o.type='sawtooth'; o.frequency.setValueAtTime(220, now); o.frequency.exponentialRampToValueAtTime(60, now+0.15); g.gain.setValueAtTime(0.05,now); g.gain.linearRampToValueAtTime(0,now+0.15); o.start(now); o.stop(now+0.15); }
        if (t === 'pickup')      { o.type='sine'; o.frequency.setValueAtTime(880, now); o.frequency.exponentialRampToValueAtTime(1200, now+0.06); g.gain.setValueAtTime(0.04,now); g.gain.linearRampToValueAtTime(0,now+0.08); o.start(now); o.stop(now+0.08); }
        if (t === 'powerup')     { o.type='square'; o.frequency.setValueAtTime(523, now); o.frequency.setValueAtTime(784, now+0.08); o.frequency.setValueAtTime(1047, now+0.16); g.gain.setValueAtTime(0.08,now); g.gain.linearRampToValueAtTime(0,now+0.3); o.start(now); o.stop(now+0.3); }

        // Score-tally ding (level complete screen)
        if (t === 'ding')        { o.type='sine'; o.frequency.setValueAtTime(1318, now); g.gain.setValueAtTime(0.09,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.12); o.start(now); o.stop(now+0.12); }

        // Grade reveal fanfare — a rising arpeggio
        if (t === 'fanfare')     { o.type='square'; o.frequency.setValueAtTime(523, now); o.frequency.setValueAtTime(659, now+0.12); o.frequency.setValueAtTime(784, now+0.24); o.frequency.setValueAtTime(1047, now+0.36); g.gain.setValueAtTime(0.1,now); g.gain.setValueAtTime(0.1,now+0.42); g.gain.linearRampToValueAtTime(0,now+0.7); o.start(now); o.stop(now+0.7); }
        if (t === 'fanfare_bad') { o.type='sawtooth'; o.frequency.setValueAtTime(392, now); o.frequency.setValueAtTime(370, now+0.18); o.frequency.setValueAtTime(311, now+0.36); g.gain.setValueAtTime(0.1,now); g.gain.linearRampToValueAtTime(0,now+0.7); o.start(now); o.stop(now+0.7); }

        // Ship special abilities
        if (t === 'nova')        { o.type='sawtooth'; o.frequency.setValueAtTime(60, now); o.frequency.exponentialRampToValueAtTime(800, now+0.15); o.frequency.exponentialRampToValueAtTime(40, now+0.6); g.gain.setValueAtTime(0.25,now); g.gain.linearRampToValueAtTime(0,now+0.6); o.start(now); o.stop(now+0.6); }
        if (t === 'dash')        { o.type='sine'; o.frequency.setValueAtTime(200, now); o.frequency.exponentialRampToValueAtTime(1600, now+0.12); g.gain.setValueAtTime(0.12,now); g.gain.linearRampToValueAtTime(0,now+0.15); o.start(now); o.stop(now+0.15); }
        if (t === 'shieldUp')    { o.type='triangle'; o.frequency.setValueAtTime(300, now); o.frequency.linearRampToValueAtTime(900, now+0.25); g.gain.setValueAtTime(0.1,now); g.gain.linearRampToValueAtTime(0,now+0.3); o.start(now); o.stop(now+0.3); }
        if (t === 'beam')        { o.type='sawtooth'; o.frequency.setValueAtTime(80, now); o.frequency.linearRampToValueAtTime(140, now+0.3); g.gain.setValueAtTime(0.12,now); g.gain.linearRampToValueAtTime(0.03,now+1.6); g.gain.linearRampToValueAtTime(0,now+2.0); o.start(now); o.stop(now+2.0); }
        if (t === 'bossAlert')   { o.type='square'; o.frequency.setValueAtTime(220, now); o.frequency.setValueAtTime(174, now+0.25); o.frequency.setValueAtTime(220, now+0.5); o.frequency.setValueAtTime(174, now+0.75); g.gain.setValueAtTime(0.12,now); g.gain.linearRampToValueAtTime(0,now+1.0); o.start(now); o.stop(now+1.0); }
    }
};
