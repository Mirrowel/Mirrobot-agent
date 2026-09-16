# Codebase Structure

*What the code is* (the file inventory and where things live. The *why*) principles, doctrine, reasoning, lives in [`docs/design.md`](docs/design.md).

## Directory Layout

```
[project-root]/
├── .github/                    # The platform: workflows, actions, scripts, prompts
│   ├── actions/                # Composite actions (shared setup steps)
│   │   ├── bot-setup/          # Dual-identity token mint + config layering + deps
│   │   └── requester-context/  # Factual trust-line output for the security brief
│   ├── ISSUE_TEMPLATE/         # Issue forms (bug/feature/support) feeding the triage agent
│   ├── prompts/                # Agent behavior, as composable prose
│   │   ├── parts/              # 36 instruction parts (the prose)
│   │   ├── manifests/          # 14 mode manifests (the assembly order)
│   │   ├── security-brief.md   # Read first in every home agent session
│   │   └── security-brief-guest.md  # Read first in every guest session
│   ├── scripts/                # 16 bash scripts: all reusable logic
│   ├── workflows/              # 12 GitHub Actions workflows
│   └── pull_request_template.md  # PR form: gain/purpose + Closes # + redaction hint
├── ARCHITECTURE.md             # Code-state mirror: layers, entry points, flows
├── STRUCTURE.md                # This file: the file inventory
├── docs/                       # Deep documentation (README stays the overview)
│   ├── index.html              # Informational landing page (GitHub Pages from /docs)
│   ├── excerpts.json           # Auto-harvested agent-post pool for the page's cards
│   ├── badge.svg / favicon.png / .nojekyll  # Page + Ask-Mirrobot badge assets
│   ├── design.md               # Principles: execution map, trust model, doctrine
│   ├── configuration.md        # Every variable and secret
│   ├── customization.md        # Forking, renaming, new modes
│   ├── getting-started.md      # First-contact guide
│   ├── security.md             # Threat model
│   ├── workflows/              # One page per workflow + overview
│   └── plans/                  # Design plans
├── tools/                      # External Cloudflare Workers (deployed separately)
│   ├── mention-worker/         # Cross-repo mention relay (Durable Object alarm poll)
│   └── cron-probe/             # Cron-outage canary (delete when crons heal)
├── decrypt_share_link.py       # Admin-side share-link keygen/decrypt TUI
├── minify_json_secret.py       # JSON → single-line secret string
├── "Opencode config schema.json"  # Schema reference for OPENCODE_CONFIG_JSON
```

Non-code directories: `.cortexkit/`, `__pycache__/` are tooling/local state; `.fixture-cache/` is the gitignored, machine-local battery template cache (newest keys kept, safe to delete).

## Directory Purposes

**`.github/workflows/`:**
- Purpose: Every entry point, dispatchers, stubs, and agent workflows (12 files)
- Contains: Workflow YAML with extensive security-model comment headers and editable `env:` knob blocks
- Key files: `agent-router.yml` (sole comment entrypoint), `pr-review.yml` (the reviewer, ~1000 lines), `bot-reply.yml` (the home general agent) + `bot-reply-guest.yml` (the natively-guest foreign-repo lane, its own brief/manifest/checkout), `pr-review-trigger.yml` + `compliance-gate.yml` (the two zero-secret `pull_request_target` stubs), `excerpts-refresh.yml` (landing-page pool harvest + Pages artifact deploy), `compliance-groups.EXAMPLE.json` (schema doc for the optional `compliance-groups.json` override; never loaded)

