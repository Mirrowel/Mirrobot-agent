# Issue Analysis

First-contact triage for newly opened issues.

**Triggers:** `issues [opened]`, plus manual `workflow_dispatch` (issue number input).
**Executes from:** the default branch, always (issues events are default-branch by GitHub rule).
**Permissions:** `contents: read`, `issues: write`.

## What it does

On a new issue, one agent session that:

- classifies what the issue actually is: `bug`, `enhancement` (a researched proposal), `wish` (a bare idea), `question`, `documentation`, `chore`, or a support ask in disguise,
- **hunts duplicates** with a quick pass over open and closed issues (a similar issue's linked PRs count as sources); a duplicate that already has an agent analysis gets linked, labeled, and the agent stops — the work is done. Otherwise everything happens in THIS thread,
- judges neutrally — neither presuming the filer wrong nor right — reproducing where it can, rooting causes at file:line, and checking whether a fix is already in flight (open PRs, `dev`/`experimental`),
- **evaluates proposals instead of validating them**: the job behind the ask, who benefits, whether it is already possible or better done elsewhere, cost and risk, fit with the project. The result is `ai: recommended` or `ai: discouraged`, with the reason,
- **grades and labels**: three grades (`severity:`, `value:`, `risk:`), each with its reason in the comment. The workflow fetches the repository's live labels once and renders exactly those into the prompt, so the agent applies only what exists and never creates a label. Its own conclusions are the `ai:` labels; decisions (`accepted`, `Priority`) stay with the maintainer,
- posts its analysis in its own shape: verdict, the grade lines, evidence, what's next are the content; the form is not a template,
- reacts 👀 immediately on pickup.

Issues whose body mentions the bot still route here (Bot Reply listens to *comments*, never issue bodies: a mention in an issue body gets the one analysis post, and the conversation starts with the first comment).

## When it goes red

The agent session (real), or the issue re-fetch (deleted issue). Gray skip = paused, or a phantom push event. If an opened issue produced *no* run at all, that's platform event lag (seen on brand-new repos): close and reopen the issue.

## Knobs

`AGENT_MODELS_JSON["issue-comment"]`, plus the shared env-block knobs. The triage mission lives in `mission-analyst.md`; the grade and label rules are the shared `grading.md`; the palette is [`.github/labels.txt`](../customization.md#the-label-palette), seeded by Agent Bootstrap.

## Testing it

Open an issue that duplicates an existing one; within a minute you should see 👀 and a triage comment linking the duplicate. The run's step summary also carries the encrypted session blob (decrypt with `decrypt_share_link.py`).
