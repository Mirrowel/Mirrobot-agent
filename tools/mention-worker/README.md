# mention-worker

The cross-repo "ears" of the Mirrobot platform, hosted OFF GitHub Actions:
a Cloudflare Worker (free tier) that polls the bot account's notifications
every minute (Durable Object alarm loop) and forwards qualifying events to the platform repo. GitHub
Actions then only run when something actually happened — no idle polling
runs (the default architecture; the in-repo schedule is an opt-in fallback).

## What it is

One JavaScript file (`worker.js`) + `wrangler.toml`, scheduled by a
**self-rescheduling Durable Object alarm** (the `Scheduler` class): each
wake-up commits the NEXT alarm first, then polls — no error can kill the
loop.

**Conditional + adaptive polling** (measured against the endpoint's own
`X-Poll-Interval`, which reads 60 even on a quiet account): every real
response's `ETag` is persisted and sent back as `If-None-Match`, so idle
polls return **free 304s** ("leaving your rate limit untouched" — GitHub
docs). Cadence: **304 → 30s** (unless the header strains >60s, honored,
capped 120s); **200 → the header's allowance** (60s typical, clamped
30–120s); **error/403/429 → 120s backoff**. Live-lesson: GitHub omits
`Last-Modified` on the EMPTY notifications response — the ETag is always
present, so it is the primary conditional. `x-ratelimit-remaining` is
logged on every response (quota health on the dashboard forever).

**Pre-filter gauntlet (deny-only, fail-open):** before relaying, the
worker fetches the triggering content (1 call) and checks bot-own
identity, the author/requester allowlist (platform-repo collaborators +
the `FOREIGN_MENTIONS_USERS` repo variable), and the genuine
`@mirrobot-agent` token. Declines are ACKED and **never wake Actions**
(junk mentions cost 2–3 API calls instead of a full run). Any uncertainty
fails OPEN — relay anyway; the in-repo gauntlet re-verifies everything and
stays the sole authority. Why not Cron Triggers: on this account the platform
scheduler registered crons but never dispatched them (2026-09-04, zero
attempts in observability, matching community reports 922869/928936;
docs admit crons run "on underutilized machines"). DO alarms bypass that
machinery entirely, are free-tier (SQLite-backed), and go sub-minute.
No cron is attached (`crons = []`, explicit); the one-line backup option
is documented as a comment in `wrangler.toml` (`crons = ["* * * * *"]` —
the `scheduled()` handler already runs the same pipeline, and mark-read
acks in the pipeline dedupe both paths if ever both run).

Deliberately dumb:

1. `GET /notifications` with the bot account PAT — keeps only
   `mention` / `review_requested` / `subscribed` / `comment` reasons
   (filter mirrors `handle-mentions.sh` exactly)
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
   The DO alarm loop arms itself on first `__tick` (or any fetch) and
   runs every 30s. Every run logs one structured `[poll] src=...` line
   (idle/dispatched/error + duration), and with observability enabled
   (see wrangler.toml) all of it lands in Workers → Logs on the dashboard
   — searchable, with invocation context.

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
