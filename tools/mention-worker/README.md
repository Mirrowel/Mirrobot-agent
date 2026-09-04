# mention-worker

The cross-repo "ears" of the Mirrobot platform, hosted OFF GitHub Actions:
a Cloudflare Worker (free tier) that polls the bot account's notifications
every minute (Durable Object alarm loop) and forwards qualifying events to the platform repo. GitHub
Actions then only run when something actually happened — no idle polling
runs (the default architecture; the in-repo schedule is an opt-in fallback).

## What it is

One JavaScript file (`worker.js`) + `wrangler.toml`. Deliberately dumb:

1. `GET /notifications` with the bot account PAT — keeps only
   `mention` / `review_requested` / `subscribed` / `comment` reasons
2. forwards the RAW notification objects to the platform repo via
   `repository_dispatch` (`event_type: foreign-mention`)
3. marks NOTHING read — `handle-mentions.sh` (in the repo, battery-tested)
   is the single writer of read-state, so worker + fallback schedule never
   double-process

The relay holds ZERO trust: every payload field is re-fetched from the
GitHub API and re-verified (allowlist, genuine-mention token, skip matrix)
before any dispatch decision. A fully compromised worker gains nothing.

## Setup (~10 minutes, once)

Prerequisites: a free [Cloudflare account](https://dash.cloudflare.com)
(no card) and Node.js LTS.

1. **Dispatch token** (GitHub → your avatar → Settings → Developer settings
   → Personal access tokens → Fine-grained tokens → Generate):
   - Repository access: **only the platform repo** (e.g. `Mirrowel/Mirrobot-agent`)
   - Permissions: **Contents: Read and write**
   - Why fine-grained: `repository_dispatch` on a classic PAT needs the
     broad `repo` scope — never do that for a relay.

2. **Deploy**:
   ```
   cd tools/mention-worker
   npx wrangler login            # opens a browser, authorize Cloudflare
   npx wrangler secret put BOT_PAT
     # paste the bot account's classic PAT (public_repo + notifications)
   npx wrangler secret put DISPATCH_PAT
     # paste the fine-grained token from step 1
   npx wrangler deploy
   ```

3. **Verify**:
   ```
   npx wrangler tail             # live logs: "N unread, M qualifying"
   ```
   Also: Cloudflare dashboard → Workers → `mirrobot-mention-worker` →
   Triggers shows the `* * * * *` cron (every minute — the platform floor).

4. **Enable the platform side** (if not already on): repo variables
   `FOREIGN_MENTIONS_ENABLED=true` and optionally `FOREIGN_MENTIONS_USERS`
   (extra summoners beyond the repo's collaborators).

## Limits & costs (free tier)

- 100,000 requests/day; this worker uses ~288 cron runs/day of a few
  subrequests each — far inside every limit
- Cron triggers: 5 per account (free), 250 (paid)
- Cron propagation after deploys: up to ~15 minutes

## Secret rotation

If either PAT is rotated, re-run the corresponding
`npx wrangler secret put <NAME>` and `npx wrangler deploy` is NOT needed
(secrets hot-swap). Note `BOT_PAT` lives outside GitHub (Cloudflare secret)
— that is the deliberate zero-infra trade-off of this feature; rotation is
one command.
