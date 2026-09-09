# Agent Bootstrap

One-dispatch setup: makes the platform's control panel *exist*.

**Triggers:** `workflow_dispatch` only; summoning requires write access, so arbitrary users cannot invoke it.
**Executes from:** the default branch. **Permissions: `{}`** (it grants GITHUB_TOKEN nothing).

## What it does

Creates every documented **variable** with its safe-off default or prefilled template:

`AGENT_PAUSED=false`, `AGENT_PAUSED_PARTS_JSON` (all four parts `false`), the empty `AGENT_MODELS_JSON` template, `BOT_IDENTITIES` (account mode: the /user-derived login; app mode: the stock fallback names; a flat comma list), `BOT_TRIGGERS="mirrobot, mirrobot-agent"` (both stems, showing the multi-stem shape, so `/mirrobot-review` and `/mirrobot-agent-review` both work), `CONTEXT_LIMITS_JSON` (the full context-budget template), `CONTEXT_FILTER_PATTERNS_JSON=[]`, `FOREIGN_MENTIONS_ENABLED=false`, `OPENCODE_PLUGINS_JSON={}`, `PREVIOUS_BOT_REVIEWS_COUNT=1`.

Then it seeds the **label vocabulary** (create-if-missing, same never-overwrite contract): the GitHub-standard kind labels, the agent's `severity: critical/major/minor/info`, triage states (`confirmed`, `as-designed`, `needs-info`, `needs-decision`, `already-fixed`, `accepted`, `wish`), and `Agent Monitored` (collaborator-only — the agent never applies it). A repo's existing labels are never touched; its own customs always outrank the seeded palette.

Then it writes a **static checklist** into the run summary: every variable with its meaning, every secret with where-to-get-it, the label vocabulary, and copy-paste `gh variable set` commands as the manual fallback.

Deliberately **not** created: the three empty-default variables (`CONTEXT_IGNORE_AUTHORS`, `TRUSTED_AGENT_USERS`, `FOREIGN_MENTIONS_USERS`), GitHub variables cannot hold empty values (the API rejects empty values with a 422, verified against a live run) and absence already means empty everywhere. Set them only when you have content.

## The token reality

GITHUB_TOKEN **cannot** reach the Actions variables API (even with `actions: write` it 403s with "Resource not accessible by integration"; the endpoint is reserved for user/installation tokens, verified against two live runs). So seeding authenticates with the repo's existing **bot identity**: `ACCOUNT_GH_TOKEN` when present, else the App installation token (the App needs its *Variables: write* permission granted). With neither (or when the token lacks access) the workflow still succeeds and prints the manual commands instead.

## State-silence

Logs and summary never reveal which variables or secrets exist, are missing, or hold what. Per-variable outcomes are never printed; the summary is static and identical on every repo. (It also *cannot* probe: the secrets API needs a user token no workflow here holds.) Re-running is always safe: existing values are left byte-for-byte intact, only absent ones are created.

## When it goes red

The seeding step failed with the bot token (usual cause: App without Variables:write). No values were modified; the summary carries the manual path.

## Testing it

Run it twice. First run: variables appear. Second run: instant success, zero changes; that is the never-overwrite contract working.
