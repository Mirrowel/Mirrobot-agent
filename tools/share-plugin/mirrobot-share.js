// mirrobot-share-plugin — self-hosted replica of the discontinued opencode
// ShareNext (v1 plugin API). Subscribes to the same five bus events the
// original consumed, dedupes by the same item keys, and pushes debounced
// batches to our own mirrobot-share-worker.
//
// Differences from upstream ShareNext (deliberate):
//   - debounce is 10s (quota discipline), not 1s
//   - dispose() performs a guaranteed final flush (upstream had none)
//   - the live URL is written to SHARE_URL_FILE + stderr (no TUI in
//     headless CI runs)
//   - sessions with info.parentID (subagent children) are ignored: CI
//     shares exactly the one main session per run
//
// Config (environment, usually injected by the workflow):
//   SHARE_WORKER_URL    e.g. https://mirrobot-share-worker.<acct>.workers.dev
//   SHARE_CREATE_TOKEN  worker-level create bearer token
//   SHARE_URL_FILE      where to write the live URL (default /tmp/share-url.txt)
//   SHARE_DEBOUNCE_MS   flush debounce (default 10000)
// When SHARE_WORKER_URL / SHARE_CREATE_TOKEN are absent the plugin no-ops
// (local interactive use stays untouched).
//
// Wire protocol: POST {base}/api/share (create), /api/share/:id/sync
// {secret, data:[items]}, DELETE /api/share/:id {secret}. Item shapes and
// merge keys are byte-compatible with upstream (key(): "session",
// "message/<id>", "part/<mid>/<pid>", "session_diff", "model").

const KEY = {
  session: () => "session",
  message: (d) => `message/${d?.id}`,
  part: (d) => `part/${d?.messageID}/${d?.id}`,
  session_diff: () => "session_diff",
  model: () => "model",
}

function itemFor(type, data) {
  const k = KEY[type]
  if (!k) return null
  const key = k(data)
  if (!key || key.includes("null") || key.includes("undefined")) return null
  return { key, item: { type, data } }
}

