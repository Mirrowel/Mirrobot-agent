# mirrobot-share — self-hosted session sharing

Upstream opencode discontinued share links (opncd.ai). This replaces the
whole chain with infrastructure we own. One data contract everywhere: the
upstream share `Data[]` snapshot model (session / message / part /
session_diff / model / prefs items, keyed-merge last-write-wins, keys
derived server-side) — live and archived sessions are the same bytes and
render with the same viewer.

## Architecture

**Live** — `tools/share-plugin/mirrobot-share.js` (v1 opencode plugin)
streams events over one WebSocket per main session to the worker;
viewers watch via hibernating WebSockets. Free-tier friendly by
construction: sockets sleep while idle (zero cost), outgoing pushes are
free, incoming frames bill 20:1. A 10s-debounced batch (default) costs a
few request-equivalents per session; a watched page costs exactly one
request to open.

**Passive** — after a run, the agent's `export-session.py` exports the
session TREE (main + every subagent session in the db), normalizes to
Data[], gzips and hybrid-encrypts it (MRB2: RSA-OAEP-wrapped AES-256-CBC,
same SHARE_LINK_PUBKEY keypair) into an Actions artifact (90d) plus an
encrypted meta blob for the run summary.

## Delivery reliability (no expensive pulls)

- Every accepted sync bumps a monotonic rev; the worker acks it on the
  socket. The plugin retains unacked frames in a disk spool
  (`XDG_DATA_HOME/opencode/mirrobot-share/<sid>.{meta.json,queue.jsonl}`)
  and replays them on reconnect — zero loss while the plugin lives.
- Plugin restart mid-session: the spool carries {shareId, secret, rev};
  the plugin attaches to the SAME share and continues (verified across
  processes with `opencode run --session`).
- Swept/deleted share: the next sync re-creates it (fresh share; content
  continues from now — CI runs are born with their share, so this only
  affects 90d-idle TUI sessions).

## States (last signal wins, always resumable)

`live` (busy) / `completed` (idle, no bad signals) / `error` (idle after
any part error or retry). The next busy flips live again — old open
pages wake in place via their hibernating socket. Viewer header shows a
colored dot: green live, blue completed, red error.

**Undo needs no protocol**: opencode publishes `info.revert = {messageID}`
on the session item; the viewer hides everything from that message while
the marker is set (mirrors opencode's own semantics — verified). Edit,
undo, re-ask all render correctly with a dumb plugin.

## Subagent pages

Child sessions (`info.parentID`) route into the parent's share. URLs:
`/s/<id>` main, `/s/<id>/1`, `/2`, ... subagents ordered by first task
appearance. Task rows link to the sub-page (new tab by default — a
sender-side pref that travels with the data; in-page switching preserves
scroll). Sub-pages render the same view bound to the child session, with
their own title/version/model.

## Worker (mirrobot-share-worker)

- `GET /api/share/:id/ws` — viewer socket (hibernating; pushes frames)
- `GET /api/ws?token=CREATE_TOKEN` — plugin socket: `init`
  (create `{sessionID, ttlDays?}` or attach `{id, secret}`), `sync`
  `{items, status?}` -> ack `{rev}`, `delete`
- HTTP fallback (also curl-testable): `POST /api/share` (Bearer
  CREATE_TOKEN), `POST /api/share/:id/sync`, `GET /api/share/:id/data`,
  `DELETE /api/share/:id`
- ShareDO per share (items + rev + status + viewer sockets); ControlDO
  per plugin socket; SweeperDO daily alarm deletes shares idle beyond
  their OWN ttlDays (create-time override, capped at MAX_TTL_DAYS).
- Security: id + secret are unguessable capabilities; create needs the
  worker-level CREATE_TOKEN; logs never carry plaintext URLs.

Deploy: `npx wrangler deploy` (secret: CREATE_TOKEN; KV SHARE_INDEX;
viewer assets = ../share-viewer/dist).

## Plugin config (`mirrobot-share.config.json` next to the plugin)

Priority env > file > code defaults. Keys: workerUrl, createToken,
debounceMs (10000), modelLabel ("$Provider/$Model" — literal text sends
as-is, "Empty" sends "Empty", "" hides the model), ttlDays (90),
openTasksInNewTab (true), spoolDir. The model label is resolved from
each user message's actual model and sent as a model item riding the
same update (upstream's own robustness pattern).

## Local viewing (decrypt_share_link.py)

Paste the MRB2 meta blob / MRB1 history / `--file` an artifact: fetches
via gh, decrypts, caches Data[] JSON in `~/.cache/mirrobot/sessions/`,
and serves the SAME vendored viewer on localhost (7788-7790) while the
tool is open — live and local pages look identical by construction.
Offline fallback pages (minimal template) still render without the dist.

## Viewer (tools/share-viewer)

The upstream share page vendored (session-ui + ui + core utils + sdk
types; client-only vite+solid+tailwind build; worker format es). Scan
roots are explicit (`source(none)` + `@source` in src/app.css) — without
them utilities used only by vendor sources (w-58.5, gap-15) silently
never generate. Mirrobot additions: collapsed-by-default Thinking rows
with a left rule, status header, revert hiding, model-transition chips,
subagent pages. Build: `npm install && npm run build`; deploy = worker
assets.

## v1-plugin facts baked in (empirical, 1.18.31)

- Plugin loading in `opencode run` works via OPENCODE_CONFIG; a
  redirected XDG_CONFIG_HOME sandbox silently loads NO plugins.
- The plugin SDK client can hit the WRONG server when something listens
  on Server.url's port (4096) — local-only; the plugin no longer uses
  the SDK client at all (event stream + spool covers everything).
- `message.info.parentID` = the replied-to message (NOT a subagent
  marker); only session `info.parentID` marks child sessions.
- Task parts carry `state.metadata.sessionId` (the child session).
- Resumed sessions can emit the user message BEFORE any session.* event
  — unknown sessionIDs are treated as main (children always announce
  themselves first via session.created+parentID).

## v2 port posture

The viewer/worker/crypto speak Data[]; porting = new mappers only (v2
export shape; v2 plugin API or session.log follow-tail). Config,
states, spool, sub-page routing, and the local archive survive.
