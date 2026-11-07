# Project log — setup facts & handoff notes

Everything you'd need to hand this project to someone else (or to future-you
on a new PC). **No secrets go in this file** — it's committed to a public repo.
Record _where_ a secret lives, never the secret itself.

## Accounts & identifiers

| Thing                  | Value / location                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------- |
| GitHub repo            | `ConjureGanja/Retro-Space-Blaster` (public)                                           |
| Devvit app name / slug | `retro-space-blaster` (from `devvit.json` → `name`)                                   |
| Reddit developer acct  | The Reddit account you ran `devvit login` with                                        |
| Devvit login token     | Stored by the CLI in your user folder (`%USERPROFILE%\.devvit`) — **never commit it** |
| Test subreddit         | _fill in after first playtest_ (the CLI prints the `<app-name>_dev` sub it creates)   |
| App Directory page     | `https://developers.reddit.com/apps/retro-space-blaster`                              |

## Hosting & data

- **Hosting:** Reddit hosts everything (client files + Node server). No Vercel /
  Cloudflare / domain needed for the Reddit version.
- **Database:** Devvit Redis, one namespace per subreddit install.
  Keys are listed in `src/server/core/keys.ts` (`v1:` prefix — bump to `v2:` if
  a data format ever changes incompatibly).
- **Secrets / env vars:** none required today. If one is ever needed (e.g. an
  API key), use `devvit settings set <name>` (stored by Reddit, encrypted) —
  never a committed `.env`.
- **Outbound HTTP:** disabled in `devvit.json` (`permissions.http.enable: false`).
  To call an external API, add the domain to `permissions.http.domains`
  (requires Reddit review).

## Toolchain (as of 2026-10-28)

| Tool       | Version | Notes                                       |
| ---------- | ------- | ------------------------------------------- |
| Node.js    | 24 LTS  | `.nvmrc`; minimum 22.13 (ESLint 10)         |
| Devvit     | 0.15.1  | `devvit`, `@devvit/web`, `@devvit/start`    |
| Vite       | 8.3.5   | Build via `@devvit/start/vite` plugin       |
| TypeScript | 6.0.3   | Server/shared/splash only; game is plain JS |
| Hono       | 4.13.14 | Server router                               |
| sharp      | 0.35.5  | Art pipeline (SVG/PNG → WebP)               |

## Limits worth remembering (Devvit 0.15.1 CLI)

- Webview (client) files: no per-file cap, **1 GB total**.
- Media assets (if `media.dir` is ever used): 20 MB per image, 40 MB per GIF.
- App icon: square PNG, 256–1024 px (1024 recommended), **≤ 500 KB**.
- `devvit upload` / playtest only install to subreddits with **< 200 members**.
- Inline feed post height: `short` / `regular` / `tall`, or 72–512 px.

## Decisions

- **2026-10-28 — Devvit Web restructure.** Kept the game as vanilla JS (no
  React rewrite). Dropped the template's React/Tailwind. Repo root is the
  Devvit app; the old standalone `server.js` was replaced by `npm run local`.
- **2026-10-28 — Art pipeline.** Masters stay in `art/sprites/`; shipped WebPs
  are generated (gitignored). ~44 MB → ~1.5 MB shipped. HD set lazy-loads.
- **2026-10-28 — Cloud saves + leaderboard.** Redis per Reddit account / per
  subreddit; server-side validation + rate limits. Leaderboard = best run score.
- **2026-10-28 — Prettier excluded from original game modules** to keep the
  restructure diff readable. Adopt later in a style-only commit.

## Open items / ideas

- [ ] Hangar/main menu overflows on short screens (≤720 px tall) — matters for
      phones in expanded mode. Pre-existing layout, not caused by the restructure.
- [ ] Touch: two-finger special works, but there's no on-screen button yet.
- [ ] Upgrades that are cosmetic-only today (found by Codex review on PR #1):
      TRACER ROUNDS ("damaging trail" — trail particles never hit anything) and
      PRISMATIC CORE ("bonus damage" — only recolours lasers). Needs a balance
      call on how much each should add.
- [ ] In-game TOP PILOTS screen (leaderboard currently shows on the feed card).
- [ ] Music is ~7.5 MB of the bundle — re-encode to ~96 kbps to halve it.
- [ ] `Whispers of Tomorrow.mp3` sits in `art/music-unused/` — wire it in or drop it.
- [ ] Blockchain/token experiments: keep them out of the Reddit build; check
      Devvit's rules on payments & crypto before mixing them.
