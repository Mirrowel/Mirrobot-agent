// openshare-worker — Open(code)Share: self-hosted session sharing for
// opencode ("re:share"). Event-driven over hibernating WebSockets.
//
// Protocol:
//   HTTP (fallback + curl/testing):
//     POST   /api/share            {sessionID, ttlDays?, authLogin?, authPassword?}
//                                  Bearer CREATE_TOKEN -> {id, secret}
//     POST   /api/share/:id/sync   {secret, data, status?} -> {ok, rev, status}
//     GET    /api/share/:id/data   -> {data, status, rev}   (401 authRequired if gated)
//     POST   /api/share/:id/auth   {login, password} -> cookie token (rate-limited)
//     DELETE /api/share/:id        {secret}
//     GET    /branding             -> BRAND_* vars as JSON (viewer skin)
//   WebSocket (primary):
//     viewer:  GET /api/share/:id/ws — hibernating; auth cookie checked;
//              pushes {op:"frame", status, rev, items} after every sync
//     plugin:  GET /api/ws?token=<CREATE_TOKEN> — one socket per process:
//              init create {sessionID, ttlDays?, authLogin?, authPassword?}
//              init attach {id, secret, authLogin?, authPassword?}
//                 (attach with empty auth values REMOVES the read gate)
//              sync {items, status?} -> ack {rev}; delete
//
// Read auth (casual-eyes resistance): per-share PBKDF2-SHA256 hashes
// (10k iterations, per-share salt — free-tier CPU friendly; the hash
// never leaves the DO), session cookie tokens (7d, up to 5 devices),
// exponential lockout per IP (5 fails -> 1min doubling to 24h) and
// per-share total (20 fails -> 24h). Writes are gated separately by
// CREATE_TOKEN (creation) and the per-share secret (sync/delete).
//
// Viewer privacy: session items never leave with their `metadata` field
// (the plugin stores its share binding there — belt and suspenders).
//
// Resumability: every accepted sync bumps a monotonic rev; plugins ack
// and replay. TTL is per-share (capped at MAX_TTL_DAYS); the sweeper
// respects each share's own TTL.

const encoder = new TextEncoder()

