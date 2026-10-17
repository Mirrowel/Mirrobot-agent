// ATLAS VIEW: the session charted as an expedition log, a skin over the
// shared base. Each prompt is a STATION hung on a chain line down a left
// gutter (index/total micro label, datum diamond, W-numbered heading),
// tool calls are R-numbered INSTRUMENT READINGS in framed housings around
// the vendored tool rows, reasoning is an INFERENCE trace, and the
// assistant prose is a FIELD NOTE held to a reading measure with word and
// byte coordinates. The right margin rail (grid column beside the sheet,
// sticky for the whole scroll) carries the entry-kind LEGEND with live
// counts, the readings-per-station PROFILE (click a bar to jump, dimmed
// bars are stations the filter dropped), and the sheet COORDINATES. A
// faint graticule with a dashed contour band sits behind the whole sheet.
// The base owns scroll, search, follow-live, settings mechanics and the
// vendored tool pipeline; this file only arranges and decorates.
import { For, Show, createEffect, createSignal } from "solid-js"
import { Title } from "@solidjs/meta"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { DateTime } from "luxon"
import { BaseSessionView, type Skin, type SkinWrappers } from "./base-view"
import type { ViewEntry } from "./registry"
import { useSessionSections, type SessionSection } from "./session-data"
import { SettingsBody } from "../settings-panel"

type HeaderProps = Parameters<NonNullable<SkinWrappers["Header"]>>[0]
type FooterProps = Parameters<NonNullable<SkinWrappers["Footer"]>>[0]
type TurnProps = Parameters<NonNullable<SkinWrappers["TurnWrap"]>>[0]
type PromptProps = Parameters<NonNullable<SkinWrappers["PromptWrap"]>>[0]
type ToolProps = Parameters<NonNullable<SkinWrappers["ToolWrap"]>>[0]
type ReasoningProps = Parameters<NonNullable<SkinWrappers["ReasoningWrap"]>>[0]
type ResponseProps = Parameters<NonNullable<SkinWrappers["ResponseWrap"]>>[0]

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

type Counts = { stations: number; readings: number; inferences: number; notes: number }

function countsOf(sections: { tools: unknown[]; reasoning: unknown[]; response: string }[]): Counts {
  let readings = 0
  let inferences = 0
  let notes = 0
  for (const s of sections) {
    readings += s.tools.length
    inferences += s.reasoning.length
    if (s.response.trim()) notes += 1
  }
  return { stations: sections.length, readings, inferences, notes }
}

// Margin-rail feed: the masthead sees the view props (search, settings,
// data) while the rail renders from the first station wrapper, so the
// masthead publishes presentation facts here. Pure view-local plumbing;
// the base keeps owning the search state itself.
type RailFeed = {
  sections: SessionSection[]
  query: string
  sessionID: string
  info: any
  counts: Counts
  noteLines: number
  continuous: boolean
}
const emptyFeed: RailFeed = {
  sections: [],
  query: "",
  sessionID: "",
  info: undefined,
  counts: { stations: 0, readings: 0, inferences: 0, notes: 0 },
  noteLines: 0,
  continuous: false,
}
const [railFeed, setRailFeed] = createSignal<RailFeed>(emptyFeed)
const [legendOpen, setLegendOpen] = createSignal(true)

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
        class="inline-block size-1.5 rounded-full shrink-0"
        classList={{
          "status-dot": live(),
          "animate-pulse": live(),
        }}
        style={live() ? undefined : { "background-color": "var(--border-strong-base)" }}
      />
      <span class="uppercase tracking-[0.14em]">{props.status}</span>
    </span>
  )
}

