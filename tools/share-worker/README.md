# mirrobot-share — self-hosted session sharing

Upstream opencode discontinued share links (opencd.ai). This replaces the
whole chain with infrastructure we own. One data contract everywhere:
the upstream share `Data[]` snapshot model (`session` / `message` /
`part` / `session_diff` / `model` items, keyed-merge, last-write-wins) —
live and archived sessions are the same bytes and render with the same
viewer.

## The two tracks

**Passive (every run):** after a session completes, the runner exports it
(`opencode export`), normalizes to `Data[]`, gzips, and hybrid-encrypts
it (`MRB2`: RSA-OAEP-wrapped AES-256-CBC, the existing
`SHARE_LINK_PUBKEY` keypair). The ciphertext is uploaded as an Actions
artifact (`session-<runid>.enc`, 90-day retention) and the run summary
carries an encrypted `MRB2` metadata blob.

**Live (plugin):** `tools/share-plugin/mirrobot-share.js` is a v1 plugin
replicating upstream ShareNext against our worker — same five bus events
(`session.updated/created`, `message.updated`, `message.part.updated`,
`session.diff`, `session.deleted`), same item keys, 10s debounced batched
`sync` (free-tier quota discipline; 1s upstream was overkill), and a
guaranteed `dispose()` final flush (upstream had none). The live URL is
written to `SHARE_URL_FILE` and logged to stderr; the workflow folds it
(encrypted) into the same MRB2 meta blob.

## Worker (mirrobot-share-worker)

- `POST /api/share` (Bearer `CREATE_TOKEN`) -> `{id, secret, url}`
- `POST /api/share/:id/sync` `{secret, data}` — merge, server-side keys
- `GET /api/share/:id/data` — sorted snapshot (viewer polls ~2.5s)
- `DELETE /api/share/:id` `{secret}`
- `GET /s/<id>` — live viewer page (same renderer as the local archive)

Free-tier shape: one DO per share holds the snapshot (SQLite-backed —
sync traffic never touches the KV 1k-writes/day cap; KV only indexes
share ids, one write per share lifetime). A SweeperDO alarm deletes
shares after `TTL_DAYS` (90) without a sync.

Security model, same as opencd.ai was: the URL is the capability; writes
need the per-share secret (minted by the plugin, lives only in CI
process memory); create needs the worker-level `CREATE_TOKEN` (rides the
encrypted plugin-variable channel). Logs only ever carry encrypted
blobs. The worker holds no GitHub credentials.

Deploy: `npx wrangler deploy` (secrets: `CREATE_TOKEN`; KV namespace
`SHARE_INDEX`).

## Local viewing (decrypt_share_link.py)

Paste the MRB2 meta blob (or MRB1 for history) or `--file` an artifact
`.enc`:

- meta with a live URL -> the URL is shown/opened (live view)
- meta with an artifact -> auto-fetch via `gh`, decrypt, render
- rendered sessions land in `~/.cache/mirrobot/sessions/<session>.html`
  (self-contained page) with an `index.html` library browser; cache
  TTL is `session_cache_days` (default 30, 0 = forever)

## v1-plugin findings baked into the plugin (empirical, 1.18.31)

- Plugin loading in `opencode run` works via `OPENCODE_CONFIG`; a
  redirected `XDG_CONFIG_HOME` sandbox silently loads NO plugins.
- The SDK client calls return `{data, error, response}` envelopes (and
  can 500 inside run-mode plugins on 1.18.31) — the plugin treats the
  full snapshot as best-effort; events carry everything anyway.
- `message.info.parentID` = the message this message replies to (every
  assistant message has one) — NOT a subagent marker. Only session
  `info.parentID` marks child sessions.
- In non-interactive runs `--thinking` is off by default, so reasoning
  parts may be absent from the firehose (user messages carry model as an
  object `{providerID, modelID}`, not a string).

## v2 port posture

The renderer and worker speak `Data[]`; porting = new mappers only
(v2 `opencode session export` shape; v2 plugin API `{id, setup}` with
`ctx.event.subscribe()`, or skip the plugin entirely and tail v2's
durable per-session event log with `?after=&follow=true`). Crypto,
worker, viewer, decrypt tool, and the local archive survive untouched.
