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

// Port of the enterprise share page fold ([shareID].tsx getData) — pure,
// runs client-side on the worker snapshot Data[] items.
export function fold(items: { type: string; data: any }[], sessionID: string, shareID: string): ShareData {
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
        result.session_diff[sessionID] = item.data
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
        result.model[sessionID] = item.data
        break
    }
  }
  return result
}
