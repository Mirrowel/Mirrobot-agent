// ATLAS VIEW: the session charted as an expedition log. Each prompt is a
// STATION on a chain line down the left margin (numbered W-01), tool calls
// are INSTRUMENT READINGS in a framed housing with the output as the value,
// reasoning is an INFERENCE trace, and the assistant prose is a FIELD NOTE
// held to a reading measure. A sticky margin carries a readings profile
// (click to jump), the legend for the entry kinds, and the sheet
// coordinates. Chrome: a two row chart header, a faint graticule behind
// the sheet, an end-of-log footer.
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { Markdown } from "../../vendor/session-ui/src/components/markdown"
import { DateTime } from "luxon"
import { Title } from "@solidjs/meta"
import type { ViewEntry, ViewProps } from "./registry"
import { sessionModelLabel, useSessionSections, toolCallLabel, type SessionSection, type ToolEntry } from "./session-data"
import { MetaLine } from "./meta-line"
import { VendoredPart } from "./vendored-part"
import { saveSettingsScroll, restoreSettingsScroll, SettingsBody } from "../settings-panel"
import type { OshSettings } from "../settings"

type Counts = { stations: number; readings: number; inferences: number; notes: number }

const pad2 = (n: number) => String(n).padStart(2, "0")

function countWords(text: string) {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

function countLines(text?: string) {
  return text ? text.split("\n").length : 0
}

function measure(text: string) {
  const bytes = new TextEncoder().encode(text).length
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1000000) return `${(bytes / 1000).toFixed(bytes < 10000 ? 1 : 0)} KB`
  return `${(bytes / 1000000).toFixed(1)} MB`
}

