/**
 * DOM-based UI: the splash screen, menus, difficulty select, the star map,
 * the intro crawl, the HUD, the hangar (ship select), the level-complete
 * tally, the level-up upgrade picker, and the victory screen.
 * Keeps all getElementById churn out of the game logic.
 */

import { STATE, Runtime, DIFFICULTIES } from './config.js';
import { Game } from './game.js';
import { Sound } from './audio.js';
import { RARITIES, rollUpgradeChoices } from './upgrades.js';
import { SHIPS, getShip } from './ships.js';
import { Sprites } from './sprites.js';
import { store } from './store.js';
import { Campaign, MAP_NODES, MAP_ZONES, getNode } from './map.js';
import { STORY, randomQuip } from './story.js';

const $ = id => document.getElementById(id);

let tallyTimers = [];
let introTimer = null;
let lastGrade = 'C'; // grade of the most recent tally, consumed on CONTINUE

export const UI = {
    /** Wire up the static menu buttons (called once at boot). */
    bindEvents() {
        // Persisted campaign + difficulty
        Campaign.load();
        Runtime.difficulty = DIFFICULTIES[store.get('difficulty', 'pilot')] || DIFFICULTIES.pilot;

        // ---------------- Splash ("PRESS ANY BUTTON") ----------------
        // The dismissal gesture doubles as the browser audio unlock.
        $('splash-copyright').innerText = STORY.copyright;
        const dismissSplash = () => {
            if (Runtime.state !== STATE.SPLASH) return;
            Sound.init();
            UI.showMain();
        };
        window.addEventListener('keydown', dismissSplash);
        window.addEventListener('pointerdown', dismissSplash);

        // ---------------- Hangar / ship selection ----------------
        let selectedShipIdx = store.get('ship', 1);
        let useHD = store.get('hd', false);
        $('chk-hd-sprites').checked = useHD;

        const updatePreview = () => {
            const ship = getShip(selectedShipIdx);
            const suffix = useHD ? 'HD' : '';
            // Prefer the auto-trimmed sprite (the raw SVG is a huge frame with
            // the ship art small in the center); fall back to the file itself.
            const key = `${ship.sprite}${suffix}`;
            const img = Sprites.get(key);
            $('ship-preview').src = (img instanceof HTMLCanvasElement)
                ? img.toDataURL()
                : `/assets/sprites/${key}.webp`;
            $('ship-name').innerText = ship.name;
            $('ship-name').style.color = ship.stats.color;
            $('ship-role').innerText = ship.role;
            $('ship-ability-name').innerText = ship.ability.name;
            $('ship-ability-name').style.color = ship.ability.color;
            $('ship-ability-desc').innerText = ship.ability.desc;

            // Simple 1-5 pip stat bars
            const pips = (v) => '■'.repeat(v) + '□'.repeat(5 - v);
            $('stat-spd').innerText = pips(Math.round((ship.stats.speed - 0.7) * 10));
            $('stat-pow').innerText = pips(Math.min(5, Math.round(ship.stats.damage * 2)));
            $('stat-rof').innerText = pips(Math.round((30 - ship.stats.fireDelay) / 3.5));

            Runtime.shipDef = ship;
            Runtime.shipSpriteName = `${ship.sprite}${suffix}`;
            Runtime.useHD = useHD;
            store.set('ship', selectedShipIdx);
            store.set('hd', useHD);
        };

        $('btn-ship-prev').addEventListener('click', () => {
            selectedShipIdx = selectedShipIdx > 1 ? selectedShipIdx - 1 : SHIPS.length;
            updatePreview();
        });
        $('btn-ship-next').addEventListener('click', () => {
            selectedShipIdx = selectedShipIdx < SHIPS.length ? selectedShipIdx + 1 : 1;
            updatePreview();
        });
        $('chk-hd-sprites').addEventListener('change', (e) => {
            useHD = e.target.checked;
            updatePreview();
            // HD art is downloaded on first use (see Sprites.loadHD). Refresh
            // the hangar preview once it lands so the HD ship pops in.
            if (useHD) Sprites.loadHD().then(updatePreview);
        });
        updatePreview();
        // Re-render once sprites finish loading so the trimmed art appears.
        UI.refreshShipPreview = updatePreview;

        // ---------------- Menu navigation ----------------
        $('btn-start').addEventListener('click', () => UI.enterCampaign());
        $('btn-difficulty').addEventListener('click', () => UI.showDifficulty());
        $('btn-difficulty-back').addEventListener('click', () => UI.showMain());
        $('btn-mainmenu').addEventListener('click', () => { Game.resetRunAfterDeath(); Sound.stopBGM(); UI.showMain(); });
        $('btn-gameover-map').addEventListener('click', () => { Game.resetRunAfterDeath(); Sound.stopBGM(); UI.showMap(); });
        $('btn-continue').addEventListener('click', () => UI.onLevelCompleteContinue());
        $('btn-map-back').addEventListener('click', () => UI.showMain());
        $('btn-intro-skip').addEventListener('click', () => UI.finishIntro());
        $('menu-intro').addEventListener('click', (e) => {
            if (e.target.id === 'btn-intro-skip') return;
            if (UI.introDone && UI.introDone()) UI.finishIntro();
            else if (UI.introRevealAll) UI.introRevealAll();
        });
        $('btn-victory-map').addEventListener('click', () => UI.showMap());
        $('btn-victory-menu').addEventListener('click', () => UI.showMain());

        $('btn-settings').addEventListener('click', () => {
            UI.hideAll();
            $('menu-settings').classList.add('active');
        });
        $('btn-settings-back').addEventListener('click', () => UI.showMain());

        // ---------------- Pause ----------------
        window.addEventListener('keydown', (e) => {
            if (e.code !== 'Escape' && e.code !== 'KeyP') return;
            if (Runtime.state === STATE.PLAYING) {
                Runtime.state = STATE.PAUSED;
                Sound.pauseBGM();
                $('pause-node').innerText = Game.currentNode ? Game.currentNode.name : '';
                $('menu-pause').classList.add('active');
            } else if (Runtime.state === STATE.PAUSED) {
                UI.resumeFromPause();
            }
        });
        $('btn-resume').addEventListener('click', () => UI.resumeFromPause());
        $('btn-quit').addEventListener('click', () => { Sound.stopBGM(); UI.showMap(); });

        // ---------------- Settings ----------------
        const volMusic = $('vol-music');
        const volSfx = $('vol-sfx');
        volMusic.value = store.get('volMusic', 0.5);
        volSfx.value = store.get('volSfx', 0.8);
        const updateVolumes = () => {
            Sound.setVolume(volMusic.value, volSfx.value);
            store.set('volMusic', volMusic.value);
            store.set('volSfx', volSfx.value);
        };
        volMusic.addEventListener('input', updateVolumes);
        volSfx.addEventListener('input', updateVolumes);
        updateVolumes();

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.body.className = e.target.dataset.theme;
                store.set('theme', e.target.dataset.theme);
            });
        });
        document.body.className = store.get('theme', 'theme-neon');
    },

    resumeFromPause() {
        $('menu-pause').classList.remove('active');
        Sound.resumeBGM();
        Runtime.state = STATE.PLAYING;
    },

    hideAll() {
        document.querySelectorAll('.menu-screen').forEach(m => m.classList.remove('active'));
    },

    showMain() {
        UI.hideAll();
        $('menu-main').classList.add('active');
        Runtime.state = STATE.MENU;
        $('menu-hiscore').innerText = 'HI-SCORE: ' + store.get('hiscore', 0).toLocaleString();
        UI.refreshDifficultyButton();
        Sound.startMenuBGM();
    },

    refreshDifficultyButton() {
        const d = Runtime.difficulty;
        const b = $('btn-difficulty');
        b.innerText = 'DIFFICULTY: ' + d.label;
        b.style.color = d.color;
        b.style.borderColor = d.color;
    },

    // ------------------------------------------------------------------
    // Difficulty select
    // ------------------------------------------------------------------

    showDifficulty() {
        UI.hideAll();
        $('menu-difficulty').classList.add('active');
        Runtime.state = STATE.MENU;
        const c = $('difficulty-container');
        c.innerHTML = '';
        Object.values(DIFFICULTIES).forEach(d => {
            const card = document.createElement('div');
            card.className = 'diff-card' + (Runtime.difficulty.id === d.id ? ' selected' : '');
            card.style.borderColor = d.color;
            card.innerHTML = `
                <div class="diff-name" style="color:${d.color}">${d.label}</div>
                <div class="diff-tag">${d.tagline}</div>
                <div class="diff-lives" style="color:${d.color}">${'▲'.repeat(d.lives)} ${d.lives} LIVES</div>
                <div class="diff-desc">${d.desc}</div>
                <div class="diff-score">SCORE ×${d.scoreMult}</div>
            `;
            card.onclick = () => {
                // Switching contracts mid-campaign starts the next run fresh
                if (Runtime.difficulty.id !== d.id) Game.runActive = false;
                Runtime.difficulty = d;
                store.set('difficulty', d.id);
                Sound.play('powerup');
                UI.showDifficulty();
            };
            c.appendChild(card);
        });
    },

    // ------------------------------------------------------------------
    // Campaign entry + intro crawl
    // ------------------------------------------------------------------

    enterCampaign() {
        Sound.init();
        if (!store.get('introSeen', false)) UI.showIntro();
        else UI.showMap();
    },

    showIntro() {
        UI.hideAll();
        $('menu-intro').classList.add('active');
        Runtime.state = STATE.INTRO;
        const el = $('intro-text');
        const full = STORY.intro.join('\n\n');
        let pos = 0;
        el.textContent = '';
        clearInterval(introTimer);
        introTimer = setInterval(() => {
            pos = Math.min(full.length, pos + 2);
            el.textContent = full.slice(0, pos);
            if (pos >= full.length) clearInterval(introTimer);
        }, 18);
        UI.introDone = () => pos >= full.length;
        UI.introRevealAll = () => { pos = full.length; el.textContent = full; clearInterval(introTimer); };
    },

    finishIntro() {
        clearInterval(introTimer);
        store.set('introSeen', true);
        UI.showMap();
    },

    // ------------------------------------------------------------------
    // Star map
    // ------------------------------------------------------------------

    showMap() {
        UI.hideAll();
        $('menu-map').classList.add('active');
        Runtime.state = STATE.MAP;
        Sound.startMenuBGM();
        if (!Game.runActive) Game.initRun();
        UI.renderMap();
        UI.selectMapNode(null);
        UI.updateMapHeader();
    },

    updateMapHeader() {
        const d = Runtime.difficulty;
        $('map-run-stats').innerHTML =
            `SCORE <span>${Game.score.toLocaleString()}</span> · ` +
            `LIVES <span>${Game.lives}</span> · ` +
            `<span style="color:${d.color}">${d.label}</span> · ` +
            `HI <span>${store.get('hiscore', 0).toLocaleString()}</span>`;
    },

    renderMap() {
        const nodesEl = $('map-nodes');
        const svg = $('map-edges');
        nodesEl.innerHTML = '';
        svg.innerHTML = '';

        // Routes between visible nodes
        Campaign.edges().forEach(([a, b]) => {
            if (!Campaign.isVisible(a) || !Campaign.isVisible(b)) return;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
            line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
            const done = Campaign.isCompleted(a.id) && Campaign.isCompleted(b.id);
            const open = Campaign.isUnlocked(b.id);
            line.setAttribute('class', 'map-edge' + (done ? ' done' : open ? ' open' : ''));
            svg.appendChild(line);
        });

        // Zone banners
        MAP_ZONES.forEach(z => {
            const label = document.createElement('div');
            label.className = 'map-zone-label';
            label.style.left = z.labelX + '%';
            label.style.color = z.color;
            label.innerText = z.name;
            nodesEl.appendChild(label);
        });

        // Nodes
        MAP_NODES.forEach(n => {
            if (!Campaign.isVisible(n)) return;
            const unlocked = Campaign.isUnlocked(n.id);
            const grade = Campaign.grade(n.id);
            const hiddenSecret = !!n.secretOf && !unlocked; // teased as "???"
            const el = document.createElement('button');
            el.dataset.id = n.id;
            el.className = 'map-node'
                + (unlocked ? ' unlocked' : ' locked')
                + (grade ? ' completed' : '')
                + (n.secretOf ? ' secret' : '')
                + (n.mods.finale ? ' finale' : '');
            el.style.left = n.x + '%';
            el.style.top = n.y + '%';
            el.innerHTML = `
                <span class="map-node-core">${hiddenSecret ? '?' : n.mods.finale ? '☠' : n.secretOf ? '★' : n.sector}</span>
                <span class="map-node-name">${hiddenSecret ? '???' : n.name}</span>
                ${grade ? `<span class="map-node-grade grade-${grade.toLowerCase()}">${grade}</span>` : ''}
            `;
            el.onclick = () => UI.selectMapNode(n);
            nodesEl.appendChild(el);
        });
    },

    selectMapNode(n) {
        document.querySelectorAll('.map-node').forEach(el =>
            el.classList.toggle('selected', !!n && el.dataset.id === n.id));
        const brief = $('map-briefing');

        if (!n) {
            brief.innerHTML = '<div class="brief-hint">SELECT A NODE TO RECEIVE YOUR ROUTE BRIEFING</div>';
            return;
        }

        const unlocked = Campaign.isUnlocked(n.id);
        if (n.secretOf && !unlocked) {
            brief.innerHTML = `
                <div class="brief-title" style="color:#ffcc00">??? — UNKNOWN SIGNAL</div>
                <div class="brief-lore">Guild sensors detect something valuable here. Earn grade A in ${getNode(n.secretOf.node).name} to decode the route.</div>
            `;
            Sound.play('ding');
            return;
        }
        if (!unlocked) {
            brief.innerHTML = `
                <div class="brief-title" style="color:#888">${n.name} — SIGNAL LOCKED</div>
                <div class="brief-lore">Clear a connecting route to open this node.</div>
            `;
            Sound.play('ding');
            return;
        }

        const zone = MAP_ZONES.find(z => z.id === n.zone);
        const grade = Campaign.grade(n.id);
        const chips = [];
        if (n.mods.scoreMult) chips.push(`SCORE ×${n.mods.scoreMult}`);
        if (n.mods.noBoss) chips.push('NO BOSS');
        if (n.mods.bossRush) chips.push('BOSS RUSH');
        if (n.mods.goldRush) chips.push('GOLD RUSH');
        if (n.mods.waveBias) chips.push(n.mods.waveBias.toUpperCase() + ' NEST');
        if (n.mods.asteroidMult) chips.push('DENSE ASTEROIDS');
        if (n.mods.finale) chips.push('FINAL BATTLE');
        if (n.reward === 'upgrade') chips.push('REWARD: FREE UPGRADE');
        if (grade) chips.push('BEST: ' + grade);

        brief.innerHTML = `
            <div class="brief-title" style="color:${zone.color}">${n.name}<span class="brief-type">${n.type} — SECTOR ${n.sector}</span></div>
            <div class="brief-lore">"${n.lore}"</div>
            <div class="brief-mods">${chips.map(c => `<span class="brief-chip">${c}</span>`).join('')}</div>
            <button id="btn-node-launch" class="menu-btn">LAUNCH</button>
        `;
        $('btn-node-launch').onclick = () => Game.startNode(n);
        Sound.play('ding');
    },

    // ------------------------------------------------------------------
    // Level flow: toast, tally, continue, game over, victory
    // ------------------------------------------------------------------

    /** "NOW ENTERING ..." banner at the start of each node. */
    showSectorToast(node) {
        const el = $('sector-toast');
        if (!el || !node) return;
        const zone = MAP_ZONES.find(z => z.id === node.zone);
        el.innerHTML = `
            <div class="toast-zone" style="color:${zone ? zone.color : '#fff'}">${zone ? zone.name : ''}</div>
            <div class="toast-node">${node.name}</div>
        `;
        el.classList.remove('show');
        void el.offsetWidth; // restart the CSS animation
        el.classList.add('show');
    },

    showGameOver() {
        UI.hideAll();
        $('final-score').innerText = 'SCORE: ' + Game.score.toLocaleString()
            + (Game.newRecord ? '  — NEW RECORD!' : '');
        $('final-level').innerText = Game.currentNode ? 'LOST AT: ' + Game.currentNode.name : 'REACHED SECTOR: ' + Game.level;
        $('gameover-quip').innerText = randomQuip(STORY.defeatQuips);
        $('menu-gameover').classList.add('active');
        Runtime.state = STATE.GAME_OVER;
        Sound.play('fanfare_bad');
    },

    showLevelComplete(results) {
        UI.hideAll();
        tallyTimers.forEach(t => clearInterval(t));
        tallyTimers = [];
        lastGrade = results.grade;

        $('lc-title').innerText = `${results.node ? results.node.name : 'SECTOR ' + results.level} CLEAR`;
        $('lc-quip').innerText = randomQuip(STORY.victoryQuips);
        $('lc-grade').className = 'grade-stamp';
        $('lc-grade').innerText = '';
        $('btn-continue').style.visibility = 'hidden';

        const lines = [
            { label: 'ENEMIES DESTROYED', value: `${results.kills} / ${results.spawned}`, count: false },
            { label: 'KILL BONUS', value: results.killBonus, count: true },
            ...(results.perfectBonus > 0 ? [{ label: 'PERFECT RUN BONUS', value: results.perfectBonus, count: true }] : []),
            ...(results.deaths > 0 ? [{ label: 'SHIPS LOST', value: results.deaths, count: false }] : []),
            ...(results.newRecord ? [{ label: 'NEW HI-SCORE', value: '★', count: false }] : []),
            { label: 'TOTAL SCORE', value: results.totalScore, count: true }
        ];

        const container = $('lc-lines');
        container.innerHTML = '';
        $('menu-levelcomplete').classList.add('active');

        // Reveal each line in sequence; numeric lines count up with dings.
        let delay = 400;
        lines.forEach(line => {
            const row = document.createElement('div');
            row.className = 'lc-row';
            row.innerHTML = `<span>${line.label}</span><span class="lc-value"></span>`;
            row.style.visibility = 'hidden';
            container.appendChild(row);
            const valueEl = row.querySelector('.lc-value');

            const t = setTimeout(() => {
                row.style.visibility = 'visible';
                if (!line.count) {
                    valueEl.innerText = line.value;
                    Sound.play('ding');
                } else {
                    UI.animateCount(valueEl, line.value);
                }
            }, delay);
            tallyTimers.push(t);
            delay += line.count ? 900 : 500;
        });

        // Grade stamp + fanfare after the tally settles
        const gradeT = setTimeout(() => {
            const g = results.grade;
            const el = $('lc-grade');
            el.innerText = g;
            el.className = 'grade-stamp show grade-' + g.toLowerCase();
            Sound.play(g === 'A' || g === 'B' ? 'fanfare' : 'fanfare_bad');
            $('btn-continue').style.visibility = 'visible';
        }, delay + 400);
        tallyTimers.push(gradeT);
    },

    /** CONTINUE from the tally: record the node, unlock routes, move on. */
    onLevelCompleteContinue() {
        const node = Game.currentNode;
        if (!node || !getNode(node.id)) { UI.showMap(); return; } // dev free-play

        const fresh = Campaign.completeNode(node.id, lastGrade);

        if (node.reward === 'upgrade') { UI.showLevelUp({ reward: true }); return; }
        if (node.mods.finale) { UI.showVictory(); return; }

        UI.showMap();
        fresh.forEach(id => {
            const el = document.querySelector(`.map-node[data-id="${id}"]`);
            if (el) el.classList.add('fresh');
        });
        if (fresh.length) Sound.play('levelup');
    },

    showVictory() {
        UI.hideAll();
        $('menu-victory').classList.add('active');
        Runtime.state = STATE.VICTORY;
        $('victory-text').innerHTML = STORY.victory.map(p => `<p>${p}</p>`).join('');
        $('victory-score').innerText = 'FINAL SCORE: ' + Game.score.toLocaleString();
        Sound.play('fanfare');
    },

    /** Count a number up over ~0.8s, playing a ding on each step. */
    animateCount(el, target) {
        const steps = 10;
        let step = 0;
        el.innerText = '0';
        const iv = setInterval(() => {
            step++;
            const v = Math.round(target * (step / steps));
            el.innerText = v.toLocaleString();
            Sound.play('ding');
            if (step >= steps) clearInterval(iv);
        }, 70);
        tallyTimers.push(iv);
    },

    // ------------------------------------------------------------------
    // Roguelite upgrade picker (also used for secret-node rewards)
    // ------------------------------------------------------------------

    showLevelUp(opts = {}) {
        UI.hideAll();
        Sound.play('levelup');
        $('levelup-title').innerText = opts.reward
            ? 'GUILD REWARD — CHOOSE YOUR PRIZE'
            : 'SYSTEM UPGRADE AVAILABLE';
        $('menu-levelup').classList.add('active');
        Runtime.state = STATE.LEVELUP;

        // Rarity-weighted draw of 3 unique upgrades (maxed-out ones excluded)
        const choices = rollUpgradeChoices(3);

        const container = $('upgrade-container');
        container.innerHTML = '';
        choices.forEach(upg => {
            const rar = RARITIES[upg.rarity];
            const card = document.createElement('div');
            card.className = 'upgrade-card rarity-' + upg.rarity;
            card.style.borderColor = rar.color;
            card.innerHTML = `
                <div class="upg-rarity" style="color:${rar.color}">${rar.label}</div>
                <img class="upg-icon" src="${Sprites.url(upg.icon)}" alt="">
                <div class="upg-title" style="color:${upg.color}">${upg.name}</div>
                <div class="upg-desc">${upg.desc}</div>
                <div class="upg-flavor">${upg.flavor}</div>
            `;
            card.onclick = () => {
                upg.apply();
                Sound.play('powerup');
                if (opts.reward) { UI.showMap(); return; }
                UI.hideAll();
                UI.updateHUD();
                Runtime.state = STATE.PLAYING;
            };
            container.appendChild(card);
        });
    },

    // ------------------------------------------------------------------
    // HUD
    // ------------------------------------------------------------------

    updateHUD() {
        $('score').innerText = 'SCORE: ' + Game.score;
        $('lives').innerText = 'LIVES: ' + Game.lives + (Game.debug.god ? ' [GOD]' : '');
        $('level-hud').innerText = Game.currentNode ? Game.currentNode.name : 'SECTOR: ' + Game.level;
        $('xp-bar-fill').style.width = Math.min(100, Game.xp / Game.xpNeeded * 100) + '%';

        // Kill-chain combo multiplier
        const comboEl = $('combo');
        if (Game.combo.count >= 3) {
            comboEl.style.display = 'block';
            comboEl.innerText = `CHAIN ${Game.combo.count}  x${Game.comboMult()}`;
            comboEl.classList.toggle('combo-hot', Game.comboMult() >= 3);
        } else {
            comboEl.style.display = 'none';
        }

        // Sector progress toward the mothership
        const frac = Math.min(1, Game.progress / Game.levelLength);
        $('progress-fill').style.width = (frac * 100) + '%';

        // Ship ability bar
        const ship = Game.entities.ship;
        if (ship && ship.shipDef) {
            const def = ship.shipDef.ability;
            const pct = ship.ability.energy / def.max * 100;
            const fill = $('ability-bar-fill');
            fill.style.width = pct + '%';
            fill.style.background = def.color;
            fill.style.boxShadow = `0 0 10px ${def.color}`;
            const nameEl = $('ability-name');
            const ready = def.mode === 'cooldown' && pct >= 100;
            nameEl.innerText = ready ? def.name + ' — READY' : def.name;
            nameEl.style.color = def.color;
            nameEl.classList.toggle('ability-ready', ready);
        }
    },

    showBossHUD(name, hpPct, isMini) {
        const hud = $('boss-hud');
        hud.style.display = 'block';
        $('boss-name').innerText = (isMini ? '⚠ ' : '☠ ') + name;
        const fill = $('boss-bar-fill');
        fill.style.width = (hpPct * 100) + '%';
        fill.style.background = isMini ? '#ff8844' : '#ff4444';
    },

    hideBossHUD() {
        $('boss-hud').style.display = 'none';
    }
};
