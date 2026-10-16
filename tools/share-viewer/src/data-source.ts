// Data source resolution. Two modes, identical downstream:
//   live    — served by the share worker at /s/<id>; polls
//             /api/share/<id>/data every 2.5s and re-folds.
//   local   — served by the decrypt tool's localhost server at /s/<id>;
//             window.__MIRROBOT_SNAPSHOT__ carries {items, sessionID}
//             inline (no fetch, works for cached archives).
import { createSignal } from "solid-js"
import { fold, type ShareData } from "./fold"

export type Source = {
  mode: "live" | "local"
  shareID: string
  data: () => ShareData | undefined
  status: () => string
  error: () => string | undefined
}

function shareIdFromPath(): string {
  const parts = location.pathname.split("/").filter(Boolean)
  // /s/<id> on the worker; local server may also serve /s/<id>
  const i = parts.indexOf("s")
  return i >= 0 && parts[i + 1] ? parts[i + 1] : (parts.at(-1) ?? "")
}

export function useShareSource(): Source {
  const shareID = shareIdFromPath()
  const embedded = (window as any).__MIRROBOT_SNAPSHOT__ as
    | { items: { type: string; data: any }[]; sessionID: string }
    | undefined

  if (embedded) {
    const [data] = createSignal<ShareData>(fold(embedded.items, embedded.sessionID, shareID))
    return { mode: "local", shareID, data, status: () => "cached session (local)", error: () => undefined }
  }

  const [data, setData] = createSignal<ShareData | undefined>(undefined)
  const [status, setStatus] = createSignal("waiting for first snapshot")
  const [error, setError] = createSignal<string | undefined>(undefined)

  let stopped = false
  async function tick() {
    try {
      const r = await fetch(`/api/share/${shareID}/data`, { cache: "no-store" })
      if (r.status === 404) {
        setStatus("share not found (expired, deleted, or bad link)")
        setError("not found")
        stopped = true
        return
      }
      const body = await r.json()
      const items: { type: string; data: any }[] = body.data ?? []
      let sessionID = shareID
      for (const it of items) if (it.type === "session") sessionID = it.data.id ?? sessionID
      setData(fold(items, sessionID, shareID))
      setStatus(`live · updated ${new Date().toLocaleTimeString()}`)
    } catch {
      setStatus("connection problem — retrying")
    }
  }
  tick()
  setInterval(() => {
    if (!stopped) tick()
  }, 2500)

  return { mode: "live", shareID, data, status, error }
}
