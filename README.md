# Retro Space Blaster: Roguelite Edition

[![CI](https://github.com/ConjureGanja/Retro-Space-Blaster/actions/workflows/ci.yml/badge.svg)](https://github.com/ConjureGanja/Retro-Space-Blaster/actions/workflows/ci.yml)
[![Security](https://github.com/ConjureGanja/Retro-Space-Blaster/actions/workflows/security.yml/badge.svg)](https://github.com/ConjureGanja/Retro-Space-Blaster/actions/workflows/security.yml)

An R-Type-style side-scrolling arcade blaster with mouse controls, five playable
ships (each with a unique special ability), stacking roguelite upgrades, a
branching Mario-World-style campaign map, three difficulty contracts, and a
chrome machine-swarm to blame for everything (officially: a toaster).

**Runs on Reddit** as a [Devvit Web](https://developers.reddit.com/) app: a
feed card with the subreddit leaderboard, a full-screen game, cloud saves that
follow your Reddit account, and a per-subreddit TOP PILOTS board. The game
itself is vanilla JavaScript (ES modules) + Canvas 2D — no framework.

**The setup:** it's 3077, you fly packages for the ORION COURIER GUILD along the
Spiral Arm Turnpike, and the VRAX DOMINION — a swarm that strips worlds for
parts and leaves them disturbingly polished — has invaded. Clear the routes,
find the secrets, and deliver one final package marked RETURN TO SENDER.

## Quick start (Windows)

| Double-click             | What it does                                                   |
| ------------------------ | -------------------------------------------------------------- |
| `scripts\setup.bat`      | First time only: checks Node, installs deps, logs in to Devvit |
| `scripts\play-local.bat` | Play in your browser at `localhost:5173` — no Reddit needed    |
| `scripts\playtest.bat`   | Play **live on Reddit** in your private test subreddit         |
| `scripts\check.bat`      | Everything CI runs. Green here = green on GitHub               |
| `scripts\deploy.bat`     | Upload a new private version (`devvit upload`)                 |
| `scripts\publish.bat`    | Submit for review — unlisted or public (`devvit publish`)      |
| `scripts\logs.bat <sub>` | Stream server logs from an installed subreddit                 |

Same thing from any terminal: `npm ci`, then `npm run local | dev | check | build | deploy | launch`.

Requires **Node.js 22.13+** (24 LTS recommended — see `.nvmrc`).

## How it fits together

```
 Reddit feed                      Expanded (full screen)
┌────────────────────┐  LAUNCH   ┌──────────────────────────────┐
│ splash.html        │ ────────▶ │ game.html  (vanilla JS game) │
│ title + TOP PILOTS │           │ store.js ⇄ platform/cloud.js │
└─────────┬──────────┘           └──────────────┬───────────────┘
          │ GET /api/leaderboard                │ /api/init · /api/save · /api/score
          ▼                                     ▼
        ┌──────────────────────────────────────────────┐
        │ src/server (Hono on Devvit)  → Redis         │
        │ validates every request (src/shared)         │
        └──────────────────────────────────────────────┘
```

- **Offline-first saves.** `store.js` keeps the game's synchronous
  `store.get/set` API, mirrors to localStorage instantly, and uploads to the
  player's Reddit cloud save a moment later. No server? (`npm run local`) It
  just keeps playing on localStorage.
- **Never trust the client.** Scores and saves are re-validated server-side
  (`src/shared/validation.ts`, unit-tested) and rate-limited.
- **Art pipeline.** Master art lives in `art/sprites/` (huge embedded-PNG SVGs).
  `npm run art` renders each to a WebP in `public/assets/sprites/` — the game
  downsamples sprites to ≤640px anyway, so this ships ~1.5 MB instead of ~44 MB
  with no visible difference. Runs automatically before every dev/build.
- **Lazy HD.** Only the standard sprite set loads at boot; the HD set
  downloads the first time a player ticks _Use HD Sprites_.
- **No cheats in production.** `RSB.dev` console tools exist only in
  development builds (`local` / `dev`), never in what `deploy` uploads.

## Project structure

```
retro-space-blaster/
├── devvit.json               # Reddit app config: entrypoints, permissions, menu, triggers
├── vite.config.ts            # Reddit build (client + server) via @devvit/start
├── vite.local.config.ts      # Browser-only preview (npm run local)
├── art/
│   ├── sprites/              # MASTER art (SVG/PNG). Edit/add here.
│   ├── concept/              # Concept sheets — kept, not shipped
│   └── music-unused/         # Tracks not wired into the game yet
├── public/assets/
│   ├── music/                # Shipped BGM (menu + level)
│   └── sprites/              # GENERATED WebPs (gitignored) — don't edit
├── marketing/icon.png        # App Directory icon (1024², <500 KB)
├── scripts/                  # optimize-art.mjs + Windows .bat helpers
├── src/
│   ├── client/
│   │   ├── splash.html/.ts/.css   # Feed card (inline view) — keep it light
│   │   ├── game.html              # Full game markup (expanded view)
│   │   ├── styles/main.css
│   │   └── game/                  # The game (vanilla JS)
│   │       ├── main.js            # Boot + requestAnimationFrame loop
│   │       ├── store.js           # Save API (cache → localStorage → cloud)
│   │       ├── platform/cloud.js  # /api bridge (fails soft offline)
│   │       └── …                  # config, game, render, ui, map, ships, …
│   ├── server/               # Hono API on Devvit (Redis saves + leaderboard)
│   └── shared/               # Types + validation shared by client & server
├── legacy/                   # Original single-file versions (reference only)
├── docs/PROJECT-LOG.md       # Setup facts, accounts, decisions — handoff notes
└── .github/                  # CI, security scanning, Dependabot, PR template
```

### Architecture notes (game)

- **`game.js` is the model/controller**, **`render.js` is the view**. Rendering
  never mutates game state; game logic never touches the canvas.
- **`fx.js` is purely cosmetic** — nothing in it affects gameplay or collisions.
- **`config.js` holds all tuning** and **`ships.js` holds the roster** — both data-only.
- Sprites are auto-trimmed at load time (`sprites.js`) and drawn aspect-correct.

## Controls

| Input       | Action                         |
| ----------- | ------------------------------ |
| Mouse       | Move ship (always faces right) |
| Left click  | Fire weapons                   |
| Right click | Ship special ability           |
| Esc / P     | Pause                          |

On touch devices: one finger moves/fires, two fingers trigger the special.

## Gameplay

- **The flow:** splash screen (press any button) → hangar/main menu → the
  **STAR MAP**. Pick an unlocked node, read its briefing, LAUNCH. Completing a
  node unlocks its connected routes; earning an **A** on certain nodes reveals
  hidden **secret nodes** (★) with big score multipliers and a free-upgrade
  reward. Beat **VRAX PRIME** at the end of the third zone to save the
  Turnpike (the map stays open for replays and missed secrets).
- **Campaign vs. run:** map unlocks and best grades always persist. Your score,
  lives, and upgrades persist across nodes _within_ a run — a game over resets
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
  | Ship   | Role          | Special (right-click)                          |
  | ------ | ------------- | ---------------------------------------------- |
  | FALCON | Interceptor   | Chrono Field — hold to slow time to a crawl    |
  | TALON  | Heavy Gunship | Nova Blast — screen-clearing shockwave         |
  | WRAITH | Phase Fighter | Phase Dash — blink to the cursor, shred path   |
  | AEGIS  | Bulwark       | Aegis Shield — 4s invulnerable ramming barrier |
  | VULCAN | Artillery     | Hyper Beam — 2s piercing beam                  |
- **XP orbs** from kills trigger the roguelite upgrade choice mid-run: three
  rarity-weighted cards (COMMON → UNCOMMON → RARE → EPIC), each with its own
  icon; one-time unlocks stop appearing once taken. Enemies can also drop
  powerups (rapid fire, shield, speed, extra life).
- **Sector clear:** the music stops, your score tallies up with dings, and you're
  stamped a grade from **A** (best) to **F** (hull breached).

## Dev console commands

Development builds only (`npm run local` or `npm run dev`). Open the browser
console (F12) — everything lives under `RSB.dev`. Run `RSB.dev.help()` for the
in-console version of this list.

| Command               | Effect                                                       |
| --------------------- | ------------------------------------------------------------ |
| `RSB.dev.god()`       | Toggle invulnerability (`[GOD]` shows next to LIVES)         |
| `RSB.dev.node(id)`    | Launch a star-map node directly; `node()` lists them         |
| `RSB.dev.unlockMap()` | Unlock every node on the star map                            |
| `RSB.dev.wipeSave()`  | Reset campaign progress, hi-score, and intro flag            |
| `RSB.dev.sector(n)`   | Free-play an ad-hoc level at sector-`n` scaling              |
| `RSB.dev.progress(f)` | Set run position, `0..1` (e.g. `0.9` = near the end)         |
| `RSB.dev.miniboss()`  | Skip ahead to the dreadnought ambush                         |
| `RSB.dev.boss()`      | Skip ahead to the mothership fight                           |
| `RSB.dev.killBoss()`  | Instantly defeat the active boss (full rewards)              |
| `RSB.dev.levelup()`   | Open the upgrade picker now                                  |
| `RSB.dev.give(id)`    | Apply an upgrade by id; `give()` prints the id table         |
| `RSB.dev.giveAll()`   | Apply every upgrade once                                     |
| `RSB.dev.lives(n)`    | Set lives (default 99)                                       |
| `RSB.dev.score(n)`    | Set score                                                    |
| `RSB.dev.charge()`    | Fill the special ability to 100%                             |
| `RSB.dev.buff(type)`  | Grant a powerup: `weapon` \| `shield` \| `speed` \| `health` |
| `RSB.dev.clear()`     | Wipe all enemies, asteroids, and enemy fire                  |

## Extending the game

- **New sprite:** put the master file in `art/sprites/`, add one line to
  `SPRITE_FILES` in `src/client/game/sprites.js` pointing at
  `/assets/sprites/<name>.webp` (keys ending in `HD` join the lazy HD set),
  then draw it with `drawSprite(ctx, 'key', x, y, size, rotation, alpha)`.
- **New enemy:** add an archetype to `ENEMY_TYPES` in `game/entities.js` (with a
  `move` AI mode) and weight it into `Game.spawnWave()`.
- **New ship / ability:** append to `SHIPS` in `game/ships.js`; implement the
  ability in `Game.triggerAbility()` (cooldown) or `Game.updateAbility()` (drain).
- **New map node:** append to `MAP_NODES` in `game/map.js`.
- **New lore:** add lines to `game/story.js` or a `lore` string on any map node.
- **New upgrade:** append to `UPGRADE_POOL` in `game/upgrades.js` with a `rarity`
  and an `icon` sprite key.
- **New saved setting:** add the key to `SYNCED_KEYS` in `game/store.js` **and**
  `SAVE_KEYS` in `src/shared/validation.ts` (the server drops unknown keys).
- **New API endpoint:** add a route in `src/server/routes/api.ts`, its types in
  `src/shared/api.ts`, and validate every input.

## License

MIT — see [LICENSE](LICENSE). Press Start 2P font © CodeMan38, SIL Open Font License.
