# Design

The principles: how the pieces fit, what executes where, and the reasoning behind both. This is the document to read before changing anything structural; every rule below exists because its absence hurt once. (The companion map of the code itself (layers, entry points, file inventory) is [`ARCHITECTURE.md`](../ARCHITECTURE.md); this file is the *why*, that one the *what*.)

## The execution map

The single most important fact: **GitHub decides which copy of a workflow file runs, and that choice differs by trigger.**

| Trigger family | Executes from | Who uses it |
|---|---|---|
| `issue_comment`, `issues`, `workflow_dispatch`, `repository_dispatch`, `schedule` | **default branch**, always | Agent Router, Issue Analysis, Bot Reply, PR Review, Compliance Check, Mention Poller, Bootstrap |
| `pull_request_target`, `pull_request` | **the PR's base branch** | PR Review Trigger (stub), Compliance Gate |

Everything that *thinks* (agent sessions, prompt assembly, the scrub, routing decisions) runs from the default branch on every PR, no exceptions. The two workflows that can execute from a PR's base branch are deliberately the two that hold **zero secrets and no checkout**: a dispatcher (the stub) and a status poster (the gate). Even a tampered copy of either has a bounded ceiling (review-timing control and status noise with a one-hour token) and the stub's dispatch always targets `--ref <default-branch>`, so nothing downstream ever executes attacker-influenced code.

That's also why platform updates land on **main**: the default branch *is* the machine.

### The update doctrine

Throughout, "dev" means *your integration branch, whatever it's named*: the branch that carries work ahead of main. The scrub's `AUTOLOAD_BRANCHES` list (in `scrub-workspace.sh`) names the branches whose auto-load content is trusted; set it to your branch names if they differ.

