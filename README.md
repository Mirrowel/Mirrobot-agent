# Mirrobot Agent

> **Production-ready AI GitHub bot powered by [OpenCode](https://opencode.ai)**
> Automate issue analysis, PR reviews, compliance verification, and intelligent collaboration — completely free for open-source projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Powered by OpenCode](https://img.shields.io/badge/Powered%20by-OpenCode-blue)](https://opencode.ai)
[![GitHub Actions](https://img.shields.io/badge/Runs%20on-GitHub%20Actions-2088FF?logo=github-actions&logoColor=white)](https://github.com/features/github-actions)

---

## Why Mirrobot Agent?

Mirrobot Agent delivers enterprise-grade AI automation for GitHub — **perfect for open-source projects and small-to-medium teams** — without the cost or complexity of paid alternatives.

### ✨ Key Advantages

| Feature | Mirrobot Agent | Paid Alternatives (Ellipsis, etc.) |
|---------|----------------|-------------------------------------|
| **Cost for Open Source** | **FREE** (GitHub Actions minutes free on public repos) | $10-50+/user/month |
| **Infrastructure Required** | None — runs on GitHub Actions | SaaS only, or self-hosted servers |
| **LLM Provider** | Any provider (OpenAI, Anthropic, self-hosted, proxies) | Locked to specific providers |
| **Model Selection** | Full control (main + fast models, reasoning support) | Limited options |
| **Customization** | Complete (edit prompt parts, workflows, behavior) | Limited customization |
| **Privacy** | Your infrastructure, your data | Third-party processing |
| **Setup Time** | ~10 minutes | Varies |
| **BYOK (Bring Your Own Key)** | ✅ Full support | ⚠️ Limited or no support |
| **Security Model** | Hardened prompt-injection defense, workspace scrubbing, least-privilege tokens | Opaque |

### 🎯 Perfect For

- **Open-Source Projects**: Leverage free GitHub Actions minutes on public repositories
- **Small-to-Medium Teams**: Private repos get 2,000 free minutes/month — enough for most teams
- **Cost-Conscious Teams**: Only pay for LLM API usage, no per-seat licensing
- **Privacy-First Organizations**: Keep your code and data on your infrastructure
- **Teams Wanting Control**: Full transparency and customization of AI behavior

---

## Table of Contents
- [Features](#features)
- [How It Works](#how-it-works)
- [Quick Start](#quick-start)
- [Core Workflows](#core-workflows)
- [Configuration](#configuration)
- [Advanced Features](#advanced-features)
- [Usage Guide](#usage-guide)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Development Guide](#development-guide)
- [FAQ](#faq)
- [Credits](#credits)
- [License](#license)

---

## Features

### 🔍 Automated Issue Analysis
Every new issue gets an AI assessment: duplicate detection, root-cause analysis, suggested solutions, and recommended labels.

### 🧠 Intelligent PR Reviews
Comprehensive code reviews with severity-graded findings (🔴 Critical / 🟠 Major / 🟡 Minor / 🔵 Info), incremental follow-up reviews, and clear verdicts — `approve`, `changes requested`, or `comment` — each justified in the reviewer's own voice.

### ✅ Compliance Verification
A dedicated good-practices audit (documentation, coding practices, file-group consistency) that gates merging via GitHub status checks — run once at the end of a PR's life with `/mirrobot-check`.

### 💬 Context-Aware Bot Replies
Mention the bot anywhere and it picks the right strategy — answering questions, investigating the codebase, reviewing code, contributing fixes, or managing the repository. It can even review any PR on demand, in any repository it's invoked from.

### 🛡️ Production-Grade Security
Built against real adversarial testing: prompt-injection-hardened workflows, workspace scrubbing, least-privilege tokens, and a zero-secret trigger chain. See [Security](#security).

---

## How It Works

Mirrobot Agent is a **GitHub Actions integration framework** built on OpenCode: trusted workflow orchestration around an AI agent with engineered, dynamically assembled prompts.

### Architecture

```
 GitHub events
 (comment, issue, PR activity)
        │
        ├── issue_comment ──────────► agent-router ──► dispatches exactly ONE
        │                             (route-comment.sh)   target workflow, by comment_id
        │
        ├── issues [opened] ────────► issue-comment (Issue Analysis)
        │
        ├── pull_request_target ───► pr-review-trigger (zero-secret stub)
        │                             decides if review is wanted;
        │                             posts pending compliance status;
        │                             dispatches PR Review  ─────────┐
        │                                                            │
        └── pull_request ──────────► compliance-gate (insurance:    │
                                     second poster of the pending    │
                                     merge-blocker status)           │
                                                                      ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │                    Agent workflow (privileged)                   │
        │  1. bot-setup: dual-identity token (account PAT or GitHub App),  │
        │     scope-gated, fail-fast                                       │
        │  2. Trusted artifacts: prompts, scripts copied from the          │
        │     default branch BEFORE any PR checkout                        │
        │  3. Workspace scrub: auto-load files (AGENTS.md, .claude/, ...)  │
        │     kept only if identical to trusted branches; .github taint    │
        │     alarm; removed files quarantined readable-as-data            │
        │  4. Context assembly: three-block review memory, diffs, roster,  │
        │     requester trust line                                         │
        │  5. Prompt assembly: parts + manifests → mode prompt            │
        │  6. OpenCode agent session (the AI does the actual work)         │
        │  7. Verification: footer/SHA checks, repair, reactions           │
        └──────────────────────────────────────────────────────────────────┘
```

**Key principle: privileged code always runs from the default branch.** PR content is only ever *data* — checked out after trusted artifacts are secured, scrubbed, and taint-checked. A malicious PR cannot modify the pipeline that reviews it.

### What Mirrobot Agent Provides

- **Workflow Framework**: Eight specialized workflows — router, triggers, reviewers, compliance, and CI batteries
- **Prompt System**: Behavior defined as composable parts assembled per mode by `assemble-prompt.sh`, with rule batteries pinning every load-bearing instruction
- **Context Orchestration**: Three-block review memory (elevated latest / filtered history / correlated thread), incremental diffs, trusted-people roster
- **State Management**: Footer-marker review tracking, FIRST/FOLLOW-UP protocol selection, per-PR serialization
- **GitHub Integration**: Dual identity (user account or GitHub App), reaction lifecycle, status-check gating
- **Security Engineering**: Injection-safe interpolation, workspace scrub with quarantine, permission profile owned by configuration

### What OpenCode Provides

- **AI Engine**: Natural language understanding, multi-turn agentic sessions
- **Multi-Provider Support**: OpenAI, Anthropic, custom providers, and more
- **Tool Execution**: Controlled bash access, file tools, web search — governed by a deny-by-default permission profile

---

## Quick Start

### Prerequisites

1. **GitHub Repository** (public for free Actions minutes, or private with free tier)
2. **Identity** — one of:
   - **GitHub App** ([Create a GitHub App](https://docs.github.com/en/apps/creating-github-apps)): App ID + private key (PEM), installed on the repository
   - **Dedicated bot account** with a classic PAT (`public_repo` scope only — no `workflow` scope), invited as a collaborator with Write access
3. **LLM API Access** (OpenAI, Anthropic, or any OpenCode-compatible provider)

### Installation (10 Minutes)

1. **Copy the platform into your repository**
   ```bash
   gh repo clone Mirrowel/Mirrobot-agent
   cp -r Mirrobot-agent/.github /your-repo/
   ```

2. **Configure Repository Secrets** — `Settings` → `Secrets and variables` → `Actions`:

   | Secret | Required | Description |
   |--------|----------|-------------|
   | `BOT_APP_ID` | App mode | Your GitHub App ID |
   | `BOT_PRIVATE_KEY` | App mode | GitHub App private key (full PEM) |
   | `OPENCODE_API_KEY` | ✅ | LLM provider API key |
   | `OPENCODE_MODEL` | ✅ | Main model, e.g. `anthropic/claude-sonnet-4` |
   | `OPENCODE_CONFIG_JSON` | Recommended | Minified OpenCode config (permissions, providers) — start from `.github/actions/bot-setup/permissions.example.json` |
   | `OPENCODE_FAST_MODEL` | Optional | Fast model for cheap subtasks |
   | `ACCOUNT_GH_TOKEN` | Account mode | Classic PAT (`public_repo` only) — presence selects account mode automatically |

   Also consider the **variable** (not secret) `TRUSTED_AGENT_USERS`: comma-separated usernames the agent treats as trusted people (in addition to collaborators).

3. **Enable Workflows** — `Actions` tab → enable if prompted

4. **(Recommended) Gate merges on compliance** — `Settings` → `Branches` → protection rule → "Require status checks" → select `compliance-check`

5. **Test It**
   - Open a new issue → automatic analysis
   - Open a PR → automatic review + pending compliance status
   - Comment `@mirrobot-agent help` → router picks it up (one visible run)

🎉 **Done!**

---

## Core Workflows

| Workflow | Trigger | Role |
|----------|---------|------|
| **Agent Router** (`agent-router.yml`) | `issue_comment [created]` | Parses every comment once; dispatches exactly one target workflow with the comment ID; its run log IS the audit trail |
| **PR Review Trigger** (`pr-review-trigger.yml`) | `pull_request_target` | Zero-secret stub: decides whether a review is wanted (opened/ready/reopened → yes; synchronize → only with `Agent Monitored` label), posts the pending compliance status, dispatches PR Review. Declined events dispatch nothing |
| **PR Review** (`pr-review.yml`) | Dispatch only (stub/router/manual) | The reviewer: FIRST/FOLLOW-UP protocols, severity-graded findings, verdicts, footer verification and repair |
| **Issue Analysis** (`issue-comment.yml`) | `issues [opened]`, dispatch | Assesses new issues: duplicates, root cause, labels |
| **Compliance Check** (`compliance-check.yml`) | `/mirrobot-check` comment, dispatch | End-of-life merge audit: good practices, file-group consistency; posts the compliance status and report |
| **Compliance Gate** (`compliance-gate.yml`) | `pull_request` | Insurance: independently posts/maintains the pending `compliance-check` status; fails loudly rather than letting a PR look all-green |
| **Bot Reply** (`bot-reply.yml`) | Dispatch only (router) | The general agent: mentions, questions, investigations, on-demand reviews of any PR, code contribution |
| **Scrub Fixtures** (`scrub-fixtures.yml`) | `push`/`pull_request` on `.github/**` | CI: runs the security-fixture and prompt-rule batteries on every change to the platform itself |

### The review lifecycle

1. **PR opened** → stub decides: review wanted → dispatches PR Review (FIRST protocol: full diff, ack comment within the first action, severity-graded findings, justified verdict)
2. **New commits pushed** → stub checks the `Agent Monitored` label → FOLLOW-UP protocol: incremental diff + previous feedback re-verified
3. **Ready to merge** → anyone comments `/mirrobot-check` → compliance audit runs → `compliance-check` status goes green (compliant or warnings-with-description) or red (blocking findings)
4. **Merge** — the gate holds until compliance passes; the agent may merge when asked, but only after reading the compliance *description*, not just the color

### Multi-strategy bot replies

When mentioned, the agent chooses its own strategy and loads the matching instruction set on demand:

| Strategy | When Used | Capabilities |
|----------|-----------|--------------|
| **Conversationalist** | General questions, discussions | Answers, explains, advises |
| **Investigator** | "Find...", "Where is..." | Evidence-grade codebase exploration |
| **Code Reviewer** | "Review this", "review PR #N" | Full review flow via the review kit — for any PR, even in other threads |
| **Code Contributor** | "Fix this", "Implement..." | Branches, commits, opens PRs (never touches workflows) |
| **Repository Manager** | "Label this", "Close this" | Issues, labels, project management |

---

## Configuration

### Dual Identity

The bot-setup action resolves identity automatically:

- **`ACCOUNT_GH_TOKEN` present** → account mode: the token is validated (`/user`), scope-gated (`workflow` scope present = hard fail; `public_repo` missing = hard fail), and used directly. Posts, reviews, and commits appear as your bot account.
- **Absent** → GitHub App mode: installation token minted per run from `BOT_APP_ID` + `BOT_PRIVATE_KEY`. Activity appears as `your-app[bot]`.

All identity comparisons are case-insensitive — renaming the account doesn't break review detection.

### OPENCODE_CONFIG_JSON

The agent's OpenCode configuration — **including its permission profile** — is owned by this secret, not by workflow files. Start from the committed example:

```bash
python minify_json_secret.py .github/actions/bot-setup/permissions.example.json
# paste the output as the OPENCODE_CONFIG_JSON secret
```

The default profile is deny-by-default with explicit allows (gh, git, jq, file tools, python) and targeted denies (env dumps, curl/wget, workflow modification). Skills from repository directories are denied by default — approve specific ones by name if you want them.

### Custom Providers

Any OpenCode-compatible provider is configured inside `OPENCODE_CONFIG_JSON` (models, baseURL, keys via env). See the [OpenCode docs](https://opencode.ai/docs/providers/) for the provider block format; use `minify_json_secret.py` to prepare the secret.

### File Groups (Compliance)

`compliance-check.yml` defines `FILE_GROUPS_JSON` — related file groups checked for consistency (e.g. "README must reflect workflow changes"). Edit it to match your project's structure.

---

## Advanced Features

### Severity-Graded Reviews

Every finding is placed on a ladder — 🔴 **Critical**, 🟠 **Major**, 🟡 **Minor**, 🔵 **Info** — with critical/major inlined on the code and minor/info grouped in the summary. Verdicts map to severity with room for judgment (a stack of minors is a comment, not an approval).

### Incremental Reviews

The reviewer's footer carries `last_reviewed_sha`. Follow-up reviews get only the incremental diff and re-verify their previous feedback — faster, cheaper, and feedback stays where the author is working.

### Three-Block Review Memory

Context is structured, not dumped: the agent's latest reviews elevated and unfiltered, its older reviews filtered (resolved/outdated/dismissed handled), and the thread correlated so inline comments attach to their parent reviews.

### The Review Kit

`generate-review-kit.sh` builds everything needed to review any PR — type detection, diffs, head-SHA file, instruction sets, review memory. The workflow runs it for the thread's PR; the agent can run it itself for any other PR from any conversation.

### Prompt Injection Defense

Comment bodies, PR titles, and all untrusted content reach shells only through environment variables — never interpolated. All requesters may trigger the bot (by design); the security brief trains skepticism regardless of rank. See [Security](#security).

### Self-Review Detection

Reviewing its own PRs, the agent switches to a lighter tone, discloses the conflict, and stays technically rigorous.

### Reactions

👀 on the triggering comment when work starts; 🚀 on success, 😕 on failure. The agent may also react to other comments at its own discretion — sparingly.

---

## Usage Guide

### Triggering the Bot

**Automatic:**
- Issue opened → analysis
- PR opened / ready for review / reopened → review
- PR updated (with `Agent Monitored` label) → incremental review
- Any `pull_request` activity → pending compliance status maintained

**Mentions** — comment anywhere:
```
@mirrobot-agent Where is the authentication logic implemented?
@mirrobot-agent Can you review PR #42?
@mirrobot-agent I think the retry logic in client.py drops errors — could you check and fix it?
```

**Slash commands** (PR comments):
```
/mirrobot-review   → request a review now
/mirrobot-check    → run the compliance audit (end of PR life)
```

**Manual dispatch** — `Actions` → workflow → `Run workflow` (PR number / comment ID).

### What you get back

**PR review** — a single bundled GitHub review: severity-marked inline comments, a severity-grouped summary, and a justified verdict line (`Verdict: changes requested — ...`). Requested reviews cc the author and reviewers in the agent's own voice, after the verdict.

**Compliance report** — a PR comment plus the `compliance-check` status: 🟢 compliant, 🟢 warnings (description carries the summary — read it before merging), or 🔴 blocked.

**Bot reply** — a living acknowledgment comment the agent updates as it works, then the deliverable.

### Limitations

- Response time depends on LLM latency (typically 1-5 minutes for reviews)
- Very large diffs are navigated by the agent rather than ingested whole
- The bot can commit code when asked (contributor strategy) but never modifies `.github/workflows` — that's a hard deny
- Subject to GitHub API and provider rate limits

---

## Troubleshooting

#### Workflow Not Triggering
1. Workflows enabled: `Settings` → `Actions` → `General`
2. For comments: check the **Agent Router** run first — it decides dispatch targets and logs its decision in the run summary
3. For PR reviews: check the **PR Review Trigger** (stub) run — declined events dispatch nothing by design
4. Identity installed (App) or invited (account) on the repository

#### Authentication Errors
1. App mode: verify `BOT_APP_ID` / `BOT_PRIVATE_KEY`, App installed, permissions granted
2. Account mode: `ACCOUNT_GH_TOKEN` must be a **classic** PAT with exactly `public_repo` (no `workflow` scope — the scope gate hard-fails on it)
3. Private key must include full PEM headers/footers

#### LLM Issues
1. Verify `OPENCODE_API_KEY` and model identifiers (`provider/model` format)
2. Custom providers: validate your `OPENCODE_CONFIG_JSON` (any JSON linter) and remember secrets can't contain literal newlines — use the minifier
3. Check the provider's status page

#### Reviews Not Posting
1. Check the workflow log's footer-verification step — it repairs and reports
2. Fork PRs are fully supported (the review kit fetches PR heads explicitly)
3. Self-reviews work; GitHub doesn't allow an account to block its own PR (the agent discloses this when relevant)

---

## Security

Mirrobot Agent's security model was built against real adversarial testing — including disguised injection PRs, trojan documentation, and malicious agent-config files — and is re-verified by CI batteries on every change.

### Threat Model

Any GitHub user can trigger the agent. All requester-controlled text (comment bodies, PR titles, issue content, file contents) is **untrusted data**. The system assumes a malicious PR tries to: modify the pipeline that reviews it, inject instructions into the agent, or exfiltrate secrets.

### Defenses

1. **No untrusted interpolation** — event content reaches shells only via `env:` variables; a documented grep audit pins this
2. **Privileged execution from the default branch only** — agent workflows are dispatch-triggered; the only `pull_request_target` workflow is a zero-secret stub with no checkout (a tampered copy is powerless by construction)
3. **Workspace scrub** — after any checkout, auto-load surfaces (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and siblings; `.claude/`, `.agents/`, `.opencode/`, `.cursor/`, `.windsurf/`, `.devin/` directories) survive only if byte-identical to trusted branches; symlinks compared by resolved content; removed files are **quarantined** to `/tmp/scrub-quarantine/` so the agent can still read them as data
4. **`.github` taint alarm** — any workflow/prompt/script change in branch history or net-tree (evil-merge safe) is surfaced to the agent with maximum-scrutiny instructions; never silently removed
5. **Permission profile owned by configuration** — deny-by-default bash with explicit allows; env-dump and credential-access patterns denied; repo-injected skills denied; profile lives in the `OPENCODE_CONFIG_JSON` secret, untouched by workflows
6. **Scope-gated identity** — account tokens hard-fail if a `workflow` scope is present (preserving GitHub's workflow-push backstop) or `public_repo` is missing; broken secrets fail fast, never silently fall back
7. **Token hygiene** — App installation tokens are short-lived per run; git authentication rides an in-process extraheader, never written to `.git/config`; `persist-credentials: false` on every token-bearing checkout

### CI Batteries

`scrub-fixtures.sh` (52 checks: symlink chains, evil merges, quarantine, fail-closed anchors, YAML duplicate-key loader) and `prompt-rule-fixtures.sh` (325 pins: every load-bearing prompt rule verified verbatim) run on every push that touches `.github/**`.

### Best Practices

1. Rotate credentials regularly (App key, PAT, LLM keys)
2. Review workflow run history for unusual patterns
3. Keep `TRUSTED_AGENT_USERS` current; trust informs judgment, never authorization
4. For sensitive codebases, prefer self-hosted models
5. Read compliance *descriptions*, not just status colors, before merging on warnings

---

## Development Guide

### Project Structure

```
.github/
├── actions/
│   ├── bot-setup/                 # Dual-identity token setup + config passthrough
│   │   ├── action.yml
│   │   └── permissions.example.json   # Starting point for OPENCODE_CONFIG_JSON
│   └── requester-context/         # Trust-line context (association + roster)
├── prompts/
│   ├── security-brief.md          # Read first in every session
│   ├── parts/                     # The prose: ~26 composable instruction parts
│   ├── manifests/                 # Per-mode ordered part lists (13 modes)
│   └── rendered/                  # (local only, gitignored) assembled previews
├── scripts/
│   ├── assemble-prompt.sh         # parts + manifest → mode prompt (fail-closed)
│   ├── scrub-workspace.sh         # Auto-load hygiene + quarantine + taint check
│   ├── generate-review-kit.sh     # Self-serve review package for any PR
│   ├── fetch-pr-discussion.sh     # Three-block review memory
│   ├── fetch-roster.sh            # Trusted-people roster
│   ├── route-comment.sh           # Router decision logic
│   ├── react.sh                   # Reaction lifecycle
│   ├── scrub-fixtures.sh          # Security battery (52 checks)
│   └── prompt-rule-fixtures.sh    # Prompt rule battery (325 pins)
└── workflows/                     # 8 workflows (see Core Workflows)

minify_json_secret.py              # Minify JSON for GitHub secrets
README.md
LICENSE
```

### Modifying Behavior

AI behavior lives in prompt **parts**, not monolithic files:

1. **Find the part** — grep `parts/` for the behavior you want to change; parts are shared across modes where identical (severity, scope-of-action, submission flow...)
2. **Edit the part** — manifests reference parts by name; all modes using it update together
3. **Re-pin if load-bearing** — `prompt-rule-fixtures.sh` greps assembled prompts; add or adjust pins so drift fails loudly
4. **Verify locally:**
   ```bash
   bash .github/scripts/assemble-prompt.sh --verify   # manifests/parts consistent
   bash .github/scripts/prompt-rule-fixtures.sh       # rule pins green
   bash .github/scripts/scrub-fixtures.sh             # security battery green
   ```
5. **Preview a full prompt** — assemble any mode and read exactly what the agent reads:
   ```bash
   bash .github/scripts/assemble-prompt.sh pr-review-first
   ```

Workflow-level changes (triggers, permissions, context plumbing) are regular YAML edits — the scrub-fixtures battery includes a strict duplicate-key parser (the same class GitHub rejects) and contract tripwires for the dispatch chain.

### Contributing

1. Fork → feature branch → changes
2. Run both batteries locally; keep pins accurate
3. PRs to this repository get the full treatment: automated review + compliance check before merge

---

## FAQ

**Q: Is Mirrobot Agent really free?**
**A:** For public repositories, GitHub Actions minutes are free — you pay only LLM API usage. Private repos get 2,000 free minutes/month.

**Q: What LLM providers are supported?**
**A:** Any OpenCode-compatible provider: OpenAI, Anthropic, self-hosted (Ollama, vLLM), proxies, regional providers.

**Q: Can I customize behavior?**
**A:** Completely — behavior is prompt parts, assembled per mode. Tone, review criteria, verdict mapping, severity handling: all editable, all battery-checked.

**Q: Can the bot commit code?**
**A:** Yes, when explicitly asked (contributor strategy): it branches, commits, and opens PRs. It never modifies `.github/workflows` — that's denied at the permission layer. It may also merge PRs when asked, after its own safety review and reading the compliance status.

**Q: Is my code/data secure?**
**A:** The agent runs on GitHub's infrastructure with your identity and your LLM provider; nothing else is in the loop. The security model assumes hostile input and is adversarially tested — see [Security](#security).

**Q: How do I change the bot's name/identity?**
**A:** It comes from your GitHub App name or bot account. Identity comparisons are case-insensitive; update the mention strings in workflows if you rename.

**Q: Does it work on fork PRs?**
**A:** Yes — fully, including reviews. Fork heads are fetched explicitly and TOCTOU-safely.

**Q: What models work best?**
**A:** A strong reasoning-capable main model (the agent runs multi-turn sessions) plus a cheap fast model for subtasks.

---

## Credits

- **[OpenCode](https://opencode.ai)** — the AI engine
- **[GitHub Actions](https://github.com/features/github-actions)** — execution platform
- **[GitHub Apps](https://docs.github.com/en/apps)** — authentication and API access

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/Mirrowel/Mirrobot-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Mirrowel/Mirrobot-agent/discussions)
- **Contributing**: See [Development Guide](#development-guide)

---

**Made with ❤️ for the open-source community**

Deploy your AI GitHub bot in 10 minutes — zero infrastructure, complete control, completely free.
