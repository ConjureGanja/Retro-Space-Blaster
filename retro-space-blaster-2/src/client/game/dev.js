/**
 * Dev/debug console commands, attached as `window.RSB.dev`.
 * Open the browser console (F12) and call e.g. `RSB.dev.god()`.
 * Nothing here runs unless invoked from the console — zero gameplay impact.
 */

import { CONSTANTS, STATE, Runtime } from './config.js';
import { Game } from './game.js';
import { UPGRADE_POOL } from './upgrades.js';
import { UI } from './ui.js';
import { Campaign, MAP_NODES, getNode } from './map.js';
import { store } from './store.js';
import { buildBoss } from './entities.js';

const inRun = () => {
    if (Runtime.state === STATE.PLAYING || Runtime.state === STATE.PAUSED) return true;
    console.warn('[dev] no active run — start a mission first (or use RSB.dev.sector(n))');
    return false;
};

export const Dev = {
    /** Print every command. */
    help() {
        console.log([
            '%cRSB.dev — debug commands',
            'god()            toggle invulnerability (shows [GOD] next to LIVES)',
            "node(id)         launch a star-map node directly; node() lists them",
            'unlockMap()      unlock every node on the star map',
            'wipeSave()       reset campaign progress, hi-score, and intro flag',
            'sector(n)        free-play an ad-hoc level at sector-n scaling',
            'progress(frac)   set position in the run, 0..1 (e.g. 0.5 = halfway)',
            'miniboss()       skip ahead to the dreadnought ambush',
            'boss()           skip ahead to the mothership fight',
            'superboss()      summon the SUPER MOTHERSHIP (finale boss) right now',
            'killBoss()       instantly defeat the active boss (full rewards)',
            'levelup()        open the upgrade picker now',
            'give(id)         apply an upgrade directly; give() lists all ids',
            'giveAll()        apply every upgrade once (maxed ones skipped)',
            'lives(n)         set lives (default 99)',
            'score(n)         set score',
            'charge()         fill the ship special ability to 100%',
            'buff(type)       grant a powerup: weapon | shield | speed | health',
            'clear()          wipe all enemies, asteroids, and enemy fire',
            'help()           this list'
        ].join('\n'), 'color:#44ff44;font-weight:bold');
    },

    node(id) {
        if (!id) {
            console.table(MAP_NODES.map(n => ({
                id: n.id, name: n.name, sector: n.sector, type: n.type,
                unlocked: Campaign.isUnlocked(n.id), grade: Campaign.grade(n.id) || '—'
            })));
            return;
        }
        const n = getNode(id);
        if (!n) { console.warn(`[dev] unknown node '${id}' — call node() for the list`); return; }
        Game.startNode(n);
        console.log(`[dev] launched ${n.name}`);
    },

    unlockMap() {
        Campaign.state.unlocked = MAP_NODES.map(n => n.id);
        Campaign.save();
        if (Runtime.state === STATE.MAP) UI.renderMap();
        console.log('[dev] all map nodes unlocked');
    },

    wipeSave() {
        Campaign.wipe();
        store.remove('hiscore');
        store.remove('introSeen');
        console.log('[dev] campaign, hi-score, and intro flag wiped');
    },

    god(on = !Game.debug.god) {
        Game.debug.god = on;
        UI.updateHUD();
        console.log(`[dev] god mode ${on ? 'ON' : 'OFF'}`);
        return on;
    },

    sector(n = Game.level + 1) {
        const s = Math.max(1, Math.floor(n));
        // Ad-hoc node so free-play doesn't touch campaign progress
        Game.startNode({ id: '__dev', name: 'DEV SECTOR ' + s, zone: 1, sector: s, type: 'DEV', mods: {} });
        console.log(`[dev] free-playing sector ${s}`);
    },

    progress(frac = 0.5) {
        if (!inRun()) return;
        const f = Math.max(0, Math.min(1, frac));
        Game.progress = f * Game.levelLength;
        // Jumping past the ambush point shouldn't instantly trigger the miniboss
        Game.minibossSpawned = f >= CONSTANTS.MINIBOSS_AT;
        console.log(`[dev] progress set to ${Math.round(f * 100)}%`);
    },

    miniboss() {
        if (!inRun()) return;
        Game.progress = CONSTANTS.MINIBOSS_AT * Game.levelLength;
        Game.minibossSpawned = false; // let updateRun trigger the ambush
        console.log('[dev] dreadnought inbound');
    },

    boss() {
        if (!inRun()) return;
        Game.minibossSpawned = true;
        Game.progress = Game.levelLength;
        console.log('[dev] mothership inbound');
    },

    superboss() {
        if (!inRun()) return;
        Game.minibossSpawned = true;
        Game.progress = Game.levelLength; // stop wave spawns; run sits at the boss point
        Runtime.bossActive = true;
        Game.entities.enemies.push(buildBoss(Game.level, { finale: true }));
        console.log('[dev] SUPER MOTHERSHIP inbound — shoot through the shield gap');
    },

    killBoss() {
        if (!inRun()) return;
        const idx = Game.entities.enemies.findIndex(e => e.isBoss);
        if (idx < 0) { console.warn('[dev] no boss on screen'); return; }
        Game.destroyEnemy(idx);
        console.log('[dev] boss destroyed');
    },

    levelup() {
        if (!inRun()) return;
        Game.xp = Game.xpNeeded; // picked up by checkLevelUp next frame
    },

    give(id) {
        if (!id) {
            console.table(UPGRADE_POOL.map(u => ({
                id: u.id, name: u.name, rarity: u.rarity,
                owned: !!(u.maxed && u.maxed())
            })));
            return;
        }
        const u = UPGRADE_POOL.find(u => u.id === id);
        if (!u) { console.warn(`[dev] unknown upgrade '${id}' — call give() for the list`); return; }
        u.apply();
        UI.updateHUD();
        console.log(`[dev] applied ${u.name}`);
    },

    giveAll() {
        UPGRADE_POOL.forEach(u => { if (!(u.maxed && u.maxed())) u.apply(); });
        UI.updateHUD();
        console.log('[dev] applied every upgrade once');
    },

    lives(n = 99) {
        Game.lives = Math.max(1, Math.floor(n));
        UI.updateHUD();
        console.log(`[dev] lives = ${Game.lives}`);
    },

    score(n = 0) {
        Game.score = Math.max(0, Math.floor(n));
        UI.updateHUD();
        console.log(`[dev] score = ${Game.score}`);
    },

    charge() {
        const ship = Game.entities.ship;
        if (!ship || !inRun()) return;
        ship.ability.energy = ship.shipDef.ability.max;
        console.log('[dev] ability charged');
    },

    buff(type = 'shield') {
        const ship = Game.entities.ship;
        if (!ship || !inRun()) return;
        if (!['weapon', 'shield', 'speed', 'health'].includes(type)) {
            console.warn(`[dev] unknown buff '${type}' — weapon | shield | speed | health`);
            return;
        }
        Game.applyPowerup(ship, type);
    },

    clear() {
        if (!inRun()) return;
        const e = Game.entities;
        const wasBoss = e.enemies.some(en => en.isBoss);
        e.enemies.length = 0;
        e.asteroids.length = 0;
        e.enemyLasers.length = 0;
        if (wasBoss) { Runtime.bossActive = false; UI.hideBossHUD(); }
        console.log('[dev] screen cleared');
    }
};
