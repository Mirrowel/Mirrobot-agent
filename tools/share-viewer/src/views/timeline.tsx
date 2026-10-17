// TIMELINE VIEW: the session as a chronology rail. A vertical rail on
// the left carries one node per event: prompts are major rings with
// clock time and the delta since the previous turn ended, tool calls
// are minor ticks with their duration, response completions are
// terminal squares with the turn duration, idle gaps between turns get
// a dotted marker. Chrome: a period header (time range, counts, an
// activity strip that doubles as navigation) and a rail end-cap footer.
// Continuous mode drops index tags and wide spacing for one stream.
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { Markdown } from "../../vendor/session-ui/src/components/markdown"
import { DateTime } from "luxon"
import { Title } from "@solidjs/meta"
import type { ViewEntry, ViewProps } from "./registry"
import type { OshSettings } from "../settings"
import { visibleMessages } from "../fold"
import { toolCallLabel, toolOutputText, type AnyPart } from "./session-data"
import { saveSettingsScroll, restoreSettingsScroll, SettingsBody } from "../settings-panel"

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

type ToolItem = {
  kind: "tool"
  at?: number
  end?: number
  tool: string
  title: string
  output?: string
  part: AnyPart
}

type ReasonItem = { kind: "reasoning"; at?: number; text: string }

type Section = {
  id: string
  index: number
  prompt: string
  model?: { providerID?: string; modelID?: string }
  items: (ToolItem | ReasonItem)[]
  response: string
  promptAt?: number
  responseAt?: number
}

function ToolRow(props: { item: ToolItem; settings: OshSettings }) {
  const [userOpen, setOpen] = createSignal<boolean | undefined>(undefined)
  const open = () => userOpen() ?? props.settings.toolOutput
  const dur = () =>
    props.item.at != null && props.item.end != null ? fmtDur(props.item.end - props.item.at) : undefined
  return (
    <div class={COLS}>
      <div class="pt-1.5 text-right text-12-mono text-text-weaker">{dur()}</div>
      <div class="relative flex justify-center">
        <div class={LINE} />
        <span class="relative z-10 mt-[11px] size-[5px] rounded-full bg-icon-base" />
      </div>
      <div class="min-w-0 py-0.5">
        <button
          class="group flex items-center gap-2 w-full text-left bg-transparent border-none cursor-pointer py-0.5"
          onClick={() => setOpen(!open())}
        >
          <span class="text-icon-weaker-base group-hover:text-icon-strong-base transition-colors duration-150 shrink-0">
            <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
          </span>
          <span class="text-12-medium text-text-weaker shrink-0">{props.item.tool}</span>
          <Show when={props.settings.toolInfo}>
            <span class="text-12-regular text-text-weaker group-hover:text-text-base transition-colors duration-150 truncate">
              {toolCallLabel(props.item)}
            </span>
          </Show>
        </button>
        <Show when={open() && props.item.output}>
          <pre class="mt-1 mb-2 p-3 max-h-64 overflow-auto rounded-md border border-border-weak-base bg-background-stronger text-12-mono text-text-weaker whitespace-pre-wrap break-words">
            {props.item.output}
          </pre>
        </Show>
      </div>
    </div>
  )
}

function ReasonRow(props: { item: ReasonItem; settings: OshSettings }) {
  const [userOpen, setOpen] = createSignal<boolean | undefined>(undefined)
  const open = () => userOpen() ?? props.settings.reasoningOpen
  return (
    <div class={COLS}>
      <div class="pt-1.5 text-right text-12-mono text-text-weaker" />
      <div class="relative flex justify-center">
        <div class={LINE} />
        <span class="relative z-10 mt-[10px] size-[5px] rounded-full border border-icon-weak-base bg-background-base" />
      </div>
      <div class="min-w-0 py-0.5">
        <button
          class="group flex items-center gap-1.5 bg-transparent border-none cursor-pointer py-0.5 text-12-medium text-text-weaker hover:text-text-base transition-colors duration-150"
          onClick={() => setOpen(!open())}
        >
          <span class="text-icon-weaker-base group-hover:text-icon-strong-base transition-colors duration-150">
            <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
          </span>
          reasoning
        </button>
        <Show when={open()}>
          <div class="text-12-regular italic text-text-weaker [&_p]:my-1">
            <Markdown text={props.item.text} />
          </div>
        </Show>
      </div>
    </div>
  )
}

