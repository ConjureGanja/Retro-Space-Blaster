# Retro Space Blaster: Roguelite Edition

An R-Type-style side-scrolling arcade blaster with mouse controls, five playable
ships (each with a unique special ability), stacking roguelite upgrades, a
branching Mario-World-style campaign map, three difficulty contracts, and a
chrome machine-swarm to blame for everything (officially: a toaster). Built with
vanilla JavaScript (ES modules) and the Canvas 2D API — no framework, no build
step.

**The setup:** it's 3077, you fly packages for the ORION COURIER GUILD along the
Spiral Arm Turnpike, and the VRAX DOMINION — a swarm that strips worlds for
parts and leaves them disturbingly polished — has invaded. Clear the routes,
find the secrets, and deliver one final package marked RETURN TO SENDER.

## Running

ES modules can't be loaded from `file://`, so the game is served over http by a
tiny zero-dependency Node server:

```bash
npm start          # then open http://localhost:8080
```

(`npm run dev` is an alias. Requires Node.js — no `npm install` needed, there are
no dependencies.)

## Controls

| Input        | Action                        |
| ------------ | ----------------------------- |
| Mouse        | Move ship (always faces right)|
| Left click   | Fire weapons                  |
| Right click  | Ship special ability          |
| Esc / P      | Pause                         |

On touch devices: one finger moves/fires, two fingers trigger the special.

## Gameplay

- **The flow:** splash screen (press any button) → hangar/main menu → the
  **STAR MAP**. Pick an unlocked node, read its briefing, LAUNCH. Completing a
  node unlocks its connected routes; earning an **A** on certain nodes reveals
  hidden **secret nodes** (★) with big score multipliers and a free-upgrade
  reward. Beat **VRAX PRIME** at the end of the third zone to save the
  Turnpike (the map stays open for replays and missed secrets).
- **Campaign vs. run:** map unlocks and best grades always persist. Your score,
  lives, and upgrades persist across nodes *within* a run — a game over resets
  the run (on CADET you keep your upgrades).
- **Difficulty contracts:** CADET (5 lives, gentler enemies, ×0.75 score),
  PILOT (baseline), ACE (2 lives, +35% enemy HP, faster+quicker enemy fire,
  ×1.5 score). Selectable from the main menu; persisted.
- **The run:** the screen scrolls right; the bottom progress bar tracks your
  race toward the **MOTHERSHIP** at the end of the sector. Waves enter from the
  right edge and ambush from the top/bottom of the right half. Assault nodes add
  a **DREADNOUGHT** mini-boss ambush mid-run; patrol nodes have no boss; node
  modifiers add themed swarms, dense asteroids, or gold-rush pickup streams.
- **Kill chains:** kills in quick succession build a combo multiplying score up
  to ×5 (shown in the HUD). Dying breaks the chain.
- **Bosses** have big HP pools (full-width health bar across the top) and three
  phases: aimed spreads → radial bursts + swarmer summons → enraged spiral
  barrages and lunges.
- **Ships** (pick in the hangar; SD or HD sprites):
  | Ship   | Role         | Special (right-click)                          |
  | ------ | ------------ | ---------------------------------------------- |
  | FALCON | Interceptor  | Chrono Field — hold to slow time to a crawl    |
  | TALON  | Heavy Gunship| Nova Blast — screen-clearing shockwave         |
  | WRAITH | Phase Fighter| Phase Dash — blink to the cursor, shred path   |
  | AEGIS  | Bulwark      | Aegis Shield — 4s invulnerable ramming barrier |
  | VULCAN | Artillery    | Hyper Beam — 2s piercing beam                  |
- **XP orbs** from kills trigger the roguelite upgrade choice mid-run: three
  rarity-weighted cards (COMMON → UNCOMMON → RARE → EPIC), each with its own
  icon; one-time unlocks stop appearing once taken. Enemies can also drop
  powerups (rapid fire, shield, speed, extra life).
- **Sector clear:** the music stops, your score tallies up with dings, and you're
  stamped a grade from **A** (best) to **F** (hull breached).

## Project structure

