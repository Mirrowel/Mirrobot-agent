# Compliance Gate

Pending-marker insurance. The smallest workflow in the platform, and the reason a GitHub API outage can never make a PR silently mergeable.

**Triggers:** `pull_request_target`, `opened`, `synchronize`, `ready_for_review`, `reopened`.
**Executes from:** the PR's base branch (GitHub rule for `pull_request_target`); same caveat as the stub: keep your integration branch merge-synced when this file changes.
**Permissions:** `statuses: write`. **Zero secrets, no checkout.**

## Why `pull_request_target`

Fork PRs park plain `pull_request` workflows behind maintainer approval ("action_required") — for as long as that approval sits unanswered, this second posting path does not exist exactly where independent verification matters most (untrusted contributors). `pull_request_target` runs immediately for fork and same-repo PRs alike, and the workflow file always comes from the base branch, so a PR cannot redefine the gate. The zero-secret contract (no secrets, no checkout, no event-content interpolation, statuses-only permission) is pinned by fixtures — a `pull_request_target` workflow must never gain any of those.

## Why it exists

The `compliance-check` pending status is what branch protection keys on. Normally the PR Review Trigger stub posts it, but on 2026-08-17 a real API outage swallowed that POST *silently* (the step was `continue-on-error` by design, so everything looked green while the required check simply didn't exist). A PR with no compliance-check context at all can merge. This workflow is the second, independent poster:

- Retries with backoff.
- If it still cannot post, it **goes red**: a red `Compliance Gate` check on the PR. A red gate is preferable to a silently missing required check: the required check stays "Expected" (merge blocked) either way, but now a human knows.

Fork PRs get the post too: `pull_request_target` mints the base-repo token even on fork events, and statuses attach to the PR head SHA.

## When it goes red

Almost always: the statuses API is refusing writes (outage); in which case the red is the feature. If it's red with no outage, look at the run log's final error; it names the exact API response.

## Testing it

Temporarily point branch protection at requiring `Compliance Gate` too if you want to see it in the checks list; otherwise it's a quiet insurance policy that only appears in the Actions tab.
