// Shared session-data model for views. Turns the raw fold output into
// prompt-anchored sections so every view starts from the same shape:
// sections[i] = one user prompt + the assistant parts that answered it.
import { createMemo, type Accessor } from "solid-js"
import type { ShareData } from "../fold"
import { visibleMessages } from "../fold"

export type AnyPart = { type: string; text?: string; tool?: string; state?: any; [k: string]: any }

export type ToolEntry = {
  kind: "tool"
  tool: string
  title: string
  output?: string
  input?: Record<string, unknown>
  part: AnyPart
  // the owning assistant message (the vendored Part renderer wants it)
  message?: any
  // the vendored per-tool rule (edit/write/patch open naturally unless
  // deletion-only); the toolOutput toggle adds the rest on top
  defaultOpen?: boolean
}

export type ReasoningEntry = { kind: "reasoning"; text: string; part: AnyPart }

// a completion text part, positioned in the sequence where it occurred
export type TextEntry = { kind: "text"; text: string; part: AnyPart }

export type SessionSection = {
  id: string
  index: number
  prompt: string
  model?: { providerID?: string; modelID?: string }
  tools: ToolEntry[]
  reasoning: ReasoningEntry[]
  response: string
  // tools + reasoning in the order they actually occurred (the typed
  // arrays above are for views that group by kind; this one preserves
  // the interleaved sequence)
  ordered: (ToolEntry | ReasoningEntry | TextEntry)[]
  // per-prompt presentation facts (mode/model/time), classic-style
  mode?: string
  at?: number
}

export function useSessionSections(data: ShareData, sessionID: string): Accessor<SessionSection[]> {
  return createMemo(() => {
    const msgs = visibleMessages(data, sessionID)
    const out: SessionSection[] = []
    let current: SessionSection | undefined
    for (const m of msgs) {
      if (m.role === "user") {
        const parts = (data.part[m.id] ?? []) as AnyPart[]
        const prompt = (parts.find((p) => p.type === "text") as AnyPart | undefined)?.text?.trim() ?? ""
        current = {
          id: m.id,
          index: out.length,
          prompt,
          model: (m as any).model,
          tools: [],
          reasoning: [],
          response: "",
          ordered: [],
          mode: capitalize((m as any).agent),
          at: (m as any).time?.created,
        }
        out.push(current)
        continue
      }
      if (!current) continue
      for (const p of (data.part[m.id] ?? []) as AnyPart[]) {
        if (p.type === "text") {
          current.response += (current.response ? "\n\n" : "") + (p.text ?? "")
          current.ordered.push({ kind: "text", text: p.text ?? "", part: p })
        }
        else if (p.type === "tool") {
          // the task tool's output is the subagent's final response -
          // redundant in the share, never shown (even with the toggle on)
          const isTask = (p.tool ?? "") === "task"
          const entry: ToolEntry = {
            kind: "tool",
            tool: p.tool ?? "tool",
            title: String(p.state?.title ?? p.tool ?? "tool"),
            output: isTask ? undefined : toolOutputText(p),
            input: p.state?.input,
            part: p,
            message: m,
          }
          entry.defaultOpen = isTask ? false : toolDefaultOpen(entry)
          current.tools.push(entry)
          current.ordered.push(entry)
        } else if (p.type === "reasoning") {
          const entry: ReasoningEntry = { kind: "reasoning", text: p.text ?? "", part: p }
          current.reasoning.push(entry)
          current.ordered.push(entry)
        }
      }
    }
    return out
  })
}

export function toolOutputText(part: AnyPart): string | undefined {
  const out = part.state?.output ?? part.state?.metadata
  if (out == null) return undefined
  if (typeof out === "string") return out.trim() || undefined
  try {
    return JSON.stringify(out, null, 2)
  } catch {
    return String(out)
  }
}

// The invocation label the classic view shows: "Called `tool` <query part>"
export function toolCallLabel(entry: ToolEntry): string {
  return toolInvocation(entry) || entry.tool
}

// What the agent actually asked the tool to do. The synced title is often
// empty (ctx_search) or a bare path; the tool's input arguments carry the
// real query. Known argument keys first, then the first string value.
export function toolInvocation(entry: ToolEntry): string {
  const t = (entry.title ?? "").trim()
  if (t && t !== entry.tool) {
    const colon = t.indexOf(":")
    return (colon > 0 ? t.slice(colon + 1) : t).trim()
  }
  const input = entry.input as Record<string, unknown> | undefined
  if (input && typeof input === "object") {
    for (const key of ["query", "command", "description", "prompt", "pattern", "q", "search", "filePath", "path", "file", "url", "content"]) {
      const v = input[key]
      if (typeof v === "string" && v.trim()) return clip(v.trim())
    }
    for (const v of Object.values(input)) {
      if (typeof v === "string" && v.trim()) return clip(v.trim())
    }
  }
  return ""
}

