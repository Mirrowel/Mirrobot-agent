// TELETYPE VIEW: the session as a wire-service dispatch. Prompts arrive
// as headlines with datelines, the prompt body runs as the lede, tool
// calls come over the wire as kicker items (urgent / developing / update)
// with output filed as reports, reasoning reads as an editor's note, and
// responses are bylined copy filed by the model-correspondent. Chrome:
// a masthead with an edition band, and a ticker footer (brand, status,
// counts). Settings open from the masthead desk chip. Live sessions keep
// the newest copy in view only while the reader is already at the bottom.
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Markdown } from "../../vendor/session-ui/src/components/markdown"
import { Title } from "@solidjs/meta"
import type { ViewEntry } from "./registry"
import {
  useSessionSections,
  toolCallLabel,
  type ReasoningEntry,
  type SessionSection,
  type ToolEntry,
} from "./session-data"
import { VendoredPart } from "./vendored-part"
import { saveSettingsScroll, restoreSettingsScroll, SettingsBody } from "../settings-panel"
import type { OshSettings } from "../settings"
import type { Branding } from "../data-source"
import { visibleMessages } from "../fold"

type SectionMeta = { sentAt?: number; filedAt?: number; modelName?: string; providerID?: string }

const pad = (n: number) => String(n + 1).padStart(2, "0")

// timestamps arrive as epoch millis on live data and are simply absent on
// cached snapshots; every formatter returns undefined so <Show> gates them
// (formatted locally, no luxon types in this package)
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const two = (n: number) => String(n).padStart(2, "0")

const asTime = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined

const stampParts = (t: number) => {
  const d = new Date(t)
  return {
    dd: two(d.getDate()),
    mo: MONTHS[d.getMonth()] ?? "",
    yyyy: d.getFullYear(),
    hh: two(d.getHours()),
    mm: two(d.getMinutes()),
    ss: two(d.getSeconds()),
  }
}

const clock = (t?: number) => (t == null ? undefined : `${stampParts(t).hh}:${stampParts(t).mm}`)
const clockSec = (t?: number) =>
  t == null ? undefined : `${stampParts(t).hh}:${stampParts(t).mm}:${stampParts(t).ss}`
const stamp = (t?: number) => {
  if (t == null) return undefined
  const p = stampParts(t)
  return `${p.dd} ${p.mo} ${p.yyyy} ${p.hh}:${p.mm}`
}

