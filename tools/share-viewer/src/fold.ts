import type { Message, Model, Part, Session, SessionStatus, SnapshotFileDiff } from "@opencode-ai/sdk/v2"

export type ShareData = {
  sessionID: string
  shareID: string
  session: Session[]
  session_diff: { [sessionID: string]: SnapshotFileDiff[] }
  session_status: { [sessionID: string]: SessionStatus }
  message: { [sessionID: string]: Message[] }
  part: { [messageID: string]: Part[] }
  model: { [sessionID: string]: Model[] }
}

export type SubSession = {
  index: number
  sessionID: string
  session: Session
}

// Port of the enterprise share page fold ([shareID].tsx getData) — pure,
// runs client-side on the worker snapshot Data[] items.
//
// Mirrobot extensions over upstream:
//  - model items carry their own sessionID (multi-session shares: each
//    subagent turn keeps its own model label)
//  - "prefs" items carry sender-side display preferences
//  - children(): subagent sessions (parentID set), ordered by FIRST TASK
//    APPEARANCE in the parent timeline (deterministic reading order)
//  - the reverted range is hidden at RENDER time via session.info.revert
//    (opencode publishes the marker; we mirror its semantics: everything
//    from revert.messageID onward is not shown while the marker is set)
export function fold(items: { type: string; data?: any; sessionID?: string }[], sessionID: string, shareID: string): ShareData {
  const result: ShareData = {
    sessionID,
    shareID,
    session: [],
    session_diff: { [sessionID]: [] },
    session_status: { [sessionID]: { type: "idle" } },
    message: {},
    part: {},
    model: {},
  }
  for (const item of items) {
    switch (item.type) {
      case "session":
        result.session.push(item.data)
        break
      case "session_diff":
        result.session_diff[item.sessionID ?? sessionID] = item.data
        break
      case "message":
        result.message[item.data.sessionID] = result.message[item.data.sessionID] ?? []
        result.message[item.data.sessionID].push(item.data)
        break
      case "part":
        result.part[item.data.messageID] = result.part[item.data.messageID] ?? []
        result.part[item.data.messageID].push(item.data)
        break
      case "model":
        result.model[item.sessionID ?? sessionID] = item.data
        break
    }
  }
  return result
}

export function readPrefs(items: { type: string; data?: any }[]): { openTasksInNewTab?: boolean } {
  for (const item of items) {
    if (item.type === "prefs" && item.data && typeof item.data === "object") return item.data
  }
  return {}
}

// Subagent sessions bound to the main session, in task-appearance order.
export function children(data: ShareData): SubSession[] {
  const byId = new Map<string, Session>()
  for (const s of data.session) if (s.id) byId.set(s.id, s)
  const order: string[] = []
  const seen = new Set<string>()
  const msgs = data.message[data.sessionID] ?? []
  // task parts live in the main timeline; their metadata.sessionId pins the child
  for (const m of msgs) {
    for (const p of data.part[m.id] ?? []) {
      const any = p as any
      const child = any?.state?.metadata?.sessionId ?? any?.metadata?.sessionId
      if (typeof child === "string" && byId.has(child) && byId.get(child)!.parentID === data.sessionID && !seen.has(child)) {
        seen.add(child)
        order.push(child)
      }
    }
  }
  // sessions never referenced by a task part (still streaming, edge cases):
  // append by creation time
  for (const s of byId.values()) {
    if (s.parentID === data.sessionID && !seen.has(s.id)) {
      seen.add(s.id)
      order.push(s.id)
    }
  }
  return order.map((sid, i) => ({ index: i + 1, sessionID: sid, session: byId.get(sid)! }))
}

// While session.info.revert is set, everything from revert.messageID
// onward is hidden (opencode undo semantics).
export function visibleMessages(data: ShareData, sessionID: string): Message[] {
  const msgs = [...(data.message[sessionID] ?? [])].sort((a, b) => a.time.created - b.time.created)
  const info = data.session.find((s) => s.id === sessionID) as any
  const rev = info?.revert
  if (!rev?.messageID) return msgs
  const idx = msgs.findIndex((m) => m.id === rev.messageID)
  return idx < 0 ? msgs : msgs.slice(0, idx)
}
