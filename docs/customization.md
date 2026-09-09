# Customization

Everything that's *yours* (behavior prose, watch-lists, permissions, identities, trigger words) and how to change each without breaking the machinery around it.

## Prompts

All agent behavior prose lives in `.github/prompts/parts/*.md`, there is no prompt text in the workflows. A **manifest** (`.github/prompts/manifests/<mode>.txt`) is an ordered list of part names, and a mode's full prompt is exactly those parts concatenated, then `envsubst`ed with the run's context variables.

```
parts/security-brief.md        ← every session starts here
parts/on-topic-guardrail.md    ← off-topic deflection
parts/severity.md              ← the 🔴🟠🟡🔵 ladder (every mode)
parts/mission-review.md        ← the reviewer's identity and judgment rules
manifests/pr-review-first.txt  ← = the FIRST-review assembly
```

Workflows call `bash /tmp/assemble-prompt.sh <mode> | envsubst "$VARS"`. The assembler is fail-closed (a manifest naming a missing part kills the run) and `--verify`-able (no orphan parts, no duplicate headings).

### What to edit

| You want to change | Edit |
|---|---|
| Review judgment, thresholds, verdict wording | `parts/mission-review.md` + the `protocol-*` parts |
| The agent's personality in conversations | `parts/mission-agent.md`, `parts/communication.md` |
| Compliance checklist scope (beyond FILE_GROUPS) | `parts/mission-compliance.md` |
| Security posture / refusals | `parts/security-brief.md` (carefully, it's read first, every session) |
| Severity ladder wording | `parts/severity.md` |

### Rules of the road

- **Shared parts are shared byte-for-byte.** If two modes need different rules, that's *two parts*, not one part with mode-dependent prose. This is what keeps duplicated guidance from drifting apart.
- **Battery pins cover the prompt rules.** After editing parts, run `bash .github/scripts/prompt-rule-fixtures.sh`. If a pin fails, you changed pinned behavior, update the pin in the same commit *because you decided to*, not to make it shut up.
- **Render any mode's full prompt yourself** (`bash .github/scripts/assemble-prompt.sh <mode>`) to read exactly what the agent will read.
- Envsubst variables are per-mode whitelists in the workflow (`VARS='...'`), a new `$SOMETHING` in a part needs the variable added to the mode's list, or it ships literally.

## The compliance watch-list

`FILE_GROUPS_JSON` in `compliance-check.yml`'s env block, the platform's most repo-specific knob. Each group: a name, a **description of what the agent should verify**, and file globs:

```json
[
  {
    "name": "Auth surface",
    "description": "When auth code changes, verify docs/auth.md and the .env.example var table were updated together, and no new endpoint skips the middleware list.",
    "files": ["src/auth/**", "middleware/auth*.py"]
  }
]
```

The description is the actual instruction, write it like you'd brief a new maintainer. Globs are matched against the PR's changed files; each matching group becomes a checklist item in the audit.

## The permission profile

Lives inside your `OPENCODE_CONFIG_JSON` (the committed `permissions.example.json` is the template, a full-config example whose `permission` block you paste in). Shape: a `bash` deny-catch-all with ordered allows, targeted denies last (OpenCode is **last-match-wins**: an allowlist without the catch-all is cosmetic), plus `read`/`edit`/`webfetch`/`websearch`/`skill` rules. The example's comments explain each deny. Two invariants:

- `webfetch: deny` for a reason (agents use `websearch` + their judgment; webfetch burns tokens).
- The `~/.config` and `~/.mirrobot-plugins` read-denies are load-bearing, they're what makes the config/plugin lifecycle airtight. If you loosen them, you're reopening the window the deletion timer closes.

bot-setup warns when your secret's permission block drifts from the example, refresh consciously.

Known limit: substring permission rules are advisory whenever an *interpreter* is allowed. This deployment allows `python`/`python3` (the platform's home repos are Python); a determined session could construct forbidden strings inside a `python -c` one-liner. The interpreter is a deliberate per-repo tradeoff (see below); the profile closes the cheap paths; the security brief's refusal rules and the deny-is-a-signal doctrine carry the rest.

## Adapting the platform to your repo

The platform is configurable **and** universal, but it is not zero-edit for every repo: some surfaces are *repo adaptations* you make by editing committed code, not variables. That is just how it is: variables tune behavior; the surfaces below define what your repo *is*.

| Surface | File(s) you edit | What adapts |
|---|---|---|
| **Language toolchain** | `permissions.example.json` → your `OPENCODE_CONFIG_JSON` | The `bash` allows. Stock allows `python`/`python3`/`pytest`/`uv`/`pip` because this platform's home repos are Python. A Node repo wants `node`/`npm`/`npx`/`yarn`; Go wants `go`/`gofmt`; swap accordingly, keeping the deny-catch-all and targeted denies intact. |
| **Compliance watch-list** | `FILE_GROUPS_JSON` env in `compliance-check.yml` | Which file groups must stay mutually consistent (docs vs code vs config). |
| **Diff budgets** | `DIFF_MAX_BYTES` env in the diff-generating steps | How much diff the agent is fed. |
| **Scrub trust branches** | `AUTOLOAD_BRANCHES` in `scrub-workspace.sh` | Which branches vouch for auto-load content, `main dev` by default; the taint anchor is main-only. |
| **Maintained base branches** | `MAINTAINED_BASE_BRANCHES` env in `pr-review.yml` | Which PR targets count as "maintained" for trust-context wording. |
| **CI integration** | `scrub-fixtures.yml` paths filter | Which paths trigger the battery. |
| **Prompt voice** | `parts/*.md` | The agent's tone and procedures, per-repo flavor is expected, pinned wording is not. |

What you should **not** need to edit: the router mechanics, the scrub algorithm, the share filter, bot-setup's identity logic, the fixture suite (except pins that reference renamed stock identities). Per [What NOT to customize per-repo](#what-not-to-customize-per-repo), a per-repo fork of the security boundary rots.

## Renaming the agent

If "mirrobot" isn't your bot's name, it's **two variables and a sweep**; the machinery derives itself:

1. **`BOT_IDENTITIES`** (who the agent *is*: `mybot, mybot[bot]`, i.e. your account login and, **only if you registered that app**, its full `[bot]` login; the twin is never assumed; see [configuration](configuration.md#bot_identities)). Loop guards, review attribution, and footer verification match this set case-insensitively. In account mode the login is also detected live from the token, so renames take effect immediately; the variable covers the rest and app-mode installs.
2. **`BOT_TRIGGERS`** (what *summons* it): raw stems like `mybot`; every stem derives `@mybot`, `/mybot-review`, `/mybot-check` automatically (see [configuration](configuration.md#bot_triggers)). Multiple stems are fine.
3. **Prompt prose**: parts refer to the agent by name; a sweep of `mirrobot` → your name in `parts/` keeps the voice consistent.
4. **The worker** (if guest mode) needs nothing; it derives the account login from its own token.

That is the whole hard surface: Git attribution is derived from the account/App automatically. The battery pins reference `mirrobot-agent` as the stock fallback; if you're maintaining a fork of the platform itself, update the fallbacks in `bot-config.sh` and the fixture pins in the same commit.

**One nuance:** cross-repo guest summons key off the *identities* (the account is what gets mentioned abroad), not the trigger stems; after a rename, set `BOT_IDENTITIES` even if your triggers differ.

**Name vs identity, preserved everywhere:** a *name* is what people type (`@mirrobot` routes); an *identity* is a login the agent treats as itself. Bare `mirrobot` is a trigger word, never an identity; a user who registers that username is not the agent.

## Trigger words

All trigger words derive from the `BOT_TRIGGERS` variable (see [renaming](#renaming-the-agent) and [configuration](configuration.md#bot_triggers)); routing itself lives in one place, `.github/scripts/route-comment.sh`, which builds the match matrix from the stems. The stub's label gate is the literal `Agent Monitored` in `pr-review-trigger.yml`. The mention matching is loose (substring); tighten it in `route-comment.sh` if you'd rather, at the cost of stricter typo tolerance.

## The informational page & badge

`docs/index.html` is a self-contained landing page (published via GitHub Pages from `docs/` on `main`), and `docs/badge.svg` is the **Ask Mirrobot** badge with the bot avatar embedded. Fork-relevant edits:

- The `REPOS` array near the top of the page script is the "home repositories" list powering the live-activity strip and its stat line — point it at the repos your deployment actually runs in (public repos only; the strip reads GitHub's public API from the visitor's browser, unauthenticated).
- Badge links should carry your deployment's bot name as `?bot=YOUR-BOT-NAME` — the page then tells visitors who to mention back home instead of assuming this repo's identity. A `?repo=owner/name` param is also understood and shown as origin context.
- The rotating status lines, FAQ, and excerpt cards are curated content — edit them freely; keep quotes real.
- If you don't want the site at all, disable GitHub Pages in repo settings and delete the two files; nothing else depends on them.

## Adding a whole new mode

If you need a genuinely new agent kind (say, a release-notes writer): add a `mission-*` part, a manifest naming it plus the shared parts, a workflow modeled on the existing dispatch-only ones (bot-setup → context fetch → assembly → session → verify), a router matrix row in `route-comment.sh`, and fixture pins for the new manifest. The stub/gate/router need no changes; dispatch is generic.

## What NOT to customize per-repo

The scrub, the router mechanics, the share filter, the fixture suite, bot-setup. These stay consistent across repos; they are the security boundary, and a per-repo fork of it drifts from the real one. If something in them doesn't fit your repo, that's a platform change: make it here, carry it everywhere.