// two row masthead: brand chip, atlas marks, back-to-main, status, version,
// github, the legend toggle, and the settings dropdown kept at z-[70]
// inside a relative container. Row two is the sheet strip plus the filter
// field (the base owns the search state, this is only its surface). The
// graticule layer behind the sheet is rendered here and pinned by CSS to
// the whole view; the masthead also publishes the rail feed.
function Masthead(props: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  // dropdown scroll memory: the sheet outlives the dropdown, remember
  // where the reader was (wired locally; the shared helpers are typed as
  // ref callbacks and cannot serve onScroll)
  let settingsScrollTop = 0
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const b = () => props.source.branding()
  const sections = useSessionSections(props.data, props.sessionID)
  const counts = () => countsOf(sections())
  const noteLines = () =>
    sections().reduce((n, s) => n + countLines(s.response) + s.tools.length, 0)

  createEffect(() => {
    setRailFeed({
      sections: sections(),
      query: props.search,
      sessionID: props.sessionID,
      info: info(),
      counts: counts(),
      noteLines: noteLines(),
      continuous: props.settings.continuous,
    })
  })

  return (
    <>
      <div class="atlas-graticule" aria-hidden="true" />
      <Title>{`${info()?.title ?? "session"} | ${b().name || "openshare"}`}</Title>
      <header class="relative z-30 shrink-0 border-b border-border-weak-base bg-background-base">
        <div class="mx-auto w-full max-w-[76rem] px-5">
          <div class="flex items-center gap-3 py-2.5">
            <div class="flex min-w-0 items-center gap-3">
              <Show when={props.isSub && props.onBack}>
                <button
                  class="flex items-center gap-1 bg-transparent border-none cursor-pointer text-12-regular text-text-weaker hover:text-text-base shrink-0"
                  onClick={() => props.onBack?.()}
                >
                  <Icon name="arrow-left" size="small" />
                  main
                </button>
              </Show>
              <BrandChip logoUrl={b().logoUrl} linkUrl={b().linkUrl} title={b().name} />
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
                <StatusStamp status={props.status} />
              </span>
              <span class="hidden items-center gap-1.5 rounded-md border border-border-weak-base bg-background-stronger px-1.5 py-0.5 text-12-mono text-text-weaker sm:flex">
                <Mark class="size-3" />
                <span>v{info()?.version ?? "0"}</span>
              </span>
              <Show when={props.model}>
                <span class="hidden truncate text-12-mono text-text-weaker md:inline max-w-48">{props.model}</span>
              </Show>
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
                  <span
                    class="text-icon-weaker-base transition-transform duration-200 ease-out"
                    classList={{ "rotate-180": settingsOpen() }}
                  >
                    <Icon name="chevron-down" size="small" />
                  </span>
                </button>
                <Show when={settingsOpen()}>
                  <div
                    class="absolute top-8 right-0 z-[70] w-72 max-h-[calc(100vh-4rem)] overflow-y-auto p-4 rounded-xl border border-border-weak-base bg-background-base shadow-xl"
                    ref={(el) => {
                      const top = settingsScrollTop
                      queueMicrotask(() => {
                        if (top) el.scrollTop = top
                      })
                    }}
                    onScroll={(e) => {
                      settingsScrollTop = e.currentTarget.scrollTop
                    }}
                  >
                    <SettingsBody
                      settings={props.settings}
                      update={props.updateSettings}
                      branding={b()}
                      search={props.search}
                      onSearch={props.onSearch}
                    />
                  </div>
                </Show>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-weak-base py-2 text-12-mono text-text-weaker">
            <span class="whitespace-nowrap">
              sheet 01 · {counts().stations} stations · {counts().readings} readings ·{" "}
              {noteLines()} note lines · charted{" "}
              {DateTime.fromMillis(info()?.time?.created ?? Date.now()).toFormat("dd LLL, HH:mm")}
            </span>
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
    </>
  )
}

// end-of-log sheet footer: the legend repeated as a row on narrow sheets
// (the rail is lg and up only), then the brand and end-of-log line
function SheetFooter(props: FooterProps) {
  const b = () => props.source.branding()
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const sections = useSessionSections(props.data, props.sessionID)
  return (
    <footer class="relative z-10 shrink-0 border-t border-border-weak-base bg-background-base">
      <div class="mx-auto w-full max-w-[76rem] px-5">
        <Show when={legendOpen()}>
          <div class="border-b border-border-weak-base py-2.5 lg:hidden">
            <Legend counts={countsOf(sections())} layout="row" />
          </div>
        </Show>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
          <span class="flex min-w-0 items-center gap-2">
            <BrandChip logoUrl={b().logoUrl} linkUrl={b().linkUrl} title={b().name} />
            <Show
              when={b().wordmarkUrl}
              fallback={
                <span class="truncate text-12-mono text-text-base">
                  <Show when={b().name}>
                    <span class="text-text-strong">{b().name}</span>
                    <span class="text-text-weaker"> · </span>
                  </Show>
                  <span>Open(code)Share</span>
                </span>
              }
            >
              <img src={b().wordmarkUrl} alt="" class="h-3.5 opacity-70" />
            </Show>
          </span>
          <span class="text-12-mono text-text-weaker">end of log · {sections().length} stations charted</span>
          <span class="ml-auto min-w-0 truncate text-12-mono text-text-weaker">
            {info()?.title ?? "untitled session"}
          </span>
        </div>
      </div>
    </footer>
  )
}

function Legend(props: { counts: Counts; layout?: "stack" | "row" }) {
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
      when={props.layout === "row"}
      fallback={
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
      }
    >
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
    </Show>
  )
}

