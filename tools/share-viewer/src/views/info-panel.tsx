// Session info panel: the metadata no view is obliged to show - token
// accounting, cost, counts, timing, identity. A floating trigger owned at
// app level so it works in every view (classic included); the panel is a
// right-hand slide-over.
import { createSignal, For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import type { ShareData } from "../fold"
import { sessionUsage, sessionModelLabel, type SessionUsage } from "./session-data"

const [open, setOpen] = createSignal(false)
export const toggleInfoPanel = () => setOpen((v) => !v)

function Row(props: { label: string; value: string | number }) {
  return (
    <div class="flex items-baseline justify-between gap-4 py-1">
      <span class="text-12-regular text-text-weaker shrink-0">{props.label}</span>
      <span class="text-12-mono text-text-base text-right break-all">{props.value}</span>
    </div>
  )
}

function Group(props: { label: string; children: React.ReactNode }) {
  return (
    <div class="flex flex-col pt-3 border-t border-border-weak-base first:border-none first:pt-0">
      <div class="text-12-medium text-text-weaker tracking-[0.14em] uppercase pb-1">{props.label}</div>
      {props.children}
    </div>
  )
}

function fmt(n: number): string {
  if (!n) return "0"
  if (n >= 1000) return n.toLocaleString("en-US")
  return String(n)
}

function clock(at?: number): string {
  if (!at) return ""
  return new Date(at).toLocaleString("en-US", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export function InfoPanel(props: { data: ShareData; sessionID: string; source?: { status(): string; shareID: string; rev(): number } }) {
  const status = () => { try { return props.source?.status() ?? "?" } catch { return "?" } }
  const shareId = () => { try { return props.source?.shareID ?? "?" } catch { return "?" } }
  const rev = () => { try { return String(props.source?.rev?.() ?? 0) } catch { return "0" } }
  const usage = (): SessionUsage => sessionUsage(props.data, props.sessionID)
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const dur = () => {
    const u = usage()
    if (!u.firstAt) return ""
    const ms = u.lastAt - u.firstAt
    if (ms < 1000) return `${ms}ms`
    const s = Math.round(ms / 100) / 10
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
  }
  return (
    <div class="relative">
      <button
        class="fixed bottom-4 right-4 z-40 size-8 rounded-full border border-border-weak-base bg-background-base text-icon-weaker-base hover:text-icon-strong-base shadow-lg cursor-pointer flex items-center justify-center"
        title="session info"
        onClick={toggleInfoPanel}
      >
        <Icon name="information" size="small" />
      </button>
      <Show when={open()}>
        <div class="fixed bottom-14 right-4 z-50 w-80 max-h-[calc(100vh-6rem)] overflow-y-auto p-4 rounded-xl border border-border-weak-base bg-background-base shadow-xl">
          <div class="flex items-center justify-between pb-2">
            <div class="text-14-medium text-text-strong">Session info</div>
            <button
              class="text-icon-weaker-base hover:text-icon-strong-base bg-transparent border-none cursor-pointer p-1 rounded hover:bg-surface-base"
              onClick={() => setOpen(false)}
            >
              <Icon name="close-small" size="small" />
            </button>
          </div>
          <div class="flex flex-col gap-1">
            <Group label="identity">
              <Row label="title" value={String(info()?.title ?? "untitled").slice(0, 60)} />
              <Row label="session" value={info()?.id ?? props.sessionID} />
              <Show when={info()?.parentID}>
                <Row label="parent" value={String(info().parentID)} />
              </Show>
              <Row label="status" value={status()} />
              <Row label="version" value={info()?.version ? `v${info().version}` : "?"} />
              <Row label="model" value={sessionModelLabel(props.data, props.sessionID) || "?"} />
              <Row label="provider" value={(info()?.model as any)?.providerID ?? "?"} />
              <Show when={info()?.directory}>
                <Row label="worktree" value={String(info().directory)} />
              </Show>
              <Row label="share" value={shareId()} />
              <Row label="sync rev" value={rev()} />
            </Group>
            <Group label="counts">
              <Row label="prompts" value={fmt(usage().prompts)} />
              <Row label="responses" value={fmt(usage().responses)} />
              <Row label="tool calls" value={fmt(usage().toolCalls)} />
              <Row label="reasoning blocks" value={fmt(usage().reasoningBlocks)} />
            </Group>
            <Group label="tokens">
              <Row label="input" value={fmt(usage().tokensIn)} />
              <Row label="output" value={fmt(usage().tokensOut)} />
              <Row label="reasoning" value={fmt(usage().tokensReasoning)} />
              <Row label="cache read" value={fmt(usage().cacheRead)} />
              <Row label="cache write" value={fmt(usage().cacheWrite)} />
              <Row label="total" value={fmt(usage().tokensTotal)} />
              <Show when={usage().cost > 0}>
                <Row label="cost" value={`$${usage().cost.toFixed(4)}`} />
              </Show>
            </Group>
            <Group label="time">
              <Row label="started" value={clock(usage().firstAt)} />
              <Row label="last activity" value={clock(usage().lastAt)} />
              <Show when={dur()}>
                <Row label="duration" value={dur()} />
              </Show>
            </Group>
          </div>
        </div>
      </Show>
    </div>
  )
}

// silence unused-import lint in the For case (kept for future row lists)
void For
