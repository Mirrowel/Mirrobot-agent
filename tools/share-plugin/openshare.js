// Open(code)Share — re:share, session sharing for opencode. Self-hosted
// replacement for the discontinued opencode share. Streams session events
// over one WebSocket per main session to an openshare-worker; viewers
// watch via hibernating sockets.
//
// Design contract:
//  - Dumb forwarder: it forwards events, never diffs. Delivery reliability
//    = ack + retain-until-acked disk spool (temporary buffer, replayed on
//    reconnect) + the share binding persisted INSIDE opencode (session
//    metadata) so recovery never depends on the spool.
//  - One share per MAIN session; child sessions (session info.parentID)
//    route into the parent's share. (message info.parentID is the
//    replied-to message — NOT a subagent marker.)
//  - Status = last signal: busy -> live; idle -> completed, or error if
//    any part error / retry was seen. Always resumable.
//  - Model label: config template ($Provider/$Model placeholders,
//    literals as-is, "" hides) resolved from the user message's actual
//    model; rides every user message (robust, free).
//  - Optional read auth: authLogin/authPassword are sent on create AND
//    attach (resume retroactively applies/updates credentials; empty on
//    attach REMOVES protection — an intentional owner action).
//  - Config: env (OPENSHARE_*) > openshare.config.json (next to this
//    file) > code defaults. Keys: workerUrl, createToken, debounceMs,
//    modelLabel, ttlDays, openTasksInNewTab, authLogin, authPassword,
//    spoolDir.
//  - Mismatch protocol: attach refused / share gone / worker rev below
//    our acked rev -> fresh create (never merge into a bad base); nacked
//    or dropped frames -> spool replay; stale extras -> left for the
//    next prompt's keyed merge to correct. All logged loudly.
//  - Undo needs nothing here: opencode publishes info.revert on the
//    session item; the viewer hides the reverted range while it is set.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.pathname ?? import.meta.url))
const METADATA_KEY = "openshare"

const DEFAULTS = {
  workerUrl: "https://openshare-worker.mirrowel-zz.workers.dev",
  createToken: "",
  debounceMs: 10000,
  modelLabel: "$Provider/$Model",
  ttlDays: 90,
  openTasksInNewTab: true,
  authLogin: "",
  authPassword: "",
  spoolDir: "",
}

function loadConfig() {
  const cfg = { ...DEFAULTS }
  try {
    const raw = JSON.parse(readFileSync(join(PLUGIN_DIR, "openshare.config.json"), "utf8"))
    if (raw && typeof raw === "object") Object.assign(cfg, raw)
  } catch {}
  if (process.env.OPENSHARE_WORKER_URL) cfg.workerUrl = process.env.OPENSHARE_WORKER_URL
  if (process.env.OPENSHARE_CREATE_TOKEN) cfg.createToken = process.env.OPENSHARE_CREATE_TOKEN
  if (process.env.OPENSHARE_DEBOUNCE_MS) cfg.debounceMs = Number(process.env.OPENSHARE_DEBOUNCE_MS) || cfg.debounceMs
  if (process.env.OPENSHARE_MODEL_LABEL !== undefined) cfg.modelLabel = process.env.OPENSHARE_MODEL_LABEL
  if (process.env.OPENSHARE_TTL_DAYS) cfg.ttlDays = Number(process.env.OPENSHARE_TTL_DAYS) || cfg.ttlDays
  if (process.env.OPENSHARE_AUTH_LOGIN !== undefined) cfg.authLogin = process.env.OPENSHARE_AUTH_LOGIN
  if (process.env.OPENSHARE_AUTH_PASSWORD !== undefined) cfg.authPassword = process.env.OPENSHARE_AUTH_PASSWORD
  if (process.env.OPENSHARE_URL_FILE) cfg.urlFile = process.env.OPENSHARE_URL_FILE
  return cfg
}

function spoolDirFor(cfg) {
  if (cfg.spoolDir) return cfg.spoolDir
  const base = process.env.XDG_DATA_HOME || (process.env.HOME ? join(process.env.HOME, ".local", "share") : "/tmp")
  return join(base, "opencode", "openshare")
}

