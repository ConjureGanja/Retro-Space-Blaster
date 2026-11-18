# Space Blaster 2

A behind-the-ship rail shooter. The world comes at the camera. Five new routes, eight enemy behaviors, a yard between levels, and a camera rule that removes anything that reaches the ship. The five fighters and their rear artwork are the ones from the first game.

This folder is the Devvit app `space-blaster-2` (private install on `r/space_blaster_2_dev`). Do not upload it under the original game's name. Setup, tests, and how to tune a level: [docs/SEQUEL-SETUP.md](docs/SEQUEL-SETUP.md).

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

- **`game/rail/sim.ts` is the model.** `game/rail/draw.js` only paints it.
- **`game/rail/shell.js` is the lobby** — hangar, route, yard, settings, tally.
- **`game/rail/tune.ts` and `content.ts` hold the numbers.** Ship roster is
  `game/rail/ships.ts`. The rear sprites are still trimmed in `sprites.js`.

## Controls

| Input                         | Action                          |
| ----------------------------- | ------------------------------- |
| Mouse                         | Fly toward the cursor           |
| WASD or arrows                | Strafe                          |
| Z or left click               | Fire                            |
| X, Shift, or right click      | Ship special                    |
| Esc or P                      | Pause                           |
| Gamepad stick / A / B / Start | Strafe / fire / special / pause |

On a phone the game is landscape only. Drag the left side to move. FIRE and SPECIAL are on the right. A portrait phone shows ROTATE and pauses a running fight.

## Gameplay

- **The flow:** title → hangar (ship and contract) → the route. Five levels in
  a line: Violet Nebula, Asteroid Belt, Orbital Station, Ice Moon, Hive Core.
  Clearing one unlocks the next. Between clears, the yard spends credits on
  fire rate, side bolts, extra hull, and a faster special meter.
- **What you can buy stays bought.** A hull breach ends the level, not the yard.
- **Difficulty contracts:** CADET (5 lives, slower enemy guns), PILOT (baseline,
  3 lives), ACE (2 lives, tougher and quicker). The autopilot test must clear
  pilot.
- **The run:** enemies spawn at the horizon and approach in lanes. A painted
  lane is the safe gap. Shots telegraph, then travel. Anything that reaches the
  cull line in front of the ship is removed, and guns lock before that, so
  nothing shoots from behind the camera. Close sprites fade so they can't hide
  the ship.
- **Bosses** hold their distance and change pattern at two HP thresholds.
- **Ships** (hangar shows the overhead portrait and the rear view you fly):
  | Ship   | Role          | Special (right-click)                          |
  | ------ | ------------- | ---------------------------------------------- |
  | FALCON | Interceptor   | Chrono Field — hold to slow time to a crawl    |
  | TALON  | Heavy Gunship | Nova Blast — screen-clearing shockwave         |
  | WRAITH | Phase Fighter | Phase Dash — blink to the cursor, shred path   |
  | AEGIS  | Bulwark       | Aegis Shield — 4s invulnerable ramming barrier |
  | VULCAN | Artillery     | Hyper Beam — 2s piercing beam                  |
- **Drops:** repair, rapid fire, a temporary side bolt, and a special-meter cell.
- **Level clear:** the tally splits kills, boss, pickups, and the clear bonus.
  Grade A is a clean run. A hull breach is an F. Scores post to the subreddit
  board when you are playing inside Reddit.

## Dev console commands

Development builds only (`npm run local` or `npm run dev`). Open the browser
console (F12) — everything lives under `RSB.dev`. Run `RSB.dev.help()` for the
in-console version of this list.

| Command             | Effect                             |
| ------------------- | ---------------------------------- |
| `RSB.dev.help()`    | Print this list                    |
| `RSB.dev.level(id)` | Launch a route (`nebula` … `hive`) |
| `RSB.dev.boss()`    | Launch the current route's boss    |
| `RSB.dev.god()`     | Toggle invulnerability             |
| `RSB.dev.lives(n)`  | Set hull                           |

## Extending the game

- **New sprite:** put the master file in `art/sprites/`, add one line to
  `SPRITE_FILES` in `src/client/game/sprites.js` pointing at
  `/assets/sprites/<name>.webp` (keys ending in `HD` join the lazy HD set),
  then draw it with `drawSprite(ctx, 'key', x, y, size, rotation, alpha)`.
- **New enemy or level:** see [docs/SEQUEL-SETUP.md](docs/SEQUEL-SETUP.md). The
  live sim is `src/client/game/rail/`.
- **New ship / ability:** append to `SHIPS` in `game/rail/ships.ts` and handle
  the key in `updateSpecial` in `game/rail/sim.ts`. The rear PNG still has to
  exist for that index.
- **New saved setting:** add the key to `SYNCED_KEYS` in `game/store.js` **and**
  `SAVE_KEYS` in `src/shared/validation.ts` (the server drops unknown keys).
- **New API endpoint:** add a route in `src/server/routes/api.ts`, its types in
  `src/shared/api.ts`, and validate every input.

## License

MIT — see [LICENSE](LICENSE). Press Start 2P font © CodeMan38, SIL Open Font License.