function Turn(props: {
  s: Section
  settings: OshSettings
  showIndex: boolean
  delta?: string
  model?: string
}) {
  const s = props.s
  const tools = () => s.items.filter((i) => i.kind === "tool").length
  const reasons = () => s.items.filter((i) => i.kind === "reasoning").length
  const turnDur = () =>
    s.promptAt != null && s.responseAt != null ? fmtDur(s.responseAt - s.promptAt) : undefined
  const counts = () => {
    const parts: string[] = []
    if (tools() > 0) parts.push(`${tools()} tool call${tools() === 1 ? "" : "s"}`)
    if (reasons() > 0) parts.push(`${reasons()} reasoning`)
    return parts.join(" · ")
  }
  return (
    <section data-sec={s.id}>
      {/* prompt node */}
      <div class={COLS}>
        <div class="flex flex-col items-end gap-0.5 pt-1 text-right">
          <span class="text-12-mono text-text-base">{fmtClock(s.promptAt)}</span>
          <Show when={props.delta}>
            <span class="text-12-mono text-text-weaker">+{props.delta}</span>
          </Show>
        </div>
        <div class="relative flex justify-center">
          <div class={LINE} />
          <span class="relative z-10 mt-1 size-2.5 rounded-full border-2 border-icon-strong-base bg-background-base" />
        </div>
        <div class="min-w-0 pt-0.5">
          <div class="flex items-baseline gap-2.5">
            <Show when={props.showIndex}>
              <span class="shrink-0 text-12-mono text-text-weaker">{pad2(s.index + 1)}</span>
            </Show>
            <p class="text-14-medium text-text-strong whitespace-pre-wrap">{s.prompt || "(empty prompt)"}</p>
          </div>
          <Show when={counts() || props.model}>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-12-mono text-text-weaker">
              <Show when={counts()}>
                <span>{counts()}</span>
              </Show>
              <Show when={props.model}>
                <span class="border border-border-weak-base rounded px-1">{props.model}</span>
              </Show>
            </div>
          </Show>
        </div>
      </div>
      {/* event ticks */}
      <For each={s.items}>
        {(it) =>
          it.kind === "tool" ? (
            <ToolRow item={it} settings={props.settings} />
          ) : (
            <ReasonRow item={it} settings={props.settings} />
          )
        }
      </For>
      {/* terminal node */}
      <Show when={s.response || s.responseAt != null}>
        <div class={COLS}>
          <div class="flex flex-col items-end gap-0.5 pt-1.5 text-right">
            <span class="text-12-mono text-text-weaker">{turnDur()}</span>
          </div>
          <div class="relative flex justify-center">
            <div class={LINE} />
            <span class="relative z-10 mt-[9px] size-2 rounded-[2px] bg-icon-strong-base" />
          </div>
          <div class="min-w-0 pt-1">
            <Show
              when={s.response}
              fallback={<span class="text-12-mono text-text-weaker">no response text</span>}
            >
              <div class="max-w-[46rem] text-14-regular text-text-base [&_p]:my-2">
                <Markdown text={s.response} />
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </section>
  )
}

function GapRow(props: { label: string }) {
  return (
    <div class={COLS}>
      <div class="pt-2.5 text-right text-12-mono text-text-weaker">{props.label}</div>
      <div class="relative flex justify-center">
        <div class={LINE} />
        <div class="relative z-10 mt-3 flex flex-col items-center gap-[3px]">
          <span class="size-[3px] rounded-full bg-icon-weak-base" />
          <span class="size-[3px] rounded-full bg-icon-weak-base" />
          <span class="size-[3px] rounded-full bg-icon-weak-base" />
        </div>
      </div>
      <div class="pt-2.5 text-12-mono text-text-weaker opacity-70">idle</div>
    </div>
  )
}

function Spacer(props: { h: number }) {
  return (
    <div class={COLS} style={{ height: `${props.h}px` }}>
      <div />
      <div class="relative">
        <div class={LINE} />
      </div>
      <div />
    </div>
  )
}

