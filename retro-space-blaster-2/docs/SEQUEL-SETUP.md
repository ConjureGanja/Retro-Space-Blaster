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

A video reference can change colors and the camera. It should not change shot count, wave timers, or upgrade effects. The base gun is still one bolt. Spread, twin cannons, and flak add the extra shots.

## Camera, short version

- Sim x is forward (old "right"). Sim y is lateral (old "down").
- The lens looks along +x. The far edge of the floor sits on the horizon, about a quarter of the way down the logical view. The near edge sits at the bottom.
- The window letterboxes that view. It does not resize the floor.
- Mouse, and the existing one-finger touch control, are unprojected into sim coordinates. Left click still fires. Right click is still the ship special. Esc or P still pauses.
