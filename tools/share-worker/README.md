# Open(code)Share — re:share

Self-hosted session sharing for opencode. Upstream discontinued share
links (opncd.ai); this replaces the whole chain with infrastructure you
own. One data contract everywhere: the upstream share `Data[]` snapshot
model (session / message / part / session_diff / model / prefs items,
keyed-merge last-write-wins, keys derived server-side) — live and
archived sessions are the same bytes and render with the same viewer.

- Title: **Open(code)Share** · tagline: *re:share — session sharing, back
  for opencode*
- Package/plugin: `openshare` (`openshare.js` + `openshare.config.json`,
  loaded like any opencode plugin)
- Worker: `openshare-worker` (Cloudflare, free-tier friendly)

The default look is the neutral upstream-derived page; deployments brand
themselves via `BRAND_*` worker vars (this deploy ships the mirrobot
example skin — swap the vars and the assets to make it yours).

## Architecture

**Live** — the plugin (`tools/share-plugin/openshare.js`) streams events
over one WebSocket per main session to the worker; viewers watch via
hibernating WebSockets. Free-tier friendly by construction: sockets
sleep while idle (zero cost), outgoing pushes are free, incoming frames
bill 20:1. A 10s-debounced batch costs a few request-equivalents per
session; a watched page costs exactly one request to open.

**Passive** — after a run, `export-session.py` (agent-side companion)
exports the session tree (main + every subagent session in the db),
normalizes to Data[], gzips and hybrid-encrypts it (MRB2:
RSA-OAEP-wrapped AES-256-CBC) into an Actions artifact plus an
encrypted meta blob for the run summary.

## Delivery reliability (no expensive pulls)

- Every accepted sync bumps a monotonic rev; the worker acks it on the
  socket. The plugin retains unacked frames in a disk spool (temporary
  buffer) and replays them on reconnect.
- The share binding `{id, secret, rev, url}` is persisted INSIDE
  opencode — session metadata (`metadata.openshare`, written via the
  session PATCH API) — so recovery never depends on the spool. The
  plugin strips the key from everything it syncs, and the worker strips
  session `metadata` on all read paths (belt and suspenders: the write
  secret must never reach viewers).
- Mismatch protocol (all logged loudly): attach refused / share gone /
  worker rev below our acked rev → fresh create (never merge into a bad
  base); nacked or dropped frames → spool replay; stale extras → left
  for the next prompt's keyed merge (and the revert marker) to correct.
- Degradation: if the session-metadata API is unreachable (e.g. a
  foreign server squats Server.url's port), the spool covers
  reconnects; a process crash loses only in-flight frames.

## States (last signal wins, always resumable)

`live` (busy) / `completed` (idle, no bad signals) / `error` (idle
after any part error or retry). The next busy flips live again — old
open pages wake in place via their hibernating socket. Viewer header
shows a colored dot (green/blue/red).

**Undo needs no protocol**: opencode publishes `info.revert` on the
session item; the viewer hides everything from that message while the
marker is set.

## Branding

The deployment skin is config-first: **`openshare.config.json`** next to
`wrangler.toml` (bundled at deploy) holds `name`, `logoUrl`,
`wordmarkUrl`, `linkUrl`, `accent`, `faviconUrl`, `backgroundUrl` — all
optional, all defaulting to the neutral upstream look. `BRAND_*` env
vars override the file when both exist (same ENV > file > defaults
chain as the plugin config). Edit the file, redeploy, done — no code.

Identity model on the page: **left header = the deployment** (logo,
links to its git when `linkUrl` is set), **right header = Open(code)
Share itself** (github mark → repo, fixed in source so the product
always promotes itself), **version badge = the tool that ran** (opencode
mark + version), **footer** = brand wordmark image or styled text
("Open(code)Share" by default).

## Viewer settings (cookie)

The gear in the header opens the settings panel — persisted in a
`osh_settings` cookie, applied pre-paint (no theme flash):

- **Theme**: system (default), forced light/dark, plus premades —
  `mirrobot` (the landing-page paper-terminal look, included by
  default), `midnight`, `sepia`, `nord`. Forced themes work via
  attribute-scoped token copies emitted by
  `tools/share-viewer/scripts/build-themes.mjs` at build time.
- **Text size**: compact / normal / roomy (root font scale).
- **Continuous mode**: render every prompt in one scroll instead of
  one-turn-at-a-time with the left selector — continuity reading.
- **Follow live scroll**: during a live share the view keeps the newest
  content visible, but only while you are already at the bottom — it
  never fights your reading position.
- **Reasoning expanded**: default open instead of collapsed (applies to
  rendered blocks immediately).
- **Background image**: on/off toggle, present only when the deployment
  sets `backgroundUrl` (rendered under a dark readability overlay).
- **Session search**: prompt filter (Ctrl+K).

Header extras: copy session as markdown, j/k prompt navigation.

## Read auth (optional, casual-eyes resistance)

`authLogin`/`authPassword` in the plugin config gate the share pages:
per-share PBKDF2-SHA256 hashes (10k iterations, per-share salt), a
branded login card, 7-day cookie session tokens (up to 5 devices), and
exponential lockout (5 fails per IP → 1min doubling to 24h; 20 total →
share-locked 24h). Credentials are sent on create AND attach: resuming
retroactively applies/updates them; empty-on-resume removes protection
(intentional owner action — write access is separately keyed).

**Write access is a different lock**: creating shares requires the
worker-level `CREATE_TOKEN`; writing (sync/delete) requires the
per-share secret held only by the plugin that created it. A URL plus
valid login still cannot write a byte.

## Subagent pages

Child sessions (`info.parentID`) route into the parent's share. URLs:
`/s/<id>` main, `/s/<id>/1`, `/2`, ... subagents ordered by first task
appearance. Task rows link to the sub-page (new tab by default — a
sender-side pref; in-page switching preserves scroll). Sub-pages render
the same view bound to the child session, with their own
title/version/model.

## Worker API

- `GET /api/share/:id/ws` — viewer socket (hibernating; auth cookie)
- `GET /api/ws?token=CREATE_TOKEN` — plugin socket: `init`
  (create/attach), `sync` → ack, `delete`
- HTTP fallback: `POST /api/share` (Bearer CREATE_TOKEN),
  `POST /api/share/:id/sync`, `GET /api/share/:id/data`,
  `POST /api/share/:id/auth`, `DELETE /api/share/:id`
- `GET /branding` — the deployment's `BRAND_*` skin (name, logoUrl,
  wordmarkUrl, linkUrl, accent, faviconUrl; all optional — absent =
  neutral default)
