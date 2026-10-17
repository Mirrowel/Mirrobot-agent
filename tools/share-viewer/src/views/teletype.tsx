// TELETYPE: the wire-service skin over the shared base. The masthead
// carries the edition band, every turn is a dispatch (ruled dateline
// slug, tight headline, lede, correspondent byline, end mark), tool
// calls arrive as kickered wire updates with the time and hold time
// stamped beside the chip, reasoning is filed as an editor's note, the
// copy runs in a newsroom measure and the ticker footer keeps the desk's
// running count. The skin only arranges and styles: no data handling, no
// scroll or search plumbing of its own (deep styling of the shared tool
// rows, reasoning blocks and prose lives in the teletype section of
// skins.css).
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { BaseSessionView, type Skin, type SkinWrappers } from "./base-view"
import { SettingsBody, restoreSettingsScroll, saveSettingsScroll } from "../settings-panel"
import { useSessionSections, type ReasoningEntry, type SessionSection, type ToolEntry } from "./session-data"
import type { ViewEntry } from "./registry"
import { visibleMessages } from "../fold"

const OPENSHARE_REPO = "https://github.com/Mirrowel/Mirrobot-agent"

// the desk's file number: the wire copy this session was filed under
const fileNo = (sessionID: string) =>
  (sessionID.replace(/^ses_/, "").slice(0, 8) || "00000000").toUpperCase()

const pad = (n: number) => String(n + 1).padStart(2, "0")

// timestamps arrive as epoch millis on live data and are simply absent on
// cached snapshots, so every stamp is gated on a real number; formatted
// locally (no luxon types in this package)
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const two = (n: number) => String(n).padStart(2, "0")

const millis = (v: unknown): number | undefined =>
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

