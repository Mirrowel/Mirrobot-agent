// mention-worker — cross-repo mention relay for the Mirrobot platform.
//
// WHY: the in-repo Mention Poller schedule costs a GitHub Actions run every
// few minutes even when nothing happened. This worker moves the polling off
// GitHub Actions: Actions then only run when a qualifying notification
// actually exists (the anti-abuse path).
//
// SCHEDULING: a self-rescheduling Durable Object alarm (30s period), NOT
// Cron Triggers. Live-lesson 2026-09-04: on this account the cron scheduler
// registered schedules but never dispatched them once over ~2h — zero
// scheduled attempts in workersInvocationsAdaptive, exact-match community
// reports (922869, 928936), and docs admit crons "run on underutilized
// machines" (the parking edge case). DO alarms bypass that machinery
// entirely, are free-tier (SQLite-backed DO), and can go sub-minute —
// something crons could never do. A dormant */5 cron stays attached to this
// same worker as a BACKUP: zero code (the scheduled() handler runs the same
// pipeline), never fires while the platform bug persists, and if the DO
// loop ever dies after the platform heals, worst-case latency is 5 minutes.
// Duplicate fires across both paths are no-ops: mark-read-before-dispatch
// in the repo pipeline is the at-most-once guard.
//
// WHAT IT DOES (deliberately dumb — zero trust, zero logic):
//   1. polls GET /notifications for the bot ACCOUNT (reason filter mirrors
//      handle-mentions.sh exactly: mention / review_requested / subscribed /
//      comment — GitHub classifies re-mentions in threads the account
//      already replied to as `subscribed`; a narrower filter silently drops
//      them)
//   2. forwards the RAW notification objects to the platform repo via
//      repository_dispatch (event_type: foreign-mention)
//   3. marks NOTHING read — the workflow (handle-mentions.sh) is the single
//      writer of read-state (mark-read-before-dispatch there is the
//      at-most-once guard; duplicate relays resolve as no-ops)
//
// ALL filtering, trust checks, and dispatch decisions live in the repo
// (.github/scripts/handle-mentions.sh, battery-tested). This relay could be
// fully compromised without gaining the ability to make the agent do
// anything: every payload field is re-fetched and re-verified from the
// GitHub API before any decision.
//
// GET /__tick?key=<TEST_TOKEN> runs the pipeline on demand, bootstraps the
// alarm loop, and returns diagnostics JSON.
//
// Secrets (wrangler secret put ...):
//   BOT_PAT      — the bot account's classic PAT (public_repo +
//                  notifications scopes)
//   DISPATCH_PAT — a fine-grained PAT with contents:write on the platform
//                  repo ONLY (repository_dispatch requirement; classic PATs
//                  would need the broad `repo` scope — don't)
//   TEST_TOKEN   — random hex string gating /__tick
// Env (wrangler.toml vars):
//   PLATFORM_REPO — "owner/name" of the repo running mention-poller.yml

const GH = "https://api.github.com";
// 30s: halves guest-reply latency vs a minute loop; ~2,880 polls/day is
// noise against free-tier limits (100k DO requests/day, 5k GitHub req/hr).
const POLL_PERIOD_MS = 30_000;

async function runPipeline(env, src) {
  const t0 = Date.now();
  const diag = {
    src,
    pollStatus: null,
    unread: 0,
    qualifying: 0,
    reasons: {},
    dispatched: [],
    dispatchStatus: null,
    dispatchBody: null,
  };

  const headers = {
    Authorization: `Bearer ${env.BOT_PAT}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "mirrobot-mention-worker",
  };

  const res = await fetch(`${GH}/notifications?all=false&per_page=30`, { headers });
  diag.pollStatus = res.status;
  if (!res.ok) {
    diag.pollError = (await res.text()).slice(0, 300);
    console.log(`[poll] src=${src} ERROR status=${res.status} body=${diag.pollError} (${Date.now() - t0}ms)`);
    return diag;
  }
  const all = await res.json();
  const REASONS = new Set(["mention", "review_requested", "subscribed", "comment"]);
  const qualifying = all.filter((n) => REASONS.has(n.reason));
  diag.unread = all.length;
  diag.qualifying = qualifying.length;
  diag.reasons = all.reduce((acc, n) => ((acc[n.reason] = (acc[n.reason] || 0) + 1), acc), {});
  if (qualifying.length === 0) {
    console.log(`[poll] src=${src} idle unread=${all.length} (${Date.now() - t0}ms)`);
    return diag;
  }

  // Audit line per notification BEFORE relaying — visible on the dashboard.
  for (const n of qualifying) {
    const ref = (n.subject?.url || "").match(/\/(?:issues|pulls)\/(\d+)$/)?.[1] || "?";
    const entry = `${n.repository?.full_name || "?"}#${ref} reason=${n.reason}`;
    diag.dispatched.push(entry);
    console.log(`[poll] src=${src} relaying ${entry}`);
  }

  const dispatch = await fetch(`${GH}/repos/${env.PLATFORM_REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DISPATCH_PAT}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mirrobot-mention-worker",
    },
    body: JSON.stringify({
      event_type: "foreign-mention",
      client_payload: { notifications: qualifying },
    }),
  });
  diag.dispatchStatus = dispatch.status;
  if (!dispatch.ok) diag.dispatchBody = (await dispatch.text()).slice(0, 300);
  console.log(
    `[poll] src=${src} dispatched=${qualifying.length} status=${dispatch.status}` +
      (diag.dispatchBody ? ` body=${diag.dispatchBody}` : "") + ` (${Date.now() - t0}ms)`,
  );
  return diag;
}

// Self-rescheduling scheduler: reschedules FIRST, then polls — a thrown
// error can never kill the loop. Singleton via idFromName("only").
export class Scheduler {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async ensureAlarm() {
    const current = await this.state.storage.getAlarm();
    if (current === null) {
      await this.state.storage.setAlarm(Date.now() + POLL_PERIOD_MS);
      return "bootstrapped";
    }
    return "armed";
  }

  async alarm() {
    await this.state.storage.setAlarm(Date.now() + POLL_PERIOD_MS);
    try {
      await runPipeline(this.env, "alarm");
    } catch (err) {
      console.log(`[poll] src=alarm EXCEPTION ${err}`);
    }
  }

  async fetch(request) {
    // "ensure" endpoint: (re)arm the loop. Gated by the worker's __tick
    // secret upstream; the DO is not routable directly.
    return Response.json({ alarm: await this.ensureAlarm() });
  }
}

export default {
  // Cron path kept only for manual remote tests (wrangler dev --test-
  // scheduled). No cron is attached in production — see wrangler.toml.
  async scheduled(event, env) {
    await runPipeline(env, "cron");
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/__tick") {
      return new Response("not found\n", { status: 404 });
    }
    const key = url.searchParams.get("key") || "";
    if (!env.TEST_TOKEN || key !== env.TEST_TOKEN) {
      return new Response("forbidden\n", { status: 403 });
    }
    const diag = await runPipeline(env, "tick");
    // Bootstrap the alarm loop on every tick (idempotent ensure).
    const id = env.SCHEDULER.idFromName("only");
    const boot = await env.SCHEDULER.get(id).fetch("https://do/ensure");
    diag.alarm = (await boot.json()).alarm;
    return Response.json(diag);
  },
};
