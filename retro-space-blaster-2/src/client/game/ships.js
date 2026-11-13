/**
 * The playable ship roster. Data only — ability behavior is implemented in
 * game.js (see Game.updateAbility / Game.triggerAbility) keyed by `ability.key`.
 *
 * Each ship maps to assets/sprites/playership{n}.svg (+HD variant) and carries
 * its own stats and a unique right-click special ability.
 *
 * Ability modes:
 *   'drain'    — hold right-click to use; energy drains while active, regens when idle.
 *   'cooldown' — right-click when the bar is full to trigger; bar refills over time.
 */

export const SHIPS = [
    {
        idx: 1, name: 'FALCON', role: 'Interceptor',
        sprite: 'playership1',
        stats: { speed: 1.05, fireDelay: 18, damage: 1, color: '#66aaff' },
        ability: {
            key: 'chrono', name: 'CHRONO FIELD', color: '#00ffff', mode: 'drain',
            desc: 'Hold to slow the flow of time to a crawl while you fly at full speed.',
            max: 240, drain: 1, regen: 0.5, slowFactor: 0.2
        }
    },
    {
        idx: 2, name: 'TALON', role: 'Heavy Gunship',
        sprite: 'playership2',
        stats: { speed: 0.85, fireDelay: 24, damage: 2, color: '#ffaa44' },
        ability: {
            key: 'nova', name: 'NOVA BLAST', color: '#ffaa00', mode: 'cooldown',
            desc: 'Detonate a shockwave that wipes enemy fire and ravages every ship on screen.',
            max: 720, regen: 1, damage: 8
        }
    },
    {
        idx: 3, name: 'WRAITH', role: 'Phase Fighter',
        sprite: 'playership3',
        stats: { speed: 1.15, fireDelay: 16, damage: 1, color: '#cc88ff' },
        ability: {
            key: 'dash', name: 'PHASE DASH', color: '#cc66ff', mode: 'cooldown',
            desc: 'Blink instantly to the cursor, shredding everything along the path.',
            max: 300, regen: 1, damage: 5, graceFrames: 40
        }
    },
    {
        idx: 4, name: 'AEGIS', role: 'Bulwark',
        sprite: 'playership4',
        stats: { speed: 0.9, fireDelay: 20, damage: 1.5, color: '#66ff88' },
        ability: {
            key: 'shield', name: 'AEGIS SHIELD', color: '#44ff88', mode: 'cooldown',
            desc: 'Raise an impenetrable barrier for 4 seconds — ram enemies to grind them down.',
            max: 840, regen: 1, duration: 240
        }
    },
    {
        idx: 5, name: 'VULCAN', role: 'Artillery',
        sprite: 'playership5',
        stats: { speed: 0.95, fireDelay: 20, damage: 1.5, color: '#ff6655' },
        ability: {
            key: 'beam', name: 'HYPER BEAM', color: '#ff4444', mode: 'cooldown',
            desc: 'Unleash a devastating piercing beam that melts everything ahead for 2 seconds.',
            max: 600, regen: 1, duration: 120, dps: 0.15
        }
    }
];

export function getShip(idx) {
    return SHIPS.find(s => s.idx === idx) || SHIPS[0];
}
