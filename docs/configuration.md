# Configuration reference

Every knob the platform reads, with syntax, examples, and the reasoning. Two shelves: **variables** (non-sensitive tuning, editable in repo settings without re-encrypting anything) and **secrets** (credentials and anything sensitive).

## Variables

Set under `Settings → Secrets and variables → Actions → Variables`:

```bash
gh variable set AGENT_PAUSED -R <owner>/<repo> --body "true"
```

**Variable formats follow one doctrine** (so every knob reads the way its data is shaped):

| Data shape | Format | Examples |
|---|---|---|
| Lists of simple tokens (logins, stems) | comma-separated | `BOT_IDENTITIES`, `BOT_TRIGGERS`, `TRUSTED_AGENT_USERS`, `FOREIGN_MENTIONS_USERS`, `CONTEXT_IGNORE_AUTHORS` |
| Lists whose elements can contain commas or quotes (regex) | JSON array | `CONTEXT_FILTER_PATTERNS_JSON` |
| Maps (key to value, nested) | JSON object | `CONTEXT_LIMITS_JSON`, `AGENT_MODELS_JSON` |
| Prefilled editable menus (flip, don't construct) | JSON object, seeded by Bootstrap | `AGENT_PAUSED_PARTS_JSON` |
| Scalars | plain string | booleans like `AGENT_PAUSED`, integers like `PREVIOUS_BOT_REVIEWS_COUNT` |

A `_JSON` suffix appears only on variables that actually are JSON.

### `AGENT_PAUSED`
**Default:** `false` (seeded). **Type:** kill switch.

`true` pauses the agent's brain: the router dispatches nothing, the mention poller stays silent, and all four agent workflows skip with a visible gray "skipped" (manual dispatches included). What keeps running: the PR Review Trigger stub and Compliance Gate, so open PRs keep their pending merge-blocker status; **pausing never makes a PR mergeable**.

*When to use it:* incidents, migrations, "the bot is being weird and I want it quiet while I look." Flip back to `false` (or delete the variable) to resume.

### `AGENT_PAUSED_PARTS_JSON`
**Default:** all `false` (seeded). **Type:** per-part pause.

```json
{ "pr-review": false, "bot-reply": false, "compliance-check": false, "issue-analysis": false }
```

Pause one agent part: `true` = that part skips visibly (gray), the router stops dispatching it, and its manual dispatches skip too. Missing keys (or the whole variable) mean *not* paused. Malformed JSON fails the run with a visible error: a broken kill switch must not be silently ignored. `AGENT_PAUSED` stays the global kill above all parts.

### `OPEN_TRIGGERING`
**Default:** `true` (seeded). **Type:** perimeter toggle.

By default any GitHub user may summon the agent on demand (mentions, `/review`, `/check`). Set `false` and those on-demand summons are accepted only from collaborators and [`TRUSTED_AGENT_USERS`](#trusted_agent_users) members; everyone else gets a visible decline notice and nothing dispatches. Automatic paths stay open either way: PR auto-reviews, new-issue analysis, and cross-repo mentions (those carry their own `FOREIGN_MENTIONS_USERS` allowlist). The check costs no API calls: the author association arrives with the event itself.

*When to use it:* public repos where you want the agent reviewing PRs but not answering strangers' questions; incident mode alongside `AGENT_PAUSED` (which silences everything, this only gates the front door).

### `BOT_IDENTITIES`
**Default:** seeded by Bootstrap, the account login in account mode, the stock names in app mode. **Type:** comma-separated logins.

**Who the agent is**: the logins treated as *self* by loop guards, review attribution, FIRST/FOLLOW-UP markers, and footer verification. A comma-separated list. List **only identities you control**: an account login, plus an app login *only if you registered that app*:

```
mybot, mybot[bot]
```

**The `[bot]` twin is never assumed.** GitHub app slugs and usernames are *separate namespaces*: someone else can register an app named exactly like your account. The platform therefore never synthesizes a `name[bot]` twin from your account name: an app identity is trusted only when you list its **full name including `[bot]`** in this variable (that listing is your explicit claim that you control that app). A wrong twin here would make the agent adopt a stranger's reviews as its own previous work; it is the most dangerous silent misconfiguration there is.

Resolution at runtime: this variable (comma-separated; logins cannot contain commas, which is why this one is a plain list) **∪** the account login detected live via the API (account mode, credential-proven, so a rename self-heals instantly). The stock fallback (`mirrobot-agent, mirrobot-agent[bot]`) applies only when both are absent; both are identities this project verifiably controls. Bare `mirrobot` is *not* an identity (the username is taken; a spoofed account must never be treated as self); it remains a trigger word.

### `BOT_TRIGGERS`
**Default:** `mirrobot, mirrobot-agent` (seeded). **Type:** comma-separated raw stems.

**What summons the agent.** Raw names, no `@` or `/` prefixes; the prefixes are the derivation. Every stem yields:

- `@<stem>`, mention routing
- `/<stem>-review` and `/<stem>_review`, review command
- `/<stem>-check` and `/<stem>_check`, compliance command

So the default value gives you `@mirrobot`, `@mirrobot-agent`, `/mirrobot-review`, `/mirrobot-agent-review`, `/mirrobot-check`, `/mirrobot-agent-check`, all working. Setting the variable **replaces** the set: rename your bot by setting `BOT_TRIGGERS="mybot"` and the mirrobot words stop routing. When unset, stems derive from the resolved identity (account mode answers to its account name); when nothing is set anywhere, the mirrobot words apply.

### `CONTEXT_LIMITS_JSON`
**Default:** *(full budget template, seeded)*. **Type:** context budget.

```json
{
  "comments": 30,
  "reviews": 15,
  "own-reviews": 5,
  "threads-per-review": 25,
  "thread-comments": 10,
  "orphan-threads": 20,
  "orphan-thread-comments": 10
}
```

How much thread context the agent reads, per fetch:

| Key | Controls |
|---|---|
| `comments` | Conversation comments (the flat PR/issue discussion), newest first |
| `reviews` | Review objects (verdict submissions), newest first |
| `own-reviews` | **Safeguard:** the agent's own newest reviews are *always* included, even beyond the `reviews` window, so its memory of its own findings never falls out |
| `threads-per-review` | Inline (code-anchored) threads allocated per fetched review |
| `thread-comments` | Replies per fetched thread (oldest dropped) |
| `orphan-threads` | Review-less threads ("Add single comment" notes), newest first |
| `orphan-thread-comments` | Replies per orphaned thread |

Everything is *up to*, newest-first, deduped. **Filter before cap, everywhere:** hidden (minimized) content never consumes a slot; resolved/outdated content never does outside the elevated block; and the fetch itself overfills each window (3x) with a cursor catch-up page when noise truncates one, so the numbers below count *content shown*, never content wasted on filtered posts. Lower the numbers on noisy repos for smaller first prompts; this is the primary cost knob alongside per-agent models. Malformed JSON: warning + per-key defaults (a broken knob is visible, not fatal).

**Two knobs that sound alike, one distinction:** `own-reviews` (here) is how many of the agent's own reviews are *fetched at all*, the always-include safeguard. `PREVIOUS_BOT_REVIEWS_COUNT` is how many of those render *unfiltered* (the elevated block). Fetch more, elevate fewer.

### `AGENT_MODELS_JSON`
**Default:** empty template (seeded). **Type:** per-agent model overrides.

```json
{
  "pr-review":        { "model": "anthropic/claude-sonnet-4", "fast": "anthropic/claude-haiku-4" },
  "bot-reply":        { "model": "openai/gpt-5" },
  "compliance-check": { "model": "anthropic/claude-sonnet-4" },
  "issue-comment":    { "model": "anthropic/claude-haiku-4" }
}
```

Rules:
- Empty string = not set → falls back to the global `OPENCODE_MODEL` secret. Missing keys: same fallback. Fill what you want, leave the rest.
- `"fast"` (optional) sets that agent's `small_model`. opencode uses `small_model` for session-title generation, so the override only matters for completeness.
- Malformed JSON **fails the run with a visible error**: never a silent global fallback.
- Model names never appear in any log; the run only says the override is active.
- Format is `provider/model`; the provider can be a **built-in** (anthropic, openai, …) when `OPENCODE_API_KEY` supplies its key, or an entry in your `OPENCODE_CONFIG_JSON`.

*When to use it:* one heavyweight reviewer + cheap triage is the classic split; also cost control after watching the per-run usage summaries.

### `OPENCODE_PLUGINS_JSON` (+ `_1` … `_5`)
**Default:** `{}` (seeded). **Type:** plugin files, without committing them.

```json
{ "myplugin/myplugin.js": "<the file's entire content, JSON-escaped>" }
```

Build the value without hand-escaping:

```bash
python -c "import json,pathlib;print(json.dumps({'myplugin/myplugin.js': pathlib.Path('myplugin.js').read_text()}))" \
  | gh variable set OPENCODE_PLUGINS_JSON -R <owner>/<repo> --body-file -
```

Then reference the materialized path in your `OPENCODE_CONFIG_JSON` secret's `plugin` array:

```json
"plugin": ["/home/runner/.mirrobot-plugins/myplugin/myplugin.js"]
```

Each variable may hold one plugin or several entries; `_1`..`_5` hold more. All merge; the same path in two variables is a hard error (a config mistake, always). Files land `chmod 600` outside the workspace, are permission-denied to the agent, and are **deleted seconds after opencode boots** (same lifecycle as the config). Relative paths only (no `/`, `..`, or spaces; unsafe paths fail the run). Remove the `plugin` entry when you remove a plugin: referencing a path nothing materializes is a boot error.

*When to use it:* private provider plugins (the router that must not be committed), anything opencode loads from a path.

### `TRUSTED_AGENT_USERS`
**Default:** absent (= empty). **Type:** comma-separated logins.

Everyone who is a direct collaborator **already counts as friendly**: this variable only *adds* to that list (people who don't have write access but whose asks should carry friendly context in the agent's judgment). A trust *signal*: the agent still evaluates risk on its own; this never bypasses its judgment.

```bash
gh variable set TRUSTED_AGENT_USERS -R <owner>/<repo> --body "alice,bob"
```

### `CONTEXT_IGNORE_AUTHORS`
**Default:** absent (= empty). **Type:** comma-separated logins.

Posts from these logins never enter the agent's thread context at all; use this to exclude another bot you never want the agent reading. `[bot]` suffixes work.

### `CONTEXT_FILTER_PATTERNS_JSON`
**Default:** baked AI-reviewer noise defaults. **Type:** JSON array of case-insensitive regexes.

Any match on a post's **body** drops that post from thread context. Setting the variable **replaces** the baked defaults (which target only known noise classes: CodeRabbit rate-limit/skip/too-many-files posts, "No actionable comments" notices, Greptile's status channel, substantive reviews from those same tools survive).

```json
["skip rationale I never want", "^<!-- deploy-status -->", "stale-bot marker [0-9]+"]
```

Regex metacharacters work; backslashes double as JSON escapes. Malformed JSON falls back to the defaults with a workflow warning.

### `PREVIOUS_BOT_REVIEWS_COUNT`
**Default:** `1` (seeded). **Type:** integer.

How many of the agent's own **newest** PR reviews are *elevated*, included unfiltered (only resolved/outdated markers are bypassed; hidden content stays hidden even here). This is the agent's working memory of its latest findings. Older own reviews are **not lost**: they still appear in the filtered history block (resolved/outdated/hidden threads dropped). Raise to `3` on long-lived PRs with many rounds for deeper unfiltered memory of its own feedback.

### `FOREIGN_MENTIONS_ENABLED`
**Default:** `false` (seeded). **Type:** cross-repo master switch.

Must be exactly `true` to arm the mention poller. Everything guest-mode: [workflows/mention-poller.md](workflows/mention-poller.md).

### `FOREIGN_MENTIONS_USERS`
**Default:** absent (= empty). **Type:** comma-separated logins.

Who may summon the agent *cross-repo* (unioned with home collaborators, owner included). Separate from `TRUSTED_AGENT_USERS`: cross-repo summoning is its own, stricter privilege; home trust does not travel.

## Secrets

`Settings → Secrets and variables → Actions → Secrets`. Minimal set: `OPENCODE_MODEL` + `OPENCODE_CONFIG_JSON` + one identity pair.

### `OPENCODE_MODEL`
Main model, `provider/model` (e.g. `anthropic/claude-sonnet-4`). Overrides any `model` key in your config; per-agent overrides (above) beat this.

### `OPENCODE_CONFIG_JSON`
Your complete [OpenCode config](https://opencode.ai/docs/config), minified to one line: providers (with models and API keys), `small_model`, agents, MCP servers, the `plugin` array, and the `permission` profile. Start from the committed template `.github/actions/bot-setup/permissions.example.json`: it's a full-config example with a placeholder provider, an MCP entry, a plugin reference, and the recommended permission block.

```bash
python minify_json_secret.py my-config.json   # RFC 8259-strict minifier
gh secret set OPENCODE_CONFIG_JSON -R <owner>/<repo> < my-config.min.json
```

Runtime lifecycle: written `chmod 600`, every credential leaf inside it (provider API keys, MCP header values, credential-bearing URLs) registered with `::add-mask::` so no later step can echo one, then **deleted seconds after opencode boots** (opencode reads the config once at startup; the fixture suite verifies deletion mid-session is safe). bot-setup warns when the secret's permission block drifts from the committed example. The warning is informational; the secret always wins.

### `OPENCODE_API_KEY` (optional)
API key for the main model's provider, injected as `provider.<main>.options.apiKey`. Redundant when the key lives inside your config (recommended).

### `OPENCODE_FAST_MODEL` (optional)
Global `small_model`, used for session-title generation. Per-agent `"fast"` overrides beat this.

### Identity pair, exactly one of:

| | Secret(s) | Notes |
|---|---|---|
| **Account mode** (recommended) | `ACCOUNT_GH_TOKEN` | Classic PAT of the bot account, `public_repo` scope **only**. The `workflow` scope is hard-rejected (it would remove GitHub's workflow-push backstop); missing `public_repo` fails; a broken token fails fast, never silently falls back. Add `notifications` + `actions:read` when enabling cross-repo guest mode. |
| **App mode** | `BOT_APP_ID` + `BOT_PRIVATE_KEY` | Full PEM contents including BEGIN/END lines. App permissions: Contents read-only, Issues read/write, Pull requests read/write; Variables: write if you want Bootstrap to seed via the App. |

Present account token → account mode; else App pair → app mode; else workflows fail with a clear error.

### `SHARE_LINK_PUBKEY` (optional)
RSA **public** key (PEM) for encrypted session share links. Without it, share URLs are still captured and masked but not recoverable. One-command setup: `python decrypt_share_link.py setup` (generates the pair, sets the secret, keeps the private key locally). See [security.md](security.md#encrypted-share-links).

## Interaction cheatsheet

| Want | Set |
|---|---|
| Different model per agent | `AGENT_MODELS_JSON` |
| Quieter/cheaper triage | `issue-comment` entry in the same variable |
| Smaller first prompts on noisy repos | `CONTEXT_LIMITS_JSON` |
| Mute another bot entirely | `CONTEXT_IGNORE_AUTHORS` |
| Drop a recurring noise post | `CONTEXT_FILTER_PATTERNS_JSON` (remember: replaces defaults) |
| Stop everything safely | `AGENT_PAUSED=true` |
| Stop just one part (e.g. reviews) | `AGENT_PAUSED_PARTS_JSON` |
| Rename the bot | `BOT_IDENTITIES` + `BOT_TRIGGERS` |
| Private plugin | `OPENCODE_PLUGINS_JSON` + `plugin` path in the config |
| Agent follows me into other repos | `FOREIGN_MENTIONS_ENABLED` + `FOREIGN_MENTIONS_USERS` + PAT scopes + the worker |
