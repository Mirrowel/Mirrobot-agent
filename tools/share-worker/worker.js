// mirrobot-share-worker — self-hosted replacement for the discontinued
// opencode share service. Receives debounced batched session snapshots
// (the ShareNext protocol: create/sync/data/remove) from the share
// plugin running inside opencode sessions in CI, and serves the share
// viewer page at /s/<id>.
//
// Architecture (quota-aware, free tier):
//   - ShareDO per share id: holds {meta, items}. All sync traffic hits
//     the DO (SQLite-backed storage) — KV writes are NEVER used for
//     snapshot data (free tier caps KV at 1k writes/day).
//   - KV holds only the lightweight share index: ONE write per share
//     lifetime (at create), one delete at removal/sweep.
//   - SweeperDO singleton: daily alarm sweeps shares inactive for
//     TTL_DAYS (default 90). DO alarms, not cron — cron dispatch is
//     broken on this account (see mention-worker).
//
// Security model (same as opencd.ai was): the share URL is the
// capability (32 hex chars of CSPRNG); writes require the per-share
// secret minted by the plugin at create and held only in CI process
// memory; create requires the worker-level CREATE_TOKEN secret which
// rides the encrypted plugin-variable channel, never public logs.
// The worker holds no GitHub credentials and cannot touch the agent.
//
// Item merge semantics are byte-compatible with upstream ShareNext /
// enterprise share.ts: key() strings are identical, last-write-wins
// per key, snapshot sorted by key localeCompare on read. The keys are
// derived SERVER-side from item shape (never taken from the client).

const TTL_DAYS_DEFAULT = 90
const SWEEP_PERIOD_MS = 24 * 60 * 60 * 1000 // daily sweep
const ITEM_KEYS = {
  session: (d) => "session",
  message: (d) => `message/${d?.id}`,
  part: (d) => `part/${d?.messageID}/${d?.id}`,
  session_diff: (d) => "session_diff",
  model: (d) => "model",
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function randomId() {
  return hex(crypto.getRandomValues(new Uint8Array(16))) // 32 hex chars
}

function randomSecret() {
  return hex(crypto.getRandomValues(new Uint8Array(24))) // 48 hex chars
}

// Constant-time string compare (both sides are ASCII hex).
function ctEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  })
}

function log(event, fields = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), src: "share-worker", event, ...fields })
  console.log(line)
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname
    const ttlDays = Number(env.TTL_DAYS || TTL_DAYS_DEFAULT)

    try {
      if (path === "/health") return json(200, { ok: true, service: "mirrobot-share-worker" })

      if (path === "/api/share" && request.method === "POST") {
        const auth = request.headers.get("authorization") || ""
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
        if (!env.CREATE_TOKEN || !ctEqual(token, env.CREATE_TOKEN)) {
          log("create.denied", { reason: "bad-create-token" })
          return json(401, { error: "unauthorized" })
        }
        let body
        try {
          body = await request.json()
        } catch {
          return json(400, { error: "invalid json" })
        }
        const sessionID = typeof body?.sessionID === "string" ? body.sessionID : ""
        if (!sessionID || sessionID.length > 200) return json(400, { error: "sessionID required" })
        const id = randomId()
        const secret = randomSecret()
        const idObj = env.SHARE_DO.idFromName(id)
        const stub = env.SHARE_DO.get(idObj)
        const now = Date.now()
        await stub.fetch("https://do/init", {
          method: "POST",
          body: JSON.stringify({ secret, sessionID, createdAt: now, lastActive: now }),
        })
        // One KV index write per share lifetime.
        await env.SHARE_INDEX.put(`share:${id}`, JSON.stringify({ createdAt: now }))
        // Arm the sweeper (idempotent).
        await env.SWEEPER_DO.get(env.SWEEPER_DO.idFromName("singleton")).fetch("https://do/arm", { method: "POST" })
        const shareUrl = `${url.origin}/s/${id}`
        log("create.ok", { id, sessionID })
        return json(200, { id, secret, url: shareUrl })
      }

      const m = path.match(/^\/api\/share\/([0-9a-f]+)(\/sync|\/data|)$/)
      if (m) {
        const id = m[1]
        const op = m[2]
        const stub = env.SHARE_DO.get(env.SHARE_DO.idFromName(id))

        if (op === "/sync" && request.method === "POST") {
          const r = await stub.fetch("https://do/sync", { method: "POST", body: await request.text() })
          const out = await r.json()
          if (!r.ok) log("sync.rejected", { id, reason: out?.error })
          else log("sync.ok", { id, items: out?.merged ?? 0 })
          return json(r.status, out)
        }
        if (op === "/data" && request.method === "GET") {
          const r = await stub.fetch("https://do/data")
          const out = await r.json()
          if (!r.ok) log("data.miss", { id })
          return json(r.status, out)
        }
        if (op === "" && request.method === "GET") {
          const r = await stub.fetch("https://do/data")
          const out = await r.json()
          if (!r.ok) log("data.miss", { id })
          return json(r.status, out)
        }
        if (op === "" && request.method === "DELETE") {
          const r = await stub.fetch("https://do/remove", { method: "POST", body: await request.text() })
          if (r.ok) await env.SHARE_INDEX.delete(`share:${id}`)
          log(r.ok ? "remove.ok" : "remove.rejected", { id })
          return json(r.status, await r.json())
        }
      }

      // /s/<id> is served by the static viewer (assets binding, SPA
      // html_handling maps unknown paths to the viewer entry). If no
      // assets binding is configured, respond honestly.
      if (path.startsWith("/s/")) {
        if (env.ASSETS) return env.ASSETS.fetch(request)
        return new Response("share viewer not deployed yet", { status: 501, headers: { "content-type": "text/plain" } })
      }

      return json(404, { error: "not found" })
    } catch (err) {
      log("error", { message: String(err?.stack || err) })
      return json(500, { error: "internal" })
    }
  },
}