- ShareDO per share; ControlDO per plugin socket; SweeperDO daily alarm
  deletes shares idle beyond their own ttlDays (create-time override,
  capped at MAX_TTL_DAYS).

Deploy: `npx wrangler deploy` (secret CREATE_TOKEN; KV SHARE_INDEX;
assets = ../share-viewer/dist).

## Plugin config (`openshare.config.json`)

Priority `OPENSHARE_*` env > file > code defaults. Keys: workerUrl,
createToken, debounceMs (10000), modelLabel ("$Provider/$Model";
literal text as-is; "" hides), ttlDays (90), openTasksInNewTab (true),
authLogin/authPassword (""), spoolDir.

## Local viewing (decrypt_share_link.py, agent-side)

Paste the MRB2 meta blob / MRB1 history / `--file` an artifact:
fetches via gh, decrypts, caches Data[] JSON, and serves the SAME
viewer on localhost (7788-7790) while the tool is open. Offline
minimal-template fallback for no-dist environments.

## Viewer (tools/share-viewer)

The upstream share page vendored (session-ui + ui + core utils + sdk
types; vite+solid+tailwind client-only build). Tailwind scan roots are
explicit (`source(none)` in the vendored ui entry + `@source` lines in
src/app.css) — without them, vendor-only utilities silently never
generate. Branding swaps at runtime: logo/wordmark images, header link,
page title, favicon, accent. Default = neutral upstream look.

## v1-plugin facts baked in (empirical, 1.18.31)

- Plugins load in `opencode run` via OPENCODE_CONFIG; a redirected
  XDG_CONFIG_HOME sandbox silently loads NO plugins.
- SDK client calls are hey-api shaped: `{path: {id}}` / `{path, body}`
  — and error envelopes don't throw (check `.error` or you fail
  silently; live-caught as literal `%7Bid%7D` URLs).
- The client can hit a foreign server when something else listens on
  Server.url's port — degrade loudly, spool covers.
- `message.info.parentID` = the replied-to message; only session
  `info.parentID` marks subagent children.
- Task parts carry `state.metadata.sessionId` (the child session).
- Resumed sessions may emit the user message BEFORE any session.* event
  — unknown sids are treated as main (children announce first).

## v2 port posture

The viewer/worker/crypto speak Data[]; porting = new mappers only (v2
export shape; v2 plugin API or session.log follow-tail). Config,
states, spool+metadata binding, sub-page routing, auth, and the local
archive survive.
