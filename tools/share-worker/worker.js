// mirrobot-share-worker — event-driven session sharing.
//
// Protocol:
//   HTTP (fallback + curl/testing):
//     POST   /api/share            {sessionID, ttlDays?}  Bearer CREATE_TOKEN -> {id, secret}
//     POST   /api/share/:id/sync   {secret, data, status?} -> {ok, rev, status}
//     GET    /api/share/:id/data   -> {data, status, rev}
//     DELETE /api/share/:id        {secret}
//   WebSocket (primary):
//     viewer:  GET /s/../api route /api/share/:id/ws — terminates in ShareDO
//              (hibernating); every plugin sync broadcasts
//              {op:"frame", status, rev, items} to all viewers.
//     plugin:  GET /api/ws?token=<CREATE_TOKEN> — terminates in a fresh
//              ControlDO (hibernating). Frames:
//                -> {op:"init", create:{sessionID, ttlDays?}} | {op:"init", attach:{id, secret}}
//                <- {op:"init", ok, id, secret, rev, status, data?}
//                -> {op:"sync", items, status?}   <- {op:"ack", rev, status}
//                -> {op:"delete"}                 <- {op:"deleted"}
//              Both socket kinds hibernate between frames (zero cost);
//              outgoing messages are free.
//
// Resumability: every accepted sync bumps a monotonic rev; plugins replay
// their unacked spool on reconnect. TTL is per-share (create frame, capped
// at MAX_TTL_DAYS, default 90); the sweeper respects each share's own TTL.

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const path = url.pathname
    const json = (code, body) => new Response(JSON.stringify(body), {
      status: code,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    })

    try {
      if (path === "/health") return json(200, { ok: true })

      // ---- plugin control socket: forward the upgrade into a fresh DO ----
      if (path === "/api/ws") {
        const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("token") ?? ""
        const fwd = new Request(url.origin + "/control-ws?token=" + encodeURIComponent(token), req)
        return env.SHARE_CONTROL.get(env.SHARE_CONTROL.newUniqueId()).fetch(fwd)
      }

      // ---- viewer socket: forward the upgrade into the ShareDO ----
      const wm = path.match(/^\/api\/share\/([0-9a-f]+)\/ws$/)
      if (wm && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return shareStub(env, wm[1]).fetch(new Request(`https://do/ws`, req))
      }

      const sm = path.match(/^\/api\/share\/([0-9a-f]+)(\/sync|\/data|)$/)
      if (!sm) return json(404, { error: "not found" })
      const id = sm[1]
      const op = sm[2]

      if (req.method === "POST" && op === "") {
        const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
        if (!env.CREATE_TOKEN || auth !== env.CREATE_TOKEN) return json(401, { error: "bad create token" })
        const body = await req.json().catch(() => ({}))
        if (!body.sessionID || typeof body.sessionID !== "string") return json(400, { error: "sessionID required" })
        const newId = randomId()
        const r = await shareStub(env, newId).fetch("https://do/init", {
          method: "POST",
          body: JSON.stringify({ id: newId, sessionID: body.sessionID, ttlDays: clampTtl(body.ttlDays, env) }),
        })
        return json(r.status, await r.json())
      }

      if (req.method === "POST" && op === "/sync") {
        const body = await req.json().catch(() => ({}))
        const r = await shareStub(env, id).fetch("https://do/sync", {
          method: "POST",
          body: JSON.stringify({ secret: body.secret ?? "", data: body.data ?? [], status: body.status }),
        })
        return json(r.status, await r.json())
      }

      if (req.method === "GET" && op === "/data") {
        const r = await shareStub(env, id).fetch("https://do/data")
        return new Response(await r.text(), {
          status: r.status,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        })
      }

      if (req.method === "DELETE" && op === "") {
        const body = await req.json().catch(() => ({}))
        const r = await shareStub(env, id).fetch("https://do/remove", {
          method: "POST",
          body: JSON.stringify({ secret: body.secret ?? "" }),
        })
        return json(r.status, await r.json())
      }

      return json(404, { error: "not found" })
    } catch (e) {
      console.log("[http] error", e?.message || e)
      return json(500, { error: "internal" })
    }
  },
}

function randomId() {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
}

function clampTtl(days, env) {
  const max = Number(env.MAX_TTL_DAYS || 90)
  if (days == null || !Number.isFinite(Number(days))) return max
  return Math.max(1, Math.min(Math.floor(Number(days)), max))
}

function shareStub(env, id) {
  return env.SHARE_DO.get(env.SHARE_DO.idFromName(id))
}

