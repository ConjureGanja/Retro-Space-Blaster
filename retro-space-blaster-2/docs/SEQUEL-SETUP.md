# Space Blaster 2 — setup

This folder is the Devvit app `space-blaster-2`. It is already uploaded privately for `r/space_blaster_2_dev`. It is not the original game. Do not point an upload at the original app's name. That would replace the live game and its Redis board.

The fight is a behind-the-ship rail shooter. The world scrolls toward the camera. The ship moves on a flat plane in front of the lens. Enemies spawn at the horizon. Anything that reaches the cull line is removed, and guns lock when a shooter crosses the no-fire line, so nothing fires from behind the ship or from off the playfield.

## What you need

- Node.js 22.13+ (24 LTS is what this repo expects; see `.nvmrc`)
- A Reddit account for `devvit login` when you want a playtest. `npm run local` does not need one.

## Run it on your machine

From this folder:

```bash
npm ci
npm run check
npm run local
```

Open the URL Vite prints. It serves `game.html` (usually `http://localhost:5173/game.html`).

`npm run check` is types, lint, format, and unit tests. The playability tests live in `src/client/game/rail/`:

- `bot.test.ts` — an autopilot flies every level on cadet, pilot, and ace. Pilot must clear every run. The log prints survival and clear rates.
- `invariants.test.ts` — fails if a live enemy or enemy shot is closer than the cull line, or if a shot was born past the no-fire line.
- `dodge.test.ts` — samples patterns, including each boss, and checks a path exists at the ship's real speed.

Add `?hitbox=1` to draw the ship's hit circle. It is smaller than the sprite. Add `?touch=1` to force the phone controls on a desktop.

Development builds also accept `?play=nebula&bot=1`, `?boss`, and `?screen=hangar` (or `map`, `shop`, `settings`, `board`, `pause`, `results`, `over`). Production builds ignore those. Level ids: `nebula`, `belt`, `station`, `ice`, `hive`.

## Playtest on Reddit

```bash
npm run login
npm run dev
```

`npm run dev` runs the art pipeline, then `devvit playtest` for `space-blaster-2`. Point it at `r/space_blaster_2_dev` (or another private subreddit). Saves and the top-pilots board are per install, so the original game's board is a different app.

Do not run upload or publish from the parent folder if you meant to ship this one.

## Tune difficulty

Numbers live in two places:

- `src/client/game/rail/tune.ts` — ship speed, playfield size, cull line, no-fire line, and the cadet / pilot / ace multipliers (HP, time between enemy shots, bullet speed, wave timing, simultaneous shot cap, lives).
- `src/client/game/rail/content.ts` — enemy HP, approach speed, fire timers, and the script of each level (`t` is a frame at 60Hz on pilot).

Pilot is the baseline. Cadet stretches the gaps and adds lives. Ace shortens them. After a change, run `npm run test:unit` and read the autopilot log. If pilot stops clearing, the pattern is too tight or the safe lane moved faster than the ship.

The safe lane is `safeLane()` in `content.ts`. Every patterned volley deletes dots that land in it, and aimed shots that would land there are nudged aside. One patterned volley is in the air at a time (`salvoUntil` in `sim.ts`), like a four-way stop.

## Add a level

1. Add a theme and a `LevelDef` to `LEVELS` in `content.ts`. Give it an `id` of letters, numbers, `_`, or `-` (the save validator uses that for map unlocks).
2. Script waves as `{ t, spawn, x, y }`. Spawns: `swarmer`, `strafer`, `turret`, `tank`, `kamikaze`, `miner`, `splitter`, `elite`, `mine`.
3. Add a boss `{ name, hp, accent, phases, summon }`. `phases` is three pattern names: `aimed`, `gap-pair`, `lanes-gap`, `fan-gap`.
4. The route screen picks up `LEVELS` on its own. Clearing a level unlocks the next id in that array.

## Add an enemy

