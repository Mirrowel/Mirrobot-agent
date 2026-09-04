// mention-worker — cross-repo mention relay for the Mirrobot platform.
//
// WHY: the in-repo Mention Poller schedule costs a GitHub Actions run every
// 5 minutes even when nothing happened. This worker moves the polling to
// Cloudflare's free cron triggers: Actions then only run when a qualifying
// notification actually exists (the anti-abuse path).
//
// WHAT IT DOES (deliberately dumb — zero trust, zero logic):
//   1. polls GET /notifications for the bot ACCOUNT (reason: mention or
//      review_requested only)
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
// Secrets (wrangler secret put ...):
//   BOT_PAT      — the bot account's classic PAT (public_repo +
//                  notifications scopes)
//   DISPATCH_PAT — a fine-grained PAT with contents:write on the platform
//                  repo ONLY (repository_dispatch requirement; classic PATs
//                  would need the broad `repo` scope — don't)
// Env (wrangler.toml vars):
//   PLATFORM_REPO — "owner/name" of the repo running mention-poller.yml

const GH = "https://api.github.com";

export default {
  async scheduled(event, env) {
    const headers = {
      Authorization: `Bearer ${env.BOT_PAT}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mirrobot-mention-worker",
    };

    // Poll unread notifications (the workflow marks them read once handled).
    const res = await fetch(`${GH}/notifications?all=false&per_page=30`, { headers });
    if (!res.ok) {
      console.log(`poll failed: ${res.status} ${await res.text()}`);
      return;
    }
    const all = await res.json();
    const qualifying = all.filter(
      (n) => n.reason === "mention" || n.reason === "review_requested",
    );
    console.log(`${all.length} unread, ${qualifying.length} qualifying`);
    if (qualifying.length === 0) return;

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
    console.log(`dispatch: ${dispatch.status} ${dispatch.ok ? "ok" : await dispatch.text()}`);
  },
};
