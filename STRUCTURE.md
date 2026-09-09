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
│   │   ├── parts/              # 34 instruction parts (the prose)
│   │   ├── manifests/          # 13 mode manifests (the assembly order)
│   │   ├── security-brief.md   # Read first in every agent session
│   │   └── guest-rules.md      # Guest-mode rules, injected after the brief
│   ├── scripts/                # 14 bash scripts: all reusable logic
│   ├── workflows/              # 10 GitHub Actions workflows
│   └── pull_request_template.md  # PR form: gain/purpose + Closes # + redaction hint
├── ARCHITECTURE.md             # Code-state mirror: layers, entry points, flows
├── STRUCTURE.md                # This file: the file inventory
├── docs/                       # Deep documentation (README stays the overview)
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
├── test-config.py              # Local config emulator/test harness
├── custom_providers.json       # Local provider config used by test-config.py
├── "Opencode config schema.json"  # Schema reference for OPENCODE_CONFIG_JSON
└── test_results/               # Output artifacts from test-config.py runs
```

Non-code directories: `.github/buk/` is archived pre-parts prompt backups (do not edit); `.cortexkit/`, `__pycache__/`, `.vscode/`, `todo.md` are tooling/local state.

## Directory Purposes

**`.github/workflows/`:**
- Purpose: Every entry point, dispatchers, stubs, and agent workflows (10 files)
- Contains: Workflow YAML with extensive security-model comment headers and editable `env:` knob blocks
- Key files: `agent-router.yml` (sole comment entrypoint), `pr-review.yml` (the reviewer, ~1000 lines), `pr-review-trigger.yml` + `compliance-gate.yml` (the two zero-secret base-branch stubs)

**`.github/scripts/`:**
- Purpose: All shared logic, callable from any workflow or the agent's own tooling
- Contains: Bash scripts, each with a strict contract header (env in/out, files written, exit semantics)
- Key files: `bot-config.sh` (identity + trigger resolution, the single "who am I / what summons me" source, exports `BOT_IDENTITY_LIST` / `BOT_IDENTITY_PRIMARY` for prompt prose), `assemble-prompt.sh` (fail-closed parts assembler), `scrub-workspace.sh` (split-trust scrub), `route-comment.sh` (shared routing decision, comments and discussions alike), `handle-mentions.sh` (the guest gauntlet, sole authority for cross-repo mentions — issues/PRs plus foreign Discussions via a GraphQL subject branch), `generate-review-kit.sh` (review context for any PR), `fetch-pr-discussion.sh` (three-block context, `CONTEXT_LIMITS_JSON` budgeting, fill-loop slots that count content shown, `body-chars` per-body clips), `fetch-roster.sh`, `react.sh` (reaction lifecycle: REST for issues/comments, GraphQL mutations for discussion nodes), `share-filter.sh` (share-URL mask/encrypt + boot sentinel), `split-diff.sh` (oversized diffs → navigable parts + index, never truncated), `opencode-cleanup.sh` (config/plugin delete-after-boot), plus the two CI batteries `scrub-fixtures.sh` and `prompt-rule-fixtures.sh`

**`.github/prompts/`:**
- Purpose: The agent's behavior and security doctrine as content, not code
- Contains: `parts/*.md` (one instruction block each), `manifests/*.manifest` (ordered part lists per mode), the top-level `security-brief.md` and `guest-rules.md`
- Key files: `parts/security-*.md` content is pinned by `prompt-rule-fixtures.sh`; `security-brief.md` is read first in every session

**`.github/actions/`:**
- Purpose: Composite actions shared across workflows
- Contains: `bot-setup/action.yml` (identity mint, model/config layering, `AGENT_MODELS_JSON` resolution, credential masking) with `permissions.example.json` (the recommended permission block for the user's config secret); `requester-context/action.yml` (association + roster line, secrets-free)

**`tools/`:**
- Purpose: Cloudflare Workers deployed outside GitHub, each self-contained with its own README and `wrangler.toml`
- Key files: `mention-worker/worker.js` (conditional-request notification polling, deny-only fail-open pre-filter, `repository_dispatch` relay), `cron-probe/worker.js` (a canary for the cron-trigger outage, delete when it starts firing)

**`docs/`:**
- Purpose: The deep documentation: `getting-started.md`, `design.md` (principles, execution map, split-trust model, update doctrine), `configuration.md`, `customization.md`, `security.md`, `workflows/*.md`

## Key File Locations

**Entry Points:** `.github/workflows/*.yml`, all 10 workflows; GitHub events and dispatches start here. The comment path always enters via `agent-router.yml`.
**Core Logic:** `.github/scripts/*.sh` (identity/triggers, routing, scrubbing, context assembly, prompt assembly, verification; `.github/actions/bot-setup/action.yml`) token minting and config lifecycle.
**Configuration:** Secrets and variables live in GitHub (not in the repo); behavior knobs are variables (`AGENT_PAUSED`, `AGENT_PAUSED_PARTS_JSON`, `BOT_IDENTITIES`, `BOT_TRIGGERS`, `CONTEXT_LIMITS_JSON`, `AGENT_MODELS_JSON`, `OPEN_TRIGGERING`, `OPENCODE_PLUGINS_JSON*`, roster/filter lists, see `docs/configuration.md`). The committed config surface is `.github/actions/bot-setup/permissions.example.json` (full-config template) and per-workflow `env:` knob blocks (e.g. `MAINTAINED_BASE_BRANCHES` in `pr-review.yml`, `FILE_GROUPS_JSON` in `compliance-check.yml`, `DIFF_SPLIT_BYTES` diff split threshold). `custom_providers.json` is local test input only.
**Tests:** `.github/scripts/scrub-fixtures.sh` (231 security fixtures covering the scrub, roster transforms, router decision matrix, mention/discussion pipelines, and permission-profile deny patterns) and `.github/scripts/prompt-rule-fixtures.sh` (393 pinned prompt rules), wired to CI via `.github/workflows/scrub-fixtures.yml`. Local: `test-config.py` emulates secrets/inputs and writes to `test_results/`.

## Naming Conventions

**Files:** `kebab-case` everywhere, with type-signaling extensions: workflows are named for their function (`pr-review.yml`, `bot-reply.yml`), scripts end in `.sh`, prompt parts are bare `.md` nouns (`severity.md`, `error-handling.md`), manifests carry `.manifest` and mirror their mode name (`pr-review-first.manifest` ↔ mode `pr-review-first`).
**Directories:** `kebab-case` (`bot-setup`, `mention-worker`); `.github` subdirectories are fixed by convention (`workflows/`, `actions/`, `scripts/`, `prompts/`).

## Where to Add New Code

**New agent behavior:** `.github/prompts/parts/<new-part>.md`, then reference it from the relevant `.github/prompts/manifests/*.manifest` files; a part edit propagates to every mode that lists it; if the wording is load-bearing, pin it in `prompt-rule-fixtures.sh` and run `bash .github/scripts/assemble-prompt.sh --verify` before committing.
**New agent mode:** create a `.github/prompts/manifests/<mode>.manifest` ordering existing (and new) parts; verify with `bash .github/scripts/assemble-prompt.sh --list`.
**New shared script:** `.github/scripts/<kebab-name>.sh`, start from an existing script's contract header (env in/out, files, exit semantics); never interpolate untrusted text into the shell except via `env:`.
**New workflow:** `.github/workflows/<name>.yml`; dispatch-only agent workflows must declare the phantom-suppressing never-matching `push` trigger and runtime input validation (see `pr-review.yml`); anything `pull_request`-triggered must stay zero-secret with no checkout. Never add `pull_request*` triggers to agent workflows.
**New composite action:** `.github/actions/<action-name>/action.yml`; keep it secrets-free if it can ever run on a base branch.
**New external worker:** `tools/<worker-name>/` with `worker.js` + `wrangler.toml` + README; follow the mention-worker pattern: pre-filters are deny-only and fail-open, and never hold authority (re-verify every relayed field in-repo).
**New fixtures/tests:** extend `.github/scripts/scrub-fixtures.sh` (scrub/roster/permissions) or `.github/scripts/prompt-rule-fixtures.sh` (prompt rules); the CI battery picks them up automatically.
**Local admin tooling:** repository root as Python (`*.py`), used by humans only; nothing in CI may depend on root scripts.