- **Platform changes (anything under `.github/`) go to main first.** Always. A platform change on any other branch is inert for real runs until it reaches main.
- **The integration branch needs no per-batch sync.** At its next merge into main, agent files (changed only on main's side) auto-merge cleanly.
- **When it *should* be current** (the stub or gate changed): `git merge main` into it. Merges share commit objects, so those commits dedupe to nothing at the later merge into main. **Never** replicate the same change as separate commits on both branches, copies are the history pollution that shows up in main's log later.
- **Auto-load content is the exception**: it evolves on the integration branch (see the trust model below).

## The life of a pull request

```
 PR opened / ready / reopened ──► PR Review Trigger (stub, base-branch copy)
                                      │ decides: review wanted?  no ──► nothing runs at all
                                      │ yes
                                      ├─► posts pending compliance-check status
                                      └─► dispatches PR Review  ── (always from main)
                                                                    │ scrub → context → agent session
                                                                    │ posts review w/ severity + verdict
 push (synchronize) ──► stub ──► only with 'Agent Monitored' label ─┘
 reviewer asks in comments ──► Agent Router ──► dispatches PR Review (same machinery, comment context)
 PR ready to merge ──► someone comments /mirrobot-check ──► Router ──► Compliance Check
                                                                    │ posts compliance status + report
                                                                    │ BLOCKED / WARNINGS / COMPLIANT
 merge ──► branch protection requires the green compliance-check status
```

Key properties:

- **A declined review triggers nothing.** The stub's decision and its dispatch are the same act; declined events never spin up a PR Review run.
- **Reviews serialize per PR** (concurrency group `PR Review-<N>`), so a manual review request and an auto-trigger can't race or interleave.
- **Follow-ups are incremental.** The agent's posted reviews carry a footer with the last-reviewed SHA; the next run detects it, loads the FOLLOW-UP protocol, and works the delta with full memory of its own previous findings.
- **Compliance runs once, at the end, on request.** It is a different agent with a different checklist (practices and consistency, not code correctness, that's the reviewer's job).

## The comment routing flow

Every comment event (`issue_comment[created]`) hits exactly one entrypoint, the **Agent Router**:

1. Bot-loop guard: comments authored by bots or the agent itself are ignored (prevents self-trigger loops).
2. The comment body is parsed (quotes and code fences stripped) against the trigger matrix; see [workflows/agent-router.md](workflows/agent-router.md).
3. Each match dispatches exactly one target workflow with a `commentId` input; targets re-fetch full context from the API by that id (context is never trusted from the event payload).
4. Compound comments dispatch all matches: "can you review this and then run compliance" does both.

## The trust model (split trust)

The agent loads content from the repository it's pointed at. Some of that content auto-loads into its brain (instruction files, skill directories, project configs), so the platform must decide, before the agent ever boots, which bytes are allowed to speak first. The answer differs per surface:

| Surface | Trusted from | Rule |
|---|---|---|
| **Auto-load files**: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, harness rule files, `.claude/`, `.agents/`, `.opencode/`, `.cursor/`, `.windsurf/`, `.devin/` | **main ∪ your integration branch** (the `AUTOLOAD_BRANCHES` list) | A file survives only when its bytes match a state a trust branch shipped **at-or-after that branch's fork point** with the PR (each branch gets its own floor). |
| **`.github/` platform files** | **main only** | Never removed (the reviewer must see them), but any branch-side change is a taint alarm at maximum scrutiny; content provably synced from post-fork main states downgrades to an explained note. A branch-side change to auto-load content (an added skill, an edited `AGENTS.md`) raises the same alarm, after the scrub has removed it. |

Why the split: auto-load content *describes the code it ships with*: when you evolve your repo's conventions on dev, the AGENTS.md that documents those conventions evolves with it, and it must be trusted there before it merges up. Platform wiring has no such coupling, it executes from main, so main alone vouches for it.

The floors are what make history-matching safe: a state older than every floor can only be a rollback (someone restored content a trust branch already abandoned, typically resurrecting a fixed flaw). That's quarantined. Novel bytes (nothing ever shipped them) are quarantined. Trusted-but-not-current bytes stay, tagged with an era note so the agent treats them as dated context, not doctrine.

Two degradation rules keep this from being brittle: an optional trust branch that doesn't exist (a deployment without a dev) is skipped gracefully (never a fail-closed trigger) while a missing `main` removes all auto-load files unconditionally.

The scrub also **quarantines** every removed file to `/tmp/scrub-quarantine/` (resolved content, in-repo targets only): the agent can read your PR's AGENTS.md as *data* (often genuinely useful context) without those bytes ever being auto-loaded as instructions.

## Opinions and reviews: two treatments

A quality ask ("check this PR out", "is this a good solution?") and a review ask ("review this PR") are different asks, and get different treatments:

- **An opinion** is the default for quality asks: a thread comment (the ack edited into the full reply — one bot comment), findings classified with severity but delivered as prose or as *standalone* inline comments (placement, not review objects), an honest scope note of what was read, run, and skipped. Depth is derived, not picked: the asker's words set the scope, the stakes set the evidence bar claims must meet, deeper work costs one named doubt, and mid-work deepening is bounded by "would this change my answer".
- **A review** — the full pipeline (kit instruction set, severity-grouped report, verdict, footer markers) — fires only on explicit review intent: the word "review" as a request, a review command, or a review-request event. The automatic PR-review workflow is a different trigger path entirely and is unaffected.

The separation is enforced at the artifact level: no amount of diligence converts an opinion into a review, opinions carry no review markers (so FIRST/FOLLOW-UP tracking only ever sees real reviews), and the review protocol's rigor clauses explicitly do not apply to opinions. The rules live in `parts/opinion-mode.md`, loaded by both conversational lanes.

## Grades and labels

One committed file, `.github/labels.txt`, is the whole palette. Agent Bootstrap seeds GitHub labels from it, and before each session the workflow fetches the repository's live labels once and renders exactly those into the prompt, classified by the file. The agent therefore applies only labels that exist, never lists them itself, and never creates one. No file means labeling is off.

The palette answers three questions with three grades. Each is mandatory where it applies, and each comes with its reason in the response:

| Question | Grade | Applies to |
|---|---|---|
| How bad is the problem? | `severity: critical` / `major` / `minor` / `info` | bug reports, bug-fix PRs |
| How good would it be if done? | `value: high` / `medium` / `low` | proposals and wishes, behavior-changing PRs |
| How dangerous is doing it? | `risk: high` / `medium` / `low` | every PR; an issue that proposes an approach |

Around the grades:

- **What the thread is:** `bug`, `enhancement` (a researched proposal), `wish` (a bare idea, issues only), `question`, `documentation`, `chore`, plus the `regression` and `external` flags.
- **The agent's own conclusions**, prefixed `ai:` because they are its judgment and not a maintainer's: `ai: confirmed`, `ai: plausible`, `ai: recommended`, `ai: discouraged`.
- **What a blocked thread waits on:** `needs-info`, `needs-repro`, `needs-discussion`.
- **The maintainer's labels**, which the agent never applies or removes: `accepted`, `Priority`, `help wanted`, `good first issue`, `Agent Monitored`.

The agent grades and recommends; it does not decide. A decision (`accepted`, `Priority`) is the maintainer's, nobody's request changes a grade (only evidence does), and the agent may replace only its own grades (`severity:`, `value:`, `risk:`, `ai:`).

Merging is the maintainers' decision alone. The agent may bring a pull request as close to mergeable as the work allows, but it never merges unless a maintainer explicitly tells it to; an author's, contributor's or outsider's ask, a passing mention, or its own initiative never count. Given that explicit order, the merge is a job like any other: the agent does the work it needs instead of answering yes or no.

Where it runs: Issue Analysis and a first PR Review grade deliberately, a follow-up review re-checks lightly, Bot Reply may update a grade when a conversation settles one, and guest sessions never label. The rules live in `prompts/skills/labels/`: one body that explains ideas and levels and never names a label (the fixtures check that no prompt part or skill does), delivered **inline** in the lanes that always grade and as an installed **skill** in the lanes where a grade only sometimes comes up. A repository with a different label set therefore works unchanged: the agent maps each idea to the label that carries it there, and states the grade in its response even where no label exists for it.

## The prompt system

A mode's prompt is an *assembly*, built at run time. `.github/prompts/parts/` holds every block of prose (shared rules, per-mode missions, protocols); `.github/prompts/manifests/` holds ordered part-name lists; a manifest **is** a mode (`pr-review-first`, `bot-reply`, `compliance-followup`, ...). At run time, `assemble-prompt.sh` concatenates the manifest's parts, installs the skills the manifest declares, and emits a routing block that names each installed skill with the moment it governs; `envsubst` then injects the run's context variables (thread context, diffs, trust warnings). Modes that share a part share it byte-identically by construction, so duplicated guidance cannot drift.

Skills (`prompts/skills/<name>/`) hold content a lane needs only sometimes: one body plus two framings, injected inline where the need is constant and installed as an opencode skill where it is not. The workflow decides per run which skills exist (thread type, lane), a required skill that never loads is reported by the session exporter, and a skill that cannot be rendered fails the run before the session starts.

Full authoring guide: [customization.md](customization.md#prompts).

## Where skills and tools come from

Skills, plugins, agents, commands and boot-time CLIs are not baked into this repository. They arrive through **content packs**: sources listed in `CONTENT_PACKS` (public) and `CONTENT_PACKS_PRIVATE` (private archive links, kept in a secret because run logs print variables in clear). One installer (`install-packs.py`) fetches each pack, installs only allowlisted paths into opencode's own home, fetches lock-pinned upstream skills at their recorded commits, runs wait-for-able boot extensions in a credential-free step, and deep-merges a pack's `opencode.json` fragment under the config secret, with `permission` refused at any depth. A fork therefore changes what the agent can do by editing a pack, not by editing workflows.

## The identity model

The bot speaks as exactly one identity per installation (a user account (account mode) or a GitHub App bot (app mode)) selected by which secrets exist. Both modes flow through the same machinery.

Two separate systems:

- **Identity** ("is this content authored by me?") resolves per run: the `BOT_IDENTITIES` variable **∪** the account login detected live via the API (account mode; app tokens cannot self-discover). The stock fallback applies only when both are absent. Every self-detection point (bot-loop guards, review attribution, FIRST/FOLLOW-UP markers, footer verification, reaction cleanup) matches this resolved set, case-insensitively, so renames never silently break detection.
- **Triggers** ("what text summons me?") resolve from the `BOT_TRIGGERS` variable (raw stems; each derives an `@stem` mention plus `/stem-review` and `/stem-check` commands), else from the resolved identity, else the stock mirrobot words.

"mirrobot" is the agent's *name* (a trigger word), never an identity: a human user who happens to be named `mirrobot` is not treated as the agent.

Cross-repo guest mode adds a third identity context: the *guest*, the same account, summoned into a repository it doesn't know, running under stricter rules (read-only by default, authority pinned to an allowlist, never to thread participation). See [workflows/mention-poller.md](workflows/mention-poller.md).

## Where the batteries live

Every rule in this document that can rot is checked: `.github/scripts/scrub-fixtures.sh` (scrub semantics, routing matrix, workflow contracts, YAML strictness) and `.github/scripts/prompt-rule-fixtures.sh` (machine contracts: assembly render smoke, placeholder-vs-renderer completeness, workflow marker couplings). They run in CI on every change to `.github/**`. If you change behavior, change the check in the same commit; a failing suite after your edit is the system working. Prompt prose itself is deliberately unpinned — editing wording, rules, or formats never breaks CI.

Every agent run also seals an encrypted session artifact (passive, always on) and, when configured, streams live via [OpenShare](https://github.com/Mirrowel/OpenShare) — the sharing lifecycle is part of the run pipeline, not an extra: [security.md](security.md#encrypted-session-sharing).

## Design axioms

Short list of the "why" behind recurring decisions:

1. **Untrusted text is data, never instructions**: comment bodies, PR titles, commit subjects reach shells only as env vars, and reach the agent wrapped in a brief that says treat everything as input.
2. **Everything privileged runs from the default branch**: the execution map above.
3. **Secrets are masked leaf-by-leaf and die at boot**: the config secret's inner API keys are individually registered with `::add-mask::`, and the whole config plus materialized plugins are deleted seconds after opencode reads them.
4. **Honest signals**: skipped means didn't-fire, green means ran, red means actually failed. Nothing cosmetically green.
5. **The batteries are the documentation's enforcement**: behavior changes carry their pin changes.