const log = (...a) => {
  try { console.error(`[${METADATA_KEY}]`, ...a) } catch {}
}

function formatLabel(template, model) {
  if (template === "") return ""
  if (!model) return template ?? ""
  return (template ?? "")
    .replace(/\$Provider/g, model.providerID ?? "")
    .replace(/\$provider/g, model.providerID ?? "")
    .replace(/\$Model/g, model.modelID ?? "")
    .replace(/\$model/g, model.modelID ?? "")
}

function itemFor(type, data, sessionID) {
  if (type === "model") return { key: `model/${sessionID}`, item: { type, sessionID, data } }
  if (type === "prefs") return { key: "prefs", item: { type, data } }
  if (type === "session") return { key: `session/${data?.id ?? ""}`, item: { type, data } }
  if (type === "message") return { key: `message/${data?.id ?? ""}`, item: { type, data } }
  if (type === "part") return { key: `part/${data?.messageID ?? ""}/${data?.id ?? ""}`, item: { type, data } }
  if (type === "session_diff") return { key: `session_diff/${sessionID}`, item: { type, sessionID, data } }
  return undefined
}

// session items must never carry our binding (the secret would reach
// viewers) — strip our metadata key from anything we enqueue
function redact(info) {
  if (!info?.metadata || typeof info.metadata !== "object") return info
  if (!(METADATA_KEY in info.metadata)) return info
  const metadata = { ...info.metadata }
  delete metadata[METADATA_KEY]
  return { ...info, metadata }
}

