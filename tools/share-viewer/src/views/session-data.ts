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
  part: AnyPart
}

export type ReasoningEntry = { kind: "reasoning"; text: string; part: AnyPart }

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
  ordered: (ToolEntry | ReasoningEntry)[]
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
        }
        out.push(current)
        continue
      }
      if (!current) continue
      for (const p of (data.part[m.id] ?? []) as AnyPart[]) {
        if (p.type === "text") current.response += (current.response ? "\n\n" : "") + (p.text ?? "")
        else if (p.type === "tool") {
          const entry: ToolEntry = {
            kind: "tool",
            tool: p.tool ?? "tool",
            title: String(p.state?.title ?? p.tool ?? "tool"),
            output: toolOutputText(p),
            part: p,
          }
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
  const t = entry.title
  const colon = t.indexOf(":")
  return (colon > 0 ? t.slice(colon + 1) : t).trim() || entry.tool
}
