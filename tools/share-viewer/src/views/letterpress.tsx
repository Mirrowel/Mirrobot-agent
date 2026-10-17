// LETTERPRESS VIEW: the printed-volume skin over the shared base. The type
// IS the design: serif text face with drop-capped leaf openers, small-caps
// apparatus, hairline rules and one fleuron per boundary. The nav column is
// the book's front matter: a half-title above the Contents, whose entries
// carry real folios derived from each leaf's volume. Tool calls are
// numbered footnotes in occurrence order; reasoning is a marginal aside.
// Chrome: running head up top, colophon below.
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { BaseSessionView, type Skin, type SkinWrappers } from "./base-view"
import { SettingsBody, saveSettingsScroll, restoreSettingsScroll } from "../settings-panel"
import type { ViewEntry, ViewProps } from "./registry"
import { sessionModelLabel, type SessionSection } from "./session-data"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Title } from "@solidjs/meta"

const OPENSHARE_REPO = "https://github.com/Mirrowel/Mirrobot-agent"

// the text face and the display face: old-style serifs first, then broad
// platform coverage so a Linux viewer still gets a real book
const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,"Times New Roman",Times,serif'
const SERIF_DISPLAY = '"Hoefler Text",Baskerville,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif'

const FLEURON = "\u2766" // the printer's mark, used sparingly
const CONTENTS_LIMIT = 12
// folio arithmetic: a page of this volume carries roughly this many
// characters of text, so each leaf's opening folio follows from the
// measured volume of the leaves before it
const FOLIO_CHARS = 1800

