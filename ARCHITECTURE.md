# Architecture

*What the code is*: the map of layers, entry points, and flows. The *why* (principles, doctrine, reasoning) lives in [`docs/design.md`](docs/design.md).

## Pattern Overview

**Overall:** Event-driven, dispatch-routed GitHub Actions agent platform. GitHub events wake small zero-secret dispatcher workflows, which route to privileged agent workflows that always execute from the default branch and hand the actual work to an [OpenCode](https://opencode.ai) LLM session.

**Key Characteristics:**
- **Privileged execution from the default branch only**: everything that *thinks* (agents, prompts, scrub, routing) runs from `main` on every PR; the only `pull_request*`-triggered workflows (`pr-review-trigger.yml`, `compliance-gate.yml`) are zero-secret, no-checkout marker/dispatcher stubs, so a tampered PR branch cannot redefine the pipeline that reviews it
- **PR content is only ever data**: comment bodies, PR titles, and file contents reach shells only through environment variables, never `${{ }}` interpolation
- **Split-trust workspace scrub**: auto-load content (e.g. `AGENTS.md`, `.claude/`) survives only when its bytes match a state a trust branch (`main` ∪ `dev`) shipped; `.github` platform changes trigger a taint alarm anchored to `main` alone
- **Prompts are parts**: 33 instruction parts assembled per mode (13 manifests) by a fail-closed assembler; load-bearing wording is pinned by CI fixtures
- **Dual identity, automatic**: `ACCOUNT_GH_TOKEN` present selects account mode; otherwise `BOT_APP_ID` + `BOT_PRIVATE_KEY` selects App mode; neither fails fast
- **Configurable identity & summons**: the agent knows who it is and what summons it from `BOT_IDENTITIES` ∪ the live `/user` login (account mode), and answers to trigger stems from `BOT_TRIGGERS` (derived into `@stem`, `/stem-review`, `/stem-check`); the stock names apply only when nothing is set
- **Graceful pause ladder**: one kill switch (`AGENT_PAUSED`) plus per-part switches (`AGENT_PAUSED_PARTS_JSON`); the status stubs deliberately keep running so a paused agent never makes a PR mergeable
- **Batteries in CI**: 193 security fixtures + 339 pinned prompt rules run on every `.github/` change, so drift turns CI red

## Layers

**Event & Dispatch Layer:**
- Purpose: Wake on GitHub events, decide whether an agent should act, and dispatch exactly one privileged workflow per trigger, with zero secrets and zero checkouts
- Location: `.github/workflows/` (the dispatcher subset: `agent-router.yml`, `pr-review-trigger.yml`, `compliance-gate.yml`)
- Contains: Workflow YAML plus one shared routing script (`route-comment.sh`)
- Depends on: GitHub `issue_comment`/`pull_request` events, `workflow_dispatch` API via `GITHUB_TOKEN` (the documented token-recursion exception)
- Used by: Every entry into the agent layer

**Agent Workflow Layer:**
- Purpose: The privileged workflows that assemble context, run the LLM session, and post verified output (reviews, replies, compliance reports)
- Location: `.github/workflows/` (`pr-review.yml`, `bot-reply.yml`, `compliance-check.yml`, `issue-comment.yml`, plus support workflows `mention-poller.yml`, `agent-bootstrap.yml`, `scrub-fixtures.yml`)
- Contains: Dispatch-only workflow YAML with editable knob blocks, inline verification steps
- Depends on: Composite actions (`.github/actions/`), scripts (`.github/scripts/`), prompt doctrine (`.github/prompts/`), the `OPENCODE_*` secrets
- Used by: The dispatch layer, GitHub schedules, manual dispatch

**Shared Machinery Layer:**
- Purpose: All reusable logic, identity/token minting, bot identity+trigger resolution, workspace scrub, context assembly, routing, reactions, share-link filtering, config cleanup
- Location: `.github/scripts/` (13 bash scripts) and `.github/actions/` (2 composite actions: `bot-setup/`, `requester-context/`)
- Contains: Bash scripts with strict env-contract headers; composite action YAML
- Depends on: `gh` CLI, `git`, `jq`, env variables only (never event payloads interpolated)
- Used by: All agent workflows and some CI fixtures (`scrub-fixtures.sh` tests `scrub-workspace.sh` + `fetch-roster.sh` directly)

**Prompt Doctrine Layer:**
- Purpose: The agent's behavior, as composable prose
- Location: `.github/prompts/`, `parts/` (33 files), `manifests/` (13 files), `security-brief.md`, `guest-rules.md`
- Contains: Markdown instruction parts; manifest files listing part names in assembly order
- Depends on: Nothing (pure content); resolved by `assemble-prompt.sh`
- Used by: All four agent workflows; pinned by `prompt-rule-fixtures.sh`

**External Workers Layer:**
- Purpose: Cross-repo mention intake (moves polling off GitHub Actions so Actions run only when something happened) and a cron-health canary
- Location: `tools/mention-worker/`, `tools/cron-probe/` (Cloudflare Workers, deployed with `wrangler`)
- Contains: `worker.js`, `wrangler.toml`, per-tool README
- Depends on: Cloudflare Durable Object alarms (not Cron Triggers, see the cron-probe canary story), GitHub notifications API, `repository_dispatch`
- Used by: `mention-poller.yml` (its relay mode), but the worker holds zero authority: it may only decline-on-positive-evidence or relay; every field is re-verified in-repo

**Admin-Side Tooling Layer:**
- Purpose: Local (non-CI) utilities for the repository operator
- Location: Repository root (`decrypt_share_link.py`, `minify_json_secret.py`, `test-config.py`)
- Contains: Python scripts, share-link keygen/decrypt TUI, JSON→single-line secret minifier, config emulator/test harness
- Depends on: Python 3, `openssl` on PATH (decrypt tool), `gh` CLI (setup mode)
- Used by: Humans only; nothing in CI imports these

## Data Flow

**Comment Routing (one comment → one run):**
1. `issue_comment[created]` wakes `agent-router.yml` (default-branch by GitHub rule) with a generic bot guard on the job `if`; exact identity membership is checked in the routing step after `bot-config.sh` resolves the identity set
2. Comment body is parsed once by `.github/scripts/route-comment.sh` against the stem-derived trigger matrix (trigger words inside quotes/code fences are ignored); text arrives via `env:`, never interpolation
3. Router dispatches matching targets (`pr-review.yml`, `bot-reply.yml`, `compliance-check.yml`) by comment id; targets re-fetch the comment from the API by id, so author/body never arrive from dispatch inputs
4. Routing decisions are logged to the run step summary; the router run is the audit trail

**PR Review (the life of a review):**
1. PR event → `pr-review-trigger.yml` stub (runs from the PR's **base branch**, zero secrets, no checkout) decides if a review is wanted and posts the pending merge-blocker status; declined events dispatch nothing
2. Dispatch → `pr-review.yml` (runs from `main`): runtime input validation, fast "eyes" reaction in account mode, identity minting via `.github/actions/bot-setup/action.yml`
3. `scrub-workspace.sh` scrubs the workspace **before** any PR checkout; split-trust rules quarantine untrusted auto-load content to `/tmp/scrub-quarantine/` and raise the `.github` taint alarm (evil-merge safe)
4. Context assembly: `.github/scripts/fetch-pr-discussion.sh` (three-block separation: previous bot reviews / older review history / thread context, with noise filtering), `.github/scripts/fetch-roster.sh` (trusted-people roster), requester-context action (factual trust line)
5. `generate-review-kit.sh` produces the diff files, review type (FIRST/FOLLOW-UP from the agent's own last review marker), and baked instruction sets under `/tmp/kit/<pr>/`
6. `.github/scripts/assemble-prompt.sh <manifest>` concatenates the mode's parts (fail-closed: a missing part exits 1 rather than sending a short prompt); caller pipes through `envsubst`
7. The OpenCode session (`opencode run --share`) does the work; concurrency groups serialize reviews per PR
8. Verification: footer/SHA checks with repair, `.github/scripts/react.sh` closes the reaction lifecycle, `.github/scripts/share-filter.sh` masks the raw share URL and republishes it RSA-OAEP-encrypted (`MRB1.<base64>`)

**Cross-Repo Mention (guest mode):**
1. GitHub turns mentions of the account / review requests in any public repo into account notifications
2. `tools/mention-worker/worker.js` polls via a self-rescheduling Durable Object alarm with conditional requests (`If-None-Match` → free 304 idle polls, 30-120s adaptive cadence), applies a deny-only **fail-open** pre-filter (bot-own identity derived from the cached `/user` login, requester allowlist, genuine-mention token); declines are acked and never wake Actions
3. Qualifying notifications relay via `repository_dispatch` → `mention-poller.yml` → `.github/scripts/handle-mentions.sh`, the **sole authority**: reason filter → skip matrix (platform-repos of the home owner are no-ops) → mark-read-before-dispatch → subject re-fetch from the API → bot-loop guard → summoner allowlist → genuine-mention verification (for review requests: trust the timeline *actor*, not the PR author) → per-run cap → `bot-reply.yml` in guest mode with `guest-rules.md` injected

**Compliance Gating:**
1. A stem-derived compliance command (default `/mirrobot-check`) → router → `compliance-check.yml` runs the merge audit and posts the `compliance-check` status + report (`FILE_GROUPS_JSON` in the workflow defines which files must stay consistent)
2. In parallel, `compliance-gate.yml` (base-branch stub) redundantly posts the pending status with backoff and **goes red** rather than letting a swallowed status POST make a PR look mergeable
3. Branch protection requires the `compliance-check` status; pausing the agent (globally or per part) never makes a PR mergeable because both stubs keep posting pending

## Key Abstractions

**Prompt part:**
- Purpose: One composable block of agent instruction prose
- Location: `.github/prompts/parts/*.md`
- Pattern: Plain markdown; referenced by name in manifests; a part edit propagates to every mode that uses it

**Mode manifest:**
- Purpose: The assembly order of parts for one agent mode (13 modes, e.g. `pr-review-first`, `bot-reply`, `agentlib-investigate`)
- Location: `.github/prompts/manifests/*.manifest`
- Pattern: One part name per line, `#` comments allowed; verified by `assemble-prompt.sh --verify` (no missing parts, no orphans, no duplicate headings outside code fences)

**Split-trust scrub:**
- Purpose: Keep PR content as data while still letting the agent read its own quarantined instructions
- Location: `.github/scripts/scrub-workspace.sh` (TRUST CONFIGURATION block), fixtures in `.github/scripts/scrub-fixtures.sh`
- Pattern: Two rules for two surfaces; auto-load files byte-matched against trust-branch states at-or-after each branch's fork floor (missing `dev` degrades to main-only; missing `main` fails closed = everything removed); `.github` changes flagged via taint alarm, never removed. Removals are logged **and** quarantined to `/tmp/scrub-quarantine/`; symlinked configs compare by resolved content

**Dual-identity bot-setup:**
- Purpose: One action that mints the session token (account PAT validated via `/user` and scope-gated (a `workflow` scope is a hard fail) or a short-lived App installation token), applies the model/layering rules to `OPENCODE_CONFIG_JSON`, and installs dependencies
- Location: `.github/actions/bot-setup/action.yml` (recommended permission profile: `permissions.example.json`)
- Pattern: Presence-of-secret selects the mode; per-agent model overrides resolved from the `AGENT_MODELS_JSON` variable via the `agent-key` input

**Identity & trigger resolution (bot-config.sh):**
- Purpose: One resolver for "who am I" and "what summons me", consumed by the router, the mention pipeline, the stub, and every loop guard
- Location: `.github/scripts/bot-config.sh`
- Pattern: Identities = `BOT_IDENTITIES` variable (comma-separated logins) ∪ the live `/user` login (account mode), with the stock names as fallback only when both are absent; trigger stems = `BOT_TRIGGERS` variable, else identity-derived, else the stock words; each stem derives `@stem`, `/stem-review`, `/stem-check` forms. No identity or trigger word is hardcoded in workflows, scripts, or the worker; a renamed or forked bot changes one variable

**Review kit:**
- Purpose: Self-serve review context for ANY PR, from any thread, used both by `pr-review.yml` and by the agent itself on demand ("review PR #42" from an unrelated issue)
- Location: `.github/scripts/generate-review-kit.sh`
- Pattern: Kit-scoped files under `/tmp/kit/<pr>/` (never clobbers the thread's own state); stdout `KIT RESULT` summary is the caller's selector

**Three-block discussion context:**
- Purpose: Single source of truth for what the reviewer remembers, its own newest N reviews (elevated: only resolved/outdated markers bypassed), older review history (fully filtered), and everything else (correlated, noise-filtered) plus orphaned inline threads
- Location: `.github/scripts/fetch-pr-discussion.sh`
- Pattern: Hidden/minimized content stays hidden everywhere (own content included); filtering happens *before* capping so filtered content never consumes fetch budget; the own-newest-reviews window is a safeguard that always applies even beyond the general review cap; all window sizes come from the `CONTEXT_LIMITS_JSON` variable; filter variables `CONTEXT_IGNORE_AUTHORS` / `CONTEXT_FILTER_PATTERNS_JSON` come from repo variables with baked AI-reviewer noise defaults

## Entry Points

**Agent Router:**
- Location: `.github/workflows/agent-router.yml`
- Triggers: any `issue_comment[created]` (single comment-trigger entrypoint, consolidates 3 former per-workflow triggers into 1 run per comment)
- Responsibilities: Parse once via `route-comment.sh`, dispatch exactly the matching agent workflow(s); log the decision to the step summary; compound comments dispatch all matches in parallel; a failing dispatch fails the run so the miss is visible

**PR Review Trigger (stub):**
- Location: `.github/workflows/pr-review-trigger.yml`
- Triggers: PR events (runs from the PR's **base branch**: the only privileged-adjacent execution that does not happen on `main`)
- Responsibilities: Zero-secret review-wanted decision + pending merge-blocker status; dispatches `pr-review.yml` only when a review is wanted

**PR Review:**
- Location: `.github/workflows/pr-review.yml`
- Triggers: `workflow_dispatch` only (router / stub / manual); `pull_request*` triggers are banned; an explicit never-matching `push` trigger (`branches-ignore: ["**"]`) suppresses phantom push runs (actions/runner#4001)
- Responsibilities: Full review pipeline, scrub, context, kit, assembled prompt, OpenCode session, footer verification/repair, verdict posting; per-PR concurrency group serializes auto + manual reviews

**Bot Reply on Mention:**
- Location: `.github/workflows/bot-reply.yml`
- Triggers: dispatch only (router, mention pipeline, manual)
- Responsibilities: The general agent, conversations, investigations, on-demand reviews (via the review kit), contributor strategy (branch → implement → self-review → PR, never touching `.github/workflows`), repository management; strategy instruction sets load on demand

**Issue Analysis:**
- Location: `.github/workflows/issue-comment.yml`
- Triggers: `issues[opened]` (plus manual `workflow_dispatch`)
- Responsibilities: Duplicate hunt, root-cause trace, labels, suggested fix

**Compliance Check / Compliance Gate:**
- Location: `.github/workflows/compliance-check.yml`, `.github/workflows/compliance-gate.yml`
- Triggers: dispatch (routed `/mirrobot-check`) / PR events (base branch)
- Responsibilities: End-of-life merge audit + status posting; the gate is the redundant second poster of the pending status, status insurance against API outages

**Mention Poller:**
- Location: `.github/workflows/mention-poller.yml`
- Triggers: `repository_dispatch` from the mention-worker, manual `workflow_dispatch` (on-demand poll), documented opt-in schedule
- Responsibilities: Runs the `handle-mentions.sh` gauntlet on relayed/polled notifications; single writer of notification read-state

**Agent Bootstrap:**
- Location: `.github/workflows/agent-bootstrap.yml`
- Triggers: `workflow_dispatch` (write access) only
- Responsibilities: One-time setup, seeds every variable with safe defaults/templates (never overwrites), including the identity/trigger defaults derived from the repo's own bot identity; prints the secrets checklist into the run summary; state-silent (logs can never reveal which variables or secrets exist)

**Scrub Fixture Suite:**
- Location: `.github/workflows/scrub-fixtures.yml`
- Triggers: any `.github/` change
- Responsibilities: The batteries, 193 security fixtures (`scrub-fixtures.sh`), 339 pinned prompt rules (`prompt-rule-fixtures.sh`), strict YAML validation

## Error Handling

**Strategy:** Fail closed, and make every decision auditable.

- **Fail-closed machinery:** the prompt assembler exits 1 naming the missing part (a silently short prompt must never reach an agent); the scrub removes everything when `main` cannot be established; missing tokens fail fast with a clear error, never a silent fallback
- **Fail-open only where denial is the danger:** the mention-worker pre-filter is deny-only and fails open (any uncertainty relays anyway), because the in-repo gauntlet is the authority and re-verifies everything
- **Redundancy over hope:** the compliance pending status is posted by two independent paths; the gate fails with a red job rather than letting a transient API outage make a PR look mergeable
- **Isolated dispatches:** one failing router target does not silently kill the remaining routes for compound comments, warn, record, keep routing, then fail the run if any dispatch failed
- **Platform-bug workarounds are explicit:** phantom push runs on dispatch-only workflows are suppressed with a never-matching push trigger + runtime input validation; `secrets`-in-`if` limitations are worked around via a derived job-env boolean
- **Graceful degradation with visible signals:** a missing trust branch (no `dev`) degrades to main-only scrubbing; roster API failure emits an explicit "unavailable" line plus a step-summary note instead of a fabricated roster; bootstrap without a usable bot token degrades to copy-paste instructions in the summary

## Cross-Cutting Concerns

**Secrets & masking:** Credential leaves inside `OPENCODE_CONFIG_JSON` (provider keys, MCP headers, credential-bearing URLs) are each `::add-mask::`ed at boot by bot-setup; the config is written `chmod 600` outside the workspace, and (together with any materialized plugin files (`OPENCODE_PLUGINS_JSON*` variables)) deleted seconds after opencode boots (once-at-boot semantics; `opencode-cleanup.sh` provides the waiter/now cleanup with an `if: always()` guarantee). Git auth rides an in-process extraheader, never `.git/config`; `persist-credentials: false` on every token-bearing checkout.

**No untrusted interpolation:** Untrusted text reaches shells only as environment variables; a pinned CI audit proves it. Dispatch inputs never carry requester content; targets re-fetch from the API by id.

**Share-link hygiene:** Session share URLs are masked, never logged raw, and re-published RSA-OAEP-encrypted with public context (repo, PR, head SHA, review type, run, actor); only the admin-side private key (`decrypt_share_link.py`, key never leaves the admin machine) recovers them.

**Auditability:** The router's step summary is the dispatch decision record; agent usage surfaces as a bare `opencode stats` report in the run summary (model stats stay hidden); reactions follow a mechanical workflow-owned lifecycle (`react.sh`) distinct from the agent's discretionary reactions.

**Documentation doctrine:** Deep documentation lives in `docs/` (`docs/design.md` is the principles and update doctrine; `docs/workflows/` has one page per workflow); the README stays the overview; `ARCHITECTURE.md` + `STRUCTURE.md` at the root mirror the current code state (layers, entry points, file inventory). Platform changes land on `main`; integration-branch sync rules for the two base-branch workflows are documented in the design doc.