export const SharePlugin = async (input) => {
  const WORKER = (process.env.SHARE_WORKER_URL || "").replace(/\/+$/, "")
  const TOKEN = process.env.SHARE_CREATE_TOKEN || ""
  const URL_FILE = process.env.SHARE_URL_FILE || "/tmp/share-url.txt"
  const DEBOUNCE = Number(process.env.SHARE_DEBOUNCE_MS || 10000)

  if (!WORKER || !TOKEN) {
    return {} // unarmed: nothing configured, no hooks installed
  }

  const log = (...a) => console.error("[mirrobot-share]", ...a)

  // per-session state: { secret, id, url, queue: Map, timer, creating }
  const sessions = new Map()
  let chain = Promise.resolve() // serialize all async work (fire-and-forget host)

  const enqueue = (sessionID, entry) => {
    const st = sessions.get(sessionID)
    if (!st || !entry) return
    st.queue.set(entry.key, entry.item)
    scheduleFlush(sessionID)
  }

  const scheduleFlush = (sessionID) => {
    const st = sessions.get(sessionID)
    if (!st || st.timer || st.creating) return
    st.timer = setTimeout(() => {
      const s = sessions.get(sessionID)
      if (!s) return
      s.timer = null
      chain = chain.then(() => flush(sessionID)).catch((e) => log("flush error", e?.message || e))
    }, DEBOUNCE)
    if (typeof st.timer.unref === "function") st.timer.unref()
  }

  const flush = async (sessionID) => {
    const st = sessions.get(sessionID)
    if (!st || st.creating || st.queue.size === 0 || !st.secret) return
    const items = Array.from(st.queue.values())
    st.queue.clear()
    // worker caps batches at 500 items; chunk sequentially
    for (let i = 0; i < items.length; i += 500) {
      const chunk = items.slice(i, i + 500)
      const r = await fetch(`${WORKER}/api/share/${st.id}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: st.secret, data: chunk }),
      })
      if (!r.ok) {
        const t = await r.text().catch(() => "")
        log(`sync ${st.id} failed: ${r.status} ${t.slice(0, 120)}`)
        return // keep dropped items dropped (upstream parity: no retry)
      }
    }
  }

  const create = async (sessionID) => {
    const st = sessions.get(sessionID)
    if (!st || st.creating || st.secret) return
    st.creating = true
    try {
      const r = await fetch(`${WORKER}/api/share`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ sessionID }),
      })
      if (!r.ok) {
        log(`create failed: ${r.status} ${(await r.text().catch(() => "")).slice(0, 120)}`)
        sessions.delete(sessionID)
        return
      }
      const out = await r.json()
      st.id = out.id
      st.secret = out.secret
      st.url = out.url
      log("live:", out.url)
      try {
        const { writeFileSync } = require("node:fs")
        writeFileSync(URL_FILE, out.url + "\n")
      } catch (e) {
        log("url file write failed:", e?.message || e)
      }
      // full snapshot via the in-process SDK client (upstream full()).
      // SDK calls return a {data, error, response} envelope — unwrap .data.
      const unwrap = (res) => (res && typeof res === "object" && "data" in res ? res.data : res)
      try {
        const info = unwrap(await input.client.session.get({ id: sessionID }))
        if (info) enqueue(sessionID, itemFor("session", info))
        const msgs = unwrap(await input.client.session.messages({ id: sessionID })) ?? []
        for (const m of msgs) {
          enqueue(sessionID, itemFor("message", m.info))
          for (const p of m.parts || []) enqueue(sessionID, itemFor("part", p))
        }
      } catch (e) {
        log("full snapshot failed:", e?.message || e)
      }
      scheduleFlush(sessionID)
    } finally {
      st.creating = false
    }
  }

  const remove = async (sessionID) => {
    const st = sessions.get(sessionID)
    if (!st || !st.secret) return
    sessions.delete(sessionID)
    if (st.timer) clearTimeout(st.timer)
    try {
      await fetch(`${WORKER}/api/share/${st.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: st.secret }),
      })
    } catch (e) {
      log("remove failed:", e?.message || e)
    }
  }

  // Track sessions ONLY via session lifecycle events: session.created /
  // session.updated carry SessionInfo whose parentID marks subagent child
  // sessions (share only the main session). message.info.parentID means
  // something ELSE entirely (the message this message replies to) — never
  // filter messages on it.
  const trackSession = (sessionID, info) => {
    if (info?.parentID) return false // subagent child session
    if (!sessions.has(sessionID)) {
      sessions.set(sessionID, { queue: new Map(), timer: null, creating: false })
      chain = chain.then(() => create(sessionID)).catch((e) => log("create error", e?.message || e))
    }
    return true
  }

  return {
    event: async ({ event }) => {
      const t = event?.type
      const p = event?.properties || {}
      const sid = p.sessionID
      if (!sid) return
      if (t === "session.created" || t === "session.updated") {
        if (!trackSession(sid, p.info)) return
        enqueue(sid, itemFor("session", p.info))
      } else if (t === "message.updated") {
        if (!sessions.has(sid)) return
        enqueue(sid, itemFor("message", p.info))
      } else if (t === "message.part.updated") {
        if (!sessions.has(sid)) return
        enqueue(sid, itemFor("part", p.part))
      } else if (t === "session.diff") {
        if (!sessions.has(sid)) return
        enqueue(sid, itemFor("session_diff", p.diff))
      } else if (t === "session.deleted") {
        if (!sessions.has(sid)) return
        chain = chain.then(() => remove(sid)).catch((e) => log("remove error", e?.message || e))
      }
    },

    dispose: async () => {
      // guaranteed final flush (upstream had none) — dispose IS awaited
      for (const [sid] of sessions) {
        const st = sessions.get(sid)
        if (st?.timer) {
          clearTimeout(st.timer)
          st.timer = null
        }
      }
      await chain
      for (const sid of Array.from(sessions.keys())) {
        await flush(sid)
      }
    },
  }
}