const ROMAN: [number, string][] = [
  [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
  [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
]
function roman(n: number) {
  let out = ""
  let v = Math.max(1, n)
  for (const [value, glyph] of ROMAN) while (v >= value) {
    out += glyph
    v -= value
  }
  return out
}

const firstTextLine = (text: string, max = 72) =>
  (text.split("\n").find((l) => l.trim().length > 0) ?? "").trim().slice(0, max) || "untitled leaf"

// the three-line initial: the float box is sized to three leading steps so
// the first three lines wrap around it (CSS ::first-letter on the prompt)
const DROP_CAP =
  "[&_p:first-of-type]:first-letter:float-left [&_p:first-of-type]:first-letter:mr-2 " +
  "[&_p:first-of-type]:first-letter:mt-[0.06em] [&_p:first-of-type]:first-letter:text-[4.4em] " +
  "[&_p:first-of-type]:first-letter:leading-[0.84] [&_p:first-of-type]:first-letter:font-semibold"

// leaf-opener type vs running type (continuous mode): the base's prompt
// <p> sets its own size, so these ride on as important overrides
const PROMPT_LEAF =
  "[&_p:first-of-type]:[font-size:calc(var(--font-size-x-large)*1.06)]! [&_p:first-of-type]:[line-height:1.34]!"
const PROMPT_RUNNING =
  "[&_p:first-of-type]:[font-size:calc(var(--font-size-large)*1.05)]! [&_p:first-of-type]:[line-height:1.5]!"

// the reading sizes ride in skins.css ([data-view="letterpress"]); these
// wrappers carry only layout: the measure and the rhythm
const PROSE_WRAP = "my-1"
const MARGIN_WRAP = "my-1.5"

// small-caps label: the workhorse of a printed page
function Sc(props: { children?: JSX.Element; class?: string }) {
  return (
    <span class={props.class} style={{ "font-variant-caps": "small-caps", "letter-spacing": "0.09em" }}>
      {props.children}
    </span>
  )
}

const BRAND_BOX = "flex items-center border border-border-weak-base rounded-sm p-0.5 transition-colors duration-150"

// the deployment mark: the configured logo, else the deployment name in caps
function BrandMark(props: { branding: ReturnType<ViewProps["source"]["branding"]> }) {
  return (
    <Show
      when={props.branding.logoUrl}
      fallback={<Sc class="text-12-medium text-text-base px-1">{props.branding.name || "openshare"}</Sc>}
    >
      <img src={props.branding.logoUrl} alt="" class="h-5 rounded-xs" />
    </Show>
  )
}

// a rule, a fleuron, a rule
function Fleuron(props: { class?: string }) {
  return (
    <div class={`flex items-center justify-center gap-3 text-text-weaker ${props.class ?? ""}`} aria-hidden="true">
      <span class="w-14 border-t border-border-weaker-base" />
      <span style={{ "font-family": SERIF }}>{FLEURON}</span>
      <span class="w-14 border-t border-border-weaker-base" />
    </div>
  )
}

// ------------------------------------------------------- running head ----
function RunningHead(props: Parameters<NonNullable<SkinWrappers["Header"]>>[0]) {
  const [open, setOpen] = createSignal(false)
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const statusTone = () => {
    const s = props.status
    if (s === "live") return "bg-icon-success-base"
    if (s === "error") return "bg-icon-critical-base"
    if (s === "waiting" || s === "login required") return "bg-icon-warning-base"
    if (s === "gone") return "bg-border-strong-base"
    return "bg-icon-info-base"
  }
  return (
    <>
      <Title>{`${info()?.title ?? "session"} | ${props.source.branding().name || "openshare"}`}</Title>
      <header class="h-11 px-5 lg:px-10 flex items-center justify-between gap-4 self-stretch bg-background-base border-b border-border-weak-base relative z-30">
        <div class="flex items-center gap-3 min-w-0">
          <Show when={props.isSub && props.onBack}>
            <button
              class="flex items-center gap-1 text-12-regular text-text-weaker hover:text-text-base bg-transparent border-none cursor-pointer shrink-0 transition-colors duration-150"
              onClick={() => props.onBack?.()}
            >
              <Icon name="arrow-left" size="small" />
              main
            </button>
          </Show>
          <Show
            when={props.source.branding().linkUrl}
            fallback={<div class={`${BRAND_BOX} shrink-0`}><BrandMark branding={props.source.branding()} /></div>}
          >
            {(href) => (
              <a
                href={href()}
                target="_blank"
                rel="noreferrer"
                title={props.source.branding().name || ""}
                class={`${BRAND_BOX} shrink-0 hover:border-border-strong-base`}
              >
                <BrandMark branding={props.source.branding()} />
              </a>
            )}
          </Show>
          {/* the verso carries the book */}
          <span class="min-w-0 truncate text-12-regular text-text-weaker italic" style={{ "font-family": SERIF }}>
            {info()?.title ?? "session"}
          </span>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="hidden sm:flex items-center gap-1.5 text-12-mono text-text-weaker">
            <span class={`inline-block size-1.5 rounded-full shrink-0 ${statusTone()}`} />
            {props.status}
          </span>
          <span class="hidden sm:flex items-center gap-1.5 text-12-mono text-text-weaker">
            <Mark class="h-3 shrink-0" />
            <span>v{info()?.version ?? "?"}</span>
          </span>
          <Show when={props.model}>
            <span class="hidden sm:inline text-12-mono text-text-weaker truncate max-w-48">{props.model}</span>
          </Show>
          <a
            href={OPENSHARE_REPO}
            target="_blank"
            rel="noreferrer"
            title="Open(code)Share"
            class="text-icon-weaker-base transition-colors duration-150 hover:text-icon-strong-base"
          >
            <Icon name="github" size="small" />
          </a>
          <button
            class="flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-12-regular text-text-weaker hover:text-text-base transition-colors duration-150"
            onClick={() => setOpen(!open())}
          >
            <Sc class="hidden sm:inline">settings</Sc>
            <Icon name="settings-gear" size="small" />
          </button>
        </div>
      </header>
      <Show when={open()}>
        <div
          class="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-[8vh]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div class="w-[19rem] max-h-[75vh] overflow-y-auto rounded-lg border border-border-weak-base bg-background-base shadow-xl"
            onScroll={(e) => saveSettingsScroll(e.currentTarget)}
            ref={restoreSettingsScroll}
          >
            <div class="px-4 pt-3">
              <SettingsBody
                settings={props.settings}
                update={props.updateSettings}
                branding={props.source.branding()}
                search={props.search}
                onSearch={props.onSearch}
              />
            </div>
            <div class="px-4 pb-3 pt-1 border-t border-border-weak-base mt-2">
              <button
                class="w-full text-left bg-transparent border-none cursor-pointer text-12-regular text-text-weaker hover:text-text-base py-1 transition-colors duration-150"
                onClick={() => setOpen(false)}
              >
                <Sc>close the apparatus</Sc>
              </button>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}

// ------------------------------------------------------------ colophon ----
function Colophon(props: Parameters<NonNullable<SkinWrappers["Footer"]>>[0]) {
  const b = () => props.source.branding()
  return (
    <footer class="shrink-0 border-t border-border-weak-base bg-background-base">
      <div class="mx-auto w-full max-w-[64rem] px-5 py-4 lg:px-10">
        <div class="grid grid-cols-[1fr_auto_1fr] items-baseline gap-4">
          <div class="flex min-w-0 items-center gap-2">
            <Show when={b().logoUrl}>
              <img src={b().logoUrl} alt="" class="h-4 shrink-0 rounded-xs" />
            </Show>
            <Show
              when={b().wordmarkUrl}
              fallback={<span class="truncate text-12-mono text-text-base">{b().name ? b().name + " \u00b7 " : ""}Open(code)Share</span>}
            >
              <img src={b().wordmarkUrl} alt="" class="h-3.5 shrink-0 opacity-70" />
            </Show>
          </div>
          <div class="flex items-baseline gap-1.5 text-text-base" style={{ "font-family": SERIF }}>
            <span class="opacity-40" aria-hidden="true">{FLEURON}</span>
            <Sc class="text-12-regular text-text-weaker">finis</Sc>
            <span class="opacity-40" aria-hidden="true">{FLEURON}</span>
          </div>
          <div class="flex min-w-0 items-center justify-end text-12-mono text-text-weaker">
            <span class="truncate">{`${props.source.status()} \u00b7 ${props.source.shareID}`}</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ------------------------------------------------------ front matter ----
// the nav column: a half-title above the Contents. The folios are real in
// the bookish sense: each leaf's opening page follows from the measured
// volume of the leaves before it, not from the leaf's order alone.
const leafVolume = (s: SessionSection) =>
  s.prompt.length +
  s.response.length +
  s.tools.reduce((n, t) => n + (t.title?.length ?? 0) + (t.output?.length ?? 0), 0)

function FrontMatter(props: Parameters<NonNullable<SkinWrappers["Nav"]>>[0] & { ctx: ViewProps }) {
  const ctx = props.ctx
  const info = () => (ctx.data.session as any[]).find((s) => s.id === ctx.sessionID)
  const providerID = () => (info()?.model as any)?.providerID
  const model = () => sessionModelLabel(ctx.data, ctx.sessionID)
  const dateLine = () => {
    const created = info()?.time?.created
    return typeof created === "number"
      ? new Date(created).toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" })
      : undefined
  }
  const folios = createMemo(() => {
    const out: Record<string, number> = {}
    let page = 1
    for (const s of props.sections) {
      out[s.id] = page
      page += Math.max(1, Math.ceil(leafVolume(s) / FOLIO_CHARS))
    }
    return out
  })

  return (
    <div class="w-56 flex flex-col">
      {/* half title */}
      <div class="flex flex-col items-center gap-2 px-2 pb-5 mb-4 border-b border-border-weaker-base text-center">
        <Sc class="text-12-medium text-text-weaker">session transcript</Sc>
        <div
          class="max-w-[24ch] font-medium text-text-strong"
          style={{ "font-family": SERIF_DISPLAY, "font-size": "calc(var(--font-size-large) * 1.15)", "line-height": "1.25", "letter-spacing": "-0.01em" }}
        >
          {info()?.title ?? "session"}
        </div>
        <Fleuron class="w-full max-w-[10rem] mt-1" />
        <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-12-mono text-text-weaker">
          <Show when={dateLine()}>
            <span>{dateLine()}</span>
          </Show>
          <Show when={model()}>
            <span class="flex items-center gap-1.5 min-w-0">
              <Show when={providerID()}>
                <ProviderIcon id={providerID()!} class="size-3.5 shrink-0 text-icon-strong-base" />
              </Show>
              <span class="truncate">{model()}</span>
            </span>
          </Show>
          <span>
            {props.sections.length} {props.sections.length === 1 ? "leaf" : "leaves"}
          </span>
        </div>
      </div>

      {/* contents */}
      <Show when={props.sections.length > 1}>
        <div class="flex items-baseline gap-3 px-2">
          <Sc class="text-12-medium text-text-base">Contents</Sc>
          <span class="flex-1 border-b border-border-weaker-base" />
          <span class="text-12-mono text-text-weaker">folio</span>
        </div>
        <div class="mt-1.5 flex flex-col">
          <For each={props.sections.slice(0, CONTENTS_LIMIT)}>
            {(s, i) => (
              <button
                class="group flex w-full items-baseline gap-2 py-1 px-2 rounded-sm bg-transparent border-none cursor-pointer text-left transition-colors duration-150"
                classList={{ "bg-surface-base": props.active === i() }}
                onClick={() => props.onSelect(i())}
              >
                <span class="w-7 shrink-0 text-right text-12-mono text-text-weaker">{roman(s.index + 1)}</span>
                <span
                  class="min-w-0 flex-1 truncate text-14-regular text-text-base transition-colors duration-150 group-hover:text-text-strong"
                  style={{ "font-family": SERIF }}
                >
                  {firstTextLine(s.prompt)}
                </span>
                <span class="mx-1.5 shrink-0 w-6 translate-y-[-0.3em] border-b border-dotted border-border-weaker-base" />
                <span class="shrink-0 text-right text-12-mono text-text-weaker tabular-nums">{folios()[s.id]}</span>
              </button>
            )}
          </For>
        </div>
        <Show when={props.sections.length > CONTENTS_LIMIT}>
          <p class="px-2 pt-1.5 text-12-regular text-text-weaker">
            <Sc>{`and ${props.sections.length - CONTENTS_LIMIT} further leaves`}</Sc>
          </p>
        </Show>
      </Show>
    </div>
  )
}

// ---------------------------------------------------------------- skin ----
export function letterpressSkin(props: ViewProps): Skin {
  const continuous = () => props.settings.continuous
  return {
    id: "letterpress",
    mode: "composed",
    // one measure for the whole volume: prompt, notes and prose share the
    // text column, so the leaf reads like a page, not a dashboard
    columnClass: "mx-auto w-full max-w-[40rem] px-6 lg:px-8 py-10 flex flex-col gap-12",
    wrappers: {
      Header: RunningHead,
      Footer: Colophon,
      Nav: (nav) => <FrontMatter {...nav} ctx={props} />,
      TurnWrap: (p) => (
        <article data-leaf={p.section.id} class="scroll-mt-24">
          <Show when={p.index > 0 && !continuous()}>
            <div
              class="flex items-center justify-center py-9 text-text-weaker opacity-45"
              style={{ "font-family": SERIF }}
              aria-hidden="true"
            >
              {FLEURON}
            </div>
          </Show>
          {p.children}
        </article>
      ),
      PromptWrap: (p) => {
        const drop = () => {
          const ch = p.section.prompt.trim().slice(0, 1)
          return !continuous() && /[\p{L}]/u.test(ch)
        }
        return (
          <div style={{ "font-family": SERIF_DISPLAY }}>
            <Show when={!continuous()}>
              <div class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <Sc class="text-12-medium text-text-strong">{`leaf ${roman(p.section.index + 1)}`}</Sc>
              </div>
            </Show>
            <div
              class={`text-text-strong ${drop() ? DROP_CAP : ""} ${
                continuous() ? PROMPT_RUNNING : PROMPT_LEAF
              }`}
            >
              {p.children}
            </div>
          </div>
        )
      },
      ToolWrap: (p) => (
        <div class={p.index === 0 ? "mt-4" : "mt-1.5"}>
          <Show when={p.index === 0}>
            <div class="mb-1.5 flex items-baseline gap-2 border-b border-border-weaker-base pb-1">
              <Sc class="text-12-medium text-text-base">notes</Sc>
            </div>
          </Show>
          <div class="flex items-start gap-2">
            <span
              class="w-3 shrink-0 select-none pt-1 text-left text-[0.72em] leading-none font-medium text-text-weaker"
              style={{ "font-family": SERIF }}
            >
              {p.index + 1}
            </span>
            <div class="min-w-0 flex-1">{p.children}</div>
          </div>
        </div>
      ),
      ReasoningWrap: (p) => <div class={MARGIN_WRAP}>{p.children}</div>,
      ResponseWrap: (p) => <div class={PROSE_WRAP}>{p.children}</div>,
    },
  }
}

export function LetterpressView(props: Parameters<ViewEntry["component"]>[0]) {
  return <BaseSessionView {...props} skin={letterpressSkin(props)} />
}

export const letterpress: ViewEntry = {
  id: "letterpress",
  label: "letterpress",
  component: LetterpressView,
}
