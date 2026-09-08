# Issue Analysis

First-contact triage for newly opened issues.

**Triggers:** `issues [opened]`, plus manual `workflow_dispatch` (issue number input).
**Executes from:** the default branch, always (issues events are default-branch by GitHub rule).
**Permissions:** `contents: read`, `issues: write`.

## What it does

On a new issue, one agent session that:

- **hunts duplicates** against open+recent issues (and links them),
- reads the report and sketches a **root-cause hypothesis** with the evidence it could gather,
- applies **labels** where it's confident,
- posts a short triage comment: what it understood, what it suspects, what it checked, and, if the fix is obvious and small, a suggested approach (suggestions only; contributions go through bot-reply),
- reacts 👀 immediately on pickup.

Issues whose body mentions the bot still route here (Bot Reply listens to *comments*, never issue bodies: a mention in an issue body gets the one analysis post, and the conversation starts with the first comment).

## When it goes red

The agent session (real), or the issue re-fetch (deleted issue). Gray skip = paused, or a phantom push event. If an opened issue produced *no* run at all, that's platform event lag (seen on brand-new repos): close and reopen the issue.

## Knobs

`AGENT_MODELS_JSON["issue-comment"]`, plus the shared env-block knobs. Triage personality and label vocabulary live in the `mission-issue` prompt parts.

## Testing it

Open an issue that duplicates an existing one; within a minute you should see 👀 and a triage comment linking the duplicate.