**`.github/scripts/`:**
- Purpose: All shared logic, callable from any workflow or the agent's own tooling
- Contains: Bash scripts, each with a strict contract header (env in/out, files written, exit semantics)
- Key files: `bot-config.sh` (identity + trigger resolution, the single "who am I / what summons me" source, exports `BOT_IDENTITY_LIST` / `BOT_IDENTITY_PRIMARY` for prompt prose), `assemble-prompt.sh` (fail-closed parts assembler), `scrub-workspace.sh` (split-trust scrub), `route-comment.sh` (shared routing decision, comments and discussions alike), `handle-mentions.sh` (the guest gauntlet, sole authority for cross-repo mentions — issues/PRs plus foreign Discussions via a GraphQL subject branch; enforces the `GUEST_REPO_RULES` ordered `glob:deny|allow` repo filter, parity with the worker prefilter), `generate-review-kit.sh` (review context for any PR, `KIT_REPO`-aware for foreign-repo runs; the shared rebase ladder / `REBASE_CONTEXT` used by kit, `bot-reply.yml`, and `compliance-check.yml`), `minimized-nodes.sh` (single source of hidden/minimized review + comment node ids; fail-closed, `QUERY_REPO`-aware for guest PRs), `fetch-pr-discussion.sh` (three-block context, `CONTEXT_LIMITS_JSON` budgeting, fill-loop slots that count content shown, `body-chars` per-body clips defaulting to 4000, chronological rendering, addressable `[id N]` / `[DC_...]` conversation lines), `fetch-roster.sh`, `react.sh` (reaction lifecycle: REST for issues/comments, GraphQL mutations for discussion nodes), `share-filter.sh` (share-URL mask/encrypt + boot sentinel + shape-based credential redaction), `split-diff.sh` (oversized diffs → navigable parts + index, never truncated), `harvest-excerpts.sh` (builds `docs/excerpts.json`, the landing page's quality-gated card pool), `opencode-cleanup.sh` (config/plugin delete-after-boot), plus the two CI batteries `scrub-fixtures.sh` and `prompt-rule-fixtures.sh`

**`.github/prompts/`:**
- Purpose: The agent's behavior and security doctrine as content, not code
- Contains: `parts/*.md` (one instruction block each; `mission-guest.md` is the guest monolith), `manifests/*.manifest` (ordered part lists per mode), the top-level `security-brief.md` (home) and `security-brief-guest.md` (guest lane)
- Key files: `parts/security-*.md` prose is never pinned — `prompt-rule-fixtures.sh` checks machine contracts only (assembly render, placeholder-vs-renderer completeness, workflow marker couplings); `security-brief.md` is read first in every home session, `security-brief-guest.md` in every guest session

**`.github/actions/`:**
- Purpose: Composite actions shared across workflows
- Contains: `bot-setup/action.yml` (identity mint, model/config layering — model from `OPENCODE_MODEL` or the config secret's own `model` field, one of the two required; `AGENT_MODELS_JSON` resolution; credential-leaf masking (config leaves plus opencode's own `auth.json`) and credential-helper git auth (no token in any URL or config value); a deny-subset permission drift check that warns with a count only, never rule names) with `permissions.example.json` (the recommended permission profile; `bash`/`read`/`edit`/`write` deny matrices); `requester-context/action.yml` (association + roster line, secrets-free)

**`tools/`:**
- Purpose: Cloudflare Workers deployed outside GitHub, each self-contained with its own README and `wrangler.toml`
- Key files: `mention-worker/worker.js` (conditional-request notification polling, deny-only fail-open pre-filter, `repository_dispatch` relay), `cron-probe/worker.js` (a canary for the cron-trigger outage, delete when it starts firing)

**`docs/`:**
- Purpose: The deep documentation: `getting-started.md`, `design.md` (principles, execution map, split-trust model, update doctrine), `configuration.md`, `customization.md`, `security.md`, `workflows/*.md` — plus the static landing page `index.html` (deployed to GitHub Pages by `excerpts-refresh.yml`, cards fed by `excerpts.json`)

## Key File Locations

**Entry Points:** `.github/workflows/*.yml`, all 12 workflows; GitHub events and dispatches start here. The comment path always enters via `agent-router.yml`; cross-repo mentions enter via `mention-poller.yml` → `bot-reply-guest.yml`.
**Core Logic:** `.github/scripts/*.sh` (identity/triggers, routing, scrubbing, context assembly, prompt assembly, verification, excerpt harvesting; `.github/actions/bot-setup/action.yml`) token minting and config lifecycle.
**Configuration:** Secrets and variables live in GitHub (not in the repo); behavior knobs are variables (`AGENT_PAUSED`, `AGENT_PAUSED_PARTS_JSON`, `BOT_IDENTITIES`, `BOT_TRIGGERS`, `CONTEXT_LIMITS_JSON`, `AGENT_MODELS_JSON`, `OPEN_TRIGGERING`, `GUEST_REPO_RULES`, `FOREIGN_MENTIONS_USERS`, `OPENCODE_PLUGINS_JSON*`, roster/filter lists, see `docs/configuration.md`). The committed config surface is `.github/actions/bot-setup/permissions.example.json` (full-config template) and per-workflow `env:` knob blocks (e.g. `MAINTAINED_BASE_BRANCHES` in `pr-review.yml`, `FILE_GROUPS_JSON` in `compliance-check.yml` — optionally overridden by a repo-specific `.github/workflows/compliance-groups.json`, schema in `compliance-groups.EXAMPLE.json`, `DIFF_SPLIT_BYTES` diff split threshold). 
**Tests:** `.github/scripts/scrub-fixtures.sh` (401 security fixtures covering the scrub, roster transforms, router decision matrix, mention/discussion pipelines, cross-repo workflow contracts, credential-shape redaction, and the bash/read/edit/write permission deny matrices) and `.github/scripts/prompt-rule-fixtures.sh` (80 machine-contract checks: assembly render, placeholder-vs-renderer completeness, workflow marker couplings), wired to CI via `.github/workflows/scrub-fixtures.yml`; a failing suite after an edit means the suite disagrees with the change — update the check or the behavior, never silently delete the check.

