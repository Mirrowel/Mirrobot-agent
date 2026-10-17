// ATLAS VIEW: the session charted as an expedition log, now a skin over
// the shared base. Each prompt is a STATION on a chain line (numbered
// W-01), tool calls are R-numbered INSTRUMENT READINGS in a framed
// housing, reasoning is an INFERENCE trace, and the assistant prose is a
// FIELD NOTE held to a reading measure. Chrome: a two row masthead with
// the brand chip, sheet coordinates and a settings dropdown, a margin
// rail with the legend and the sheet coordinates, a faint graticule behind
// the sheet, and an end-of-log sheet footer that carries the token
// profile. The base owns scroll, search, follow-live, navigation and the
// vendored tool pipeline; this file only arranges and decorates.
import { For, Show, createSignal } from "solid-js"
import { Title } from "@solidjs/meta"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { DateTime } from "luxon"
import { BaseSessionView, type Skin, type SkinWrappers } from "./base-view"
import type { ViewEntry } from "./registry"
import { sessionUsage, useSessionSections } from "./session-data"
import { SettingsBody, saveSettingsScroll, restoreSettingsScroll } from "../settings-panel"

type HeaderProps = Parameters<NonNullable<SkinWrappers["Header"]>>[0]
type FooterProps = Parameters<NonNullable<SkinWrappers["Footer"]>>[0]
type NavProps = Parameters<NonNullable<SkinWrappers["Nav"]>>[0]
type TurnProps = Parameters<NonNullable<SkinWrappers["TurnWrap"]>>[0]
type PromptProps = Parameters<NonNullable<SkinWrappers["PromptWrap"]>>[0]
type ToolProps = Parameters<NonNullable<SkinWrappers["ToolWrap"]>>[0]
type ReasoningProps = Parameters<NonNullable<SkinWrappers["ReasoningWrap"]>>[0]
type ResponseProps = Parameters<NonNullable<SkinWrappers["ResponseWrap"]>>[0]

const pad2 = (n: number) => String(n).padStart(2, "0")

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

// the survey paper: a fine 32px graticule plus a dashed contour band,
// faded into the border color so it can sit behind the sheet itself
const graticule = `
  .atlas-graticule {
    background-image:
      linear-gradient(to right, color-mix(in oklab, var(--border-weak-base) 50%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in oklab, var(--border-weak-base) 50%, transparent) 1px, transparent 1px),
      repeating-linear-gradient(to bottom, color-mix(in oklab, var(--border-weak-base) 50%, transparent) 0 7px, transparent 7px 192px);
    background-size: 32px 32px, 32px 32px, 100% 192px;
  }
`

// two row masthead: brand chip, atlas marks, back-to-main, version +
// model + status from the base props, sheet coordinates along the second
// row, and the settings dropdown kept at z-[70] inside a relative
// container so it never falls under the rail
function Masthead(props: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const b = () => props.source.branding()
  const sections = useSessionSections(props.data, props.sessionID)
  const counts = () => countsOf(sections())
  const worktree = () => {
    const dir = info()?.directory
    if (!dir) return undefined
    const parts = String(dir).split(/[\\/]/).filter(Boolean)
    return parts.slice(-2).join("/") || undefined
  }
  const sessionCode = () => (props.sessionID.replace(/^ses_/, "").slice(-8) || "00000000").toUpperCase()
  const tokens = () => info()?.tokens
  return (
    <>
      <style>{graticule}</style>
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
              <div class="relative flex items-center rounded-md border border-border-weak-base bg-background-base p-0.5">
                <button
                  class="flex items-center gap-1 h-6 px-1.5 text-12-mono text-text-weaker hover:text-text-base cursor-pointer bg-transparent border-none"
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
            <span>
              sheet 01 · {counts().stations} stations · {counts().readings} readings
            </span>
            <Show when={worktree()}>
              {(dir) => <span>worktree {dir()}</span>}
            </Show>
            <span>
              charted {DateTime.fromMillis(info()?.time?.created ?? Date.now()).toFormat("dd LLL, HH:mm")}
            </span>
            <Show when={tokens()?.input != null || tokens()?.output != null}>
              <span>
                scale {countTokens(tokens()?.input) ?? 0} in · {countTokens(tokens()?.output) ?? 0} out
              </span>
            </Show>
            <span class="ml-auto">field {sessionCode()}</span>
          </div>
        </div>
      </header>
    </>
  )
}