const holdTime = (from?: number, to?: number) => {
  if (from == null || to == null || to < from) return undefined
  const s = (to - from) / 1000
  if (s < 0.1) return "<0.1s"
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`
}

// the wire slug: first line is the headline, the rest of the prompt is
// the lede, so together they carry the full prompt exactly once
function splitPrompt(prompt: string): { headline: string; lede: string } {
  const lines = prompt.split("\n")
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  const headline = (lines[i] ?? "").trim()
  const lede = lines.slice(i + 1).join("\n").trim()
  return { headline: headline || "(untitled dispatch)", lede }
}

const slug = (s: SessionSection) => splitPrompt(s.prompt).headline.slice(0, 48)

const statusDot = (status: string) =>
  status === "live"
    ? "bg-icon-success-base"
    : status === "error"
      ? "bg-icon-critical-base"
      : "bg-icon-weak-base"

// ------------------------------------------------------------- masthead ----
function BrandTile(props: { logoUrl?: string }) {
  return (
    <Show when={props.logoUrl} fallback={<Mark class="h-4 shrink-0 opacity-80" />}>
      <img src={props.logoUrl} alt="" class="h-6 rounded-sm shrink-0" />
    </Show>
  )
}

function Masthead(props: Parameters<NonNullable<SkinWrappers["Header"]>>[0]) {
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const branding = () => props.source.branding()
  const created = () => millis(info()?.time?.created)
  const searching = () => props.search.trim().length > 0
  return (
    <header class="shrink-0 bg-background-base relative z-30">
      <div class="flex items-center gap-3 px-4 h-12 border-b-2 border-border-strong-base">
        <Show when={props.isSub && props.onBack}>
          <button
            class="flex items-center gap-1 shrink-0 bg-transparent border-none cursor-pointer text-12-mono text-text-weaker hover:text-text-base transition-colors duration-150"
            onClick={() => props.onBack?.()}
          >
            &lt; main
          </button>
        </Show>
        <Show
          when={branding().linkUrl}
          fallback={
            <span class="flex items-center gap-2 shrink-0">
              <BrandTile logoUrl={branding().logoUrl} />
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
              <BrandTile logoUrl={branding().logoUrl} />
              <span class="hidden sm:inline text-14-medium text-text-strong truncate max-w-40">
                {branding().name ?? "Open(code)Share"}
              </span>
            </a>
          )}
        </Show>
        <span class="hidden sm:block h-5 w-px shrink-0 bg-border-weak-base" />
        <h1 class="flex-1 min-w-0 text-14-medium text-text-base truncate">
          {info()?.title ?? "session"}
        </h1>
        <div class="flex items-center gap-2 shrink-0">
          <span
            class="flex items-center gap-1.5 rounded-md border border-border-weak-base px-2 py-1 text-12-mono text-text-weaker"
            title="source status"
          >
            <span class={"inline-block size-1.5 rounded-full shrink-0 " + statusDot(props.status)} />
            {props.status}
          </span>
          <Show when={props.model}>
            <span class="max-w-48 truncate rounded-md border border-border-weak-base px-2 py-1 text-12-mono text-text-base">
              {props.model}
            </span>
          </Show>
          <span class="flex items-center gap-1.5 rounded-md border border-border-weak-base px-2 py-1 text-12-mono text-text-base">
            <Mark class="h-3 shrink-0" />
            v{info()?.version ?? "?"}
          </span>
          <a
            href={OPENSHARE_REPO}
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
              <Icon name="chevron-down" size="small" />
            </button>
            <Show when={settingsOpen()}>
              <div
                class="absolute top-8 right-0 z-[70] w-72 max-h-[calc(100vh-4rem)] overflow-y-auto p-4 rounded-xl border border-border-weak-base bg-background-base shadow-xl"
                onScroll={(e) => saveSettingsScroll(e.currentTarget)}
                ref={restoreSettingsScroll}
              >
                <SettingsBody
                  settings={props.settings}
                  update={props.updateSettings}
                  branding={props.source.branding()}
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
        <span class="shrink-0">wire {fileNo(props.sessionID)}</span>
        <Show when={created()}>
          {(t) => (
            <>
              <span class="shrink-0 opacity-50">·</span>
              <span class="shrink-0 hidden sm:inline">received {stamp(t())}</span>
            </>
          )}
        </Show>
        <span class="flex-1" />
        <Show when={searching()}>
          <span class="shrink-0 truncate">filter "{props.search.trim()}"</span>
        </Show>
      </div>
    </header>
  )
}

// --------------------------------------------------------------- ticker ----
function Ticker(props: Parameters<NonNullable<SkinWrappers["Footer"]>>[0]) {
  const sections = useSessionSections(props.data, props.sessionID)
  const branding = () => props.source.branding()
  const status = () => props.source.status()
  const wireItems = createMemo(() => sections().reduce((n, s) => n + s.tools.length, 0))
  const notes = createMemo(() => sections().reduce((n, s) => n + s.reasoning.length, 0))
  const searching = () => props.search.trim().length > 0
  const matches = createMemo(() => {
    const q = props.search.trim().toLowerCase()
    if (!q) return undefined
    return sections().filter(
      (s) => s.prompt.toLowerCase().includes(q) || s.response.toLowerCase().includes(q),
    ).length
  })
  // the newest completed message is the last copy the desk filed
  const lastFiled = createMemo(() => {
    let last: number | undefined
    for (const m of visibleMessages(props.data, props.sessionID)) {
      const t = millis((m as any).time?.completed) ?? millis((m as any).time?.created)
      if (t != null) last = Math.max(last ?? 0, t)
    }
    return last
  })
  return (
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
          <span class={"inline-block size-1.5 rounded-full shrink-0 " + statusDot(status())} />
          <span>{status()}</span>
        </span>
        <span class="shrink-0 opacity-50 hidden md:inline">·</span>
        <span class="shrink-0 hidden md:inline">
          {sections().length} dispatches · {wireItems()} wire items · {notes()} notes
        </span>
        <Show when={searching() && matches() != null}>
          <span class="shrink-0 opacity-50 hidden sm:inline">·</span>
          <span class="shrink-0 hidden sm:inline">
            filter "{props.search.trim()}" · {matches()} matches
          </span>
        </Show>
        <span class="flex-1" />
        <Show when={lastFiled()}>
          {(t) => <span class="shrink-0 hidden lg:inline">last filed {clockSec(t())}</span>}
        </Show>
        <span class="shrink-0">teletype</span>
      </div>
    </footer>
  )
}

// ----------------------------------------------------------- wire index ----
// the Nav slot as a dispatch index: numbers and slugs, the active sheet
// highlighted. Selection, filtering and rendering stay with the base.
function WireIndex(props: Parameters<NonNullable<SkinWrappers["Nav"]>>[0]) {
  return (
    <div class="hidden sm:flex flex-col gap-0.5 w-40 max-w-[10rem]">
      <div class="pb-1 mb-1 text-12-mono uppercase text-text-weaker border-b border-border-weak-base">
        wire index
      </div>
      <For each={props.sections}>
        {(s, i) => (
          <button
            class={
              "flex items-baseline gap-2 w-full text-left rounded-md px-1.5 py-1 bg-transparent border-none cursor-pointer transition-colors duration-150 " +
              (props.active === i() ? "bg-surface-base" : "hover:bg-surface-base")
            }
            title={splitPrompt(s.prompt).headline}
            onClick={() => props.onSelect(i())}
          >
            <span
              class={
                "text-12-mono shrink-0 " + (props.active === i() ? "text-text-strong" : "text-text-weaker")
              }
            >
              {pad(s.index)}
            </span>
            <span
              class={
                "text-12-regular truncate " + (props.active === i() ? "text-text-base" : "text-text-weaker")
              }
            >
              {slug(s)}
            </span>
          </button>
        )}
      </For>
    </div>
  )
}

// ------------------------------------------------------------- wrappers ----
type Kicker = { label: string; tone: "critical" | "strong" | "weak" }

const KICKER_TONE: Record<Kicker["tone"], string> = {
  critical: "border-icon-critical-base text-icon-critical-base",
  strong: "border-border-strong-base text-text-base",
  weak: "border-border-weak-base text-text-weaker",
}

// what the wire calls a tool part: urgent when it broke, developing while
// it runs, a draft before it starts, otherwise a filed update
function wireKicker(tool: ToolEntry): Kicker {
  const status = tool.part.state?.status
  if (status === "error") return { label: "urgent", tone: "critical" }
  if (status === "running") return { label: "developing", tone: "strong" }
  if (status === "pending") return { label: "draft", tone: "weak" }
  return { label: "update", tone: "weak" }
}

function correspondent(section: SessionSection): string | undefined {
  const m = section.model
  if (!m) return undefined
  if (m.providerID && m.modelID) return `${m.providerID}/${m.modelID}`
  return m.modelID ?? m.providerID
}

// one dispatch: a ruled frame closed with the wire's end mark (also the
// only closing signal in nav mode, where no next dispatch draws the rule)
function Dispatch(props: { section: SessionSection; index: number; children: JSX.Element }) {
  return (
    <article class="pt-8 first:pt-2 border-t border-border-strong-base first:border-none">
      {props.children}
      <div class="pt-1 pb-2 text-12-mono text-text-weaker opacity-60 select-none">-30-</div>
    </article>
  )
}

function Slug(props: { section: SessionSection; children: JSX.Element }) {
  const split = () => splitPrompt(props.section.prompt)
  const model = () => correspondent(props.section)
  return (
    <div>
      {/* dateline slug: number, wordmark, received time, ruled off to the edge */}
      <div class="flex items-center gap-2.5 text-12-mono text-text-weaker">
        <span class="text-text-strong">{pad(props.section.index)}</span>
        <span class="uppercase">dispatch</span>
        <Show when={clock(props.section.at)}>{(t) => <span>{t()}</span>}</Show>
        <span class="flex-1 border-t border-border-weak-base" />
      </div>
      {/* headline over lede: the prompt set as wire copy */}
      <h2 class="mt-2 text-20-medium text-text-strong break-words">{split().headline}</h2>
      <Show when={split().lede}>
        <p class="mt-2 max-w-[40rem] text-14-regular text-text-base whitespace-pre-wrap">
          {split().lede}
        </p>
      </Show>
      {/* byline: who filed the copy */}
      <Show when={model()}>
        <div class="mt-3 flex items-center gap-2 min-w-0 text-12-mono text-text-weaker">
          <Show when={props.section.model?.providerID}>
            {(id) => <ProviderIcon id={id()} class="size-3.5 shrink-0 text-icon-strong-base" />}
          </Show>
          <span class="uppercase">correspondent</span>
          <span class="text-text-base truncate">{model()}</span>
        </div>
      </Show>
      {/* the base's own prompt block and meta line stay in the tree (and
          stay reactive) but this wrapper typesets the copy itself, so
          they are kept out of view: same text, wire presentation */}
      <div hidden>{props.children}</div>
    </div>
  )
}

function WireUpdate(props: { entry: ToolEntry; children: JSX.Element }) {
  const kicker = () => wireKicker(props.entry)
  const start = () => millis(props.entry.part.state?.time?.start)
  const held = () => holdTime(start(), millis(props.entry.part.state?.time?.end))
  return (
    <div class="my-2 flex items-start gap-2.5">
      {/* stamped rail: kicker chip over the time the wire item crossed
          and how long it was held */}
      <div class="flex flex-col items-center gap-1 shrink-0 pt-1 w-22">
        <span
          class={
            "w-full text-center rounded-xs border px-1.5 text-12-mono uppercase " +
            KICKER_TONE[kicker().tone]
          }
        >
          {kicker().label}
        </span>
        <Show when={clockSec(start())}>
          {(t) => <span class="text-12-mono text-text-weaker whitespace-nowrap">{t()}</span>}
        </Show>
        <Show when={held()}>
          {(d) => <span class="text-12-mono text-text-weaker whitespace-nowrap">{d()}</span>}
        </Show>
      </div>
      <div class="flex-1 min-w-0">{props.children}</div>
    </div>
  )
}

// the base's reasoning block is relabeled as the note by skins.css (the
// label line, the meta stamps and the chevron are generated there); this
// wrapper supplies the aside frame and the meta stamps themselves
function EditorNote(props: { entry: ReasoningEntry; children: JSX.Element }) {
  const start = () => millis(props.entry.part.time?.start)
  const held = () => holdTime(start(), millis(props.entry.part.time?.end))
  const meta = () => [clockSec(start()), held()].filter(Boolean).join(" · ")
  return (
    <aside
      class="mt-1 rounded-md border border-dashed border-border-weak-base px-3 py-2"
      style={meta() ? ({ "--note-meta": ` " · ${meta()}"` } as JSX.CSSProperties) : undefined}
    >
      {props.children}
    </aside>
  )
}

function Copy(props: { children: JSX.Element }) {
  return <div class="tt-copy mt-2 max-w-[40rem]">{props.children}</div>
}

// ----------------------------------------------------------------- skin ----
export const teletypeSkin: Skin = {
  id: "teletype",
  mode: "composed",
  columnClass: "max-w-[54rem] mx-auto px-4 sm:px-6 py-6 osh-content flex flex-col",
  wrappers: {
    Header: Masthead,
    Footer: Ticker,
    Nav: WireIndex,
    TurnWrap: Dispatch,
    PromptWrap: Slug,
    ToolWrap: WireUpdate,
    ReasoningWrap: EditorNote,
    ResponseWrap: Copy,
  },
}

export function TeletypeView(props: Parameters<ViewEntry["component"]>[0]) {
  return <BaseSessionView {...props} skin={teletypeSkin} />
}

export const teletype: ViewEntry = {
  id: "teletype",
  label: "teletype",
  component: TeletypeView,
}
