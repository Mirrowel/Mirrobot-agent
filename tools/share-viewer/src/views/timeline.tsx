// timeline: the chronology skin over the shared base. A vertical rail on
// the left of each turn carries one node per event: prompts are major
// rings with clock time and the delta since the previous turn ended,
// tool calls are minor ticks with their duration, response completions
// are terminal squares with the turn duration, idle gaps between turns
// get a dotted marker. Chrome: a period header (time range, duration,
// counts, version, model, status, settings chip) and a rail end-cap
// footer. The always-visible prompt selector rides the base Nav slot,
// with the activity-density strip as its mini-map.
import { For, Show, createContext, useContext, createEffect, createSignal, type JSX } from "solid-js"
import { BaseSessionView, type Skin, type SkinWrappers } from "./base-view"
import { SettingsBody, saveSettingsScroll, restoreSettingsScroll } from "../settings-panel"
import { useSessionSections, type SessionSection } from "./session-data"
import type { ViewEntry } from "./registry"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { DateTime } from "luxon"
import { Title } from "@solidjs/meta"

const COLS = "grid grid-cols-[3rem_1.25rem_1fr] sm:grid-cols-[3.75rem_1.5rem_1fr] gap-x-2 sm:gap-x-3"
const LINE = "absolute inset-y-0 left-1/2 -ml-[0.5px] w-px bg-border-strong-base"

const finite = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined

function fmtDur(ms: number | undefined): string | undefined {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return undefined
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(/\.0$/, "")}s`
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${String(m % 60).padStart(2, "0")}m`
  const d = Math.floor(h / 24)
  return `${d}d${h % 24}h`
}

const fmtClock = (t: number | undefined) =>
  t == null ? undefined : DateTime.fromMillis(t).toFormat("HH:mm")

const pad2 = (n: number) => String(n).padStart(2, "0")

const promptTitle = (s: { prompt: string }) =>
  (s.prompt.split("\n")[0] || "(empty prompt)").slice(0, 60)

// the last known end time of the turn before the given index: the
// shared sections list, mirrored here by the header skin (the turn
// wrappers have no data access, only the section object)
const [sharedSections, setSharedSections] = createSignal<SessionSection[]>([])

function prevEndAt(index: number): number | undefined {
  const prev = sharedSections()[index - 1]
  if (!prev) return undefined
  let end: number | undefined
  for (const e of prev.ordered) {
    const t = e.kind === "tool" ? finite(e.part?.state?.time?.end) : undefined
    if (t != null && (end == null || t > end)) end = t
  }
  return end ?? prev.at
}

const deltaMsOf = (s: SessionSection): number | undefined => {
  const from = prevEndAt(s.index)
  if (s.at == null || from == null || s.at < from) return undefined
  return s.at - from
}

// per-turn duration, shared from the turn wrapper to its response rows
const TurnTime = createContext<{ dur?: string }>({})

function Rail(props: { node: JSX.Element }) {
  return (
    <div class="relative flex justify-center">
      <div class={LINE} />
      {props.node}
    </div>
  )
}

function GapRow(props: { label: string }) {
  return (
    <div class={COLS}>
      <div class="pt-2.5 text-right text-12-mono text-text-weaker">{props.label}</div>
      <Rail
        node={
          <div class="relative z-10 mt-3 flex flex-col items-center gap-[3px]">
            <span class="size-[3px] rounded-full bg-icon-weak-base" />
            <span class="size-[3px] rounded-full bg-icon-weak-base" />
            <span class="size-[3px] rounded-full bg-icon-weak-base" />
          </div>
        }
      />
      <div class="pt-2.5 text-12-mono text-text-weaker opacity-70">idle</div>
    </div>
  )
}

function SpacerRow(props: { h: string }) {
  return (
    <div class={COLS} style={{ height: props.h }}>
      <div />
      <div class="relative">
        <div class={LINE} />
      </div>
      <div />
    </div>
  )
}

// ------------------------------------------------------- header/footer ----

