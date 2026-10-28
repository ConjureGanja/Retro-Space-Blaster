# Security Policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Use GitHub's
private reporting instead: **Security tab → Report a vulnerability** on this
repository. I'll acknowledge within a few days.

In scope: the Devvit server (`src/server`), save/leaderboard validation
(`src/shared`), anything that lets one player affect another player's data,
and leaked credentials in the repo history.

Out of scope: client-side score tampering in your own browser. The server
caps and rate-limits scores, but a determined player can always forge client
input — that's inherent to browser games.

## What protects this project

| Layer             | Where                                    | What it catches                             |
| ----------------- | ---------------------------------------- | ------------------------------------------- |
| Input validation  | `src/shared/validation.ts` (+ tests)     | Forged scores, oversized/unknown save data  |
| Rate limiting     | `src/server/core/rate-limit.ts`          | Scripted spam of `/api/score` & `/api/save` |
| Least privilege   | `devvit.json` → `permissions`            | Outbound HTTP disabled; only Redis + Reddit |
| No dev tools      | `game/main.js` (`MODE === 'production'`) | `RSB.dev` cheats never ship to players      |
| CodeQL            | `.github/workflows/security.yml`         | Injection / XSS / unsafe code patterns      |
| Dependency review | `.github/workflows/security.yml`         | PRs adding runtime deps with HIGH vulns     |
| Gitleaks          | `.github/workflows/security.yml`         | API keys / tokens committed by accident     |
| Dependabot        | `.github/dependabot.yml`                 | Outdated or vulnerable npm deps + actions   |
| Pinned actions    | `.github/workflows/*.yml`                | Supply-chain swaps of GitHub Action tags    |

## Known, accepted advisories

`npm audit` reports a high-severity advisory in `tmp` (via `inquirer`) inside
the **Devvit CLI** (`devvit`, a devDependency). The CLI only runs on the
developer's machine for login/upload prompts and is never bundled into the
app that runs on Reddit. Revisit when Devvit ships a CLI update.