// The vendored per-tool default-open rule (partDefaultOpen): the
// edit/write/patch family opens naturally unless the change is
// deletion-only; bash/shell follow a flag; everything else stays
// collapsed until clicked. Views use this instead of a blanket toggle.
const EDIT_FAMILY = new Set(["edit", "write", "patch", "apply_patch"])
function deletionOnly(meta: any): boolean {
  const files = meta?.files
  if (Array.isArray(files) && files.length > 0) {
    return files.every((f: any) => !!f && typeof f === "object" && "type" in f && f.type === "delete")
  }
  const fd = meta?.filediff
  if (fd && typeof fd === "object" && "additions" in fd && "deletions" in fd) {
    return fd.additions === 0 && typeof fd.deletions === "number" && fd.deletions > 0
  }
  return false
}

export function toolDefaultOpen(entry: ToolEntry, shell = false, edit = true): boolean {
  if (entry.tool === "bash" || entry.tool === "shell") return shell
  if (EDIT_FAMILY.has(entry.tool)) {
    if (!edit) return false
    return !deletionOnly(entry.part?.state?.metadata)
  }
  return false
}

function clip(s: string, n = 140): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

function capitalize(s?: string): string | undefined {
  if (!s) return undefined
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// The model string for a session: the plugin syncs model items whose
// `name` carries the configured label; fall back to the session info's
// model object, then to the first message that carries one.
export function sessionModelLabel(data: ShareData, sessionID: string): string {
  const items = (data.model as any)?.[sessionID]
  if (Array.isArray(items) && items.length) {
    const it = items[items.length - 1]
    if (typeof it?.name === "string" && it.name) return it.name
    if (it?.providerID && it?.id) return `${it.providerID}/${it.id}`
  }
  const info = data.session.find((s: any) => s.id === sessionID) as any
  const m = info?.model
  if (m?.providerID && m?.modelID) return `${m.providerID}/${m.modelID}`
  return ""
}

// Aggregate facts for the info panel: tokens, cost, counts, timing.
export type SessionUsage = {
  prompts: number
  toolCalls: number
  reasoningBlocks: number
  responses: number
  tokensIn: number
  tokensOut: number
  tokensReasoning: number
  cacheRead: number
  cacheWrite: number
  tokensTotal: number
  cost: number
  firstAt?: number
  lastAt?: number
}

export function sessionUsage(data: ShareData, sessionID: string): SessionUsage {
  const u: SessionUsage = {
    prompts: 0, toolCalls: 0, reasoningBlocks: 0, responses: 0,
    tokensIn: 0, tokensOut: 0, tokensReasoning: 0, cacheRead: 0, cacheWrite: 0,
    tokensTotal: 0, cost: 0,
  }
  let first = Infinity
  let last = 0
  for (const s of data.session as any[]) {
    if (s?.parentID || s?.id !== sessionID) continue
    if (s?.time?.created) first = Math.min(first, s.time.created)
    if (s?.time?.completed || s?.time?.updated) last = Math.max(last, s.time.completed ?? s.time.updated ?? 0)
  }
  for (const m of visibleMessages(data, sessionID)) {
    const info = m as any
    if (info.time?.created) {
      first = Math.min(first, info.time.created)
      last = Math.max(last, info.time.created)
    }
    if (info.time?.completed) last = Math.max(last, info.time.completed)
    if (m.role === "user") u.prompts++
    if (m.role === "assistant") {
      u.responses++
      const t = info.tokens
      if (t) {
        u.tokensIn += t.input ?? 0
        u.tokensOut += t.output ?? 0
        u.tokensReasoning += t.reasoning ?? 0
        u.cacheRead += t.cache?.read ?? 0
        u.cacheWrite += t.cache?.write ?? 0
        u.tokensTotal += t.total ?? 0
      }
      u.cost += Number(info.cost ?? 0)
    }
  }
  for (const sid2 of [sessionID]) {
    for (const [, parts] of Object.entries(data.part as Record<string, AnyPart[]>)) {
      for (const p of parts as AnyPart[]) {
        if (p.sessionID !== sid2) continue
        if (p.type === "tool") u.toolCalls++
        if (p.type === "reasoning") u.reasoningBlocks++
      }
    }
  }
  if (first !== Infinity) {
    u.firstAt = first
    u.lastAt = last || first
  }
  return u
}