// end-of-log sheet footer: the token profile strip above the sheet line
function SheetFooter(props: FooterProps) {
  const b = () => props.source.branding()
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const sections = useSessionSections(props.data, props.sessionID)
  return (
    <footer class="relative z-10 shrink-0 border-t border-border-weak-base bg-background-base">
      <div class="mx-auto w-full max-w-[76rem] px-5">
        <div class="w-64 border-b border-border-weak-base py-2.5">
          <TokenProfile data={props.data} sessionID={props.sessionID} compact />
        </div>
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

// the readings profile: a bar per token component, pure decoration
function TokenProfile(props: { data: FooterProps["data"]; sessionID: string; compact?: boolean }) {
  const u = () => sessionUsage(props.data, props.sessionID)
  const parts = () => [
    { label: "in", name: "input tokens", value: u().tokensIn },
    { label: "out", name: "output tokens", value: u().tokensOut },
    { label: "inf", name: "reasoning tokens", value: u().tokensReasoning },
    { label: "crd", name: "cache read", value: u().cacheRead },
    { label: "cwr", name: "cache write", value: u().cacheWrite },
  ]
  const max = () => Math.max(1, ...parts().map((p) => p.value))
  const height = (n: number) => (n <= 0 ? 3 : 6 + Math.round((props.compact ? 28 : 44) * n / max()))
  return (
    <div>
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-12-mono uppercase tracking-[0.14em] text-text-weaker">profile</span>
        <span class="text-12-mono text-text-weaker whitespace-nowrap">tokens</span>
      </div>
      <div class="mt-2 flex h-12 items-end gap-1.5">
        <For each={parts()}>
          {(p) => (
            <div
              class="flex min-w-0 flex-1 flex-col items-center gap-1"
              title={`${p.name}: ${countTokens(p.value) ?? 0}`}
            >
              <span class="w-full max-w-6 bg-border-strong-base" style={{ height: `${height(p.value)}px` }} />
              <span class="text-12-mono text-text-weaker">{p.label}</span>
            </div>
          )}
        </For>
      </div>
      <div class="mt-px h-px w-full bg-border-weak-base" />
    </div>
  )
}

function Legend(props: { counts: Counts }) {
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
  )
}

// the margin rail: the entry-kind legend above the sheet coordinates.
// The nav slot only carries the sections, so the coordinates here are the
// ones the sections know (extent and charting); the masthead carries the
// rest (worktree, token scale, field code)
function MarginRail(props: NavProps) {
  const counts = () => countsOf(props.sections)
  const charted = () => {
    const at = props.sections.find((s) => s.at)?.at
    return DateTime.fromMillis(at ?? Date.now()).toFormat("dd LLL yyyy, HH:mm")
  }
  const row = (label: string, value: string) => (
    <div class="flex items-baseline gap-2">
      <span class="w-17 shrink-0 text-12-mono text-text-weaker opacity-70">{label}</span>
      <span class="min-w-0 truncate text-12-mono text-text-base">{value}</span>
    </div>
  )
  return (
    <aside class="w-52 shrink-0">
      <div class="sticky top-4 flex flex-col gap-6 py-1">
        <Legend counts={counts()} />
        <div class="flex flex-col gap-1.5">
          <div class="text-12-mono uppercase tracking-[0.14em] text-text-weaker">coordinates</div>
          {row("extent", `${counts().stations} stations · ${counts().readings} readings`)}
          {row("charted", charted())}
        </div>
      </div>
    </aside>
  )
}

// station separator: the chain line with a datum diamond
function Station(props: TurnProps) {
  return (
    <article class="relative scroll-mt-4 pt-2">
      <span class="hidden sm:block absolute left-0 top-0 bottom-0 w-px bg-border-weak-base" aria-hidden="true" />
      <span
        class="hidden sm:block absolute -left-1 top-3 size-2 rotate-45 border border-border-strong-base bg-background-base"
        aria-hidden="true"
      />
      {props.children}
    </article>
  )
}

// station heading: the W-number tag against the prompt
function StationHeading(props: PromptProps) {
  return (
    <div class="flex items-start gap-3">
      <span class="shrink-0 mt-0.5 rounded border border-border-strong-base px-1.5 py-px text-12-mono text-text-base">
        W-{pad2(props.section.index + 1)}
      </span>
      <div class="min-w-0 flex-1">
        <Show when={!props.section.prompt.trim()}>
          <span class="text-12-regular italic text-text-weaker">station without a prompt</span>
        </Show>
        {props.children}
      </div>
    </div>
  )
}

// instrument reading: R-numbered housing around the vendored tool part
function Reading(props: ToolProps) {
  return (
    <div class="relative my-2.5 border border-border-weak-base">
      <div class="flex items-center gap-2 border-b border-border-weak-base bg-background-stronger px-2.5 py-1">
        <span class="shrink-0 text-12-mono text-text-weaker">R-{pad2(props.index + 1)}</span>
        <span class="min-w-0 truncate text-12-mono text-text-base">{props.entry.tool}</span>
        <span class="ml-auto shrink-0 text-12-mono uppercase tracking-[0.14em] text-text-weaker">reading</span>
      </div>
      <div class="min-w-0 px-2.5 py-1.5">{props.children}</div>
    </div>
  )
}

// inference trace label above the shared reasoning block
function Inference(props: ReasoningProps) {
  return (
    <div class="mt-2">
      <div class="flex items-center gap-2">
        <span class="text-12-mono uppercase tracking-[0.14em] text-text-weaker">inference</span>
        <span class="h-px flex-1 bg-border-weak-base" />
      </div>
      <div class="mt-0.5 border-l border-dashed border-border-weak-base pl-3">{props.children}</div>
    </div>
  )
}

// field note: the assistant prose held to a reading measure
function FieldNote(props: ResponseProps) {
  return (
    <Show
      when={props.text.trim()}
      fallback={<div class="mt-3 text-12-regular italic text-text-weaker">no field note was recorded at this station.</div>}
    >
      <div class="mt-4">
        <div class="mb-1 text-12-mono uppercase tracking-[0.14em] text-text-weaker">field note</div>
        <div class="max-w-[68ch]">{props.children}</div>
      </div>
    </Show>
  )
}

export const atlasSkin: Skin = {
  id: "atlas",
  mode: "composed",
  columnClass: "atlas-graticule w-full max-w-[76rem] mx-auto px-5 py-5 flex flex-col gap-6",
  wrappers: {
    Header: Masthead,
    Footer: SheetFooter,
    Nav: MarginRail,
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
