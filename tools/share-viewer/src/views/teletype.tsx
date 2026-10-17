// TELETYPE: the wire-service skin over the shared base. The masthead
// carries the edition band, every turn is a dispatch (dateline slug, headline
// and lede, correspondent byline), tool calls arrive as kickered wire updates
// rendered by the base's vendored pipeline, reasoning is filed as an editor's
// note, the copy runs in a narrow column and the ticker footer keeps the
// desk's running count. The skin only arranges and styles: no data handling,
// no scroll or search plumbing of its own.
import { Show, createMemo, createSignal, type JSX } from "solid-js"
import { DateTime } from "luxon"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { BaseSessionView, type Skin, type SkinWrappers } from "./base-view"
import { SettingsBody, restoreSettingsScroll, saveSettingsScroll } from "../settings-panel"
import { useSessionSections, type SessionSection, type ToolEntry } from "./session-data"
import type { ViewEntry } from "./registry"

const OPENSHARE_REPO = "https://github.com/Mirrowel/Mirrobot-agent"

// the desk's file number: the wire copy this session was filed under
const fileNo = (sessionID: string) =>
  (sessionID.replace(/^ses_/, "").slice(0, 8) || "00000000").toUpperCase()

const pad = (n: number) => String(n + 1).padStart(2, "0")

// timestamps arrive as epoch millis on live data and are simply absent on
// cached snapshots, so every stamp is gated on a real number
const millis = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined

const statusDot = (status: string) =>
  status === "live"
    ? "bg-icon-success-base"
    : status === "error"
      ? "bg-icon-critical-base"
      : "bg-icon-weak-base"

// The base lays a prompt down as one pre-wrap block. Wire copy wants the
// first line to read as the headline and the rest as the lede, and pre-wrap
// keeps every prompt newline as a real line break, so ::first-line lands
// exactly on the headline: the base's own block, typeset as wire copy.
// Sizes come from the design system tokens, so the reading-text setting
// still drives them.
const HEADLINE_AND_LEDE =
  "[&>div>p]:mt-1 [&>div>p]:max-w-[42rem] [&>div>p]:text-[length:var(--font-size-base)] " +
  "[&>div>p]:font-regular [&>div>p]:text-text-base " +
  "[&>div>p]:first-line:text-[length:var(--font-size-x-large)] [&>div>p]:first-line:font-medium " +
  "[&>div>p]:first-line:tracking-tightest [&>div>p]:first-line:text-text-strong"

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
              <Icon name={settingsOpen() ? "chevron-up" : "chevron-down"} size="small" />
            </button>
            <Show when={settingsOpen()}>
              <div
                class="absolute top-8 right-0 z-[70] w-72 max-h-[calc(100vh-4rem)] overflow-y-auto p-4 rounded-xl border border-border-weak-base bg-background-base shadow-xl"
                onScroll={saveSettingsScroll}
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
              <span class="shrink-0 hidden sm:inline">
                received {DateTime.fromMillis(t()).toFormat("dd MMM yyyy HH:mm")}
              </span>
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
        <span class="flex-1" />
        <span class="shrink-0">teletype</span>
      </div>
    </footer>
  )
}

// ------------------------------------------------------------- wrappers ----
type Kicker = { label: string; tone: "critical" | "strong" | "weak" }

const KICKER_TONE: Record<Kicker["tone"], string> = {
  critical: "border-icon-critical-base text-icon-critical-base",
  strong: "border-border-strong-base text-text-base",
  weak: "border-border-weak-base text-text-weaker",
}

// what the wire calls a tool part: urgent when it broke, developing while it
// runs, a draft before it starts, otherwise a filed update
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

function Dispatch(props: { section: SessionSection; children: JSX.Element }) {
  return (
    <article class="pt-8 first:pt-2 border-t border-border-strong-base first:border-none">
      {props.children}
    </article>
  )
}

function Slug(props: { section: SessionSection; children: JSX.Element }) {
  const model = () => correspondent(props.section)
  return (
    <div>
      {/* dateline slug: number, wire mark, received time, ruled off */}
      <div class="flex items-center gap-2.5 text-12-mono text-text-weaker">
        <span class="text-text-strong">{pad(props.section.index)}</span>
        <span class="uppercase">dispatch</span>
        <Show when={props.section.at}>
          {(t) => <span>{DateTime.fromMillis(t()).toFormat("HH:mm")}</span>}
        </Show>
        <span class="flex-1 border-t border-border-weak-base" />
      </div>
      {/* the base's prompt block, set as wire copy: headline over lede */}
      <div class={HEADLINE_AND_LEDE}>{props.children}</div>
      {/* byline: who filed the copy */}
      <Show when={model()}>
        <div class="mt-3 flex items-center gap-2 min-w-0 border-t border-border-weaker-base pt-2 text-12-mono text-text-weaker">
          <Show when={props.section.model?.providerID}>
            {(id) => <ProviderIcon id={id()} class="size-3.5 shrink-0 text-icon-strong-base" />}
          </Show>
          <span class="uppercase">correspondent</span>
          <span class="text-text-base truncate">{model()}</span>
        </div>
      </Show>
    </div>
  )
}

function WireUpdate(props: { entry: ToolEntry; children: JSX.Element }) {
  const kicker = () => wireKicker(props.entry)
  return (
    <div class="flex items-start gap-2.5">
      <span
        class={"shrink-0 mt-1 rounded-xs border px-1.5 text-12-mono uppercase " + KICKER_TONE[kicker().tone]}
      >
        {kicker().label}
      </span>
      <div class="flex-1 min-w-0">{props.children}</div>
    </div>
  )
}

function EditorNote(props: { children: JSX.Element }) {
  return (
    <aside class="mt-1 rounded-md border border-dashed border-border-weak-base px-3 py-2">
      <div class="mb-1 text-12-mono uppercase text-text-weaker">editor's note</div>
      <div class="text-14-regular italic text-text-weaker [&_p]:my-1">{props.children}</div>
    </aside>
  )
}

function Copy(props: { children: JSX.Element }) {
  return <div class="mt-2 max-w-[44rem] [&_p]:my-2 [&_ul]:pl-5">{props.children}</div>
}

// ----------------------------------------------------------------- skin ----
export const teletypeSkin: Skin = {
  id: "teletype",
  mode: "composed",
  columnClass: "max-w-[54rem] mx-auto px-4 sm:px-6 py-6 osh-content flex flex-col gap-3",
  wrappers: {
    Header: Masthead,
    Footer: Ticker,
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