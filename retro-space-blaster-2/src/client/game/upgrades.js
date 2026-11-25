/**
 * Roguelite upgrade pool. Each upgrade mutates Game.upgrades (or Game state).
 * `apply` runs when the player picks the card on the level-up screen.
 *
 * Each entry has a `rarity` (weighted draw odds + card styling), an `icon`
 * (sprite key from sprites.js), and optionally `maxed()` — when it returns
 * true the upgrade stops appearing (one-time unlocks, capped stats).
 *
 * To add an upgrade: append an entry. UI.showLevelUp draws 3 via
 * rollUpgradeChoices().
 */

import { Game } from './game.js';

export const RARITIES = {
    common:   { label: 'COMMON',   color: '#aabbcc', weight: 100 },
    uncommon: { label: 'UNCOMMON', color: '#44ff44', weight: 55 },
    rare:     { label: 'RARE',     color: '#44aaff', weight: 26 },
    epic:     { label: 'EPIC',     color: '#cc44ff', weight: 11 }
};

export const UPGRADE_POOL = [
    { id: 'double',   name: 'TWIN CANNONS',   rarity: 'uncommon', icon: 'upgDouble', desc: 'Adds parallel laser emitters.',          flavor: '"Twice the pride, double the fall."', color: '#ffcc00', apply: () => { Game.upgrades.doubleShot++; } },
    { id: 'spread',   name: 'SPREAD MODULE',  rarity: 'uncommon', icon: 'upgSpread', desc: 'Adds angled lasers to your shots.',       flavor: '"Accuracy through volume."',          color: '#ff8800', apply: () => { Game.upgrades.spreadShot++; } },
    { id: 'tail',     name: 'TAIL GUNNER',    rarity: 'common',   icon: 'upgTail',   desc: 'Fires lasers backwards.',                 flavor: '"Check your six."',                   color: '#888888', apply: () => { Game.upgrades.tailGunner++; } },
    { id: 'rate',     name: 'OVERCLOCK',      rarity: 'uncommon', icon: 'upgRate',   desc: 'Increases rate of fire.',                 flavor: '"Brrrrrrrrrt."',                      color: '#00ffaa', apply: () => { Game.upgrades.fireRate = Math.min(Game.upgrades.fireRate + 0.2, 0.8); }, maxed: () => Game.upgrades.fireRate >= 0.79 }, // Max 80% reduction
    { id: 'speed',    name: 'THRUSTER BOOST', rarity: 'common',   icon: 'upgSpeed',  desc: 'Increases max speed and agility.',        flavor: '"Gotta go fast."',                    color: '#aaddff', apply: () => { Game.upgrades.speedMult += 0.2; } },
    { id: 'range',    name: 'LONG BARREL',    rarity: 'common',   icon: 'upgRange',  desc: 'Lasers travel much further.',             flavor: '"Reach out and touch someone."',      color: '#cccccc', apply: () => { Game.upgrades.laserRange += 0.5; } },

    // Wild upgrades
    { id: 'pierce',    name: 'RAILGUN ROUNDS', rarity: 'epic',     icon: 'upgPierce',    desc: 'Lasers pierce through targets.',                  flavor: '"Line them up."',            color: '#00ffff', apply: () => { Game.upgrades.sniper = true; },    maxed: () => Game.upgrades.sniper },
    { id: 'tracer',    name: 'TRACER ROUNDS',  rarity: 'uncommon', icon: 'upgTracer',    desc: 'Lasers leave a damaging glowing trail.',          flavor: '"Painting the void."',       color: '#ff00aa', apply: () => { Game.upgrades.tracer = true; },    maxed: () => Game.upgrades.tracer },
    { id: 'titan',     name: 'TITAN CALIBER',  rarity: 'rare',     icon: 'upgTitan',     desc: 'Massively increases bullet size and damage.',     flavor: '"Size does matter."',        color: '#ff4444', apply: () => { Game.upgrades.bulletSize += 2; } },
    { id: 'seeker',    name: 'SEEKER MISSILES',rarity: 'rare',     icon: 'upgSeeker',    desc: 'Bullets actively home in on nearby enemies.',     flavor: '"Fire and forget."',         color: '#aa00ff', apply: () => { Game.upgrades.seeker += 0.05; } },
    { id: 'explosive', name: 'HIGH EXPLOSIVE', rarity: 'rare',     icon: 'upgExplosive', desc: 'Bullets explode on impact, damaging an area.',    flavor: '"Boom."',                    color: '#ffaa00', apply: () => { Game.upgrades.explosive += 15; } }, // Adds to radius
    { id: 'prism',     name: 'PRISMATIC CORE', rarity: 'epic',     icon: 'upgPrism',     desc: 'Fires rainbow lasers. Deals bonus damage.',       flavor: '"Taste the rainbow."',       color: '#ffffff', apply: () => { Game.upgrades.prismatic = true; }, maxed: () => Game.upgrades.prismatic },
    { id: 'bouncy',    name: 'PINBALL OPTICS', rarity: 'uncommon', icon: 'upgBouncy',    desc: 'Lasers bounce off screen edges instead of wrapping.', flavor: '"Geometry is a weapon."', color: '#0088ff', apply: () => { Game.upgrades.bouncy = true; },    maxed: () => Game.upgrades.bouncy },
    { id: 'wobbly',    name: 'PHASE WOBBLE',   rarity: 'common',   icon: 'upgWobbly',    desc: 'Lasers fly in a wide sine-wave pattern.',         flavor: '"Can\'t dodge what makes no sense."', color: '#aaddff', apply: () => { Game.upgrades.wobbly = true; }, maxed: () => Game.upgrades.wobbly },
    { id: 'flak',      name: 'FLAK CANNON',    rarity: 'uncommon', icon: 'upgFlak',      desc: 'Fires a shotgun burst of short-range shrapnel.',  flavor: '"Clear the air."',           color: '#555555', apply: () => { Game.upgrades.flak += 3; } }, // Pellets per shot

    { id: 'orbitals', name: 'PLASMA DRONES', rarity: 'rare', icon: 'upgOrbitals', desc: 'Spawns an orb that orbits you. Upgrades add more, size, and range.', flavor: '"Personal space enforcer."', color: '#ccff00', apply: () => {
        Game.upgrades.orbitals++;
        Game.rebuildOrbitals(); // also re-run at every level start so drones persist
    }},

    { id: 'life', name: 'HULL REPAIR', rarity: 'epic', icon: 'upgLife', desc: 'Grants an extra life.', flavor: '"Duct tape fixes everything."', color: '#00ff00', apply: () => { Game.lives++; } }
];

/**
 * Draw `count` unique upgrades, rarity-weighted, skipping anything maxed out.
 */
export function rollUpgradeChoices(count = 3) {
    const pool = UPGRADE_POOL.filter(u => !(u.maxed && u.maxed()));
    const choices = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
        const total = pool.reduce((sum, u) => sum + RARITIES[u.rarity].weight, 0);
        let r = Math.random() * total;
        let idx = 0;
        for (; idx < pool.length - 1; idx++) {
            r -= RARITIES[pool[idx].rarity].weight;
            if (r <= 0) break;
        }
        choices.push(pool[idx]);
        pool.splice(idx, 1);
    }
    return choices;
}