1. Add a kind to `EnemyKind` and a row in `ARCHETYPES` (HP, radius, approach speed, hold depth, score, fire timer, pattern).
2. If it needs new motion, teach `moveEnemy` in `sim.ts`. Kamikaze is the model for "telegraph, then commit to a straight line." Do not home forever.
3. Draw a silhouette in `blot()` in `draw.js`.
4. Keep the two rules: never store a live threat closer than `Z_CULL`, and never call `release()` from past `Z_NO_FIRE`.

## Swap art

Ships in a fight use one tail-on PNG each:

`art/sprites/rear/playership1.png` through `playership5.png`

Those five pictures were drawn by hand. Replace the file if you want a new paint job. Do not regenerate them from a model. The matching `playershipN@2x.png` is what `npm run art` encodes, with nearest-neighbor scaling so the pixels stay square. Output is `public/assets/sprites/rear/playershipN.webp`. Do not put that file next to the hangar art or it will overwrite `playershipN.webp`.

Tail and both nozzles point at the bottom of the PNG (toward the camera). The nose points at the top. The hangar shows that rear view plus the overhead picture `art/sprites/playership1HD.svg` through `playership5HD.svg`.

`npm run art` runs before `dev`, `local`, and `build`.

Enemy stamps live in `art/sprites/foes/`. `scripts/paint-foes.mjs` redraws them. Each foe has `idle`, `wind`, and `hit`. Bosses use the route id (`nebula`, `belt`, `station`, `ice`, `hive`). After a repaint, run `npm run art`.

## Controls

Only the device you used last moves the ship. A mouse that is sitting still does not pull against the arrow keys, and keys that are up do not cancel the cursor. Settings can lock this to Auto, Keyboard, Mouse, or Touch. Auto-fire is a separate switch.

| Device   | Move                                                     | Fire       | Special                | Roll                                                               |
| -------- | -------------------------------------------------------- | ---------- | ---------------------- | ------------------------------------------------------------------ |
| Keyboard | WASD or arrows, with a short accel and a hard stop       | Z or Space | X or Shift             | Double-tap left or right, or the roll key (Q, E, or R in settings) |
| Mouse    | Cursor, with a deadzone so a still cursor does not creep | Left click | Right-click the middle | Right-click the left or right side of the glass                    |
| Phone    | Drag the left stick                                      | FIRE       | SPECIAL                | Double-flick the stick, or the ROLL button                         |
| Gamepad  | Left stick                                               | A or RT    | B or LT                | LB / RB, or a double-flick of the stick                            |

The roll is a sideways burst plus a full spin of the rear sprite. The middle of the spin cannot be hit. It then has to recharge. A shot that would have landed during the spin is a perfect dodge: a flash, a sound, and a little special meter back. Holding a key does not roll. The second press has to arrive within about a quarter of a second.

The crosshair sits on the play plane at the blaster's x and y. Shots do not drift sideways, so that point is where they still are when they reach the target's depth. Spread cannons add a small box for each side barrel. It lags a little as paint, opens while you fire, and turns red with a lock ring when an enemy is already under the guns. Aim assist, off unless you turn it on, nudges the barrels a few units toward that enemy. The mark moves with the barrels. Settings: crosshair on or off, style (cross, chevron, dot), color, and aim assist.

Foe masters are 128×128 in `art/sprites/foes/`, with a nearest-neighbor `@2x` twin. `node scripts/paint-foes.mjs` redraws them. Idle, wind-up, hit, and dead. Then `npm run art`. Hit circles are still `enemy.r`. The picture got bigger. The collision did not.

Landscape only on a phone. A tall phone gets ROTATE and a running fight pauses.

## Feel, short version

The fixed step is still 60Hz (`STEP_MS` in `main.js`). Falcon still waits 18 frames between shots, Wraith 16, Talon 24, Aegis and Vulcan 20. Pilot has 3 lives, cadet 5, ace 2. The base gun is one bolt. Split Lens in the yard adds side bolts. The open lane is still the gap in a volley. Kills and boss hits freeze the world for a couple of frames and shake the glass, unless reduced effects is on. The first run shows four prompts: move, fire, roll, special. They go away once you've done each one.