// ---------------------------------------------------------------------------
// ControlDO — one per plugin socket. Owns create/attach + forwards syncs.
// Hibernates between frames.
// ---------------------------------------------------------------------------
export class ControlDO {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.attachId = undefined
    this.attachSecret = undefined
    this.token = ""
  }

  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/control-ws" && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      this.token = url.searchParams.get("token") ?? ""
      const pair = new WebSocketPair()
      this.state.acceptWebSocket(pair[1], ["control"])
      return new Response(null, { status: 101, webSocket: pair[0] })
    }
    return new Response("nf", { status: 404 })
  }

  async webSocketMessage(ws, message) {
    const send = (obj) => {
      try { ws.send(JSON.stringify(obj)) } catch {}
    }
    try {
      const frame = JSON.parse(message)

      if (frame.op === "init") {
        if (frame.create) {
          if (!this.token || !this.env.CREATE_TOKEN || this.token !== this.env.CREATE_TOKEN) {
            return send({ op: "init", ok: false, error: "bad create token" })
          }
          const id = randomId()
          const r = await this.env.SHARE_DO.get(this.env.SHARE_DO.idFromName(id)).fetch("https://do/init", {
            method: "POST",
            body: JSON.stringify({
              id,
              sessionID: frame.create.sessionID,
              ttlDays: clampTtl(frame.create.ttlDays, this.env),
            }),
          })
          const body = await r.json()
          if (!body.ok) return send({ op: "init", ok: false, error: body.error })
          this.attachId = id
          this.attachSecret = body.secret
          return send({ op: "init", ok: true, id, secret: body.secret, rev: 0, status: "live" })
        }
        if (frame.attach) {
          const r = await this.env.SHARE_DO.get(this.env.SHARE_DO.idFromName(frame.attach.id)).fetch("https://do/attach", {
            method: "POST",
            body: JSON.stringify({ secret: frame.attach.secret ?? "" }),
          })
          const body = await r.json()
          if (!body.ok) return send({ op: "init", ok: false, error: body.error })
          this.attachId = frame.attach.id
          this.attachSecret = frame.attach.secret
          return send({
            op: "init",
            ok: true,
            id: frame.attach.id,
            secret: this.attachSecret,
            rev: body.rev,
            status: body.status,
            data: body.data,
          })
        }
        return send({ op: "init", ok: false, error: "init needs create|attach" })
      }

      if (frame.op === "sync" && this.attachId) {
        const r = await this.env.SHARE_DO.get(this.env.SHARE_DO.idFromName(this.attachId)).fetch("https://do/sync", {
          method: "POST",
          body: JSON.stringify({ secret: this.attachSecret, data: frame.items ?? [], status: frame.status }),
        })
        const body = await r.json()
        return send({ op: body.ok ? "ack" : "nack", ...body })
      }

      if (frame.op === "delete" && this.attachId) {
        await this.env.SHARE_DO.get(this.env.SHARE_DO.idFromName(this.attachId)).fetch("https://do/remove", {
          method: "POST",
          body: JSON.stringify({ secret: this.attachSecret }),
        })
        this.attachId = undefined
        this.attachSecret = undefined
        return send({ op: "deleted" })
      }

      send({ op: "error", error: "unknown op" })
    } catch (e) {
      send({ op: "error", error: e?.message || String(e) })
    }
  }

  async webSocketClose() {}
}