// Neutral code defaults for every deployment. THIS deployment's skin lives
// in openshare.config.json (bundled at build); BRAND_* env vars override
// both — same ENV > file > defaults chain as the plugin config.
import defaultBrandingFile from "./openshare.config.json"
const DEFAULT_BRANDING = {
  name: "",
  logoUrl: "",
  wordmarkUrl: "",
  linkUrl: "",
  accent: "",
  faviconUrl: "",
  backgroundUrl: "",
  ...defaultBrandingFile,
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const path = url.pathname
    const json = (code, body, headers = {}) => new Response(JSON.stringify(body), {
      status: code,
      headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
    })

    try {
      if (path === "/health") return json(200, { ok: true, service: "openshare" })

      if (path === "/branding") {
        const b = (field) => {
          const envKey = "BRAND_" + field.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase()
          return env[envKey] || DEFAULT_BRANDING[field] || ""
        }
        return new Response(JSON.stringify({
          name: b("name"),
          logoUrl: b("logoUrl"),
          wordmarkUrl: b("wordmarkUrl"),
          linkUrl: b("linkUrl"),
          accent: b("accent"),
          faviconUrl: b("faviconUrl"),
          backgroundUrl: b("backgroundUrl"),
        }), {
          headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
        })
      }

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

      const am = path.match(/^\/api\/share\/([0-9a-f]+)\/auth$/)
      if (am && req.method === "POST") {
        const body = await req.json().catch(() => ({}))
        const r = await shareStub(env, am[1]).fetch("https://do/auth", {
          method: "POST",
          headers: { "x-ip": req.headers.get("cf-connecting-ip") ?? "unknown" },
          body: JSON.stringify({ login: body.login ?? "", password: body.password ?? "" }),
        })
        const out = await r.json()
        const headers = {}
        if (out.setCookie) headers["set-cookie"] = out.setCookie
        return json(r.status, out.body ?? out, headers)
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
          body: JSON.stringify({
            id: newId,
            sessionID: body.sessionID,
            ttlDays: clampTtl(body.ttlDays, env),
            authLogin: body.authLogin ?? "",
            authPassword: body.authPassword ?? "",
          }),
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
        const token = bearer(req) || cookieToken(req, id)
        const r = await shareStub(env, id).fetch(`https://do/data?token=${encodeURIComponent(token)}`)
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

function bearer(req) {
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
}

function cookieToken(req, shareId) {
  const raw = req.headers.get("cookie") ?? ""
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=")
    if (k === `osh_${shareId}`) return v.join("=")
  }
  return ""
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

// PBKDF2-SHA256 (10k iterations: ~5ms CPU, inside the free-tier per-request
// budget; the hash stays in the DO so offline cracking isn't the threat —
// the online lockout is).
async function pbkdf2(value, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(value), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: 10000 },
    key,
    256,
  )
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("")
}

// ---------------------------------------------------------------------------
// ControlDO — one per plugin socket. Owns create/attach + forwards syncs.
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
              authLogin: frame.create.authLogin ?? "",
              authPassword: frame.create.authPassword ?? "",
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
            body: JSON.stringify({
              secret: frame.attach.secret ?? "",
              authLogin: frame.attach.authLogin,
              authPassword: frame.attach.authPassword,
            }),
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
// ShareDO — one per share: items, rev, status, auth, viewer sockets.
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
      const meta = await this.state.storage.get("meta")
      if (!meta) return new Response("gone", { status: 404 })
      if (meta.auth) {
        // browsers authenticate the WS with the session cookie
        const token = (req.headers.get("cookie") ?? "").split(";")
          .map((c) => c.trim().split("="))
          .filter(([k]) => k === `osh_${this.state.id.name}`)
          .map(([, ...v]) => v.join("="))[0] ?? ""
        if (!(await this.validToken(token))) return new Response("auth required", { status: 401 })
      }
      const pair = new WebSocketPair()
      this.state.acceptWebSocket(pair[1], ["viewer"])
      const items = (await this.state.storage.get("items")) ?? {}
      try {
        pair[1].send(JSON.stringify({ op: "frame", status: meta.status, rev: meta.rev ?? 0, items: redactItems(Object.values(items)) }))
      } catch {}
      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    if (path === "/init" && req.method === "POST") {
      const body = await req.json()
      if (!body?.id || !body?.sessionID) return json(400, { ok: false, error: "id and sessionID required" })
      const secret = randomId() + randomId()
      const now = Date.now()
      const auth = body.authLogin && body.authPassword ? await this.makeAuth(body.authLogin, body.authPassword) : null
      await this.state.storage.put("meta", {
        secret,
        sessionID: body.sessionID,
        ttlDays: body.ttlDays ?? 90,
        createdAt: now,
        lastActive: now,
        rev: 0,
        status: "live",
        auth,
        tokens: [],
        attempts: { ips: {}, total: 0, lockUntil: 0 },
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

      // resume retroactively applies/updates/clears the read gate
      if (body.authLogin !== undefined && body.authPassword !== undefined) {
        const wantAuth = body.authLogin && body.authPassword
        const sameAuth = wantAuth && meta.auth
          && meta.auth.loginHash === await pbkdf2(body.authLogin, meta.auth.salt)
          && meta.auth.passHash === await pbkdf2(body.authPassword, meta.auth.salt)
        if (wantAuth && !sameAuth) {
          meta.auth = await this.makeAuth(body.authLogin, body.authPassword)
          meta.tokens = [] // credentials changed: viewers re-login
          console.log("[attach] auth updated, tokens rotated")
        } else if (!wantAuth && meta.auth) {
          meta.auth = null
          console.log("[attach] auth removed (owner action)")
        }
        await this.state.storage.put("meta", meta)
      }

      const items = (await this.state.storage.get("items")) ?? {}
      return json(200, {
        ok: true,
        rev: meta.rev ?? 0,
        status: meta.status,
        sessionID: meta.sessionID,
        data: redactItems(Object.values(items)),
      })
    }

    if (path === "/auth" && req.method === "POST") {
      const body = await req.json()
      const ip = req.headers.get("x-ip") ?? "unknown"
      const meta = await this.state.storage.get("meta")
      if (!meta) return json(404, { ok: false, error: "share not found" })
      if (!meta.auth) return json(200, { ok: true, note: "no auth required" })

      const now = Date.now()
      const attempts = meta.attempts ?? { ips: {}, total: 0, lockUntil: 0 }
      const ipState = attempts.ips[ip] ?? { fails: 0, lockUntil: 0, streak: 0 }
      attempts.ips[ip] = ipState

      const lockedFor = Math.max(ipState.lockUntil - now, attempts.lockUntil - now)
      if (lockedFor > 0) {
        return json(429, { ok: false, error: "locked", retryAfterMs: lockedFor })
      }

      const [loginHash, passHash] = await Promise.all([
        pbkdf2(body.login ?? "", meta.auth.salt),
        pbkdf2(body.password ?? "", meta.auth.salt),
      ])
      if (loginHash !== meta.auth.loginHash || passHash !== meta.auth.passHash) {
        ipState.fails += 1
        ipState.streak += 1
        attempts.total += 1
        if (ipState.fails >= 5) {
          ipState.lockUntil = now + Math.min(60000 * 2 ** (ipState.streak - 5), 86400000)
          ipState.fails = 0
        }
        if (attempts.total >= 20) attempts.lockUntil = now + 86400000
        meta.attempts = attempts
        await this.state.storage.put("meta", meta)
        const retryAfterMs = Math.max(ipState.lockUntil - now, attempts.lockUntil - now, 0)
        return json(401, { ok: false, error: "wrong credentials", retryAfterMs })
      }

      // success: reset this IP, mint a session token (max 5, LRU)
      delete attempts.ips[ip]
      attempts.total = Math.max(0, attempts.total - 1)
      const token = randomId() + randomId()
      const tokens = [{ token, expires: now + 7 * 86400000 }, ...(meta.tokens ?? [])].slice(0, 5)
      meta.tokens = tokens
      meta.attempts = attempts
      await this.state.storage.put("meta", meta)
      const cookie = `osh_${this.state.id.name}=${token}; Path=/; Max-Age=${7 * 86400}; HttpOnly; Secure; SameSite=Lax`
      // the router translates this into a real Set-Cookie header
      return json(200, { setCookie: cookie, body: { ok: true } })
    }

    if ((path === "/sync" || path === "/sync-ws") && req.method === "POST") {
      const body = await req.json()
      const r = await this.apply(body)
      return json(r[0], r[1])
    }

    if (path === "/data") {
      const meta = await this.state.storage.get("meta")
      if (!meta) return json(404, { data: [], status: "gone", rev: 0 })
      if (meta.auth && !(await this.validToken(url.searchParams.get("token") ?? ""))) {
        return json(401, { authRequired: true })
      }
      const items = (await this.state.storage.get("items")) ?? {}
      return json(200, { data: redactItems(Object.values(items)), status: meta.status, rev: meta.rev ?? 0 })
    }

    if (path === "/meta" && req.method === "GET") {
      const meta = await this.state.storage.get("meta")
      if (!meta) return json(404, { error: "not found" })
      const { secret, auth, tokens, ...rest } = meta
      return json(200, { ...rest, auth: auth ? { set: true } : null, tokens: tokens?.length ?? 0 })
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
      // Internal-only (sweeper): the public router never routes here.
      await this.broadcast({ op: "frame", status: "gone", rev: 1, items: [] })
      await this.state.storage.deleteAll()
      try { await this.env.SHARE_INDEX.delete(`share:${this.state.id.name}`) } catch {}
      return json(200, { ok: true })
    }

    return json(404, { error: "not found" })
  }

  async makeAuth(login, password) {
    const salt = randomId() + randomId()
    const [loginHash, passHash] = await Promise.all([pbkdf2(login, salt), pbkdf2(password, salt)])
    return { salt, loginHash, passHash }
  }

  async validToken(token) {
    if (!token) return false
    const meta = await this.state.storage.get("meta")
    const now = Date.now()
    const tokens = (meta?.tokens ?? []).filter((t) => t.expires > now)
    const hit = tokens.find((t) => t.token === token)
    if (!hit) return false
    if (tokens.length !== (meta?.tokens ?? []).length) {
      meta.tokens = tokens
      await this.state.storage.put("meta", meta)
    }
    return true
  }

  async apply(body) {
    const meta = await this.state.storage.get("meta")
    if (!meta) return [404, { ok: false, error: "share not found" }]
    if (body.secret !== meta.secret) return [403, { ok: false, error: "bad secret" }]
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
    await this.broadcast({ op: "frame", status: meta.status, rev, items: redactItems(batch) })
    return [200, { ok: true, rev, status: meta.status }]
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

// Session items never leave with their metadata (the plugin stores its
// share binding — incl. the write secret — in session metadata).
function redactItems(items) {
  return items.map((it) => {
    if (it?.type === "session" && it.data?.metadata) {
      const { metadata, ...rest } = it.data
      return { ...it, data: rest }
    }
    return it
  })
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