function TimelineView(props: ViewProps) {
  const info = createMemo(() => props.data.session.find((s: any) => s.id === props.sessionID))

  const sections = createMemo<Section[]>(() => {
    const out: Section[] = []
    let cur: Section | undefined
    for (const m of visibleMessages(props.data, props.sessionID)) {
      const t = (m as any).time
      if (m.role === "user") {
        const first = (props.data.part[m.id] ?? []).find((p: any) => p.type === "text") as
          | AnyPart
          | undefined
        cur = {
          id: m.id,
          index: out.length,
          prompt: first?.text?.trim() ?? "",
          model: (m as any).model,
          items: [],
          response: "",
          promptAt: finite(t?.created),
        }
        out.push(cur)
        continue
      }
      if (!cur) continue
      const created = finite(t?.created)
      const completed = finite(t?.completed) ?? created
      if (completed != null && (cur.responseAt == null || completed > cur.responseAt)) {
        cur.responseAt = completed
      }
      for (const p of (props.data.part[m.id] ?? []) as AnyPart[]) {
        if (p.type === "text") {
          cur.response += (cur.response ? "\n\n" : "") + (p.text ?? "")
        } else if (p.type === "tool") {
          const st = p.state ?? {}
          cur.items.push({
            kind: "tool",
            at: finite(st?.time?.start),
            end: finite(st?.time?.end),
            tool: p.tool ?? "tool",
            title: String(st?.title ?? p.tool ?? "tool"),
            output: toolOutputText(p),
            part: p,
          })
        } else if (p.type === "reasoning") {
          cur.items.push({ kind: "reasoning", at: finite((p as any).time?.start), text: p.text ?? "" })
        }
      }
    }
    return out
  })

  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const filtered = createMemo(() => {
    const q = props.search.trim().toLowerCase()
    if (!q) return sections()
    return sections().filter(
      (s) =>
        s.prompt.toLowerCase().includes(q) ||
        s.response.toLowerCase().includes(q) ||
        s.items.some(
          (it) => it.kind === "tool" && (it.title.toLowerCase().includes(q) || it.tool.toLowerCase().includes(q)),
        ),
    )
  })

  const totals = createMemo(() => {
    let tools = 0
    let start: number | undefined
    let end: number | undefined
    for (const s of sections()) {
      tools += s.items.filter((i) => i.kind === "tool").length
      for (const t of [s.promptAt, s.responseAt]) {
        if (t == null) continue
        if (start == null || t < start) start = t
        if (end == null || t > end) end = t
      }
    }
    if (start == null) start = finite((info() as any)?.time?.created)
    if (end == null) end = finite((info() as any)?.time?.updated)
    return { tools, start, end, turns: sections().length }
  })

  const range = createMemo(() => {
    const { start, end } = totals()
    if (start == null || end == null) return undefined
    const a = DateTime.fromMillis(start)
    const b = DateTime.fromMillis(end)
    if (a.hasSame(b, "day")) return { main: `${a.toFormat("HH:mm")} → ${b.toFormat("HH:mm")}`, sub: a.toFormat("dd MMM yyyy") }
    return { main: `${a.toFormat("dd MMM HH:mm")} → ${b.toFormat("dd MMM HH:mm")}`, sub: undefined }
  })

  const maxTools = createMemo(() => Math.max(1, ...sections().map((s) => s.items.filter((i) => i.kind === "tool").length)))

  const modelChanged = (s: Section) => {
    const m = s.model
    if (!m?.modelID) return undefined
    const prev = sections()[s.index - 1]?.model
    if (s.index > 0 && prev?.providerID === m.providerID && prev?.modelID === m.modelID) return undefined
    return `${m.providerID ?? ""}/${m.modelID}`
  }

  const gapBefore = (s: Section): string | undefined => {
    const list = filtered()
    const i = list.findIndex((x) => x.id === s.id)
    if (i <= 0) return undefined
    const prev = list[i - 1]
    const from = prev.responseAt ?? prev.promptAt
    if (from == null || s.promptAt == null) return undefined
    const gap = s.promptAt - from
    if (gap < 120_000) return undefined
    return fmtDur(gap)
  }

  // follow-live: only when already at the bottom
  let scrollEl: HTMLDivElement | undefined
  let atBottom = true
  createEffect(() => {
    props.source.rev()
    if (props.source.status() === "live" && props.settings.followLive && atBottom && scrollEl) {
      scrollEl.scrollTop = scrollEl.scrollHeight
    }
  })

  const [activeId, setActiveId] = createSignal<string | undefined>(undefined)
  createEffect(() => {
    if (activeId() == null && sections().length > 0) setActiveId(sections()[0].id)
  })

  const onScroll = () => {
    const el = scrollEl
    if (!el) return
    atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    const er = el.getBoundingClientRect()
    let act: string | undefined
    for (const m of el.querySelectorAll<HTMLElement>("[data-sec]")) {
      if (m.getBoundingClientRect().top - er.top <= 120) act = m.dataset.sec
    }
    if (act !== undefined && act !== activeId()) setActiveId(act)
  }

  const jump = (id: string) => {
    const go = () => scrollEl?.querySelector(`[data-sec="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    const el = scrollEl?.querySelector(`[data-sec="${id}"]`)
    if (el) go()
    else {
      props.onSearch("")
      requestAnimationFrame(() => requestAnimationFrame(go))
    }
  }

  const status = () => props.source.status()
  const statusClass = () =>
    status() === "live"
      ? "text-icon-success-base border-icon-success-base"
      : status() === "error"
        ? "text-icon-critical-base border-icon-critical-base"
        : "text-text-weaker border-border-strong-base"

  const brand = () => props.source.branding()
  const promptTitle = (s: Section) => (s.prompt.split("\n")[0] || "(empty prompt)").slice(0, 60)
  const continuous = () => props.settings.continuous

  return (
    <div class="relative z-10 flex flex-col flex-1 min-h-0">
      <Title>
        {info()?.title ?? "session"} | {brand().name || "openshare"}
      </Title>

      {/* period header */}
      <header class="shrink-0 bg-background-stronger border-b border-border-weak-base">
        <div class="max-w-[52rem] mx-auto px-4 sm:px-6">
          <div class="flex items-center gap-3 pt-3">
            <Show
              when={brand().logoUrl}
              fallback={
                <Show when={brand().name}>
                  <a href={brand().linkUrl || "#"} class="shrink-0 text-12-mono text-text-weaker hover:text-text-base transition-colors duration-150">
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
              {status()}
            </span>
            <span class="flex items-center gap-1.5 shrink-0 text-12-mono text-text-weaker">
              <Mark class="h-3" />
              v{info()?.version}
            </span>
            <a
              href="https://github.com/Mirrowel/Mirrobot-agent"
              target="_blank"
              rel="noreferrer"
              class="shrink-0 text-icon-weaker-base hover:text-icon-strong-base"
            >
              <Icon name="github" size="small" />
            </a>
            <div class="relative shrink-0">
              <button
                class="flex items-center gap-1 h-7 px-2 rounded-md border border-border-weak-base text-12-mono text-text-weaker hover:text-text-base cursor-pointer transition-colors duration-150"
                onClick={() => setSettingsOpen(!settingsOpen())}
              >
                settings
              </button>
              <Show when={settingsOpen()}>
                <div class="absolute top-8 right-0 z-[70] w-72 max-h-[calc(100vh-4rem)] overflow-y-auto p-4 rounded-xl border border-border-weak-base bg-background-base shadow-xl"
                onScroll={saveSettingsScroll}
                ref={restoreSettingsScroll}>
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
            <Show when={fmtDur(totals().end != null && totals().start != null ? totals().end! - totals().start! : undefined)}>
              {(d) => <span class="shrink-0 text-12-mono text-text-weaker">· {d()} total</span>}
            </Show>
            <span class="shrink-0 text-12-mono text-text-weaker">
              · {totals().turns} turn{totals().turns === 1 ? "" : "s"} · {totals().tools} tool call{totals().tools === 1 ? "" : "s"}
            </span>
            <Show when={props.search.trim()}>
              <span class="flex items-center gap-1 shrink-0 text-12-mono text-text-base border border-border-strong-base rounded px-1.5">
                {filtered().length}/{sections().length}
                <button
                  class="bg-transparent border-none cursor-pointer p-0 text-icon-weaker-base hover:text-icon-strong-base"
                  title="clear filter"
                  onClick={() => props.onSearch("")}
                >
                  <Icon name="close-small" size="small" />
                </button>
              </span>
            </Show>
            <div class="flex-1" />
            {/* activity strip: density per turn, clickable unless continuous */}
            <Show when={sections().length > 0}>
              <div class="hidden sm:flex items-end gap-px h-5 w-24 shrink-0">
                <For each={sections()}>
                  {(s) => {
                    const n = s.items.filter((i) => i.kind === "tool").length
                    const h = Math.max(3, Math.round(20 * (n / maxTools())))
                    const active = () => activeId() === s.id
                    const cls =
                      "flex-1 min-w-[1px] transition-colors duration-150" +
                      (active() ? " bg-icon-strong-base" : " bg-icon-weak-base")
                    return (
                      <Show
                        when={!continuous()}
                        fallback={<div class={cls} style={{ height: `${h}px` }} title={promptTitle(s)} />}
                      >
                        <button
                          class={cls + (active() ? "" : " hover:bg-icon-strong-base") + " border-none cursor-pointer p-0"}
                          style={{ height: `${h}px` }}
                          title={promptTitle(s)}
                          onClick={() => jump(s.id)}
                        />
                      </Show>
                    )
                  }}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </header>

      {/* the rail */}
      <div ref={scrollEl} onScroll={onScroll} class="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div class="osh-content max-w-[52rem] mx-auto px-4 sm:px-6 pt-6 pb-10">
          <Show
            when={sections().length > 0}
            fallback={
              <div class="flex flex-col items-center gap-2 py-16 text-center">
                <span class="size-2.5 rounded-full border-2 border-icon-weak-base" />
                <div class="text-14-regular text-text-base">the rail is empty</div>
                <div class="text-12-regular text-text-weaker">no prompts recorded in this share yet</div>
              </div>
            }
          >
            <Show
              when={filtered().length > 0}
              fallback={
                <div class="flex flex-col items-center gap-2 py-16 text-center">
                  <div class="flex flex-col items-center gap-[3px]">
                    <span class="size-[3px] rounded-full bg-icon-weak-base" />
                    <span class="size-[3px] rounded-full bg-icon-weak-base" />
                    <span class="size-[3px] rounded-full bg-icon-weak-base" />
                  </div>
                  <div class="text-14-regular text-text-base">
                    no events match {"\u201C"}{props.search.trim()}{"\u201D"}
                  </div>
                  <button
                    class="text-12-medium text-text-weaker hover:text-text-base underline underline-offset-4 bg-transparent border-none cursor-pointer transition-colors duration-150"
                    onClick={() => props.onSearch("")}
                  >
                    clear filter
                  </button>
                </div>
              }
            >
              <For each={filtered()}>
                {(s, i) => {
                  const prev = filtered()[i() - 1]
                  const delta =
                    s.promptAt != null && prev
                      ? fmtDur(s.promptAt - (prev.responseAt ?? prev.promptAt))
                      : undefined
                  const gap = gapBefore(s)
                  const last = i() === filtered().length - 1
                  return (
                    <>
                      <Show when={gap} fallback={<Spacer h={continuous() ? 12 : 32} />}>
                        {(g) => <GapRow label={`+${g()}`} />}
                      </Show>
                      <Turn
                        s={s}
                        settings={props.settings}
                        showIndex={!continuous()}
                        delta={delta}
                        model={modelChanged(s)}
                      />
                      <Show when={last}>
                        <Spacer h={8} />
                      </Show>
                    </>
                  )
                }}
              </For>

              {/* rail end-cap */}
              <div class={COLS}>
                <div class="pt-3 text-right text-12-mono text-text-weaker">{fmtClock(totals().end)}</div>
                <div class="relative flex justify-center h-10">
                  <div class="absolute top-0 left-1/2 -ml-[0.5px] w-px h-5 bg-border-strong-base" />
                  <Show
                    when={status() === "live"}
                    fallback={<span class="relative z-10 mt-4 w-2.5 h-[3px] rounded-[1px] bg-icon-strong-base" />}
                  >
                    <span class="relative z-10 mt-4 size-2 rounded-full bg-icon-success-base animate-pulse" />
                  </Show>
                </div>
                <div class="pt-3 text-12-mono text-text-weaker">end of session</div>
              </div>
            </Show>
          </Show>

          {/* footer */}
          <div class="mt-8 pt-4 border-t border-border-weak-base flex items-center justify-between gap-4">
            <span class="flex items-center gap-2 min-w-0 text-12-mono text-text-weaker">
              <Show when={brand().logoUrl}>
                <img src={brand().logoUrl} alt="" class="h-4 rounded-sm" />
              </Show>
              <Show
                when={brand().wordmarkUrl}
                fallback={
                  <span class="truncate">
                    {brand().name ? brand().name + " · " : ""}Open(code)Share
                  </span>
                }
              >
                <img src={brand().wordmarkUrl} alt="" class="h-3.5" />
              </Show>
            </span>
            <Show when={totals().turns > 0}>
              <span class="shrink-0 text-12-mono text-text-weaker opacity-70">
                {totals().turns} turns · {totals().tools} tools
              </span>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}

export const timeline: ViewEntry = {
  id: "timeline",
  label: "timeline",
  component: TimelineView,
}
