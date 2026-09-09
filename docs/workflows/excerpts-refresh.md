# Excerpts Refresh

**File:** `.github/workflows/excerpts-refresh.yml`
**Triggers:** weekly schedule (Mondays 03:17 UTC) + manual `workflow_dispatch`
**Executes from:** the default branch — never PR-triggered
**Permissions:** `contents: read`, `pages: write`, `id-token: write` (run token only; zero secrets)

## What it does

The informational landing page (`docs/index.html`, published via GitHub Pages from workflow artifacts) shows eight random "field notes" cards containing things the agent has actually posted. This workflow rebuilds and redeploys that site weekly:

1. **Find candidates** — for every repo in `EXCERPT_REPOS` × every identity in `EXCERPT_BOTS`, the harvester searches `commenter:` and `reviewed-by:` threads. Both the account and the app form of the bot identity are harvested, so the pool reaches back through the app-era history.
2. **Fetch, filtered** — one GraphQL query per candidate thread pulls comments (`isMinimized` checked — hidden content is never harvested) and PR review summaries authored by the bot identities.
3. **Quality gate** — substantive prose only: length windows (comments 150–900 chars, reviews 80–2400 so full verdict reviews survive), backtick-fraction ceilings, AI-footer lines stripped, old-era conversational acks ("Thanks for the great report…") excluded, display text clipped at 420 chars.
4. **Deploy** — `docs/` plus the regenerated `excerpts.json` is uploaded as a Pages artifact and deployed. Nothing is committed to `main`: the pool is derived content, so the repo's branch rules are never touched (the Actions bot cannot and need not push).

The page deals 8 cards at random per visit from the static JSON — visitors spend **zero** GitHub API budget on cards (only the live-activity strip makes unauthenticated calls). If `excerpts.json` is missing or thin, the page falls back to a small set of hand-picked classics. The committed `docs/excerpts.json` is only a seed for a failed-harvest run; every deploy regenerates it.

> GitHub Pages on this repository is set to **build type: workflow** — the site publishes from this workflow's artifact, not from `docs/` on `main` directly. Page-source edits (index.html, badge.svg) deploy on the next run of this workflow (dispatch it manually for instant publishes).

## Knobs (workflow `env:` block)

| Knob | Default | Meaning |
|---|---|---|
| `EXCERPT_REPOS` | `Mirrowel/Mirrobot-agent Mirrowel/LLM-API-Key-Proxy` | space-separated public repos to harvest |
| `EXCERPT_BOTS` | `Mirrobot-Agent,mirrobot-agent[bot]` | comma-separated identities, account + app forms |
| `EXCERPT_MAX` | `120` | pool cap — weekly card variety |
| `EXCERPT_DAYS` | `180` | recency tier: posts newer than this many days fill the pool first (`0` disables tiering) |
| `EXCERPT_MIN` | `40` | backfill floor: older posts top up only while the recent tier is under this many items |

Per-thread fetches read the **newest** window (`last:` in GraphQL), so long threads contribute their recent posts, not their 2019-era ones. Cards render only items inside the recency window (`days` is embedded in `excerpts.json`); when the recent tier is empty the section degrades to a notice that half-jokes about it and suggests summoning the bot to investigate. Searches are combined per repository (repeated `commenter:`/`reviewed-by:` qualifiers are OR'ed), paced, and retried with a 60s backoff on secondary rate limits — the search endpoint 403s aggressively under bursts, which is the fastest way to starve the pool.

The harvester (`.github/scripts/harvest-excerpts.sh`) accepts the same knobs as environment variables for local runs; it needs an authenticated `gh` (search + GraphQL + REST) and `jq`.

## For forks

Point the knobs at your repos and identities, keep GitHub Pages enabled on `/docs`, and the whole card machinery (harvest → weekly refresh → random deal) works unchanged. The page-side constants (`REPOS`, `BOTS` for the live strip) live at the top of the `docs/index.html` script block — see [customization](../customization.md#the-informational-page--badge).
