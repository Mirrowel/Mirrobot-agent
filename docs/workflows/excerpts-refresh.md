# Excerpts Refresh

**File:** `.github/workflows/excerpts-refresh.yml`
**Triggers:** weekly schedule (Mondays 03:17 UTC) + manual `workflow_dispatch`
**Executes from:** the default branch — never PR-triggered
**Permissions:** `contents: write` (run token only; zero secrets)

## What it does

The informational landing page (`docs/index.html`, published via GitHub Pages) shows eight random "field notes" cards containing things the agent has actually posted. Those cards come from a harvested pool, `docs/excerpts.json`, which this workflow rebuilds weekly:

1. **Find candidates** — for every repo in `EXCERPT_REPOS` × every identity in `EXCERPT_BOTS`, the harvester searches `commenter:` and `reviewed-by:` threads. Both the account and the app form of the bot identity are harvested, so the pool reaches back through the app-era history.
2. **Fetch, filtered** — one GraphQL query per candidate thread pulls comments (`isMinimized` checked — hidden content is never harvested) and PR review summaries authored by the bot identities.
3. **Quality gate** — substantive prose only: length windows (comments 150–900 chars, reviews 80–2400 so full verdict reviews survive), backtick-fraction ceilings, AI-footer lines stripped, old-era conversational acks ("Thanks for the great report…") excluded, display text clipped at 420 chars.
4. **Pool** — deduped by URL, newest-first, capped at `EXCERPT_MAX` entries, committed as `docs/excerpts.json` only when it changed.

The page deals 8 cards at random per visit from the static JSON — visitors spend **zero** GitHub API budget on cards (only the live-activity strip makes unauthenticated calls). If `excerpts.json` is missing or thin, the page falls back to a small set of hand-picked classics.

## Knobs (workflow `env:` block)

| Knob | Default | Meaning |
|---|---|---|
| `EXCERPT_REPOS` | `Mirrowel/Mirrobot-agent Mirrowel/LLM-API-Key-Proxy` | space-separated public repos to harvest |
| `EXCERPT_BOTS` | `Mirrobot-Agent,mirrobot-agent[bot]` | comma-separated identities, account + app forms |
| `EXCERPT_MAX` | `120` | pool cap — weekly card variety |

The harvester (`.github/scripts/harvest-excerpts.sh`) accepts the same knobs as environment variables for local runs; it needs an authenticated `gh` (search + GraphQL + REST) and `jq`.

## For forks

Point the knobs at your repos and identities, keep GitHub Pages enabled on `/docs`, and the whole card machinery (harvest → weekly refresh → random deal) works unchanged. The page-side constants (`REPOS`, `BOTS` for the live strip) live at the top of the `docs/index.html` script block — see [customization](../customization.md#the-informational-page--badge).
