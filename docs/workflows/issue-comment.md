# Issue Analysis

First-contact triage for newly opened issues.

**Triggers:** `issues [opened]`, plus manual `workflow_dispatch` (issue number input).
**Executes from:** the default branch, always (issues events are default-branch by GitHub rule).
**Permissions:** `contents: read`, `issues: write`.

## What it does

On a new issue, one agent session that:

- classifies what the issue actually is (bug, feature, support ask in disguise, misconfiguration),
- **hunts duplicates** with a quick pass over open and closed issues (a similar issue's linked PRs count as sources); a duplicate that already has an agent analysis gets linked, labeled, and the agent stops — the work is done. Otherwise everything happens in THIS thread,
- judges neutrally — neither presuming the filer wrong nor right — reproducing where it can, rooting causes at file:line, and checking whether a fix is already in flight (open PRs, `dev`/`experimental`),
- **evaluates feature requests** instead of validating them (motivation, existing alternatives, feasibility, impact, worth-building),
- **applies labels directly** — the repo's own labels always win; the seeded vocabulary (kind, `severity:*`, triage states) is the default palette; `Agent Monitored` is collaborator-only and never applied,
- posts its analysis in its own shape: verdict + severity + evidence + what's next are the content, the form is not a template,
- reacts 👀 immediately on pickup.

Issues whose body mentions the bot still route here (Bot Reply listens to *comments*, never issue bodies: a mention in an issue body gets the one analysis post, and the conversation starts with the first comment).

## When it goes red

The agent session (real), or the issue re-fetch (deleted issue). Gray skip = paused, or a phantom push event. If an opened issue produced *no* run at all, that's platform event lag (seen on brand-new repos): close and reopen the issue.

## Knobs

`AGENT_MODELS_JSON["issue-comment"]`, plus the shared env-block knobs. The triage mission lives in `mission-analyst.md`; the label vocabulary is seeded by Agent Bootstrap (repo label customs always take precedence over the seeded palette).

## Testing it

Open an issue that duplicates an existing one; within a minute you should see 👀 and a triage comment linking the duplicate.
