// Data source. Two modes, identical downstream:
//   live    — served by the share worker at /s/<id>[/<sub>]: one GET /data,
//             then a hibernating WebSocket; every plugin sync pushes
//             {op:"frame", status, rev, items}; items merge client-side by
//             key and the fold re-runs. Polling (5s) only if WS fails.
//   local   — served by the decrypt tool's localhost server at /s/<id>:
//             window.__MIRROBOT_SNAPSHOT__ carries {items, sessionID} inline.
import { createSignal } from "solid-js"
import { fold, readPrefs, type ShareData } from "./fold"

export type Source = {
  mode: "live" | "local"
  shareID: string
  sub: number | undefined
  data: () => ShareData | undefined
  ready: () => boolean
  status: () => string
  rev: () => number
  prefs: () => { openTasksInNewTab?: boolean }
  error: () => string | undefined
}

function parsePath(): { shareID: string; sub: number | undefined } {
  const parts = location.pathname.split("/").filter(Boolean)
  const i = parts.indexOf("s")
  const id = i >= 0 && parts[i + 1] ? parts[i + 1] : (parts.at(-1) ?? "")
  const sub = i >= 0 && parts[i + 2] && /^\d+$/.test(parts[i + 2]) ? Number(parts[i + 2]) : undefined
  return { shareID: id, sub }
}

export function useShareSource(): Source {
  const { shareID, sub } = parsePath()
  const embedded = (window as any).__MIRROBOT_SNAPSHOT__ as
    | { items: { type: string; data?: any; sessionID?: string }[]; sessionID: string }
    | undefined

  const [items, setItems] = createSignal<Map<string, any>>(new Map())
  const [status, setStatus] = createSignal("waiting")
  const [rev, setRev] = createSignal(0)
  const [error, setError] = createSignal<string | undefined>(undefined)

  const merge = (incoming: any[]) => {
    setItems((prev) => {
      const next = new Map(prev)
      for (const it of incoming ?? []) {
        const key = it.type === "session" ? `session/${it.data?.id ?? ""}`
          : it.type === "message" ? `message/${it.data?.id ?? ""}`
          : it.type === "part" ? `part/${it.data?.messageID ?? ""}/${it.data?.id ?? ""}`
          : it.type === "model" ? `model/${it.sessionID ?? ""}`
          : it.type === "prefs" ? "prefs"
          : it.type === "session_diff" ? `session_diff/${it.sessionID ?? ""}`
          : null
        if (key) next.set(key, it)
      }
      return next
    })
  }

  if (embedded) {
    merge(embedded.items ?? [])
    setStatus("cached")
    const all = () => Array.from(items().values())
    const sessionID = () => embedded.sessionID
    return {
      mode: "local",
      shareID,
      sub,
      data: () => fold(all(), sessionID(), shareID),
      ready: () => all().some((i) => i.type === "session"),
      status,
      rev,
      prefs: () => readPrefs(all()),
      error,
    }
  }

  let stopped = false
  let ws: WebSocket | undefined
  let pollTimer: any
  let wsRetryTimer: any

  const wire = () => {
    try {
      ws = new WebSocket(`wss://${location.host}/api/share/${shareID}/ws`)
    } catch {
      startPolling()
      return
    }
    ws.addEventListener("message", (ev) => {
      let frame: any
      try { frame = JSON.parse(ev.data) } catch { return }
      if (frame.op !== "frame") return
      merge(frame.items ?? [])
      setRev(frame.rev ?? 0)
      if (frame.status === "gone") {
        setStatus("gone")
        stopped = true
        cleanup()
        return
      }
      setStatus(frame.status ?? "live")
    })
    ws.addEventListener("open", () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined }
    })
    ws.addEventListener("close", () => {
      if (stopped) return
      // worker redeploy / network blip: brief retry, poll meanwhile
      startPolling()
      wsRetryTimer = setTimeout(wire, 15000)
    })
  }

  const startPolling = () => {
    if (pollTimer) return
    pollTimer = setInterval(tick, 5000)
  }
  const cleanup = () => {
    if (pollTimer) clearInterval(pollTimer)
    if (wsRetryTimer) clearTimeout(wsRetryTimer)
    try { ws?.close() } catch {}
  }

  async function tick() {
    try {
      const r = await fetch(`/api/share/${shareID}/data`, { cache: "no-store" })
      if (r.status === 404) {
        setStatus("gone")
        setError("not found")
        stopped = true
        cleanup()
        return
      }
      const body = await r.json()
      merge(body.data ?? [])
      setRev(body.rev ?? 0)
      setStatus(body.status ?? "live")
    } catch {
      // transient; WS or the next tick recovers
    }
  }

  tick().then(wire)
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !stopped && ws?.readyState !== WebSocket.OPEN) tick()
  })

  const all = () => Array.from(items().values())
  const sessionID = () => {
    for (const it of all()) if (it.type === "session" && !it.data?.parentID) return it.data.id as string
    return shareID
  }
  return {
    mode: "live",
    shareID,
    sub,
    data: () => fold(all(), sessionID(), shareID),
    ready: () => all().some((i) => i.type === "session"),
    status,
    rev,
    prefs: () => readPrefs(all()),
    error,
  }
}