## Naming Conventions

**Files:** `kebab-case` everywhere, with type-signaling extensions: workflows are named for their function (`pr-review.yml`, `bot-reply.yml`), scripts end in `.sh`, prompt parts are bare `.md` nouns (`severity.md`, `error-handling.md`), manifests carry `.manifest` and mirror their mode name (`pr-review-first.manifest` ↔ mode `pr-review-first`).
**Directories:** `kebab-case` (`bot-setup`, `mention-worker`); `.github` subdirectories are fixed by convention (`workflows/`, `actions/`, `scripts/`, `prompts/`).

## Where to Add New Code

**New agent behavior:** `.github/prompts/parts/<new-part>.md`, then reference it from the relevant `.github/prompts/manifests/*.manifest` files; a part edit propagates to every mode that lists it. Prompt prose is never pinned: run `bash .github/scripts/prompt-rule-fixtures.sh` (assembly, placeholder-vs-renderer, marker couplings) and `bash .github/scripts/assemble-prompt.sh --verify` before committing.
**New agent mode:** create a `.github/prompts/manifests/<mode>.manifest` ordering existing (and new) parts; map the mode to its renderer's envsubst list in `prompt-rule-fixtures.sh` (`mode_list` — an unmapped mode fails the battery loudly). Verify with `bash .github/scripts/assemble-prompt.sh --list`.
**New shared script:** `.github/scripts/<kebab-name>.sh`, start from an existing script's contract header (env in/out, files, exit semantics); never interpolate untrusted text into the shell except via `env:`.
**New workflow:** `.github/workflows/<name>.yml`; dispatch-only agent workflows must declare the phantom-suppressing never-matching `push` trigger and runtime input validation (see `pr-review.yml`); anything `pull_request`-triggered must stay zero-secret with no checkout. Never add `pull_request*` triggers to agent workflows. For sessions that run in **foreign** repositories, model the lane on `bot-reply-guest.yml`: natively guest (no home conditionals), its own security brief + manifest, `KIT_REPO` for the kit, a foreign checkout pinned to an API-recorded SHA, and the scrub in `--foreign` mode.
**New composite action:** `.github/actions/<action-name>/action.yml`; keep it secrets-free if it can ever run on a base branch.
**New external worker:** `tools/<worker-name>/` with `worker.js` + `wrangler.toml` + README; follow the mention-worker pattern: pre-filters are deny-only and fail-open, and never hold authority (re-verify every relayed field in-repo).
**New landing-page content:** `docs/index.html` plus static assets; `excerpts-refresh.yml` deploys `docs/` to GitHub Pages as a workflow artifact, so the regenerated excerpt pool rides the deploy (never a push to `main`); tune the harvest via the `EXCERPT_*` knob block in the workflow.
**New fixtures/tests:** extend `.github/scripts/scrub-fixtures.sh` (scrub/roster/permissions, cross-repo workflow contracts) or `.github/scripts/prompt-rule-fixtures.sh` (machine contracts: structure, behavior, coupling — never prose pins); the CI battery picks them up automatically. Use `--only`/`--quick`/`--parallel` for local speed; `FIXTURES_REBUILD=1` forces a fresh `.fixture-cache/` template snapshot.
**Local admin tooling:** repository root as Python (`*.py`), used by humans only; nothing in CI may depend on root scripts.
