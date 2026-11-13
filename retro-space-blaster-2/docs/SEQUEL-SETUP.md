# Retro Space Blaster 2 — setup

This folder is a separate Devvit app. The original game stays in the parent repository and is not what `devvit upload` inside this folder ships.

The sim still runs on a flat floor. `src/client/game/view/plane.ts` only draws that floor tipped away from the camera and maps the pointer back onto it. World size is 1280×720 logical pixels on every screen. Far sprites are 72% the size of near sprites. Fire delays, scroll speeds, enemy HP, and upgrades are the numbers in the copied sim files.

## What you need

- Node.js 22.13+ (24 LTS is the version this repo expects; see `.nvmrc`)
- A Reddit account for `devvit login` when you want a playtest. `npm run local` does not need one.

## Run it on your machine

From this folder (not the parent repo):

```bash
npm ci
npm run check
npm run local
```

Open the URL Vite prints (it is `http://localhost:5173` unless that port is taken).

`npm run check` is types, lint, format, and unit tests. The camera round-trip tests live in `src/client/game/view/plane.test.ts`.

Add `?hitbox=1` to the local URL to draw the sim's hit circles on the tilted floor. Those outlines are the collisions. The sprites are billboards standing on that floor.

## Give it a GitHub repo of its own

The cloud agent that built this tree could not create a second GitHub repository. Do that once, from this folder:

```bash
cd retro-space-blaster-2
git init
git add .
git commit -m "Retro Space Blaster 2: logical floor and behind-the-ship view"
gh repo create Retro-Space-Blaster-2 --private --source=. --remote=origin --push
```

Use a new Devvit app name if you rename it. The name in `devvit.json` is `retro-space-blaster-2`. Uploading over `retro-space-blaster` would replace the original game.

## Playtest on Reddit

```bash
npm run login
npm run dev
```

Point `devvit playtest` at a private test subreddit. That installs this app beside the original. Saves and the top-pilots board are per app install, so the original leaderboard stays separate.

Do not run `npm run deploy` or `npm run launch` from the parent repository if you meant to ship this sequel.

## What not to change for "feel"

Leave these files as copies of the original if you want the same pace:

- `src/client/game/game.js`
- `src/client/game/entities.js`
- `src/client/game/ships.js`
- `src/client/game/upgrades.js`
- `src/client/game/map.js`
- `src/client/game/config.js`

Player ships in a fight use one tail-on PNG each:

`art/sprites/rear/<shipId>.png`

Ship ids are `playership1` through `playership5` (Falcon, Talon, Wraith, Aegis, Vulcan). The PNG should be transparent, with the tail and both thrusters toward the camera (the bottom of the picture) and the nose toward the top. Replace the labeled placeholder files, then run `npm run art`. The game rolls that one sprite when you strafe. It does not swap plates. The hangar still shows the original HD select art (`art/sprites/playership1HD.svg` and the same pattern for 2–5).

On a phone the game wants landscape. Turn the phone sideways: drag on the left to move, FIRE and SPECIAL on the right. FIRE holds the same flag as a left click, so the shot rate is still the ship's fire delay. If the phone is upright, a card asks you to rotate and a running fight pauses. The page tries `screen.orientation.lock('landscape')`. If the browser refuses, the card stays until you turn the phone yourself.

A video reference can change colors and the camera. It should not change shot count, wave timers, or upgrade effects. The base gun is still one bolt. Spread, twin cannons, and flak add the extra shots.

Enemies and bosses always use their HD file. There is no SD/HD switch.

## Camera, short version

- Sim x is forward (old "right"). Sim y is lateral (old "down"). The floor is still 1280×720.
- The camera is bolted just behind the ship. The fighter sits low in the frame, large, and the road ahead shrinks toward a horizon near the top. Far sprites are about a third the size of the ship.
- Only about ±110 world pixels of width stay in frame at the ship, and about 430 world pixels of road stay visible ahead. That crop is the zoom. It does not change how fast anything moves.
- The picture scales until it covers the window, then the extra edges are cropped. A tall phone does not shrink the ship into a strip. The floor itself stays 1280×720.
- Mouse aims the ship. On a phone, drag the left side of the screen instead. Holding that point keeps the ship flying that way.
- Left click, or the FIRE button, shoots. Right click, or SPECIAL, is the ship ability. Esc or P pauses.
- Upright phones show ROTATE YOUR DEVICE and pause a fight until the phone is sideways.