function TimelineHeader(props: Parameters<NonNullable<SkinWrappers["Header"]>>[0]) {
  const [open, setOpen] = createSignal(false)
  const secs = useSessionSections(props.data, props.sessionID)
  createEffect(() => setSharedSections(secs()))
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const brand = () => props.source.branding()

  const span = () => {
    let start: number | undefined
    let end: number | undefined
    for (const s of secs()) {
      if (s.at != null) {
        if (start == null || s.at < start) start = s.at
        if (end == null || s.at > end) end = s.at
      }
      for (const e of s.ordered) {
        const t = e.kind === "tool" ? finite(e.part?.state?.time?.end) : undefined
        if (t != null && (end == null || t > end)) end = t
      }
    }
    if (start == null) start = finite(info()?.time?.created)
    if (end == null) end = finite(info()?.time?.updated)
    return { start, end }
  }

  const range = () => {
    const { start, end } = span()
    if (start == null || end == null) return undefined
    const a = DateTime.fromMillis(start)
    const b = DateTime.fromMillis(end)
    if (a.hasSame(b, "day")) return { main: `${a.toFormat("HH:mm")} → ${b.toFormat("HH:mm")}`, sub: a.toFormat("dd MMM yyyy") }
    return { main: `${a.toFormat("dd MMM HH:mm")} → ${b.toFormat("dd MMM HH:mm")}`, sub: undefined }
  }

  const total = () => {
    const { start, end } = span()
    return start != null && end != null && end >= start ? fmtDur(end - start) : undefined
  }

  const counts = () => {
    let tools = 0
    for (const s of secs()) tools += s.tools.length
    return { turns: secs().length, tools }
  }

  const statusClass = () =>
    props.status === "live"
      ? "text-icon-success-base border-icon-success-base"
      : props.status === "error"
        ? "text-icon-critical-base border-icon-critical-base"
        : "text-text-weaker border-border-strong-base"

  return (
    <>
      <Title>
        {info()?.title ?? "session"} | {brand().name || "openshare"}
      </Title>
      <header class="shrink-0 bg-background-stronger border-b border-border-weak-base relative z-30">
        <div class="max-w-[52rem] mx-auto px-4 sm:px-6">
          <div class="flex items-center gap-3 pt-3">
            <Show when={props.isSub && props.onBack}>
              <button
                class="flex items-center gap-1 bg-transparent border-none cursor-pointer text-12-regular text-text-weaker hover:text-text-base shrink-0 transition-colors duration-150"
                onClick={() => props.onBack?.()}
              >
                <Icon name="arrow-left" size="small" />
                main
              </button>
            </Show>
            <Show
              when={brand().logoUrl}
              fallback={
                <Show when={brand().name}>
                  <a
                    href={brand().linkUrl || "#"}
                    class="shrink-0 text-12-mono text-text-weaker hover:text-text-base transition-colors duration-150"
                  >
                    {brand().name}
                  </a>
                </Show>
              }
            >
              <a href={brand().linkUrl || "#"} class="shrink-0">
                <img src={brand().logoUrl} alt="" class="h-4.5 w-auto rounded-sm" />
              </a>
            </Show>
            <h1 class="flex-1 min-w-0 truncate text-16-medium text-text-strong">{info()?.title ?? "session"}</h1>
            <span class={`shrink-0 text-12-mono uppercase tracking-widest border rounded px-1.5 py-0.5 ${statusClass()}`}>
              {props.status}
            </span>
            <Show when={props.model}>
              <span class="shrink-0 text-12-mono text-text-weaker truncate max-w-48 hidden sm:inline">{props.model}</span>
            </Show>
            <span class="flex items-center gap-1.5 shrink-0 text-12-mono text-text-weaker">
              <Mark class="h-3" />
              v{info()?.version ?? "?"}
            </span>
            <div class="relative shrink-0">
              <button
                class="flex items-center gap-1 h-7 px-2 rounded-md border border-border-weak-base text-12-mono text-text-weaker hover:text-text-base cursor-pointer transition-colors duration-150"
                onClick={() => setOpen(!open())}
              >
                settings
              </button>
              <Show when={open()}>
                <div
                  class="absolute top-8 right-0 z-[70] w-72 max-h-[calc(100vh-4rem)] overflow-y-auto p-4 rounded-xl border border-border-weak-base bg-background-base shadow-xl"
                  onScroll={saveSettingsScroll}
                  ref={restoreSettingsScroll}
                >
                  <SettingsBody
                    settings={props.settings}
                    update={props.updateSettings}
                    branding={brand()}
                    search={props.search}
                    onSearch={props.onSearch}
                  />
                </div>
              </Show>
            </div>
          </div>
          <div class="flex items-center gap-3 pt-1.5 pb-2.5 overflow-x-auto no-scrollbar">
            <Show when={range()} fallback={<span class="shrink-0 text-12-mono text-text-weaker">no timestamps</span>}>
              {(r) => (
                <>
                  <span class="shrink-0 text-12-mono text-text-base">{r().main}</span>
                  <Show when={r().sub}>
                    <span class="shrink-0 text-12-mono text-text-weaker">{r().sub}</span>
                  </Show>
                </>
              )}
            </Show>
            <Show when={total()}>
              {(d) => <span class="shrink-0 text-12-mono text-text-weaker">· {d()} total</span>}
            </Show>
            <span class="shrink-0 text-12-mono text-text-weaker">
              · {counts().turns} turn{counts().turns === 1 ? "" : "s"} · {counts().tools} tool call
              {counts().tools === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </header>
    </>
  )
}

function RailEnd(props: Parameters<NonNullable<SkinWrappers["Footer"]>>[0]) {
  const brand = () => props.source.branding()
  const lastEnd = () => {
    let end: number | undefined
    for (const s of sharedSections()) {
      if (s.at != null && (end == null || s.at > end)) end = s.at
      for (const e of s.ordered) {
        const t = e.kind === "tool" ? finite(e.part?.state?.time?.end) : undefined
        if (t != null && (end == null || t > end)) end = t
      }
    }
    return end
  }
  return (
    <div class="shrink-0 px-4 sm:px-6 py-3 border-t border-border-weak-base bg-background-base">
      <div class="max-w-[52rem] mx-auto flex items-center justify-between gap-4 text-12-mono text-text-weaker">
        <span class="flex items-center gap-2 min-w-0">
          <Show when={brand().logoUrl}>
            <img src={brand().logoUrl} alt="" class="h-4 rounded-sm" />
          </Show>
          <span class="truncate">
            {brand().wordmarkUrl ? "" : `${brand().name ? brand().name + " · " : ""}Open(code)Share`}
          </span>
          <Show when={brand().wordmarkUrl}>
            <img src={brand().wordmarkUrl} alt="" class="h-3.5" />
          </Show>
        </span>
        <span class="flex items-center gap-2 shrink-0">
          <span class="flex items-center gap-1.5">
            <Show
              when={props.source.status() === "live"}
              fallback={<span class="w-2.5 h-[3px] rounded-[1px] bg-icon-strong-base" />}
            >
              <span class="size-2 rounded-full bg-icon-success-base animate-pulse" />
            </Show>
            end of session
            <Show when={fmtClock(lastEnd())}>
              {(c) => <span class="opacity-70">· {c()}</span>}
            </Show>
          </span>
          <a
            href="https://github.com/Mirrowel/Mirrobot-agent"
            target="_blank"
            rel="noreferrer"
            class="text-icon-weaker-base hover:text-icon-strong-base"
          >
            <Icon name="github" size="small" />
          </a>
        </span>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- nav ----

function TimelineNav(props: { sections: SessionSection[]; active: number; onSelect: (i: number) => void }) {
  const maxTools = () => Math.max(1, ...props.sections.map((s) => s.tools.length))
  return (
    <div class="w-52 shrink-0 flex flex-col">
      <div class="text-12-medium text-text-weaker tracking-[0.14em] uppercase mb-2 px-2">prompts</div>
      <For each={props.sections}>
        {(s, i) => (
          <button
            class="flex items-baseline gap-2 py-1 px-2 rounded-md text-left bg-transparent border-none cursor-pointer transition-colors duration-150"
            classList={{ "bg-surface-base": props.active === i() }}
            onClick={() => props.onSelect(i())}
          >
            <span
              class="text-12-mono shrink-0"
              classList={{ "text-text-strong": props.active === i(), "text-text-weaker": props.active !== i() }}
            >
              {fmtClock(s.at) ?? "--:--"}
            </span>
            <span
              class="text-12-regular truncate"
              classList={{ "text-text-base": props.active === i(), "text-text-weaker": props.active !== i() }}
            >
              {promptTitle(s)}
            </span>
          </button>
        )}
      </For>
      <Show when={props.sections.length > 1}>
        <div class="mt-3 pt-2 border-t border-border-weak-base flex flex-col gap-px items-start">
          <For each={props.sections}>
            {(s, i) => {
              const w = () => Math.max(6, Math.round(100 * (s.tools.length / maxTools())))
              return (
                <button
                  class={
                    "h-[3px] rounded-full transition-colors duration-150 border-none cursor-pointer p-0 " +
                    (props.active === i() ? "bg-icon-strong-base" : "bg-icon-weak-base hover:bg-icon-strong-base")
                  }
                  style={{ width: `${w()}%` }}
                  title={promptTitle(s)}
                  onClick={() => props.onSelect(i())}
                />
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}

// ------------------------------------------------------------ wrappers ----

function TurnWrapComp(p: { section: SessionSection; index: number; children: JSX.Element }) {
  let end: number | undefined
  for (const e of p.section.ordered) {
    const t = e.kind === "tool" ? finite(e.part?.state?.time?.end) : undefined
    if (t != null && (end == null || t > end)) end = t
  }
  const dur =
    p.section.at != null && end != null && end >= p.section.at ? fmtDur(end - p.section.at) : undefined
  const gap = () => {
    const ms = deltaMsOf(p.section)
    return ms != null && ms >= 120_000 ? ms : undefined
  }
  return (
    <TurnTime.Provider value={{ dur }}>
      <Show when={gap()} fallback={<SpacerRow h="2rem" />}>
        {(g) => <GapRow label={`+${fmtDur(g())}`} />}
      </Show>
      {p.children}
    </TurnTime.Provider>
  )
}

function PromptWrapComp(p: { section: SessionSection; children: JSX.Element }) {
  const delta = () => deltaMsOf(p.section)
  const counts = () => {
    const parts: string[] = []
    if (p.section.tools.length > 0)
      parts.push(`${p.section.tools.length} tool call${p.section.tools.length === 1 ? "" : "s"}`)
    if (p.section.reasoning.length > 0) parts.push(`${p.section.reasoning.length} reasoning`)
    return parts.join(" · ")
  }
  const modelChip = () => {
    const m = p.section.model
    if (!m?.modelID) return undefined
    const prev = sharedSections()[p.section.index - 1]?.model
    if (p.section.index > 0 && prev?.providerID === m.providerID && prev?.modelID === m.modelID)
      return undefined
    return `${m.providerID ?? ""}/${m.modelID}`
  }
  return (
    <div class={COLS}>
      <div class="flex flex-col items-end gap-0.5 pt-1 text-right">
        <span class="text-12-mono text-text-base">{fmtClock(p.section.at)}</span>
        <Show when={delta()}>
          <span class="text-12-mono text-text-weaker">+{fmtDur(delta())}</span>
        </Show>
      </div>
      <Rail
        node={<span class="relative z-10 mt-1 size-2.5 rounded-full border-2 border-icon-strong-base bg-background-base" />}
      />
      <div class="min-w-0 pt-0.5 pb-2">
        <div class="tl-prompt grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 items-baseline">
          <span class="text-12-mono text-text-weaker select-none">{pad2(p.section.index + 1)}</span>
          {p.children}
        </div>
        <Show when={counts() || modelChip()}>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-12-mono text-text-weaker">
            <Show when={counts()}>
              <span>{counts()}</span>
            </Show>
            <Show when={modelChip()}>
              <span class="border border-border-weak-base rounded px-1">{modelChip()}</span>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}

function ToolWrapComp(p: Parameters<NonNullable<SkinWrappers["ToolWrap"]>>[0]) {
  const dur = () => {
    const st = p.entry.part?.state
    const a = finite(st?.time?.start)
    const b = finite(st?.time?.end)
    return a != null && b != null && b >= a ? fmtDur(b - a) : undefined
  }
  return (
    <div class={COLS}>
      <div class="pt-1.5 text-right text-12-mono text-text-weaker">{dur()}</div>
      <Rail node={<span class="relative z-10 mt-[11px] size-[5px] rounded-full bg-icon-base" />} />
      <div class="tl-tool min-w-0 py-0.5">{p.children}</div>
    </div>
  )
}

function ReasoningWrapComp(p: { children: JSX.Element }) {
  return (
    <div class={COLS}>
      <div class="pt-1.5 text-right text-12-mono text-text-weaker" />
      <Rail
        node={<span class="relative z-10 mt-[10px] size-[5px] rounded-full border border-icon-weak-base bg-background-base" />}
      />
      <div class="tl-reason min-w-0 py-0.5">{p.children}</div>
    </div>
  )
}

function ResponseWrapComp(p: { text: string; children: JSX.Element }) {
  const t = useContext(TurnTime)
  return (
    <div class={COLS}>
      <div class="flex flex-col items-end gap-0.5 pt-1.5 text-right">
        <span class="text-12-mono text-text-weaker">{t.dur}</span>
      </div>
      <Rail node={<span class="relative z-10 mt-[9px] size-2 rounded-[2px] bg-icon-strong-base" />} />
      <div class="tl-response min-w-0 pt-1">{p.children}</div>
    </div>
  )
}

// ---------------------------------------------------------------- skin ----

export const timelineSkin: Skin = {
  id: "timeline",
  mode: "composed",
  columnClass: "osh-content max-w-[52rem] mx-auto px-4 sm:px-6 pt-6 pb-10",
  wrappers: {
    Header: TimelineHeader,
    Footer: RailEnd,
    Nav: TimelineNav,
    TurnWrap: TurnWrapComp,
    PromptWrap: PromptWrapComp,
    ToolWrap: ToolWrapComp,
    ReasoningWrap: ReasoningWrapComp,
    ResponseWrap: ResponseWrapComp,
  },
}

export function TimelineView(props: Parameters<ViewEntry["component"]>[0]) {
  return <BaseSessionView {...props} skin={timelineSkin} />
}

export const timeline: ViewEntry = {
  id: "timeline",
  label: "timeline",
  component: TimelineView,
}