// ---------------------------------------------------------------------------
// ShareDO — one instance per share id. Holds meta + the merged snapshot.
// ---------------------------------------------------------------------------
export class ShareDO {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname
    try {
      if (path === "/init" && req.method === "POST") {
        const meta = await req.json()
        const existing = await this.state.storage.get("meta")
        if (existing) return json(409, { error: "exists" })
        await this.state.storage.put("meta", meta)
        await this.state.storage.put("items", {})
        return json(200, { ok: true })
      }

      if (path === "/sync" && req.method === "POST") {
        const meta = await this.state.storage.get("meta")
        if (!meta) return json(404, { error: "not found" })
        let body
        try {
          body = JSON.parse(await req.text())
        } catch {
          return json(400, { error: "invalid json" })
        }
        if (!ctEqual(String(body?.secret || ""), meta.secret)) return json(403, { error: "forbidden" })
        const data = Array.isArray(body?.data) ? body.data : null
        if (!data) return json(400, { error: "data array required" })
        if (data.length > 500) return json(400, { error: "batch too large" })
        const items = (await this.state.storage.get("items")) || {}
        let merged = 0
        for (const item of data) {
          const keyFn = ITEM_KEYS[item?.type]
          if (!keyFn) return json(400, { error: `unknown item type: ${item?.type}` })
          const key = keyFn(item.data)
          if (!key || key.includes("null") || key.includes("undefined")) {
            return json(400, { error: `unkeyable item of type ${item.type}` })
          }
          items[key] = item
          merged++
        }
        meta.lastActive = Date.now()
        await this.state.storage.put({ items, meta })
        return json(200, { ok: true, merged })
      }

      if (path === "/data" && req.method === "GET") {
        const meta = await this.state.storage.get("meta")
        if (!meta) return json(404, { error: "not found" })
        const items = (await this.state.storage.get("items")) || {}
        const data = Object.keys(items).sort((a, b) => a.localeCompare(b)).map((k) => items[k])
        return json(200, { data })
      }

      if (path === "/meta" && req.method === "GET") {
        const meta = await this.state.storage.get("meta")
        if (!meta) return json(404, { error: "not found" })
        return json(200, meta)
      }

      if (path === "/remove-all" && req.method === "POST") {
        // Sweeper-privileged hard delete (binding-internal only; never
        // routed from the public fetch handler).
        await this.state.storage.deleteAll()
        return json(200, { ok: true })
      }

      if (path === "/remove" && req.method === "POST") {
        const meta = await this.state.storage.get("meta")
        if (!meta) return json(404, { error: "not found" })
        let body = null
        try {
          body = JSON.parse(await req.text())
        } catch {}
        if (!body || !ctEqual(String(body.secret || ""), meta.secret)) return json(403, { error: "forbidden" })
        await this.state.storage.deleteAll()
        return json(200, { ok: true })
      }

      return json(404, { error: "not found" })
    } catch (err) {
      log("do.error", { message: String(err?.stack || err) })
      return json(500, { error: "internal" })
    }
  }
}

// ---------------------------------------------------------------------------
// SweeperDO — singleton, daily alarm. Deletes shares inactive > TTL.
// ---------------------------------------------------------------------------
export class SweeperDO {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/arm" && req.method === "POST") {
      const existing = await this.state.storage.getAlarm()
      if (!existing) {
        await this.state.storage.setAlarm(Date.now() + SWEEP_PERIOD_MS)
        log("sweep.armed", { next: SWEEP_PERIOD_MS })
      }
      return json(200, { ok: true })
    }
    if (url.pathname === "/sweep-now" && req.method === "POST") {
      await this.sweep()
      await this.state.storage.setAlarm(Date.now() + SWEEP_PERIOD_MS)
      return json(200, { ok: true })
    }
    return json(404, { error: "not found" })
  }

  async alarm() {
    await this.sweep()
    await this.state.storage.setAlarm(Date.now() + SWEEP_PERIOD_MS)
  }

  async sweep() {
    const ttlDays = Number(this.env.TTL_DAYS || TTL_DAYS_DEFAULT)
    const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000
    let listed = 0
    let deleted = 0
    let cursor
    do {
      const page = await this.env.SHARE_INDEX.list({ prefix: "share:", cursor })
      cursor = page.list_complete ? undefined : page.cursor
      for (const k of page.keys) {
        listed++
        const id = k.name.slice("share:".length)
        try {
          const stub = this.env.SHARE_DO.get(this.env.SHARE_DO.idFromName(id))
          const r = await stub.fetch("https://do/meta")
          if (r.status === 404) {
            await this.env.SHARE_INDEX.delete(k.name)
            deleted++
            continue
          }
          const meta = await r.json()
          if ((meta.lastActive || meta.createdAt || 0) < cutoff) {
            await stub.fetch("https://do/remove-all", { method: "POST" })
            await this.env.SHARE_INDEX.delete(k.name)
            deleted++
          }
        } catch (err) {
          log("sweep.item-error", { id, message: String(err) })
        }
      }
    } while (cursor)
    log("sweep.done", { ttlDays, listed, deleted })
  }
}