// the readings profile: one bar per station, height by reading count,
// click to jump, bars the filter dropped are dimmed
function Profile(props: { sections: SessionSection[]; query: string }) {
  const q = () => props.query.trim().toLowerCase()
  const searching = () => q().length > 0
  const matched = () =>
    new Set(
      props.sections
        .filter((s) => s.prompt.toLowerCase().includes(q()) || s.response.toLowerCase().includes(q()))
        .map((s) => s.id),
    )
  const max = () => Math.max(1, ...props.sections.map((s) => s.tools.length))
  const height = (n: number) => (n <= 0 ? 4 : 16 + Math.round((84 * n) / max()))
  const dim = (s: SessionSection) => searching() && !matched().has(s.id)
  const jump = (id: string) => {
    document.getElementById(`atlas-wp-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
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
                "bg-border-strong-base": !dim(s),
                "hover:bg-icon-strong-base": !dim(s),
                "bg-border-weaker-base": dim(s),
                "hover:bg-border-strong-base": dim(s),
              }}
              style={{ height: `${height(s.tools.length)}%` }}
              title={`W-${pad2(s.index + 1)} · ${s.tools.length} ${s.tools.length === 1 ? "reading" : "readings"}`}
              aria-label={`jump to station ${s.index + 1}, ${s.tools.length} readings`}
              onClick={() => jump(s.id)}
            />
          )}
        </For>
      </div>
      <div class="mt-px h-px w-full bg-border-weak-base" />
      <Show when={searching()}>
        <div class="mt-1.5 text-12-mono text-text-weaker">matched stations are inked</div>
      </Show>
    </div>
  )
}

// the margin rail: profile, legend, coordinates. Rendered as the second
// grid column of the sheet and made sticky for the whole scroll via the
// skins.css grid-row span, exactly the original right margin
function MarginRail() {
  const feed = railFeed
  const worktree = () => {
    const dir = feed().info?.directory
    if (!dir) return undefined
    const parts = String(dir).split(/[\\/]/).filter(Boolean)
    return parts.slice(-2).join("/") || undefined
  }
  const created = () =>
    DateTime.fromMillis(feed().info?.time?.created ?? Date.now()).toFormat("dd LLL yyyy, HH:mm")
  const tokens = () => feed().info?.tokens
  const sessionCode = () =>
    (feed().sessionID.replace(/^ses_/, "").slice(-8) || "00000000").toUpperCase()
  const row = (label: string, value: string) => (
    <div class="flex items-baseline gap-2">
      <span class="w-17 shrink-0 text-12-mono text-text-weaker opacity-70">{label}</span>
      <span class="min-w-0 truncate text-12-mono text-text-base">{value}</span>
    </div>
  )
  return (
    <aside class="atlas-rail hidden w-52 flex-col gap-6 lg:flex">
      <Show when={legendOpen()}>
        <Profile sections={feed().sections} query={feed().query} />
        <Legend counts={feed().counts} />
        <div class="flex flex-col gap-1.5">
          <div class="text-12-mono uppercase tracking-[0.14em] text-text-weaker">coordinates</div>
          {row("extent", `${feed().counts.stations} stations · ${feed().counts.readings} readings`)}
          <Show when={worktree()}>{(dir) => row("worktree", dir())}</Show>
          {row("charted", created())}
          <Show when={tokens()?.input != null || tokens()?.output != null}>
            {row("scale", `${countTokens(tokens()?.input) ?? 0} in · ${countTokens(tokens()?.output) ?? 0} out`)}
          </Show>
          <Show when={feed().info?.summary?.files != null}>
            {row("files", String(feed().info?.summary?.files))}
          </Show>
          {row("session", sessionCode())}
        </div>
      </Show>
    </aside>
  )
}

// station: the chain-line gutter (index over total, datum diamond) beside
// the station body; the article is the jump target for the profile bars.
// In continuous mode the gutter and the rail drop away and the rhythm
// tightens, mirroring the original behavior.
function Station(props: TurnProps) {
  const continuous = () => railFeed().continuous
  const total = () => railFeed().sections.length
  return (
    <>
      <Show when={props.index === 0 && !continuous()}>
        <MarginRail />
      </Show>
      <article
        id={`atlas-wp-${props.section.id}`}
        class="atlas-station relative scroll-mt-4 pt-1"
        classList={{
          "sm:grid": !continuous(),
          "sm:grid-cols-[3.25rem_minmax(0,1fr)]": !continuous(),
          "sm:gap-x-5": !continuous(),
          "pb-11": !continuous(),
          "pb-6": continuous(),
        }}
      >
        <Show when={!continuous()}>
          <div class="hidden sm:block relative select-none">
            <div class="absolute right-3.5 top-0 bottom-0 w-px bg-border-weak-base" aria-hidden="true" />
            <div class="relative flex flex-col items-end gap-2.5 pr-6">
              <span class="text-12-mono text-text-weaker">
                {pad2(props.section.index + 1)}
                <span class="opacity-60">/{pad2(total())}</span>
              </span>
              <span
                class="mr-2.5 size-2 rotate-45 border border-border-strong-base bg-background-base"
                aria-hidden="true"
              />
            </div>
          </div>
        </Show>
        <div class="min-w-0 max-w-[44rem]">{props.children}</div>
      </article>
    </>
  )
}

// station heading: the W-number tag against the prompt
function StationHeading(props: PromptProps) {
  const continuous = () => railFeed().continuous
  const matched = () => railFeed().query.trim().length > 0
  return (
    <div class="flex items-start gap-3">
      <Show when={!continuous()}>
        <span class="shrink-0 mt-0.5 rounded border border-border-strong-base px-1.5 py-px text-12-mono text-text-base">
          W-{pad2(props.section.index + 1)}
        </span>
      </Show>
      <div class="atlas-prompt min-w-0 flex-1">
        <Show when={!props.section.prompt.trim()}>
          <span class="text-12-regular italic text-text-weaker">station without a prompt</span>
        </Show>
        {props.children}
      </div>
      <Show when={matched()}>
        <span class="shrink-0 hidden text-12-mono uppercase tracking-[0.14em] text-text-interactive-base sm:block">
          match
        </span>
      </Show>
    </div>
  )
}

// instrument reading: R-numbered housing around the vendored tool part;
// the skins.css section restyles the vendored rows into mono instrument
// lines inside this frame
function Reading(props: ToolProps) {
  return (
    <div class="my-2.5 overflow-hidden rounded-md border border-border-weak-base bg-background-base">
      <div class="flex items-baseline gap-2 border-b border-border-weak-base bg-background-stronger px-2.5 py-1">
        <span class="shrink-0 text-12-mono text-text-weaker">R-{pad2(props.index + 1)}</span>
        <span class="min-w-0 truncate text-12-mono text-text-base">{props.entry.tool}</span>
        <Show when={props.entry.output}>
          <span class="shrink-0 text-12-mono text-text-weaker opacity-70">
            {countLines(props.entry.output)} ln
          </span>
        </Show>
        <span class="ml-auto shrink-0 text-12-mono uppercase tracking-[0.14em] text-text-weaker">
          reading
        </span>
      </div>
      <div class="min-w-0 px-2.5 py-1">{props.children}</div>
    </div>
  )
}

// inference trace: label and word count above the shared reasoning block
// (skins.css turns the shared block into the dashed quiet trace)
function Inference(props: ReasoningProps) {
  return (
    <div class="mt-2.5">
      <div class="flex items-baseline gap-2">
        <span class="shrink-0 text-12-mono uppercase tracking-[0.14em] text-text-weaker">inference</span>
        <Show when={props.entry.text.trim()}>
          <span class="shrink-0 text-12-mono text-text-weaker opacity-70">
            {countWords(props.entry.text)} words
          </span>
        </Show>
        <span class="h-px flex-1 bg-border-weak-base" aria-hidden="true" />
      </div>
      <div class="mt-0.5">{props.children}</div>
    </div>
  )
}

// field note: the assistant prose held to a reading measure, with word
// and byte coordinates on the label row
function FieldNote(props: ResponseProps) {
  return (
    <Show
      when={props.text.trim()}
      fallback={
        <div class="mt-3 text-12-regular italic text-text-weaker">
          no field note was recorded at this station.
        </div>
      }
    >
      <div class="mt-4">
        <div class="mb-1 flex items-baseline gap-2 text-12-mono uppercase tracking-[0.14em] text-text-weaker">
          <span>field note</span>
          <span class="tracking-normal normal-case opacity-70">
            {countWords(props.text)} words · {measure(props.text)}
          </span>
        </div>
        <div class="max-w-[68ch]">{props.children}</div>
      </div>
    </Show>
  )
}

export const atlasSkin: Skin = {
  id: "atlas",
  mode: "composed",
  // the sheet: stations down column one, the margin rail as grid column
  // two (sticky via skins.css), the graticule behind it all
  columnClass:
    "atlas-sheet w-full max-w-[76rem] mx-auto px-5 py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-x-8",
  wrappers: {
    Header: Masthead,
    Footer: SheetFooter,
    TurnWrap: Station,
    PromptWrap: StationHeading,
    ToolWrap: Reading,
    ReasoningWrap: Inference,
    ResponseWrap: FieldNote,
  },
}

export const atlas: ViewEntry = {
  id: "atlas",
  label: "atlas",
  component: (p) => <BaseSessionView {...p} skin={atlasSkin} />,
}
