// mention-worker — cross-repo mention relay for the Mirrobot platform.
//
// WHY: the in-repo Mention Poller schedule costs a GitHub Actions run every
// few minutes even when nothing happened. This worker moves the polling to
// Cloudflare's free cron triggers: Actions then only run when a qualifying
// notification actually exists (the anti-abuse path).
//
// WHAT IT DOES (deliberately dumb — zero trust, zero logic):
//   1. polls GET /notifications for the bot ACCOUNT (reason filter mirrors
//      handle-mentions.sh exactly: mention / review_requested / subscribed /
//      comment — GitHub classifies re-mentions in threads the account
//      already replied to as `subscribed`; a narrower filter here silently
//      drops them, live-lesson)
//   2. forwards the RAW notification objects to the platform repo via
//      repository_dispatch (event_type: foreign-mention)
//   3. marks NOTHING read — the workflow (handle-mentions.sh) is the single
//      writer of read-state, so schedule+worker never double-process
//
// ALL filtering, trust checks, and dispatch decisions live in the repo
// (.github/scripts/handle-mentions.sh, battery-tested). This relay could be
// fully compromised without gaining the ability to make the agent do
// anything: every payload field is re-fetched and re-verified from the
// GitHub API before any decision.
//
// GET /__tick?key=<TEST_TOKEN> runs the exact same pipeline on demand and
// returns full diagnostics JSON (the debugging instrument; secret-gated so
// the public cannot spam dispatches).
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

async function runPipeline(env) {
  const diag = {
    pollStatus: null,
    unread: 0,
    qualifying: 0,
    reasons: {},
    dispatchStatus: null,
    dispatchBody: null,
  };

  const headers = {
    Authorization: `Bearer ${env.BOT_PAT}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "mirrobot-mention-worker",
  };

  // Poll unread notifications (the workflow marks them read once handled).
  const res = await fetch(`${GH}/notifications?all=false&per_page=30`, { headers });
  diag.pollStatus = res.status;
  if (!res.ok) {
    diag.pollError = (await res.text()).slice(0, 300);
    return diag;
  }
  const all = await res.json();
  const REASONS = new Set(["mention", "review_requested", "subscribed", "comment"]);
  const qualifying = all.filter((n) => REASONS.has(n.reason));
  diag.unread = all.length;
  diag.qualifying = qualifying.length;
  diag.reasons = all.reduce((acc, n) => ((acc[n.reason] = (acc[n.reason] || 0) + 1), acc), {});
  if (qualifying.length === 0) return diag;

  // Relay: repository_dispatch -> mention-poller.yml runs the pipeline.
  // Payload carries the raw notifications; nothing here is pre-trusted.
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
  return diag;
}

export default {
  async scheduled(event, env) {
    const diag = await runPipeline(env);
    console.log(
      `poll ${diag.pollStatus}, ${diag.unread} unread, ${diag.qualifying} qualifying, ` +
        `reasons: ${JSON.stringify(diag.reasons)}, dispatch ${diag.dispatchStatus}` +
        (diag.dispatchBody ? ` (${diag.dispatchBody})` : "") +
        (diag.pollError ? ` pollError: ${diag.pollError}` : ""),
    );
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
    const diag = await runPipeline(env);
    return Response.json(diag);
  },
};
