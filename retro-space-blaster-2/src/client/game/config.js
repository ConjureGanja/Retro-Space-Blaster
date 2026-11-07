/**
 * Global configuration, tuning constants, and shared runtime state.
 * Everything here is data only — no game logic, no DOM.
 */

export const CONSTANTS = {
    // Viewport (updated on resize)
    GAME_WIDTH: window.innerWidth,
    GAME_HEIGHT: window.innerHeight,

    // Movement tuning — snappy, responsive, modern arcade feel
    MOVE_DEADZONE: 6,    // Below this distance to cursor the ship eases to a stop
    MOVE_MAX_SPEED: 13,  // Base top speed (scaled by ship stats + upgrades)
    MOVE_ACCEL: 0.24,    // How fast velocity snaps toward the target velocity (0..1)
    MOVE_APPROACH: 0.22, // Desired speed = distance * this (so it slows as it nears cursor)
    MOVE_FRICTION: 0.88, // Light damping; velocity is actively driven so this stays subtle
    BANK_TILT: 0.04,     // Radians of visual roll per unit of vertical velocity
    BANK_MAX: 0.55,      // Max visual roll while climbing/diving

    // Side-scroller pacing (R-Type style) — faster, punchier
    SCROLL_SPEED: 1.8,     // World units of forward progress per frame (nodes multiply this)
    LEVEL_LENGTH: 2800,    // Progress units to reach the mothership (~90s baseline, ~40s for SKIRMISH)
    LEVEL_LENGTH_GROWTH: 300, // Extra length per level
    MINIBOSS_AT: 0.5,      // Fraction of the run where the dreadnought ambushes (level 2+)
    SPAWN_MARGIN: 70,      // How far offscreen enemies spawn
    CULL_LEFT: -240,       // Entities past this x (offscreen left) are removed

    // Powerup drops — slightly more generous to keep the action flowing
    POWERUP_DROP_CHANCE: 0.12,
    POWERUP_DURATION: 360,   // Frames a timed buff lasts (6s at 60fps)

    // Grade thresholds (kill ratio, adjusted down by deaths)
    GRADE_A: 0.85, GRADE_B: 0.65, GRADE_C: 0.45
};

// Finite-state-machine values for the top-level game state.
export const STATE = {
    MENU: 0, PLAYING: 1, LEVELUP: 2, GAME_OVER: 3, LEVEL_COMPLETE: 4, PAUSED: 5,
    SPLASH: 6, MAP: 7, INTRO: 8, VICTORY: 9
};

/**
 * Difficulty presets. Multipliers are applied where combat numbers are born:
 * entity HP in entities.js, fire timers / bullet speeds / wave pacing in
 * game.js, and score at the point it's awarded.
 */
export const DIFFICULTIES = {
    cadet: {
        id: 'cadet', label: 'CADET', color: '#44ff88',
        lives: 5, enemyHp: 0.75, fireInterval: 1.4, bulletSpeed: 0.85,
        wavePace: 1.0, scoreMult: 0.75, keepUpgradesOnDeath: true,
        tagline: 'Scenic route',
        desc: 'For couriers who enjoy the scenery. Extra lives, gentler Vrax — and your upgrades survive a game over.'
    },
    pilot: {
        id: 'pilot', label: 'PILOT', color: '#ffcc00',
        lives: 3, enemyHp: 1, fireInterval: 1, bulletSpeed: 1,
        wavePace: 1, scoreMult: 1, keepUpgradesOnDeath: false,
        tagline: 'Standard contract',
        desc: 'The standard Guild contract. Fair fights, fair pay. A game over costs you the run — the map remembers.'
    },
    ace: {
        id: 'ace', label: 'ACE', color: '#ff4444',
        lives: 2, enemyHp: 1.35, fireInterval: 0.7, bulletSpeed: 1.15,
        wavePace: 0.85, scoreMult: 1.5, keepUpgradesOnDeath: false,
        tagline: 'Hazard pay',
        desc: 'Tougher, faster, angrier Vrax on every route — and half again the score for flying into it anyway.'
    }
};

// Mutable holder so modules can read/write the current state without a global.
export const Runtime = {
    state: STATE.SPLASH,
    camera: { x: 0, y: 0 },
    bossActive: false,
    shipDef: null,        // Selected ship definition (see ships.js)
    shipSpriteName: 'playership1',
    useHD: false,
    difficulty: DIFFICULTIES.pilot // live preset (see DIFFICULTIES)
};