export const OpenSharePlugin = async (input) => {
  const cfg = loadConfig()
  if (!cfg.workerUrl || (!cfg.createToken && !process.env.OPENSHARE_CREATE_TOKEN)) {
    log("disabled: workerUrl/createToken not configured")
    return {}
  }
  const wsUrl = cfg.workerUrl.replace(/^http/, "ws")
  const spoolRoot = spoolDirFor(cfg)
  try { mkdirSync(spoolRoot, { recursive: true }) } catch {}

  // ---- per-main-session state -------------------------------------------
  const sessions = new Map() // mainSid -> st
  const childToParent = new Map() // childSid -> mainSid
  let chain = Promise.resolve()

  const stFor = (sid) => {
    let st = sessions.get(sid)
    if (!st) {
      st = {
        sid,
        client: input?.client,
        queue: new Map(), // key -> item (not yet sent)
        pending: [], // spool frames [{items, status}] awaiting ack
        timer: null,
        metaTimer: null,
        shareId: null,
        secret: null,
        ackedRev: 0,
        ws: null,
        wsReady: false,
        backoff: 1000,
        status: "live",
        badSignal: false,
        lastSentStatus: null,
        connecting: false,
        closed: false,
        prefsSent: false,
        binding: null, // {id, secret, rev, url} mirrored into session metadata
        bindingQueried: false,
      }
      sessions.set(sid, st)
      chain = chain.then(() => connect(st)).catch((e) => log("connect error", e?.message || e))
    }
    return st
  }

  // ---- durable binding: session metadata (inside opencode's db) ---------
  // NOTE: the plugin SDK client can hit a foreign server when something
  // else listens on Server.url's port — error envelopes don't throw, so
  // every call is checked and degradation (spool covers reconnects) is
  // logged loudly instead of failing silently.
  const unwrap = (res) => {
    if (res && typeof res === "object" && "error" in res && res.error) {
      throw new Error(`client error: ${JSON.stringify(res.error).slice(0, 120)}`)
    }
    return res?.data ?? res
  }

  async function readBinding(st) {
    if (!st.client || st.bindingQueried) return
    st.bindingQueried = true
    try {
      const info = unwrap(await st.client.session.get({ path: { id: st.sid } }))
      const b = info?.metadata?.[METADATA_KEY]
      if (b && typeof b === "object" && b.id && b.secret) {
        st.shareId = b.id
        st.secret = b.secret
        st.ackedRev = b.rev ?? 0
        log(`binding recovered from session metadata: share ${b.id} rev ${st.ackedRev}`)
      }
    } catch (e) {
      log("metadata read failed (degrading to spool):", e?.message || e)
    }
  }

  async function writeBinding(st) {
    if (!st.client || !st.shareId || !st.secret) return
    try {
      const info = unwrap(await st.client.session.get({ path: { id: st.sid } }))
      const metadata = { ...(info?.metadata ?? {}) }
      metadata[METADATA_KEY] = { id: st.shareId, secret: st.secret, rev: st.ackedRev, url: `${cfg.workerUrl}/s/${st.shareId}` }
      unwrap(await st.client.session.update({ path: { id: st.sid }, body: { metadata } }))
    } catch (e) {
      log("metadata write failed (spool still covers reconnects):", e?.message || e)
    }
  }

  const scheduleBindingWrite = (st) => {
    if (st.metaTimer) return
    st.metaTimer = setTimeout(() => {
      st.metaTimer = null
      chain = chain.then(() => writeBinding(st)).catch(() => {})
    }, 30000)
  }

  // ---- spool (temporary buffer for unacked frames) ----------------------
  const metaPath = (st) => join(spoolRoot, `${st.sid}.meta.json`)
  const queuePath = (st) => join(spoolRoot, `${st.sid}.queue.jsonl`)

  const spoolSave = (st) => {
    try {
      writeFileSync(metaPath(st), JSON.stringify({ shareId: st.shareId, secret: st.secret, ackedRev: st.ackedRev, sid: st.sid }))
      writeFileSync(queuePath(st), st.pending.map((f) => JSON.stringify(f)).join("\n") + (st.pending.length ? "\n" : ""))
    } catch (e) {
      log("spool save failed", e?.message || e)
    }
  }
  const spoolLoad = (st) => {
    try {
      const meta = JSON.parse(readFileSync(metaPath(st), "utf8"))
      // metadata binding (db) is authoritative when both exist and disagree
      if (!st.shareId && meta.shareId) {
        st.shareId = meta.shareId
        st.secret = meta.secret
        st.ackedRev = meta.ackedRev ?? 0
      }
      if (existsSync(queuePath(st))) {
        st.pending = readFileSync(queuePath(st), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
      }
    } catch {
      st.pending = []
    }
  }
  const spoolClear = (st) => {
    try { rmSync(metaPath(st), { force: true }); rmSync(queuePath(st), { force: true }) } catch {}
  }

  // ---- websocket transport ----------------------------------------------
  const wsSend = (st, obj) => {
    try { st.ws.send(JSON.stringify(obj)) } catch { return false }
    return true
  }

  const announceUrl = (st) => {
    const url = `${cfg.workerUrl}/s/${st.shareId}`
    log(`live: ${url}`)
    if (cfg.urlFile) {
      try { writeFileSync(cfg.urlFile, url + "\n") } catch {}
    }
  }

  const authFrame = () => {
    // always send both (empty strings included): attach with empty values
    // REMOVES protection — an intentional owner action
    return { authLogin: cfg.authLogin ?? "", authPassword: cfg.authPassword ?? "" }
  }

  const connect = async (st) => {
    if (st.closed || st.connecting) return
    st.connecting = true
    try {
      await readBinding(st)
      spoolLoad(st)
      const ws = new WebSocket(`${wsUrl}/api/ws?token=${encodeURIComponent(cfg.createToken ?? "")}`)
      st.ws = ws
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("ws open timeout")), 15000)
        ws.addEventListener("open", () => { clearTimeout(t); resolve() }, { once: true })
        ws.addEventListener("error", () => { clearTimeout(t); reject(new Error("ws open error")) }, { once: true })
      })
      ws.addEventListener("message", (ev) => {
        let frame
        try { frame = JSON.parse(ev.data) } catch { return }
        handleFrame(st, frame).catch((e) => log("frame error", e?.message || e))
      })
      ws.addEventListener("close", () => {
        st.wsReady = false
        if (!st.closed) scheduleReconnect(st)
      })

      if (st.shareId && st.secret) {
        wsSend(st, { op: "init", attach: { id: st.shareId, secret: st.secret, ...authFrame() } })
      } else {
        wsSend(st, { op: "init", create: { sessionID: st.sid, ttlDays: cfg.ttlDays, ...authFrame() } })
      }
    } catch (e) {
      st.connecting = false
      log("socket failed:", e?.message || e, "- falling back to HTTP, will retry")
      st.wsReady = false
      flushViaHttp(st).catch(() => {})
      scheduleReconnect(st)
      return
    }
    st.connecting = false
  }

  const scheduleReconnect = (st) => {
    if (st.closed || st.reconnectTimer) return
    const wait = st.backoff
    st.backoff = Math.min(st.backoff * 2, 60000)
    st.reconnectTimer = setTimeout(() => {
      st.reconnectTimer = null
      chain = chain.then(() => connect(st)).catch((e) => log("reconnect error", e?.message || e))
    }, wait)
  }

  const handleFrame = async (st, frame) => {
    if (frame.op === "init") {
      if (!frame.ok) {
        // share swept / removed / revoked: start fresh, never merge into a
        // bad base (mismatch protocol)
        log("init refused:", frame.error, "- creating fresh share")
        st.shareId = null
        st.secret = null
        st.ackedRev = 0
        st.pending = []
        wsSend(st, { op: "init", create: { sessionID: st.sid, ttlDays: cfg.ttlDays, ...authFrame() } })
        return
      }
      if (frame.rev != null && frame.rev < st.ackedRev) {
        // worker lost data behind our back: treat as gone
        log(`mismatch: worker rev ${frame.rev} < acked ${st.ackedRev} - recreating`)
        st.shareId = null
        st.secret = null
        st.ackedRev = 0
        st.pending = []
        wsSend(st, { op: "init", create: { sessionID: st.sid, ttlDays: cfg.ttlDays, ...authFrame() } })
        return
      }
      st.shareId = frame.id
      st.secret = frame.secret
      st.ackedRev = frame.rev ?? 0
      st.wsReady = true
      st.backoff = 1000
      announceUrl(st)
      scheduleBindingWrite(st)
      spoolSave(st)
      if (st.pending.length) {
        for (const f of st.pending) wsSend(st, { op: "sync", ...f })
      } else if (st.queue.size) {
        flush(st)
      }
      return
    }
    if (frame.op === "ack") {
      st.ackedRev = frame.rev ?? st.ackedRev
      st.pending = []
      spoolSave(st)
      scheduleBindingWrite(st)
      return
    }
    if (frame.op === "nack" || frame.op === "error") {
      log("worker refused frame:", JSON.stringify(frame).slice(0, 200))
    }
  }

  // ---- flush -------------------------------------------------------------
  const frameFrom = (st) => {
    const items = Array.from(st.queue.values())
    st.queue.clear()
    const statusChanged = st.status !== st.lastSentStatus
    if (!items.length && !statusChanged) return null
    st.lastSentStatus = st.status
    return { items, status: st.status }
  }

  // returns a promise when the frame goes out via HTTP (the dispose path
  // awaits it - an unawaited fetch dies with the exiting process and the
  // final status never lands, live-caught as shares stuck on "live")
  const flush = (st) => {
    if (st.closed) return
    const f = frameFrom(st)
    if (!f) return
    st.pending.push(f)
    spoolSave(st)
    if (st.wsReady) {
      wsSend(st, { op: "sync", ...f })
      return
    }
    return flushViaHttp(st)
  }

  const flushViaHttp = async (st) => {
    if (!st.shareId || !st.pending.length) return
    const f = st.pending[st.pending.length - 1]
    const r = await fetch(`${cfg.workerUrl}/api/share/${st.shareId}/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: st.secret, data: f.items, status: f.status }),
    }).catch(() => null)
    if (r && r.ok) {
      const body = await r.json().catch(() => ({}))
      st.ackedRev = body.rev ?? st.ackedRev
      st.pending = []
      spoolSave(st)
    }
  }

  const scheduleFlush = (st) => {
    if (st.timer) return
    const jitter = 0.8 + Math.random() * 0.4
    st.timer = setTimeout(() => {
      st.timer = null
      chain = chain.then(() => flush(st)).catch((e) => log("flush error", e?.message || e))
    }, cfg.debounceMs * jitter)
  }

  const enqueue = (st, entry) => {
    if (!st || !entry) return
    st.queue.set(entry.key, entry.item)
    scheduleFlush(st)
  }

  const remove = (st) => {
    st.closed = true
    if (st.timer) clearTimeout(st.timer)
    if (st.metaTimer) clearTimeout(st.metaTimer)
    if (st.wsReady) wsSend(st, { op: "delete" })
    setTimeout(() => { try { st.ws?.close() } catch {} }, 1000)
    spoolClear(st)
    try {
      chain = chain.then(async () => {
        if (!st.client) return
        const res = await st.client.session.get({ path: { id: st.sid } }).catch(() => null)
        const info = res?.data ?? res
        if (info?.metadata?.[METADATA_KEY]) {
          const metadata = { ...info.metadata }
          delete metadata[METADATA_KEY]
          await st.client.session.update({ path: { id: st.sid }, body: { metadata } }).catch(() => {})
        }
      })
    } catch {}
  }

  // ---- events ------------------------------------------------------------
  const mainSidFor = (sid) => childToParent.get(sid) ?? sid

  const trackSession = (sid, info) => {
    if (info?.parentID) {
      const parent = childToParent.get(sid) ?? info.parentID
      childToParent.set(sid, parent)
      return stFor(parent)
    }
    return stFor(sid)
  }

  return {
    event: async ({ event }) => {
      const t = event?.type
      const p = event?.properties || {}
      const sid = p.sessionID
      if (!sid) return

      if (t === "session.created" || t === "session.updated") {
        const st = trackSession(sid, p.info)
        if (!st) return
        if (!st.prefsSent) {
          st.prefsSent = true
          enqueue(st, itemFor("prefs", { openTasksInNewTab: cfg.openTasksInNewTab !== false }, sid))
        }
        enqueue(st, itemFor("session", redact(p.info), sid))
      } else if (t === "session.status") {
        const st = stFor(mainSidFor(sid))
        const type = p.status?.type
        if (type === "busy") {
          st.status = "live"
          scheduleFlush(st)
        } else if (type === "idle") {
          st.status = st.badSignal ? "error" : "completed"
          st.badSignal = false
          // terminal state: flush NOW, not on the debounce - the process
          // can exit before a 3s timer fires and the final status (the
          // whole "completed" signal) would be lost with it
          if (st.timer) clearTimeout(st.timer)
          st.timer = null
          flush(st)
        } else if (type === "retry") {
          st.badSignal = true
        }
      } else if (t === "message.updated") {
        // resumed sessions may emit the user message BEFORE any session.*
        // event — an unknown sid is always safe to treat as main (children
        // announce via session.created+parentID first)
        const st = stFor(mainSidFor(sid))
        enqueue(st, itemFor("message", p.info, sid))
        if (p.info?.role === "user" && p.info?.model) {
          const label = formatLabel(cfg.modelLabel, p.info.model)
          enqueue(st, itemFor("model", [{ id: p.info.model.modelID, providerID: p.info.model.providerID, name: label }], sid))
        }
      } else if (t === "message.part.updated") {
        const st = stFor(mainSidFor(sid))
        if (p.part?.state?.status === "error") st.badSignal = true
        enqueue(st, itemFor("part", p.part, sid))
      } else if (t === "session.diff") {
        const st = stFor(mainSidFor(sid))
        enqueue(st, itemFor("session_diff", p.diff, sid))
      } else if (t === "session.deleted") {
        const st = sessions.get(mainSidFor(sid))
        if (!st) return
        chain = chain.then(() => remove(st)).catch((e) => log("remove error", e?.message || e))
      }
    },

    dispose: async () => {
      for (const st of sessions.values()) {
        if (st.timer) clearTimeout(st.timer)
        st.timer = null
        const flushed = flush(st)
        if (flushed && typeof flushed.then === "function") await flushed.catch(() => {})
        if (st.metaTimer) clearTimeout(st.metaTimer)
        st.metaTimer = null
        await writeBinding(st).catch(() => {})
      }
      for (const st of sessions.values()) {
        try { st.ws?.close() } catch {}
      }
    },
  }
}

export default OpenSharePlugin