// ---------------------------------------------------------------------------
// ShareDO — one per share: items, rev, status, hibernating viewer sockets.
// ---------------------------------------------------------------------------
export class ShareDO {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname
    const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } })

    if (path === "/ws" && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair()
      this.state.acceptWebSocket(pair[1], ["viewer"])
      // push current state so late joiners render without /data
      const meta = await this.state.storage.get("meta")
      if (meta) {
        const items = (await this.state.storage.get("items")) ?? {}
        try {
          pair[1].send(JSON.stringify({ op: "frame", status: meta.status, rev: meta.rev ?? 0, items: Object.values(items) }))
        } catch {}
      }
      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    if (path === "/init" && req.method === "POST") {
      const body = await req.json()
      if (!body?.id || !body?.sessionID) return json(400, { ok: false, error: "id and sessionID required" })
      const secret = randomId() + randomId()
      const now = Date.now()
      await this.state.storage.put("meta", {
        secret,
        sessionID: body.sessionID,
        ttlDays: body.ttlDays ?? 90,
        createdAt: now,
        lastActive: now,
        rev: 0,
        status: "live",
      })
      await this.state.storage.put("items", {})
      try {
        await this.env.SHARE_INDEX.put(`share:${body.id}`, JSON.stringify({ createdAt: now, sessionID: body.sessionID }))
        await this.env.SWEEPER.get(this.env.SWEEPER.idFromName("singleton")).fetch("https://sweeper/arm", { method: "POST" })
      } catch (e) {
        console.log("[init] index error", e?.message || e)
      }
      return json(200, { ok: true, id: body.id, secret })
    }

    if (path === "/attach" && req.method === "POST") {
      const body = await req.json()
      const meta = await this.state.storage.get("meta")
      if (!meta) return json(404, { ok: false, error: "share not found" })
      if (body.secret !== meta.secret) return json(403, { ok: false, error: "bad secret" })
      const items = (await this.state.storage.get("items")) ?? {}
      return json(200, {
        ok: true,
        rev: meta.rev ?? 0,
        status: meta.status,
        sessionID: meta.sessionID,
        data: Object.values(items),
      })
    }

    if (path === "/sync" && req.method === "POST") {
      const body = await req.json()
      const meta = await this.state.storage.get("meta")
      if (!meta) return json(404, { ok: false, error: "share not found" })
      if (body.secret !== meta.secret) return json(403, { ok: false, error: "bad secret" })
      const items = (await this.state.storage.get("items")) ?? {}
      const batch = []
      for (const it of body.data ?? []) {
        const key = itemKey(it)
        if (!key) continue
        items[key] = it
        batch.push(it)
      }
      const rev = (meta.rev ?? 0) + 1
      meta.rev = rev
      meta.lastActive = Date.now()
      if (body.status && STATUSES.has(body.status)) meta.status = body.status
      await this.state.storage.put("items", items)
      await this.state.storage.put("meta", meta)
      await this.broadcast({ op: "frame", status: meta.status, rev, items: batch })
      return json(200, { ok: true, rev, status: meta.status })
    }

    if (path === "/data") {
      const meta = await this.state.storage.get("meta")
      if (!meta) return json(404, { data: [], status: "gone", rev: 0 })
      const items = (await this.state.storage.get("items")) ?? {}
      return json(200, { data: Object.values(items), status: meta.status, rev: meta.rev ?? 0 })
    }

    if (path === "/meta" && req.method === "GET") {
      const meta = await this.state.storage.get("meta")
      if (!meta) return json(404, { error: "not found" })
      const { secret, ...rest } = meta
      return json(200, rest)
    }

    if (path === "/remove" && req.method === "POST") {
      const body = await req.json()
      const meta = await this.state.storage.get("meta")
      if (!meta) return json(404, { ok: true })
      if (body.secret !== meta.secret) return json(403, { ok: false })
      try { await this.env.SHARE_INDEX.delete(`share:${this.state.id.name}`) } catch {}
      await this.broadcast({ op: "frame", status: "gone", rev: (meta.rev ?? 0) + 1, items: [] })
      await this.state.storage.deleteAll()
      return json(200, { ok: true })
    }

    if (path === "/remove-all" && req.method === "POST") {
      // Internal-only (sweeper): the public router never routes here; DOs
      // are addressable only from this script's worker and other DOs.
      await this.broadcast({ op: "frame", status: "gone", rev: 1, items: [] })
      await this.state.storage.deleteAll()
      try { await this.env.SHARE_INDEX.delete(`share:${this.state.id.name}`) } catch {}
      return json(200, { ok: true })
    }

    return json(404, { error: "not found" })
  }

  async broadcast(frame) {
    for (const ws of this.state.getWebSockets("viewer")) {
      try { ws.send(JSON.stringify(frame)) } catch {}
    }
  }

  async webSocketMessage() {}
  async webSocketClose() {}
}

const STATUSES = new Set(["live", "completed", "error"])

// Server-side key derivation — the client never decides its own key.
function itemKey(item) {
  if (!item || typeof item !== "object") return
  const t = item.type
  const d = item.data
  if (t === "session") return "session/" + (d?.id ?? "")
  if (t === "session_diff") return "session_diff/" + (item.sessionID ?? d?.sessionID ?? "")
  if (t === "message") return "message/" + (d?.id ?? "")
  if (t === "part") return "part/" + (d?.messageID ?? "") + "/" + (d?.id ?? "")
  if (t === "model") return "model/" + (item.sessionID ?? d?.sessionID ?? "")
  if (t === "prefs") return "prefs"
  return
}

// ---------------------------------------------------------------------------
// SweeperDO — daily alarm; deletes shares idle beyond their own TTL.
// ---------------------------------------------------------------------------
export class SweeperDO {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/arm" && req.method === "POST") {
      const cur = await this.state.storage.getAlarm()
      if (!cur) await this.state.storage.setAlarm(Date.now() + 24 * 3600 * 1000)
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } })
    }
    if (url.pathname === "/sweep" && req.method === "POST") return this.sweep()
    return new Response("nf", { status: 404 })
  }

  async alarm() {
    await this.state.storage.setAlarm(Date.now() + 24 * 3600 * 1000)
    await this.sweep()
  }

  async sweep() {
    let listed = 0
    let swept = 0
    let cursor
    do {
      const page = await this.env.SHARE_INDEX.list({ cursor })
      cursor = page.list_cursor
      for (const k of page.keys) {
        if (!k.name.startsWith("share:")) continue
        listed++
        const id = k.name.slice("share:".length)
        try {
          const r = await this.env.SHARE_DO.get(this.env.SHARE_DO.idFromName(id)).fetch("https://do/meta")
          if (r.status !== 200) {
            await this.env.SHARE_INDEX.delete(k.name)
            continue
          }
          const meta = await r.json()
          const ttlMs = (meta.ttlDays ?? 90) * 24 * 3600 * 1000
          if ((meta.lastActive ?? 0) + ttlMs < Date.now()) {
            await this.env.SHARE_DO.get(this.env.SHARE_DO.idFromName(id)).fetch("https://do/remove-all", { method: "POST" })
            swept++
          }
        } catch (e) {
          console.log("[sweep] share error", id, e?.message || e)
        }
      }
    } while (cursor && listed < 5000)
    console.log(`[sweep] checked=${listed} swept=${swept}`)
    return new Response(JSON.stringify({ ok: true, listed, swept }), { headers: { "content-type": "application/json" } })
  }
}