function countTokens(n?: number) {
  if (n == null) return undefined
  if (n < 1000) return String(n)
  if (n < 1000000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`
  return `${(n / 1000000).toFixed(1)}M`
}

function readingState(entry: ToolEntry): "ok" | "error" | "pending" {
  const state = (entry.part as any)?.state
  if (state?.error) return "error"
  if (state?.status === "running" || state?.status === "pending") return "pending"
  return "ok"
}

// the survey paper: a fine 32px graticule plus a dashed contour band
const GRATICULE = {
  "background-image":
    "linear-gradient(to right, var(--border-weak-base) 1px, transparent 1px)," +
    "linear-gradient(to bottom, var(--border-weak-base) 1px, transparent 1px)," +
    "repeating-linear-gradient(to bottom, var(--border-weak-base) 0 7px, transparent 7px 192px)",
  "background-size": "32px 32px, 32px 32px, 100% 192px",
  opacity: "0.5",
}

function BrandChip(props: { logoUrl?: string; linkUrl?: string; title?: string }) {
  const frame =
    "shrink-0 flex items-center justify-center size-6 rounded-md border border-border-weak-base bg-background-stronger overflow-hidden"
  return (
    <Show
      when={props.logoUrl}
      fallback={
        <span class={frame}>
          <span class="size-2 rotate-45 border border-icon-strong-base" />
        </span>
      }
    >
      {(url) => (
        <Show
          when={props.linkUrl}
          fallback={
            <span class={frame}>
              <img src={url()} alt="" class="size-4 object-contain" />
            </span>
          }
        >
          {(href) => (
            <a
              href={href()}
              target="_blank"
              rel="noreferrer"
              title={props.title || url()}
              class={`${frame} hover:border-border-strong-base transition-colors duration-150`}
            >
              <img src={url()} alt="" class="size-4 object-contain" />
            </a>
          )}
        </Show>
      )}
    </Show>
  )
}

function StatusStamp(props: { status: string }) {
  const live = () => props.status === "live"
  return (
    <span class="flex items-center gap-1.5 text-12-mono text-text-weaker whitespace-nowrap">
      <span
        classList={{
          "inline-block size-1.5 rounded-full shrink-0": true,
          "status-dot animate-pulse": live(),
        }}
        style={live() ? undefined : { "background-color": "var(--border-strong-base)" }}
      />
      <span class="uppercase tracking-[0.14em]">{props.status}</span>
    </span>
  )
}

// one instrument reading: ordinal, instrument, query, value, disclosure
function Reading(props: { entry: ToolEntry; ordinal: number; settings: OshSettings }) {
  const [userOpen, setOpen] = createSignal<boolean | undefined>(undefined)
  const open = () => userOpen() ?? (props.entry.defaultOpen || props.settings.toolOutput)
  const state = () => readingState(props.entry)
  const value = () => {
    if (props.entry.output) return props.entry.output
    const err = (props.entry.part as any)?.state?.error
    if (err == null || err === "") return ""
    return typeof err === "string" ? err : JSON.stringify(err, null, 2)
  }
  const readout = () => {
    if (state() === "error") return "error"
    if (state() === "pending") return "pending"
    return props.entry.output ? `${countLines(props.entry.output)} ln` : "no output"
  }
  return (
    <div class="border-b border-border-weak-base last:border-b-0">
      <button
        class="flex w-full items-baseline gap-2.5 bg-transparent border-none text-left cursor-pointer px-2.5 py-1.5 hover:bg-surface-base-hover focus-visible:bg-surface-base-hover transition-colors duration-150"
        onClick={() => setOpen(!open())}
        aria-expanded={open()}
      >
        <span class="w-7 shrink-0 text-12-mono text-text-weaker">R-{pad2(props.ordinal)}</span>
        <span class="w-22 shrink-0 truncate text-12-mono text-text-base">{props.entry.tool}</span>
        <span class="flex-1 min-w-0 flex items-baseline gap-2">
          <Show when={props.settings.toolInfo}>
            <span class="truncate text-12-regular text-text-base">{toolCallLabel(props.entry)}</span>
          </Show>
        </span>
        <Show when={state() === "error"}>
          <span class="shrink-0 text-icon-critical-base translate-y-0.5">
            <Icon name="warning" size="small" />
          </span>
        </Show>
        <span
          class="shrink-0 text-12-mono whitespace-nowrap"
          classList={{
            "text-text-weaker": state() !== "error",
            "text-icon-critical-base": state() === "error",
          }}
        >
          {readout()}
        </span>
        <span class="shrink-0 text-icon-weaker-base translate-y-0.5">
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        </span>
      </button>
      <Show when={open() && value()}>
        <pre class="mx-2.5 mb-2.5 p-2.5 max-h-72 overflow-auto rounded-md border border-border-weak-base bg-background-stronger text-12-mono text-text-weaker whitespace-pre-wrap break-words">
          {value()}
        </pre>
      </Show>
    </div>
  )
}

function Inference(props: { text: string; ordinal: number; settings: OshSettings }) {
  const [userOpen, setOpen] = createSignal<boolean | undefined>(undefined)
  const open = () => userOpen() ?? props.settings.reasoningOpen
  return (
    <div class="mt-2">
      <button
        class="flex w-full items-baseline gap-2 bg-transparent border-none text-left cursor-pointer py-0.5"
        onClick={() => setOpen(!open())}
        aria-expanded={open()}
      >
        <span class="shrink-0 text-icon-weaker-base translate-y-0.5">
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        </span>
        <span class="text-12-mono text-text-weaker">I-{pad2(props.ordinal)}</span>
        <span class="text-12-mono uppercase tracking-[0.14em] text-text-weaker">inference</span>
        <span class="text-12-mono text-text-weaker opacity-70">{countWords(props.text)} words</span>
      </button>
      <Show when={open()}>
        <div class="mt-1 pl-6 border-l border-border-weak-base max-w-[62ch] text-12-regular italic text-text-weaker [&_p]:my-1">
          <Markdown text={props.text} />
        </div>
      </Show>
    </div>
  )
}

function Waypoint(props: {
  section: SessionSection
  total: number
  settings: OshSettings
  rail: boolean
  continuous: boolean
  showMatch: boolean
}) {
  const s = props.section
  const modelLabel = () => sessionModelLabel(props.data, props.sessionID)
  const model = () => [s.model?.providerID, s.model?.modelID].filter(Boolean).join("/") || modelLabel()
  return (
    <article
      id={`atlas-wp-${s.id}`}
      class="grid sm:grid-cols-[3.25rem_minmax(0,1fr)] gap-x-5 pt-1 scroll-mt-4"
      classList={{
        "pb-11": !props.continuous,
        "pb-6": props.continuous,
      }}
    >
      <Show when={props.rail}>
        <div class="hidden sm:block relative select-none">
          <div class="absolute right-3.5 top-0 bottom-0 w-px bg-border-weak-base" />
          <div class="relative flex flex-col items-end gap-2.5 pr-6">
            <span class="text-12-mono text-text-weaker">
              {pad2(s.index + 1)}
              <span class="opacity-60">/{pad2(props.total)}</span>
            </span>
            <span class="mr-2.5 size-2 rotate-45 border border-border-strong-base bg-background-base" />
          </div>
        </div>
      </Show>
      <div class="min-w-0 max-w-[44rem]">
        <div class="flex items-start gap-3">
          <Show when={!props.continuous}>
            <span class="shrink-0 mt-0.5 rounded border border-border-strong-base px-1.5 py-px text-12-mono text-text-base">
              W-{pad2(s.index + 1)}
            </span>
          </Show>
          <div class="min-w-0 flex-1">
            <h2
              class="text-16-medium text-text-strong whitespace-pre-wrap break-words"
              classList={{ "italic text-text-weaker": !s.prompt.trim() }}
            >
              {s.prompt.trim() ? s.prompt : "station without a prompt"}
            </h2>
            <MetaLine section={s} data={props.data} />
            <Show when={model()}>
              <div class="mt-1 text-12-mono text-text-weaker">{model()}</div>
            </Show>
          </div>
          <Show when={props.showMatch}>
            <span class="shrink-0 hidden text-12-mono uppercase tracking-[0.14em] text-text-interactive-base sm:block">
              match
            </span>
          </Show>
        </div>

        <For each={s.ordered}>
          {(e, i) => (
            <Show
              when={e.kind !== "reasoning"}
              fallback={<Inference text={(e as any).text} ordinal={i() + 1} settings={props.settings} />}
            >
              <Show
                when={e.kind !== "text"}
                fallback={
                  <div class="mt-3">
                    <div class="mb-1 text-12-mono uppercase tracking-[0.14em] text-text-weaker">field note</div>
                    <div class="text-14-regular text-text-base">
                      <Markdown text={(e as any).text} />
                    </div>
                  </div>
                }
              >
                <div class="mt-2.5">
                  <VendoredPart entry={e as any} settings={props.settings} />
                </div>
              </Show>
            </Show>
          )}
        </For>

        <div class="mt-4">
          <div class="mb-1 flex items-baseline gap-2 text-12-mono uppercase tracking-[0.14em] text-text-weaker">
            <span>field note</span>
            <Show when={s.response.trim()}>
              <span class="tracking-normal normal-case opacity-70">
                {countWords(s.response)} words · {measure(s.response)}
              </span>
            </Show>
          </div>
          <Show
            when={s.response.trim()}
            fallback={
              <p class="text-12-regular italic text-text-weaker">no field note was recorded at this station.</p>
            }
          >
            <div class="max-w-[68ch] text-14-regular text-text-base [&_p]:my-1.5 [&_pre]:max-w-full [&_pre]:overflow-x-auto">
              <Markdown text={s.response} />
            </div>
          </Show>
        </div>
      </div>
    </article>
  )
}

function Profile(props: {
  sections: SessionSection[]
  max: number
  searching: boolean
  matched: Set<string>
  onJump: (id: string) => void
}) {
  const height = (n: number) => (n <= 0 ? 4 : 16 + Math.round((84 * n) / props.max))
  const dim = (s: SessionSection) => props.searching && !props.matched.has(s.id)
  return (
    <div>
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-12-mono uppercase tracking-[0.14em] text-text-weaker">profile</span>
        <span class="text-12-mono text-text-weaker whitespace-nowrap">readings / station</span>
      </div>
      <div class="mt-2 flex h-14 items-end gap-px">
        <For each={props.sections}>
          {(s) => (
            <button
              class="max-w-4 min-w-px flex-1 cursor-pointer border-none p-0 transition-colors duration-150"
              classList={{
                "bg-border-strong-base hover:bg-icon-strong-base": !dim(s),
                "bg-border-weaker-base hover:bg-border-strong-base": dim(s),
              }}
              style={{ height: `${height(s.tools.length)}%` }}
              title={`W-${pad2(s.index + 1)} · ${s.tools.length} ${s.tools.length === 1 ? "reading" : "readings"}`}
              aria-label={`jump to station ${s.index + 1}, ${s.tools.length} readings`}
              onClick={() => props.onJump(s.id)}
            />
          )}
        </For>
      </div>
      <div class="mt-px h-px w-full bg-border-weak-base" />
      <Show when={props.searching}>
        <div class="mt-1.5 text-12-mono text-text-weaker">matched stations are inked</div>
      </Show>
    </div>
  )
}

function Legend(props: { counts: Counts; layout: "stack" | "row" }) {
  const glyphStation = <span class="size-2 rotate-45 border border-border-strong-base" />
  const glyphReading = <span class="size-2 bg-border-strong-base" />
  const glyphInference = <span class="h-px w-3 bg-border-strong-base" />
  const glyphNote = (
    <span class="flex w-3 flex-col gap-0.5">
      <span class="h-px w-3 bg-border-strong-base" />
      <span class="h-px w-2 self-end bg-border-strong-base" />
    </span>
  )
  const items = () => [
    { label: "station", note: "prompt, numbered W-01", count: props.counts.stations, glyph: glyphStation },
    { label: "reading", note: "tool invocation and output", count: props.counts.readings, glyph: glyphReading },
    { label: "inference", note: "reasoning trace", count: props.counts.inferences, glyph: glyphInference },
    { label: "field note", note: "assistant prose", count: props.counts.notes, glyph: glyphNote },
  ]
  return (
    <Show
      when={props.layout === "stack"}
      fallback={
        <div class="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-12-mono text-text-weaker">
          <span class="uppercase tracking-[0.14em]">legend</span>
          <For each={items()}>
            {(it) => (
              <span class="flex items-center gap-1.5">
                <span class="flex size-3 shrink-0 items-center justify-center">{it.glyph}</span>
                <span>{it.label}</span>
                <span class="text-text-base">{it.count}</span>
              </span>
            )}
          </For>
        </div>
      }
    >
      <div class="flex flex-col gap-2.5">
        <div class="text-12-mono uppercase tracking-[0.14em] text-text-weaker">legend</div>
        <For each={items()}>
          {(it) => (
            <div class="flex items-start gap-2">
              <span class="flex size-3 shrink-0 items-center justify-center">{it.glyph}</span>
              <span class="flex min-w-0 flex-col">
                <span class="flex items-baseline gap-1.5 text-12-mono">
                  <span class="text-text-base">{it.label}</span>
                  <span class="text-text-weaker">{it.count}</span>
                </span>
                <span class="text-12-regular text-text-weaker">{it.note}</span>
              </span>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

function Coordinates(props: { sessionID: string; counts: Counts; info: () => any }) {
  const worktree = () => {
    const dir = props.info()?.directory
    if (!dir) return undefined
    const parts = String(dir).split(/[\\/]/).filter(Boolean)
    return parts.slice(-2).join("/") || undefined
  }
  const tokens = () => props.info()?.tokens
  const created = () => DateTime.fromMillis(props.info()?.time?.created ?? Date.now()).toFormat("dd LLL yyyy, HH:mm")
  const row = (label: string, value: string) => (
    <div class="flex items-baseline gap-2">
      <span class="w-17 shrink-0 text-12-mono text-text-weaker opacity-70">{label}</span>
      <span class="min-w-0 truncate text-12-mono text-text-base">{value}</span>
    </div>
  )
  return (
    <div class="flex flex-col gap-1.5">
      <div class="text-12-mono uppercase tracking-[0.14em] text-text-weaker">coordinates</div>
      {row("extent", `${props.counts.stations} stations · ${props.counts.readings} readings`)}
      <Show when={worktree()}>{(dir) => row("worktree", dir())}</Show>
      {row("charted", created())}
      <Show when={tokens()?.input != null || tokens()?.output != null}>
        {row("scale", `${countTokens(tokens()?.input) ?? 0} in · ${countTokens(tokens()?.output) ?? 0} out`)}
      </Show>
      <Show when={props.info()?.summary?.files != null}>
        {row("files", String(props.info().summary.files))}
      </Show>
      {row("session", (props.sessionID.replace(/^ses_/, "").slice(-8) || "00000000").toUpperCase())}
    </div>
  )
}

function AtlasView(props: ViewProps) {
  const info = createMemo(() => props.data.session.find((s) => s.id === props.sessionID))
  const sections = useSessionSections(props.data, props.sessionID)
  const brand = () => props.source.branding()
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [legendOpen, setLegendOpen] = createSignal(true)

  const query = () => props.search.trim().toLowerCase()
  const searching = () => query().length > 0
  const filtered = createMemo(() => {
    const q = query()
    if (!q) return sections()
    return sections().filter(
      (s) => s.prompt.toLowerCase().includes(q) || s.response.toLowerCase().includes(q),
    )
  })
  const matched = createMemo(() => new Set(filtered().map((s) => s.id)))

  const counts = createMemo<Counts>(() => {
    let readings = 0
    let inferences = 0
    let notes = 0
    for (const s of sections()) {
      readings += s.tools.length
      inferences += s.reasoning.length
      if (s.response.trim()) notes += 1
    }
    return { stations: sections().length, readings, inferences, notes }
  })

  const maxReadings = createMemo(() => Math.max(1, ...sections().map((s) => s.tools.length)))
  const logLines = createMemo(() =>
    sections().reduce((n, s) => n + countLines(s.response) + s.tools.length, 0),
  )

  // follow live: pin the newest station only while the reader sits at the foot
  let scrollEl: HTMLDivElement | undefined
  let atBottom = true
  createEffect(() => {
    props.source.rev()
    if (props.source.status() !== "live") return
    if (!props.settings.followLive || !atBottom || !scrollEl) return
    requestAnimationFrame(() => {
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
    })
  })
  const onScroll = () => {
    const el = scrollEl
    if (el) atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const jump = (id: string) => {
    document.getElementById(`atlas-wp-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // centerContent drops the chart margin gutter, the notes column is
  // measure limited either way
  const rail = () => !props.settings.continuous && !props.settings.centerContent

  return (
    <div class="relative flex h-screen w-full flex-col overflow-hidden bg-background-base text-text-base">
      <Title>{`${info()?.title ?? "session"} | ${brand().name || "openshare"}`}</Title>
      <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-0" style={GRATICULE} />

      <header class="relative z-10 shrink-0 border-b border-border-weak-base bg-background-base">
        <div class="mx-auto w-full max-w-[76rem] px-5">
          <div class="flex items-center gap-3 py-2.5">
            <div class="flex min-w-0 items-center gap-3">
              <BrandChip logoUrl={brand().logoUrl} linkUrl={brand().linkUrl} title={brand().name} />
              <div class="flex min-w-0 items-baseline gap-2">
                <span class="text-12-mono uppercase tracking-[0.14em] text-text-strong">atlas</span>
                <span class="hidden truncate text-12-mono text-text-weaker md:inline">expedition log</span>
              </div>
              <span class="hidden h-3.5 w-px bg-border-weak-base lg:block" />
              <h1 class="hidden min-w-0 truncate text-14-medium text-text-strong lg:block">
                {info()?.title ?? "untitled session"}
              </h1>
            </div>
            <div class="ml-auto flex shrink-0 items-center gap-2">
              <span class="hidden sm:flex">
                <StatusStamp status={props.source.status()} />
              </span>
              <span class="hidden items-center gap-1.5 rounded-md border border-border-weak-base bg-background-stronger px-1.5 py-0.5 text-12-mono text-text-weaker sm:flex">
                <Mark class="size-3" />
                <span>v{info()?.version ?? "0"}</span>
              </span>
              <a
                href="https://github.com/Mirrowel/Mirrobot-agent"
                target="_blank"
                rel="noreferrer"
                title="Open(code)Share"
                class="flex items-center text-icon-weaker-base transition-colors duration-150 hover:text-icon-strong-base"
              >
                <Icon name="github" size="small" />
              </a>
              <button
                class="flex items-center gap-1.5 rounded-md border border-border-weak-base bg-background-base px-2 py-1 text-12-mono text-text-weaker transition-colors duration-150 hover:border-border-strong-base hover:text-text-base cursor-pointer"
                onClick={() => setLegendOpen(!legendOpen())}
                aria-expanded={legendOpen()}
                title={legendOpen() ? "hide the legend" : "show the legend"}
              >
                <Icon name="dot-grid" size="small" />
                <span class="hidden sm:inline">legend</span>
                <span
                  class="text-icon-weaker-base transition-transform duration-200 ease-out"
                  classList={{ "rotate-90": !legendOpen() }}
                >
                  <Icon name="chevron-right" size="small" />
                </span>
              </button>
              <div class="relative flex items-center rounded-md border border-border-weak-base bg-background-base p-0.5">
                <button
                  class="flex items-center gap-1 h-6 px-1.5 text-12-mono text-text-weaker hover:text-text-base cursor-pointer bg-transparent border-none"
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
                      branding={{ backgroundUrl: (brand() as any).backgroundUrl }}
                      search={props.search}
                      onSearch={props.onSearch}
                    />
                  </div>
                </Show>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-weak-base py-2">
            <div class="text-12-mono text-text-weaker">
              sheet 01 · {counts().stations} stations · {counts().readings} readings ·{" "}
              {logLines()} note lines · charted{" "}
              {DateTime.fromMillis(info()?.time?.created ?? Date.now()).toFormat("dd LLL, HH:mm")}
            </div>
            <div class="relative ml-auto w-full sm:w-60">
              <span class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-icon-weaker-base">
                <Icon name="magnifying-glass" size="small" />
              </span>
              <input
                class="w-full box-border rounded-md border border-border-weak-base bg-background-stronger py-1 pl-7 pr-7 text-12-regular text-text-base outline-none transition-colors duration-150 placeholder:text-text-weaker focus:border-icon-strong-base"
                placeholder="filter stations"
                aria-label="filter stations by prompt or field note"
                value={props.search}
                onInput={(e) => props.onSearch(e.currentTarget.value)}
              />
              <Show when={props.search}>
                <button
                  class="absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer rounded bg-transparent border-none p-1 text-icon-weaker-base transition-colors duration-150 hover:text-icon-strong-base"
                  title="clear the filter"
                  onClick={() => props.onSearch("")}
                >
                  <Icon name="close-small" size="small" />
                </button>
              </Show>
            </div>
          </div>
        </div>
      </header>

      <div
        ref={scrollEl}
        onScroll={onScroll}
        class="osh-content select-text relative z-10 min-h-0 flex-1 overflow-y-auto"
      >
        <div class="mx-auto flex w-full max-w-[76rem] gap-8 px-5">
          <main class="min-w-0 flex-1 py-5">
            <Show
              when={sections().length > 0}
              fallback={<BlankSheet status={props.source.status()} error={props.source.error()} />}
            >
              <Show
                when={filtered().length > 0}
                fallback={<NoStation query={props.search} onClear={() => props.onSearch("")} />}
              >
                <For each={filtered()}>
                  {(s) => (
                    <Waypoint
                      section={s}
                      total={sections().length}
                      settings={props.settings}
                      rail={rail()}
                      continuous={props.settings.continuous}
                      showMatch={searching()}
                    />
                  )}
                </For>
              </Show>
            </Show>
          </main>

          <Show when={legendOpen()}>
            <aside class="hidden w-52 shrink-0 py-5 lg:block">
              <div class="sticky top-4 flex flex-col gap-6">
                <Show when={!props.settings.continuous}>
                  <Profile
                    sections={sections()}
                    max={maxReadings()}
                    searching={searching()}
                    matched={matched()}
                    onJump={jump}
                  />
                </Show>
                <Legend counts={counts()} layout="stack" />
                <Coordinates sessionID={props.sessionID} counts={counts()} info={info} />
              </div>
            </aside>
          </Show>
        </div>
      </div>

      <footer class="relative z-10 shrink-0 border-t border-border-weak-base bg-background-base">
        <div class="mx-auto w-full max-w-[76rem] px-5">
          <Show when={legendOpen()}>
            <div class="border-b border-border-weak-base py-2.5 lg:hidden">
              <Legend counts={counts()} layout="row" />
            </div>
          </Show>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <span class="flex min-w-0 items-center gap-2">
              <BrandChip logoUrl={brand().logoUrl} linkUrl={brand().linkUrl} title={brand().name} />
              <Show
                when={brand().wordmarkUrl}
                fallback={
                  <span class="truncate text-12-mono text-text-base">
                    <Show when={brand().name}>
                      <span class="text-text-strong">{brand().name}</span>
                      <span class="text-text-weaker"> · </span>
                    </Show>
                    <span>Open(code)Share</span>
                  </span>
                }
              >
                <img src={brand().wordmarkUrl} alt="" class="h-3.5 opacity-70" />
              </Show>
            </span>
            <span class="text-12-mono text-text-weaker">
              end of log · {counts().stations} stations charted
            </span>
            <span class="ml-auto text-12-mono text-text-weaker">
              {info()?.title ?? "untitled session"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function BlankSheet(props: { status: string; error?: string }) {
  return (
    <div class="mx-auto max-w-[34rem] py-20 text-center">
      <div class="flex items-center justify-center gap-2 text-12-mono uppercase tracking-[0.14em] text-text-weaker">
        <span class="size-2 rotate-45 border border-border-strong-base" />
        blank sheet
      </div>
      <p class="mt-3 text-14-regular text-text-base">
        No stations were charted for this session yet.
      </p>
      <p class="mt-1.5 text-12-regular text-text-weaker">
        Every prompt becomes a station as the log syncs. Current status: {props.status}.
      </p>
      <Show when={props.error}>
        <p class="mt-2 inline-flex items-center gap-1.5 text-12-mono text-icon-critical-base">
          <Icon name="warning" size="small" />
          {props.error}
        </p>
      </Show>
    </div>
  )
}

function NoStation(props: { query: string; onClear: () => void }) {
  return (
    <div class="mx-auto max-w-[34rem] py-20 text-center">
      <div class="flex items-center justify-center gap-2 text-12-mono uppercase tracking-[0.14em] text-text-weaker">
        <span class="size-2 rotate-45 border border-border-strong-base" />
        no station found
      </div>
      <p class="mt-3 text-14-regular text-text-base break-words">
        Nothing on this sheet matches <span class="text-text-strong">{props.query}</span>.
      </p>
      <p class="mt-1.5 text-12-regular text-text-weaker">
        Stations are matched on prompt text and field notes. Clear the filter to chart the whole route.
      </p>
      <button
        class="mt-4 cursor-pointer rounded-md border border-border-weak-base bg-background-base px-3 py-1 text-12-regular text-text-base transition-colors duration-150 hover:border-border-strong-base hover:text-text-strong"
        onClick={props.onClear}
      >
        clear filter
      </button>
    </div>
  )
}

export const atlas: ViewEntry = {
  id: "atlas",
  label: "atlas",
  component: AtlasView,
}