const duration = (from?: number, to?: number) => {
  if (from == null || to == null || to < from) return undefined
  const s = (to - from) / 1000
  if (s < 0.1) return "<0.1s"
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`
}

// the wire slug: first line is the headline, the rest of the prompt is the
// lede, so together they carry the full prompt exactly once
function splitPrompt(prompt: string): { headline: string; lede: string } {
  const lines = prompt.split("\n")
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  const headline = (lines[i] ?? "").trim()
  const lede = lines.slice(i + 1).join("\n").trim()
  return { headline: headline || "(untitled dispatch)", lede }
}

const slug = (s: SessionSection) => splitPrompt(s.prompt).headline.slice(0, 48)

type Kicker = { label: string; tone: "critical" | "strong" | "weak" }

const KICKER_TONE: Record<Kicker["tone"], string> = {
  critical: "border-icon-critical-base text-icon-critical-base",
  strong: "border-border-strong-base text-text-base",
  weak: "border-border-weak-base text-text-weaker",
}

function wireKicker(tool: ToolEntry): Kicker {
  const status = tool.part.state?.status
  if (status === "error") return { label: "urgent", tone: "critical" }
  if (status === "running") return { label: "developing", tone: "strong" }
  if (status === "pending") return { label: "draft", tone: "weak" }
  return { label: "update", tone: "weak" }
}

function WireItem(props: { tool: ToolEntry; settings: OshSettings }) {
  const [userOpen, setOpen] = createSignal<boolean | undefined>(undefined)
  const open = () => userOpen() ?? (props.tool.defaultOpen || props.settings.toolOutput)
  const kicker = () => wireKicker(props.tool)
  const start = () => asTime(props.tool.part.state?.time?.start)
  const held = () => duration(start(), asTime(props.tool.part.state?.time?.end))
  const label = () => toolCallLabel(props.tool)
  const expandable = () => !!props.tool.output
  return (
    <div class="rounded-md border border-border-weak-base bg-background-stronger overflow-hidden">
      <button
        class={
          "flex items-start gap-3 w-full px-3 py-2 bg-transparent border-none text-left transition-colors duration-150 " +
          (expandable() ? "cursor-pointer" : "cursor-default")
        }
        disabled={!expandable()}
        aria-expanded={expandable() ? open() : undefined}
        onClick={() => expandable() && setOpen(!open())}
      >
        <span
          class={
            "shrink-0 mt-px rounded-sm border px-1.5 text-12-mono uppercase " + KICKER_TONE[kicker().tone]
          }
        >
          {kicker().label}
        </span>
        <span class="flex-1 min-w-0">
          <span class="flex flex-wrap items-baseline gap-x-2 text-12-mono text-text-weaker">
            <span class="text-text-base">{props.tool.tool}</span>
            <Show when={clockSec(start())}>{(t) => <span>{t()}</span>}</Show>
            <Show when={held()}>{(d) => <span>{d()}</span>}</Show>
          </span>
          <Show when={props.settings.toolInfo && label() !== props.tool.tool}>
            <span class="block text-12-regular text-text-base truncate">{label()}</span>
          </Show>
        </span>
        <Show when={expandable()}>
          <span class="shrink-0 text-icon-weaker-base">
            <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
          </span>
        </Show>
      </button>
      <Show when={open() && props.tool.output}>
        <div class="border-t border-border-weak-base bg-background-base px-3 py-2">
          <div class="text-12-mono uppercase text-text-weaker mb-1">filed report</div>
          <pre class="m-0 max-h-72 overflow-auto text-12-mono text-text-weaker whitespace-pre-wrap break-words">
            {props.tool.output}
          </pre>
        </div>
      </Show>
    </div>
  )
}

function EditorNote(props: { entry: ReasoningEntry; settings: OshSettings }) {
  const [userOpen, setOpen] = createSignal<boolean | undefined>(undefined)
  const open = () => userOpen() ?? props.settings.reasoningOpen
  const start = () => asTime(props.entry.part.time?.start)
  const held = () => duration(start(), asTime(props.entry.part.time?.end))
  return (
    <aside class="rounded-md border border-dashed border-border-weak-base px-3 py-2">
      <button
        class="flex items-center gap-2 w-full bg-transparent border-none cursor-pointer text-left"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        <span class="text-12-mono uppercase text-text-weaker">editor's note</span>
        <Show when={clockSec(start())}>{(t) => <span class="text-12-mono text-text-weaker">{t()}</span>}</Show>
        <Show when={held()}>{(d) => <span class="text-12-mono text-text-weaker">{d()}</span>}</Show>
        <span class="flex-1" />
        <span class="text-icon-weaker-base">
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        </span>
      </button>
      <Show when={open()}>
        <div class="pt-1 text-12-regular italic text-text-weaker [&_p]:my-1">
          <Markdown text={props.entry.text} />
        </div>
      </Show>
    </aside>
  )
}

function Dispatch(props: {
  section: SessionSection
  meta?: SectionMeta
  settings: OshSettings
  continuous: boolean
}) {
  const split = () => splitPrompt(props.section.prompt)
  const sent = () => clock(props.meta?.sentAt)
  const filed = () => clock(props.meta?.filedAt)
  return (
    <article
      data-dispatch={props.section.id}
      class={
        "pt-8 first:pt-2 " +
        (props.continuous
          ? "border-t border-border-weaker-base last:border-none"
          : "border-t border-border-strong-base first:border-none")
      }
    >
      {/* dateline slug: number + received time, ruled off like wire copy */}
      <Show
        when={!props.continuous}
        fallback={
          <div class="flex items-center gap-2 text-12-mono text-text-weaker">
            <span>{pad(props.section.index)}</span>
            <Show when={sent()}>
              {(t) => (
                <>
                  <span class="opacity-50">·</span>
                  <span>{t()}</span>
                </>
              )}
            </Show>
          </div>
        }
      >
        <div class="flex items-center gap-2.5 text-12-mono text-text-weaker">
          <span class="text-text-strong">{pad(props.section.index)}</span>
          <span class="uppercase">dispatch</span>
          <Show when={sent()}>{(t) => <span>{t()}</span>}</Show>
          <span class="flex-1 border-t border-border-weak-base" />
        </div>
      </Show>

      <h2 class="text-20-medium text-text-strong mt-2 break-words">{split().headline}</h2>
      <Show when={split().lede}>
        <p class="text-14-regular text-text-base whitespace-pre-wrap mt-2 max-w-[40rem]">{split().lede}</p>
      </Show>

      <Show when={props.section.ordered.length > 0}>
        <div class="flex flex-col gap-2 mt-3">
          <For each={props.section.ordered}>
            {(e) => (
              <Show
                when={e.kind !== "reasoning"}
                fallback={<EditorNote entry={e as any} settings={props.settings} />}
              >
                <Show
                  when={e.kind !== "text"}
                  fallback={
                    <div class="rounded-md border border-border-weak-base bg-background-base px-3 py-2.5 text-14-regular text-text-base">
                      <Markdown text={(e as any).text} />
                    </div>
                  }
                >
                  <VendoredPart entry={e as any} settings={props.settings} />
                </Show>
              </Show>
            )}
          </For>
        </div>
      </Show>

      <Show when={props.section.response || props.meta?.modelName}>
        <div class="mt-4 border-t border-border-weak-base pt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-12-mono text-text-weaker">
          <span class="flex items-center gap-2 min-w-0">
            <Show when={props.meta?.providerID}>
              {(id) => <ProviderIcon id={id()} class="size-3.5 shrink-0 text-icon-strong-base" />}
            </Show>
            <span class="uppercase">correspondent</span>
            <span class="text-text-base truncate">{props.meta?.modelName ?? "unknown"}</span>
          </span>
          <Show when={filed()}>{(t) => <span class="shrink-0">filed {t()}</span>}</Show>
        </div>
        <Show
          when={props.section.response}
          fallback={<div class="text-12-mono text-text-weaker mt-2">copy pending</div>}
        >
          <div class="mt-2 text-14-regular text-text-base [&_p]:my-2 max-w-[40rem]">
            <Markdown text={props.section.response} />
          </div>
        </Show>
      </Show>
    </article>
  )
}

function BrandTile(props: { branding: Branding }) {
  return (
    <Show when={props.branding.logoUrl} fallback={<Mark class="h-4 shrink-0 opacity-80" />}>
      <img src={props.branding.logoUrl} alt="" class="h-6 rounded-sm shrink-0" />
    </Show>
  )
}

export function TeletypeView(props: Parameters<ViewEntry["component"]>[0]) {
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const info = createMemo(() => props.data.session.find((s: any) => s.id === props.sessionID))
  const sections = useSessionSections(props.data, props.sessionID)
  const branding = () => props.source.branding()
  const status = () => props.source.status()
  const continuous = () => props.settings.continuous
  const searching = () => props.search.trim().length > 0

  // message times and correspondent names, derived defensively: a section
  // is keyed by its user message id, its filed time is the last completed
  // assistant message before the next prompt
  const meta = createMemo(() => {
    const out = new Map<string, SectionMeta>()
    let current: string | undefined
    for (const m of visibleMessages(props.data, props.sessionID)) {
      const time = ((m as any).time ?? {}) as { created?: number; completed?: number }
      if (m.role === "user") {
        current = m.id
        out.set(m.id, { sentAt: asTime(time.created) })
        continue
      }
      if (!current) continue
      const entry = out.get(current)
      if (!entry) continue
      const filed = asTime(time.completed) ?? asTime(time.created)
      if (filed != null) entry.filedAt = filed
    }
    const models = (props.data.model[props.sessionID] ?? []) as any[]
    for (const s of sections()) {
      const entry = out.get(s.id) ?? {}
      out.set(s.id, entry)
      const modelID = s.model?.modelID
      if (!modelID) continue
      const hit = models.find((m) => m?.id === modelID || m?.modelID === modelID)
      entry.modelName = typeof hit?.name === "string" && hit.name ? hit.name : modelID
      entry.providerID = s.model?.providerID
    }
    return out
  })

  const filtered = createMemo(() => {
    const q = props.search.trim().toLowerCase()
    if (!q) return sections()
    return sections().filter(
      (s) => s.prompt.toLowerCase().includes(q) || s.response.toLowerCase().includes(q),
    )
  })

  const wireCount = createMemo(() => sections().reduce((n, s) => n + s.tools.length, 0))
  const noteCount = createMemo(() => sections().reduce((n, s) => n + s.reasoning.length, 0))
  const lastFiled = createMemo(() => {
    const list = sections()
    for (let i = list.length - 1; i >= 0; i--) {
      const t = meta().get(list[i].id)?.filedAt
      if (t != null) return t
    }
    return undefined
  })

  // follow-live: keep the newest copy visible only when already at the bottom
  let scrollEl: HTMLDivElement | undefined
  let atBottom = true
  const onScroll = () => {
    const el = scrollEl
    if (el) atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  createEffect(() => {
    props.source.rev()
    if (status() === "live" && props.settings.followLive && atBottom && scrollEl) {
      scrollEl.scrollTop = scrollEl.scrollHeight
    }
  })

  // active dispatch tracking powers the wire index rail
  const [activeId, setActiveId] = createSignal<string | undefined>(undefined)
  onMount(() => {
    if (!("IntersectionObserver" in window)) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const id = (e.target as HTMLElement).dataset.dispatch
          if (id) setActiveId(id)
        }
      },
      { root: scrollEl, rootMargin: "-10% 0px -75% 0px" },
    )
    createEffect(() => {
      observer.disconnect()
      for (const s of filtered()) {
        const node = scrollEl?.querySelector(`[data-dispatch="${s.id}"]`)
        if (node) observer.observe(node)
      }
    })
    onCleanup(() => observer.disconnect())
  })

  const jump = (id: string) => {
    setActiveId(id)
    scrollEl?.querySelector(`[data-dispatch="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const dotClass = () =>
    status() === "live" ? "status-dot" : status() === "error" ? "bg-icon-critical-base" : "bg-icon-weak-base"

  const fileNo = () => (props.sessionID.replace(/^ses_/, "").slice(0, 8) || "00000000").toUpperCase()

  return (
    <div class="flex flex-col h-dvh min-h-0 overflow-hidden relative z-10 bg-background-base">
      <Title>{info()?.title} | {branding().name || "openshare"}</Title>

      {/* masthead */}
      <header class="shrink-0 bg-background-base">
        <div class="flex items-center gap-3 px-4 h-12 border-b-2 border-border-strong-base">
          <Show
            when={branding().linkUrl}
            fallback={
              <span class="flex items-center gap-2 shrink-0">
                <BrandTile branding={branding()} />
                <span class="hidden sm:inline text-14-medium text-text-strong truncate max-w-40">
                  {branding().name ?? "Open(code)Share"}
                </span>
              </span>
            }
          >
            {(href) => (
              <a
                href={href()}
                target="_blank"
                rel="noreferrer"
                class="flex items-center gap-2 shrink-0 hover:opacity-90 transition-opacity duration-150"
                title={branding().name ?? "Open(code)Share"}
              >
                <BrandTile branding={branding()} />
                <span class="hidden sm:inline text-14-medium text-text-strong truncate max-w-40">
                  {branding().name ?? "Open(code)Share"}
                </span>
              </a>
            )}
          </Show>
          <span class="hidden sm:block h-5 w-px shrink-0 bg-border-weak-base" />
          <h1 class="flex-1 min-w-0 text-14-medium text-text-base truncate">{info()?.title ?? "session"}</h1>
          <div class="flex items-center gap-2 shrink-0">
            <span
              class="flex items-center gap-1.5 rounded-md border border-border-weak-base px-2 py-1 text-12-mono text-text-weaker"
              title="source status"
            >
              <span class={"inline-block size-1.5 rounded-full shrink-0 " + dotClass()} />
              {status()}
            </span>
            <span class="flex items-center gap-1.5 rounded-md border border-border-weak-base px-2 py-1 text-12-mono text-text-base">
              <Mark class="h-3 shrink-0" />
              v{info()?.version}
            </span>
            <a
              href="https://github.com/Mirrowel/Mirrobot-agent"
              target="_blank"
              rel="noreferrer"
              class="p-1 text-icon-weaker-base hover:text-icon-strong-base transition-colors duration-150"
              title="Open(code)Share"
            >
              <Icon name="github" size="small" />
            </a>
            <div class="relative flex items-center gap-1 rounded-md border border-border-weak-base pl-2 pr-1 py-0.5 text-12-mono text-text-weaker hover:border-border-strong-base transition-colors duration-150">
              <button
                class="flex items-center gap-1 bg-transparent border-none cursor-pointer text-12-mono text-text-weaker hover:text-text-base p-0"
                onClick={() => setSettingsOpen(!settingsOpen())}
              >
                <span class="hidden sm:inline">settings</span>
                <Icon name={settingsOpen() ? "chevron-up" : "chevron-down"} size="small" />
              </button>
              <Show when={settingsOpen()}>
                <div class="absolute top-8 right-0 z-[70] w-72 max-h-[calc(100vh-4rem)] overflow-y-auto p-4 rounded-xl border border-border-weak-base bg-background-base shadow-xl"
                  onScroll={saveSettingsScroll}
                  ref={restoreSettingsScroll}>
                  <SettingsBody
                    settings={props.settings}
                    update={props.updateSettings}
                    branding={{ backgroundUrl: (branding() as any).backgroundUrl }}
                    search={props.search}
                    onSearch={props.onSearch}
                  />
                </div>
              </Show>
            </div>
          </div>
        </div>
        {/* edition band */}
        <div class="flex items-center gap-2.5 px-4 h-8 border-b border-border-weak-base text-12-mono text-text-weaker">
          <span class="shrink-0">wire {fileNo()}</span>
          <Show when={stamp(asTime(info()?.time?.created))}>
            {(t) => (
              <>
                <span class="shrink-0 opacity-50">·</span>
                <span class="shrink-0 hidden sm:inline">received {t()}</span>
              </>
            )}
          </Show>
          <span class="flex-1" />
          <Show when={searching()}>
            <span class="shrink-0 truncate">filter "{props.search.trim()}"</span>
          </Show>
        </div>
      </header>

      {/* the wire: osh-content scopes the reading-text size setting here */}
      <div ref={scrollEl} onScroll={onScroll} class="osh-content flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div class="max-w-[54rem] mx-auto px-4 sm:px-6 py-6">
          <Show
            when={sections().length > 0}
            fallback={
              <div class="border border-dashed border-border-weak-base rounded-lg px-6 py-14 text-center">
                <div class="text-16-medium text-text-strong">The wire is quiet</div>
                <div class="text-14-regular text-text-weaker mt-1">
                  No dispatches have been filed for this session yet.
                </div>
              </div>
            }
          >
            <Show
              when={filtered().length > 0}
              fallback={
                <div class="border border-dashed border-border-weak-base rounded-lg px-6 py-14 text-center">
                  <div class="text-16-medium text-text-strong">Nothing on the wire matches</div>
                  <div class="text-14-regular text-text-weaker mt-1">
                    No dispatch text contains "{props.search.trim()}". Clear the filter in settings.
                  </div>
                </div>
              }
            >
              {/* wire index: jump between dispatches, absent in continuous mode */}
              <Show when={!continuous() && filtered().length > 1}>
                <nav
                  class="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-4 border-b border-border-weak-base"
                  aria-label="wire index"
                >
                  <span class="text-12-mono uppercase text-text-weaker">wire index</span>
                  <For each={filtered()}>
                    {(s) => (
                      <button
                        class={
                          "bg-transparent border-none cursor-pointer p-0 text-12-mono transition-colors duration-150 " +
                          (activeId() === s.id ? "text-text-strong" : "text-text-weaker hover:text-text-base")
                        }
                        title={slug(s)}
                        onClick={() => jump(s.id)}
                      >
                        {pad(s.index)}
                        <span class="hidden xl:inline"> {slug(s)}</span>
                      </button>
                    )}
                  </For>
                </nav>
              </Show>
              <For each={filtered()}>
                {(s) => (
                  <Dispatch
                    section={s}
                    meta={meta().get(s.id)}
                    settings={props.settings}
                    continuous={continuous()}
                  />
                )}
              </For>
            </Show>
          </Show>
        </div>
      </div>

      {/* ticker footer */}
      <footer class="shrink-0 border-t border-border-strong-base bg-background-base">
        <div class="flex items-center gap-3 px-4 h-9 overflow-x-auto no-scrollbar whitespace-nowrap text-12-mono text-text-weaker">
          <span class="flex items-center gap-2 shrink-0">
            <Show when={branding().logoUrl}>
              <img src={branding().logoUrl} alt="" class="h-4 rounded-sm" />
            </Show>
            <Show
              when={branding().wordmarkUrl}
              fallback={
                <span>
                  <Show when={branding().name}>
                    <span class="text-text-base">{branding().name}</span>
                    <span> · </span>
                  </Show>
                  <span>Open(code)Share</span>
                </span>
              }
            >
              <img src={branding().wordmarkUrl} alt="" class="h-3.5" />
            </Show>
          </span>
          <span class="shrink-0 opacity-50">·</span>
          <span class="flex items-center gap-1.5 shrink-0">
            <span class={"inline-block size-1.5 rounded-full shrink-0 " + dotClass()} />
            <span>{status()}</span>
          </span>
          <span class="shrink-0 opacity-50 hidden md:inline">·</span>
          <span class="shrink-0 hidden md:inline">
            {sections().length} dispatches · {wireCount()} wire items · {noteCount()} notes
          </span>
          <Show when={searching()}>
            <span class="shrink-0 opacity-50 hidden sm:inline">·</span>
            <span class="shrink-0 hidden sm:inline">
              filter "{props.search.trim()}" · {filtered().length} matches
            </span>
          </Show>
          <span class="flex-1" />
          <Show when={lastFiled()}>
            {(t) => <span class="shrink-0 hidden lg:inline">last filed {clockSec(t())}</span>}
          </Show>
          <span class="shrink-0">teletype</span>
        </div>
      </footer>
    </div>
  )
}

export const teletype: ViewEntry = {
  id: "teletype",
  label: "teletype",
  component: TeletypeView,
}