```
retro-space-blaster/
├── index.html            # Markup shell (HUD + menus)
├── styles/main.css       # All styling
├── server.js             # Zero-dep static dev server
├── assets/
│   ├── music/            # Menu music + level BGM (starts each sector, stops on clear)
│   └── sprites/          # SVG sprites (ships, enemies, bosses, powerups, fx)
└── src/
    ├── main.js           # Entry point + requestAnimationFrame loop
    ├── config.js         # Constants, tuning knobs, difficulties, state enum
    ├── store.js          # localStorage wrapper (settings + campaign saves)
    ├── input.js          # Mouse + touch handling
    ├── audio.js          # Web Audio synth SFX + menu/level BGM control
    ├── sprites.js        # SVG sprite loader/cache, auto-trim, drawSprite()
    ├── ships.js          # Playable ship roster + ability definitions
    ├── upgrades.js       # Roguelite upgrade pool + rarity weights
    ├── map.js            # Star-map nodes, routes, secrets, campaign persistence
    ├── story.js          # All lore text: intro, quips, finale
    ├── entities.js       # Ship / asteroid / enemy / boss / powerup factories
    ├── fx.js             # Juice layer: stars, shake, particles, shockwaves, text
    ├── game.js           # Core state, node/wave logic, abilities, collisions
    ├── render.js         # All canvas drawing (view only)
    ├── ui.js             # DOM screens: splash, menus, map, HUD, tallies
    └── dev.js            # RSB.dev console debug commands
```

### Architecture notes

- **`game.js` is the model/controller**, **`render.js` is the view**. Rendering
  never mutates game state; game logic never touches the canvas.
- **`fx.js` is purely cosmetic** — nothing in it affects gameplay or collisions,
  so effects can be added/removed freely.
- **`config.js` holds all tuning** (movement feel, scroll pacing, grade
  thresholds, …) and **`ships.js` holds the roster** — both are data-only.
- **Player ship art** ships as large SVG frames with the craft centered; the
  loader auto-trims the transparent margins at load time (`sprites.js`), and
  `drawSprite` preserves aspect ratio.
- `window.RSB` exposes live game state in the console for debugging.

## Dev console commands

Open the browser console (F12) — everything lives under `RSB.dev`. Run
`RSB.dev.help()` for the in-console version of this list. Nothing here affects
gameplay unless invoked.

| Command                | Effect                                                    |
| ---------------------- | --------------------------------------------------------- |
| `RSB.dev.god()`        | Toggle invulnerability (`[GOD]` shows next to LIVES)      |
| `RSB.dev.node(id)`     | Launch a star-map node directly; `node()` lists them      |
| `RSB.dev.unlockMap()`  | Unlock every node on the star map                         |
| `RSB.dev.wipeSave()`   | Reset campaign progress, hi-score, and intro flag         |
| `RSB.dev.sector(n)`    | Free-play an ad-hoc level at sector-`n` scaling           |
| `RSB.dev.progress(f)`  | Set run position, `0..1` (e.g. `0.9` = near the end)      |
| `RSB.dev.miniboss()`   | Skip ahead to the dreadnought ambush                      |
| `RSB.dev.boss()`       | Skip ahead to the mothership fight                        |
| `RSB.dev.killBoss()`   | Instantly defeat the active boss (full rewards)           |
| `RSB.dev.levelup()`    | Open the upgrade picker now                               |
| `RSB.dev.give(id)`     | Apply an upgrade by id; `give()` prints the id table      |
| `RSB.dev.giveAll()`    | Apply every upgrade once                                  |
| `RSB.dev.lives(n)`     | Set lives (default 99)                                    |
| `RSB.dev.score(n)`     | Set score                                                 |
| `RSB.dev.charge()`     | Fill the special ability to 100%                          |
| `RSB.dev.buff(type)`   | Grant a powerup: `weapon` \| `shield` \| `speed` \| `health` |
| `RSB.dev.clear()`      | Wipe all enemies, asteroids, and enemy fire               |

## Extending the game

- **New sprite:** drop the `.svg` in `assets/sprites/`, add one line to
  `SPRITE_FILES` in `src/sprites.js`, then draw it with
  `drawSprite(ctx, 'key', x, y, size, rotation, alpha)`.
- **New enemy:** add an archetype to `ENEMY_TYPES` in `src/entities.js` (with a
  `move` AI mode) and weight it into `Game.spawnWave()`.
- **New ship / ability:** append to `SHIPS` in `src/ships.js`; implement the
  ability effect in `Game.triggerAbility()` (cooldown) or
  `Game.updateAbility()` (drain).
- **New map node:** append an entry to `MAP_NODES` in `src/map.js` — position
  (`x`/`y` in %), `sector` (difficulty scaling), `unlockedBy` routes, optional
  `secretOf` reveal condition, and `mods` (noBoss, waveBias, goldRush,
  scoreMult, …). The map renders and unlocks it automatically.
- **New lore:** add lines to `src/story.js` (quips are picked at random) or a
  `lore` string on any map node.
- **New upgrade:** append an entry to `UPGRADE_POOL` in `src/upgrades.js` with
  a `rarity` (sets draw odds + card styling) and an `icon` sprite key; give it
  a `maxed()` predicate if it should stop appearing (one-time unlocks, capped
  stats). The level-up screen draws 3 rarity-weighted cards automatically.
- **New effect:** add a spawn helper to `FX` in `src/fx.js` and draw it in
  `render.js`.
