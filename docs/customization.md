# Customization

Everything that's *yours* — behavior prose, watch-lists, permissions, identities, trigger words — and how to change each without breaking the machinery around it.

## Prompts

All agent behavior prose lives in `.github/prompts/parts/*.md` — there is no prompt text in the workflows. A **manifest** (`.github/prompts/manifests/<mode>.txt`) is an ordered list of part names, and a mode's full prompt is exactly those parts concatenated, then `envsubst`ed with the run's context variables.

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
| Security posture / refusals | `parts/security-brief.md` (carefully — it's read first, every session) |
| Severity ladder wording | `parts/severity.md` |

### Rules of the road

- **Shared parts are shared byte-for-byte.** If two modes need different rules, that's *two parts*, not one part with mode-dependent prose. This is what keeps duplicated guidance from drifting apart.
- **Battery pins cover the prompt rules.** After editing parts, run `bash .github/scripts/prompt-rule-fixtures.sh`. If a pin fails, you changed pinned behavior — update the pin in the same commit *because you decided to*, not to make it shut up.
- **Render any mode's full prompt yourself** (`bash .github/scripts/assemble-prompt.sh <mode>`) to read exactly what the agent will read.
- Envsubst variables are per-mode whitelists in the workflow (`VARS='...'`) — a new `$SOMETHING` in a part needs the variable added to the mode's list, or it ships literally.

## The compliance watch-list

`FILE_GROUPS_JSON` in `compliance-check.yml`'s env block — the platform's most repo-specific knob. Each group: a name, a **description of what the agent should verify**, and file globs:

```json
[
  {
    "name": "Auth surface",
    "description": "When auth code changes, verify docs/auth.md and the .env.example var table were updated together, and no new endpoint skips the middleware list.",
    "files": ["src/auth/**", "middleware/auth*.py"]
  }
]
```

The description is the actual instruction — write it like you'd brief a new maintainer. Globs are matched against the PR's changed files; each matching group becomes a checklist item in the audit.

## The permission profile

Lives inside your `OPENCODE_CONFIG_JSON` (the committed `permissions.example.json` is the template — a full-config example whose `permission` block you paste in). Shape: a `bash` deny-catch-all with ordered allows, targeted denies last (OpenCode is **last-match-wins** — an allowlist without the catch-all is cosmetic), plus `read`/`edit`/`webfetch`/`websearch`/`skill` rules. The example's comments explain each deny. Two invariants worth knowing:

- `webfetch: deny` on purpose (agents use `websearch` + their judgment; webfetch burns tokens).
- The `~/.config` and `~/.mirrobot-plugins` read-denies are load-bearing — they're what makes the config/plugin lifecycle airtight. If you loosen them, you're reopening the window the deletion timer closes.

bot-setup warns when your secret's permission block drifts from the example — refresh consciously.

## Renaming the agent

If "mirrobot" isn't your bot's name, it's **two variables and a sweep** — the machinery derives itself:

1. **`BOT_IDENTITIES_JSON`** — who the agent *is*: `["mybot", "mybot[bot]"]` (your account login and, if you have one, the App bot login). Loop guards, review attribution, and footer verification match this set case-insensitively. In account mode the login is also detected live from the token, so renames take effect immediately; the variable covers the rest and app-mode installs.
2. **`BOT_TRIGGERS`** — what *summons* it: raw stems like `mybot` — every stem derives `@mybot`, `/mybot-review`, `/mybot-check` automatically (see [configuration](configuration.md#bot_triggers)). Multiple stems are fine.
3. **Prompt prose** — parts refer to the agent by name; a sweep of `mirrobot` → your name in `parts/` keeps the voice consistent.
4. **The worker** (if guest mode) needs nothing — it derives the account login from its own token.

That's the whole hard surface. Git attribution is derived from the account/App automatically. The battery pins reference `mirrobot-agent` as the stock fallback — if you're maintaining a fork of the platform itself (not just deploying it), update the fallbacks in `bot-config.sh` and the fixture pins in the same commit.

**Name vs identity, preserved by design:** a *name* is what people type (`@mirrobot` routes); an *identity* is a login the agent treats as itself. Bare `mirrobot` is a trigger word, never an identity — a user who registers that username is not the agent.

## Trigger words

All trigger words derive from the `BOT_TRIGGERS` variable (see [renaming](#renaming-the-agent) and [configuration](configuration.md#bot_triggers)) — routing itself lives in one place, `.github/scripts/route-comment.sh`, which builds the match matrix from the stems. The stub's label gate is the literal `Agent Monitored` in `pr-review-trigger.yml`. The mention matching is deliberately loose (substring) — tighten it in `route-comment.sh` if you'd rather, at the cost of stricter typo tolerance.

## Adding a whole new mode

If you need a genuinely new agent kind (say, a release-notes writer): add a `mission-*` part, a manifest naming it plus the shared parts, a workflow modeled on the existing dispatch-only ones (bot-setup → context fetch → assembly → session → verify), a router matrix row in `route-comment.sh`, and fixture pins for the new manifest. The stub/gate/router need no changes — dispatch is generic.

## What NOT to customize per-repo

The scrub, the router mechanics, the share filter, the fixture suite, bot-setup. These are consistent across repos on purpose — they're the security boundary, and per-repo forks of a security boundary rot. If something in them doesn't fit your repo, that's a platform change: make it here, carry it everywhere.
