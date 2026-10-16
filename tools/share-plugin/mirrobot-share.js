// mirrobot-share — self-hosted replacement for the discontinued opencode
// share. Streams session events over one WebSocket per main session to the
// mirrobot-share-worker; viewers watch via hibernating sockets.
//
// Design contract (2026-10-16):
//  - Dumb plugin: it forwards events, never diffs. Delivery reliability =
//    ack + retain-until-acked spool (disk), replayed on reconnect.
//  - One share per MAIN session; child sessions (info.parentID) route into
//    the parent's share. Child->parent map from session lifecycle events.
//  - Status = last signal: busy -> "live"; idle -> "completed", or "error"
//    if any part error / retry was seen during the prompt. Always resumable
//    (the next busy flips live again; old viewer pages wake in place).
//  - Model label: config template ($Provider/$Model placeholders, literals,
//    "" hides) resolved from the user message's actual model and sent as a
//    model item on every user message (rides the same update - robust).
//  - Config: env > mirrobot-share.config.json (next to this file) > code
//    defaults. Keys: workerUrl, createToken, debounceMs, modelLabel,
//    ttlDays, openTasksInNewTab, spoolDir.
//  - Undo/revert needs nothing here: opencode publishes info.revert on the
//    session item; the viewer hides the reverted range while it is set.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.pathname ?? import.meta.url))

const DEFAULTS = {
  workerUrl: "https://mirrobot-share-worker.mirrowel-zz.workers.dev",
  createToken: "",
  debounceMs: 10000,
  modelLabel: "$Provider/$Model",
  ttlDays: 90,
  openTasksInNewTab: true,
  spoolDir: "",
}

function loadConfig() {
  const cfg = { ...DEFAULTS }
  try {
    const raw = JSON.parse(readFileSync(join(PLUGIN_DIR, "mirrobot-share.config.json"), "utf8"))
    if (raw && typeof raw === "object") Object.assign(cfg, raw)
  } catch {}
  if (process.env.SHARE_WORKER_URL) cfg.workerUrl = process.env.SHARE_WORKER_URL
  if (process.env.SHARE_CREATE_TOKEN) cfg.createToken = process.env.SHARE_CREATE_TOKEN
  if (process.env.SHARE_DEBOUNCE_MS) cfg.debounceMs = Number(process.env.SHARE_DEBOUNCE_MS) || cfg.debounceMs
  if (process.env.SHARE_MODEL_LABEL !== undefined) cfg.modelLabel = process.env.SHARE_MODEL_LABEL
  if (process.env.SHARE_TTL_DAYS) cfg.ttlDays = Number(process.env.SHARE_TTL_DAYS) || cfg.ttlDays
  if (process.env.SHARE_URL_FILE) cfg.urlFile = process.env.SHARE_URL_FILE
  return cfg
}

function spoolDirFor(cfg) {
  if (cfg.spoolDir) return cfg.spoolDir
  const base = process.env.XDG_DATA_HOME || (process.env.HOME ? join(process.env.HOME, ".local", "share") : "/tmp")
  return join(base, "opencode", "mirrobot-share")
}

const log = (...a) => {
  try { console.error("[mirrobot-share]", ...a) } catch {}
}

function formatLabel(template, model) {
  if (!template) return template === "" ? "" : template
  if (!model) return template
  return template
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

export const MirrobotSharePlugin = async (input) => {
  const cfg = loadConfig()
  if (!cfg.workerUrl || (!cfg.createToken && !process.env.SHARE_CREATE_TOKEN)) {
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
        queue: new Map(), // key -> item
        pending: [], // spool frames [{items, status}] awaiting ack
        timer: null,
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
      }
      sessions.set(sid, st)
      chain = chain.then(() => connect(st)).catch((e) => log("connect error", e?.message || e))
    }
    return st
  }

  // ---- spool (disk durability for restart replay) ------------------------
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
      st.shareId = meta.shareId ?? null
      st.secret = meta.secret ?? null
      st.ackedRev = meta.ackedRev ?? 0
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

  const connect = async (st) => {
    if (st.closed || st.connecting) return
    st.connecting = true
    try {
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

      // init: attach to a known share, else create one
      if (st.shareId && st.secret) {
        wsSend(st, { op: "init", attach: { id: st.shareId, secret: st.secret } })
      } else {
        wsSend(st, { op: "init", create: { sessionID: st.sid, ttlDays: cfg.ttlDays } })
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
        // share swept/removed or bad credentials: start a new one
        log("init refused:", frame.error, "- creating fresh share")
        st.shareId = null
        st.secret = null
        st.ackedRev = 0
        wsSend(st, { op: "init", create: { sessionID: st.sid, ttlDays: cfg.ttlDays } })
        return
      }
      st.shareId = frame.id
      st.secret = frame.secret
      st.ackedRev = frame.rev ?? 0
      st.wsReady = true
      st.backoff = 1000
      announceUrl(st)
      // replay anything the spool still holds beyond the acked rev
      if (st.pending.length) {
        for (const f of st.pending) wsSend(st, { op: "sync", ...f })
      } else if (st.queue.size) {
        flush(st)
      }
      return
    }
    if (frame.op === "ack") {
      st.ackedRev = frame.rev ?? st.ackedRev
      // drop acked frames from the spool (they were accepted whole)
      st.pending = []
      spoolSave(st)
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

  const flush = (st) => {
    if (st.closed) return
    const f = frameFrom(st)
    if (!f) return
    st.pending.push(f)
    spoolSave(st)
    if (st.wsReady) wsSend(st, { op: "sync", ...f })
    else flushViaHttp(st).catch(() => {})
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
    if (st.wsReady) wsSend(st, { op: "delete" })
    setTimeout(() => { try { st.ws?.close() } catch {} }, 1000)
    spoolClear(st)
  }

  // ---- events ------------------------------------------------------------
  const mainSidFor = (sid) => childToParent.get(sid) ?? sid

  const trackSession = (sid, info) => {
    if (info?.parentID) {
      // child session: its items route into the PARENT's share (incl. its
      // own session item — the sub-page needs title/version/directory)
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
          // sender-side display preferences travel with the data
          st.prefsSent = true
          enqueue(st, itemFor("prefs", { openTasksInNewTab: cfg.openTasksInNewTab !== false }, sid))
        }
        enqueue(st, itemFor("session", p.info, sid))
      } else if (t === "session.status") {
        const st = stFor(mainSidFor(sid))
        const type = p.status?.type
        if (type === "busy") {
          st.status = "live"
          scheduleFlush(st)
        } else if (type === "idle") {
          st.status = st.badSignal ? "error" : "completed"
          st.badSignal = false
          scheduleFlush(st)
        } else if (type === "retry") {
          st.badSignal = true
        }
      } else if (t === "message.updated") {
        // resumed sessions may emit the user message BEFORE any session.*
        // event — an unknown sid is always safe to treat as a main session
        // (children announce themselves via session.created+parentID first)
        const st = stFor(mainSidFor(sid))
        enqueue(st, itemFor("message", p.info, sid))
        // model label rides every user message update (robust, free)
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
        const main = mainSidFor(sid)
        const st = sessions.get(main)
        if (!st) return
        chain = chain.then(() => remove(st)).catch((e) => log("remove error", e?.message || e))
      }
    },

    dispose: async () => {
      // final flush of every open session (graceful exit; awaited)
      for (const st of sessions.values()) {
        if (st.timer) clearTimeout(st.timer)
        st.timer = null
        flush(st)
      }
      for (const st of sessions.values()) {
        try { st.ws?.close() } catch {}
      }
    },
  }
}

export default MirrobotSharePlugin
