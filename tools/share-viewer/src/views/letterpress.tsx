// LETTERPRESS VIEW: the session typeset as a printed volume. The type IS
// the design, so the reading surface is serif (text face) while the
// apparatus (contents, folios, note numbers, meta) stays sans and mono the
// way a book's marginal matter does. Structure: a half-title page, a
// contents page whose entries carry real folios, drop-capped leaf openers,
// small-caps labels, hairline rules and one fleuron per boundary. Tool calls
// are footnotes: superscript markers in the text, the notes themselves in
// the outer margin on wide screens and as a footnote block under the leaf
// on narrow ones. Reasoning is a marginal aside. The running head and the
// footer folio both track the true scroll position (measured, not faked).
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Markdown } from "../../vendor/session-ui/src/components/markdown"
import { Title } from "@solidjs/meta"
import type { ViewEntry } from "./registry"
import { useSessionSections, toolCallLabel, type SessionSection, type ToolEntry } from "./session-data"
import { SettingsPanel } from "../settings-panel"
import type { Branding } from "../data-source"
import type { OshSettings } from "../settings"

const OPENSHARE_REPO = "https://github.com/Mirrowel/Mirrobot-agent"

// the text face and the display face: old-style serifs first, then broad
// platform coverage so a Linux viewer still gets a real book
const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,"Times New Roman",Times,serif'
const SERIF_DISPLAY = '"Hoefler Text",Baskerville,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif'

const SMALL_CAPS: JSX.CSSProperties = { "font-variant-caps": "small-caps", "letter-spacing": "0.09em" }

// sizes stay in font-size tokens so settings.readText still drives them
const PROMPT_TYPE: JSX.CSSProperties = {
  "font-family": SERIF_DISPLAY,
  "font-size": "calc(var(--font-size-x-large) * 1.06)",
  "line-height": "1.34",
}
const PROMPT_TYPE_RUNNING: JSX.CSSProperties = {
  "font-family": SERIF_DISPLAY,
  "font-size": "calc(var(--font-size-large) * 1.05)",
  "line-height": "1.5",
}
const PROSE_TYPE: JSX.CSSProperties = {
  "font-family": SERIF,
  "font-size": "calc(var(--font-size-base) * 1.14)",
  "line-height": "1.72",
}
const MARGIN_TYPE: JSX.CSSProperties = {
  "font-family": SERIF,
  "font-size": "calc(var(--font-size-small) * 1.02)",
  "line-height": "1.62",
}

const FLEURON = "\u2766" // the printer's mark, used sparingly
const CONTENTS_LIMIT = 12
const PROSE_CLASSES =
  "[&_p]:mb-[0.95em] [&_h1]:text-[1.42em] [&_h1]:my-[1.4em] [&_h2]:text-[1.2em] [&_h2]:my-[1.2em] [&_h3]:text-[1.04em] " +
  "[&_ul]:pl-[1.5em] [&_ol]:pl-[1.5em] [&_li]:mb-[0.35em] [&_blockquote]:italic [&_hr]:my-[1.6em] " +
  "lg:[&_p]:text-justify lg:[&_p]:hyphens-auto"
// narrow measure in the margin: never justified, it opens rivers
const MARGIN_CLASSES = "[&_p]:mb-[0.8em] [&_ul]:pl-[1.4em] [&_ol]:pl-[1.4em]"

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

// small-caps label: the workhorse of a printed page
function Sc(props: { children?: JSX.Element; class?: string; style?: JSX.CSSProperties }) {
  return (
    <span class={props.class} style={{ ...SMALL_CAPS, ...props.style }}>
      {props.children}
    </span>
  )
}

const BRAND_BOX = "flex items-center border border-border-weak-base rounded-sm p-0.5 transition-colors duration-150"

// the deployment mark: the configured logo, else the deployment name in caps
function BrandMark(props: { branding: Branding }) {
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

function SupNum(props: { n: number }) {
  return (
    <span class="align-super text-[0.62em] leading-none pt-1.5 font-medium" style={{ "font-family": SERIF }}>
      {props.n}
    </span>
  )
}

// the shared note state: a superscript marker and the margin note it points
// at are the same footnote, so hover state is shared through here
type NotesBus = {
  isOpen: (key: string) => boolean
  toggle: (key: string) => void
  isHot: (key: string) => boolean
  setHot: (key: string | undefined) => void
}

function Note(props: { n: number; tool: ToolEntry; key: string; bus: NotesBus; settings: OshSettings }) {
  return (
    <div
      class="mt-1.5 rounded-sm px-1 -mx-1 transition-colors duration-150"
      classList={{ "bg-surface-base": props.bus.isHot(props.key) }}
      onMouseEnter={() => props.bus.setHot(props.key)}
      onMouseLeave={() => props.bus.setHot(undefined)}
    >
      <button
        class="flex w-full items-baseline gap-1.5 py-0.5 bg-transparent border-none cursor-pointer text-left"
        aria-expanded={props.bus.isOpen(props.key)}
        onClick={() => props.bus.toggle(props.key)}
      >
        <span class="shrink-0 text-text-weaker">
          <SupNum n={props.n} />
        </span>
        <Sc class="text-12-medium text-text-base shrink-0">{props.tool.tool}</Sc>
        <Show when={props.settings.toolInfo}>
          <span class="text-12-regular text-text-weaker truncate min-w-0" style={{ "font-family": SERIF }}>
            {toolCallLabel(props.tool)}
          </span>
        </Show>
        <Show when={props.tool.output}>
          <span class="ml-auto shrink-0 text-icon-weaker-base">
            <Icon name={props.bus.isOpen(props.key) ? "chevron-down" : "chevron-right"} size="small" />
          </span>
        </Show>
      </button>
      <Show when={props.bus.isOpen(props.key) && props.tool.output}>
        <pre class="mt-1 mb-1.5 pl-2.5 border-l border-border-weak-base text-12-mono text-text-weaker whitespace-pre-wrap break-words max-h-72 overflow-auto">{props.tool.output}</pre>
      </Show>
    </div>
  )
}

function Markers(props: { section: SessionSection; bus: NotesBus }) {
  return (
    <div class="flex items-baseline gap-1.5">
      <Sc class="text-12-regular text-text-weaker shrink-0">notes</Sc>
      <For each={props.section.tools}>
        {(tool, i) => {
          const key = () => `${props.section.id}:${i()}`
          return (
            <button
              class="py-0 px-0.5 bg-transparent border-none cursor-pointer transition-colors duration-150"
              classList={{
                "text-text-strong": props.bus.isHot(key()),
                "text-text-weaker hover:text-text-base": !props.bus.isHot(key()),
              }}
              title={`note ${i() + 1}`}
              onMouseEnter={() => props.bus.setHot(key())}
              onMouseLeave={() => props.bus.setHot(undefined)}
              onClick={() => props.bus.toggle(key())}
            >
              <SupNum n={i() + 1} />
            </button>
          )
        }}
      </For>
    </div>
  )
}

function Aside(props: { text: string; settings: OshSettings }) {
  const [open, setOpen] = createSignal(props.settings.reasoningOpen)
  return (
    <div class="mt-2">
      <button
        class="flex items-center gap-1.5 py-0.5 bg-transparent border-none cursor-pointer"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        <span class="text-icon-weaker-base">
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        </span>
        <Sc class="text-12-medium text-text-weaker transition-colors duration-150 hover:text-text-base">thinking</Sc>
      </button>
      <Show when={open()}>
        <div class={`mt-1 pl-1 ${MARGIN_CLASSES}`}>
          <Markdown text={props.text} class={`italic ${MARGIN_CLASSES}`} style={MARGIN_TYPE} />
        </div>
      </Show>
    </div>
  )
}

function Leaf(props: {
  section: SessionSection
  settings: OshSettings
  continuous: boolean
  modelNote: string | undefined
  providerID: string | undefined
  bus: NotesBus
}) {
  const section = props.section
  const body = () => section.prompt.trim().replace(/^(#{1,6}\s+)+/, "")
  const dropCap = () => {
    const ch = body().slice(0, 1)
    return /[\p{L}]/u.test(ch) ? ch : undefined
  }

  return (
    <article data-leaf={section.id} class="grid scroll-mt-24 lg:grid-cols-[12.5rem_minmax(0,1fr)] gap-x-10">
      {/* the outer margin: notes and asides, below the text when narrow */}
      <div class="order-2 lg:order-none min-w-0">
        <Show when={section.reasoning.length > 0 || section.tools.length > 0}>
          <div class="pt-7 lg:pt-1">
            <For each={section.reasoning}>{(r) => <Aside text={r.text} settings={props.settings} />}</For>
            <Show when={section.tools.length > 0}>
              <div class="mt-2">
                <div class="flex items-baseline gap-2 border-b border-border-weaker-base pb-1">
                  <Sc class="text-12-medium text-text-base">Notes</Sc>
                  <span class="text-12-mono text-text-weaker">{section.tools.length}</span>
                </div>
                <For each={section.tools}>
                  {(tool, i) => (
                    <Note
                      n={i() + 1}
                      tool={tool}
                      key={`${section.id}:${i()}`}
                      bus={props.bus}
                      settings={props.settings}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* the text block */}
      <div class="order-1 lg:order-none min-w-0 pt-9 lg:pt-1">
        <Show when={!props.continuous}>
          <div class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Sc class="text-12-medium text-text-strong">{`leaf ${roman(section.index + 1)}`}</Sc>
            <Show when={props.modelNote}>
              <span class="flex items-center gap-1.5 text-12-mono text-text-weaker min-w-0">
                <Show when={props.providerID}>
                  <ProviderIcon id={props.providerID!} class="size-3.5 shrink-0 text-icon-strong-base" />
                </Show>
                <span class="truncate">{props.modelNote}</span>
              </span>
            </Show>
          </div>
        </Show>

        <Show when={body()}>
          <p
            class={`font-medium text-text-strong whitespace-pre-wrap ${props.continuous ? "" : "mb-4"}`}
            style={props.continuous ? PROMPT_TYPE_RUNNING : PROMPT_TYPE}
          >
<Show when={!props.continuous && dropCap()}>
              {(ch) => (
                <span
                  class="float-left select-none"
                  style={{
                    // a three-line initial: the float box is sized to three
                    // leading steps so the first three lines wrap around it
                    "font-size": "4.6em",
                    "line-height": "0.84",
                    "font-weight": "600",
                    "padding-right": "0.05em",
                  }}
                >
                  {ch()}
                </span>
              )}
            </Show>
            {body()}
          </p>
        </Show>

        <Show when={section.tools.length > 0}>
          <div class="mb-3.5">
            <Markers section={section} bus={props.bus} />
          </div>
        </Show>

        <Show when={section.response}>
          <div class={PROSE_CLASSES} style={PROSE_TYPE}>
            <Markdown text={section.response} class={PROSE_CLASSES} style={PROSE_TYPE} />
          </div>
        </Show>
      </div>
    </article>
  )
}

function EmptyPage(props: { query: string; hasAny: boolean; onClear: () => void }) {
  return (
    <div class="py-28 flex flex-col items-center gap-3 text-center">
      <span class="text-text-weaker opacity-45" style={{ "font-family": SERIF, "font-size": "1.1rem" }} aria-hidden="true">
        {FLEURON}
      </span>
      <Show
        when={props.hasAny}
        fallback={
          <>
            <p class="text-14-medium text-text-strong">This volume has no leaves yet.</p>
            <p class="max-w-[38ch] text-12-regular text-text-weaker">
              The share is still settling. This page fills itself as the deployment syncs.
            </p>
          </>
        }
      >
        <p class="text-14-medium text-text-strong">{`No leaf matches \u201c${props.query}\u201d.`}</p>
        <button
          class="py-0 bg-transparent border-none cursor-pointer text-12-regular text-text-base underline underline-offset-4 transition-colors duration-150 hover:text-text-strong"
          onClick={props.onClear}
        >
          clear the filter
        </button>
      </Show>
    </div>
  )
}

function LetterpressView(props: Parameters<ViewEntry["component"]>[0]) {
  const info = createMemo(() => props.data.session.find((s: any) => s.id === props.sessionID) as any)
  const sections = useSessionSections(props.data, props.sessionID)
  const branding = () => props.source.branding()
  const status = () => props.source.status()
  const continuous = () => props.settings.continuous

  const modelLabel = createMemo(() => {
    const m = info()?.model as any
    if (m?.providerID || m?.modelID) return `${m.providerID ?? ""}/${m.modelID ?? ""}`
    const entry = (props.data.model[props.sessionID] ?? []).find((x: any) => x.id === m?.modelID) as any
    return entry?.name ?? entry?.id
  })
  const providerID = () => (info()?.model as any)?.providerID

  const filtered = createMemo(() => {
    const q = props.search.trim().toLowerCase()
    if (!q) return sections()
    return sections().filter(
      (s) =>
        s.prompt.toLowerCase().includes(q) ||
        s.response.toLowerCase().includes(q) ||
        s.tools.some((t) => `${t.title} ${t.output ?? ""}`.toLowerCase().includes(q)),
    )
  })
  const searching = () => props.search.trim().length > 0

  // footnote state, per leaf
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})
  const [hot, setHot] = createSignal<string | undefined>(undefined)
  const bus: NotesBus = {
    isOpen: (key) => expanded()[key] ?? props.settings.toolOutput,
    toggle: (key) => setExpanded((prev) => ({ ...prev, [key]: !(prev[key] ?? props.settings.toolOutput) })),
    isHot: (key) => hot() === key,
    setHot,
  }

  // folios: measured from the real scroll position, never faked
  const [folio, setFolio] = createSignal(1)
  const [pageCount, setPageCount] = createSignal(1)
  const [leafFolios, setLeafFolios] = createSignal<Record<string, number>>({})
  const [activeLeaf, setActiveLeaf] = createSignal<string | undefined>(undefined)
  let bodyEl: HTMLDivElement | undefined
  let frame = 0

  const pageSize = () => Math.max(520, window.innerHeight - 84)
  let lastHeight = 0
  let lastWidth = 0
  const measure = () => {
    frame = 0
    const el = bodyEl
    if (!el) return
    const ps = pageSize()
    const top = el.getBoundingClientRect().top + window.scrollY
    const height = el.offsetHeight
    const width = el.clientWidth
    const count = Math.max(1, Math.round(height / ps))
    setPageCount(count)
    // leaf folios only move when the volume itself reflows
    if (height !== lastHeight || width !== lastWidth) {
      lastHeight = height
      lastWidth = width
      const map: Record<string, number> = {}
      for (const node of el.querySelectorAll<HTMLElement>("[data-leaf]")) {
        const id = node.dataset.leaf
        if (!id) continue
        const y = node.getBoundingClientRect().top + window.scrollY - top
        map[id] = Math.min(count, Math.max(1, Math.floor(y / ps) + 1))
      }
      setLeafFolios(map)
    }
    setFolio(Math.min(Math.max(1, Math.floor((window.scrollY - top) / ps) + 1), count))
  }
  const queueMeasure = () => {
    if (frame) return
    frame = requestAnimationFrame(measure)
  }

  onMount(() => {
    queueMeasure()
    window.addEventListener("scroll", queueMeasure, { passive: true })
    window.addEventListener("resize", queueMeasure)
    let observer: ResizeObserver | undefined
    if (bodyEl && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(queueMeasure)
      observer.observe(bodyEl)
    }
    onCleanup(() => {
      window.removeEventListener("scroll", queueMeasure)
      window.removeEventListener("resize", queueMeasure)
      observer?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    })
  })

  // re-measure when the volume grows (live frames, filtering, view changes)
  createEffect(() => {
    filtered()
    props.source.rev()
    queueMeasure()
  })

  // the leaf under the reading line drives the running head
  createEffect(() => {
    const list = filtered()
    const el = bodyEl
    if (!el || list.length === 0 || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveLeaf((entry.target as HTMLElement).dataset.leaf)
        }
      },
      { rootMargin: "-10% 0px -75% 0px" },
    )
    for (const node of el.querySelectorAll<HTMLElement>("[data-leaf]")) observer.observe(node)
    onCleanup(() => observer.disconnect())
  })

  const volumeTitle = () => info()?.title ?? "session"
  const runningTitle = () => {
    const leaf = filtered().find((s) => s.id === activeLeaf())
    return leaf ? firstTextLine(leaf.prompt, 64) : volumeTitle()
  }
  const modelNote = (index: number) => {
    const current = sections()[index]?.model
    if (!current) return undefined
    const previous = sections()[index - 1]?.model
    if (index > 0 && previous?.providerID === current.providerID && previous?.modelID === current.modelID) return undefined
    return `${current.providerID ?? ""}/${current.modelID ?? ""}`
  }
  const jumpTo = (id: string) => {
    bodyEl?.querySelector(`[data-leaf="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const statusTone = () => {
    const s = status()
    if (s === "live") return "bg-icon-success-base"
    if (s === "error") return "bg-icon-critical-base"
    if (s === "waiting" || s === "login required") return "bg-icon-warning-base"
    if (s === "gone") return "bg-border-strong-base"
    return "bg-icon-info-base"
  }
  const brandText = () => `${branding().name ? branding().name + " \u00b7 " : ""}Open(code)Share`
  const dateLine = () => {
    const created = info()?.time?.created
    return new Date(typeof created === "number" ? created : Date.now()).toLocaleString(undefined, {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div class="relative z-10 flex min-h-screen w-full flex-col bg-background-base text-text-base">
      <Title>{`${info()?.title ?? "session"} | ${branding().name || "openshare"}`}</Title>

      {/* running head */}
      <header class="sticky top-0 z-30 shrink-0 border-b border-border-weak-base bg-background-base">
        <div class="mx-auto flex h-11 w-full max-w-[64rem] items-center gap-4 px-5 lg:px-10">
          <Show
            when={branding().linkUrl}
            fallback={<div class={`${BRAND_BOX} shrink-0`}><BrandMark branding={branding()} /></div>}
          >
            {(href) => (
              <a
                href={href()}
                target="_blank"
                rel="noreferrer"
                title={branding().name || ""}
                class={`${BRAND_BOX} shrink-0 hover:border-border-strong-base`}
              >
                <BrandMark branding={branding()} />
              </a>
            )}
          </Show>

          {/* verso carries the book, recto carries the leaf */}
          <div class="min-w-0 flex-1 truncate text-center">
            <span class="text-12-regular text-text-weaker italic" style={{ "font-family": SERIF }}>
              {folio() % 2 === 0 ? volumeTitle() : runningTitle()}
            </span>
          </div>

          <div class="flex shrink-0 items-center gap-3">
            <div class="hidden sm:flex items-center gap-1.5 text-12-mono text-text-weak">
              <span classList={{ "inline-block size-1.5 rounded-full shrink-0": true, [statusTone()]: true }} />
              <span>{status()}</span>
            </div>
            <div class="hidden sm:flex items-center gap-1.5 text-12-mono text-text-weaker">
              <Mark class="h-3.5 shrink-0" />
              <span>v{info()?.version ?? "?"}</span>
            </div>
            <a
              href={OPENSHARE_REPO}
              target="_blank"
              rel="noreferrer"
              title="Open(code)Share"
              class="text-icon-weaker-base transition-colors duration-150 hover:text-icon-strong-base"
            >
              <Icon name="github" size="small" />
            </a>
            <div class="flex items-center gap-1.5">
              <Sc class="hidden sm:inline text-12-regular text-text-weaker">settings</Sc>
              <SettingsPanel
                settings={props.settings}
                update={props.updateSettings}
                // the panel offers its background toggle only when the
                // deployment sets one; Branding omits the field from its type
                branding={{ backgroundUrl: (branding() as any).backgroundUrl }}
                search={props.search}
                onSearch={props.onSearch}
              />
            </div>
          </div>
        </div>
      </header>

      {/* half title */}
      <div class="mx-auto flex w-full max-w-[64rem] flex-col items-center px-5 pt-14 pb-11 text-center lg:px-10">
        <Sc class="text-12-medium text-text-weaker">session transcript</Sc>
        <h1
          class="mt-3 max-w-[32ch] font-medium text-text-strong"
          style={{
            "font-family": SERIF_DISPLAY,
            "font-size": "calc(var(--font-size-x-large) * 1.5)",
            "line-height": "1.14",
            "letter-spacing": "-0.015em",
          }}
        >
          {volumeTitle()}
        </h1>
        <div class="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-12-mono text-text-weaker">
          <span>{dateLine()}</span>
          <Show when={modelLabel()}>
            <span class="flex items-center gap-1.5">
              <Show when={providerID()}>
                <ProviderIcon id={providerID()!} class="size-3.5 shrink-0 text-icon-strong-base" />
              </Show>
              {modelLabel()}
            </span>
          </Show>
          <span>
            {sections().length} {sections().length === 1 ? "leaf" : "leaves"}
          </span>
        </div>
        <Fleuron class="mt-9 w-full max-w-[22rem]" />
      </div>

      {/* contents: the page-jump instrument, dropped in continuous mode and
          while filtering (a contents page belongs to the whole volume) */}
      <Show when={!continuous() && !searching() && sections().length > 1}>
        <nav class="mx-auto mb-14 w-full max-w-[32rem] px-5 lg:px-10" aria-label="contents">
          <div class="flex items-baseline gap-3">
            <Sc class="text-12-medium text-text-base">Contents</Sc>
            <span class="flex-1 border-b border-border-weak-base" />
            <span class="text-12-mono text-text-weaker">folio</span>
          </div>
          <div class="mt-1.5 flex flex-col">
            <For each={sections().slice(0, CONTENTS_LIMIT)}>
              {(s) => (
                <button
                  class="group flex w-full items-baseline gap-2 py-1 bg-transparent border-none cursor-pointer text-left"
                  onClick={() => jumpTo(s.id)}
                >
                  <span class="w-8 shrink-0 text-right text-12-mono text-text-weaker">{roman(s.index + 1)}</span>
                  <span class="truncate text-14-regular text-text-base transition-colors duration-150 group-hover:text-text-strong" style={{ "font-family": SERIF }}>
                    {firstTextLine(s.prompt)}
                  </span>
                  <span class="mx-2 flex-1 translate-y-[-0.3em] border-b border-dotted border-border-weaker-base" />
                  <span class="w-6 shrink-0 text-right text-12-mono text-text-weaker tabular-nums">
                    {leafFolios()[s.id] ?? ""}
                  </span>
                </button>
              )}
            </For>
          </div>
          <Show when={sections().length > CONTENTS_LIMIT}>
            <p class="pt-1.5 text-12-regular text-text-weaker">
              <Sc>{`and ${sections().length - CONTENTS_LIMIT} further leaves`}</Sc>
            </p>
          </Show>
        </nav>
      </Show>

      <Show when={searching()}>
        <div class="mx-auto mb-9 flex w-full max-w-[64rem] items-center justify-center gap-3 px-5 lg:px-10">
          <Sc class="text-12-regular text-text-weaker">
            {`${filtered().length} of ${sections().length} leaves match`}
          </Sc>
          <button
            class="py-0 bg-transparent border-none cursor-pointer text-12-regular text-text-base underline underline-offset-4 transition-colors duration-150 hover:text-text-strong"
            onClick={() => props.onSearch("")}
          >
            clear
          </button>
        </div>
      </Show>

      {/* the text block */}
      <div ref={bodyEl} class="osh-content mx-auto w-full max-w-[56rem] px-5 pb-4 lg:px-10">
        <Show
          when={filtered().length > 0}
          fallback={
            <EmptyPage
              query={props.search.trim()}
              hasAny={sections().length > 0}
              onClear={() => props.onSearch("")}
            />
          }
        >
          <For each={filtered()}>
            {(s) => (
              <>
                <Show when={!continuous() && s.index > 0}>
                  <div class="flex items-center justify-center py-9 text-text-weaker opacity-45" style={{ "font-family": SERIF }} aria-hidden="true">
                    {FLEURON}
                  </div>
                </Show>
                <Leaf
                  section={s}
                  settings={props.settings}
                  continuous={continuous()}
                  modelNote={modelNote(s.index)}
                  providerID={providerID()}
                  bus={bus}
                />
              </>
            )}
          </For>
          <div class="flex flex-col items-center gap-1.5 pt-14 pb-2 text-text-weaker">
            <span style={{ "font-family": SERIF }} aria-hidden="true">
              {FLEURON}
            </span>
            <Sc class="text-12-regular">end of volume</Sc>
          </div>
        </Show>
      </div>

      {/* colophon: brand on the left, the folio in the middle, provenance right */}
      <footer class="mt-auto">
        <div class="mx-auto w-full max-w-[64rem] px-5 pt-12 pb-10 lg:px-10">
          <div class="grid grid-cols-[1fr_auto_1fr] items-baseline gap-4 border-t border-border-weak-base pt-4">
            <div class="flex min-w-0 items-center gap-2">
              <Show when={branding().logoUrl}>
                <img src={branding().logoUrl} alt="" class="h-4 shrink-0 rounded-xs" />
              </Show>
              <Show
                when={branding().wordmarkUrl}
                fallback={<span class="truncate text-12-mono text-text-base">{brandText()}</span>}
              >
                <img src={branding().wordmarkUrl} alt="" class="h-3.5 shrink-0 opacity-70" />
              </Show>
            </div>
            <div class="flex items-baseline gap-1.5 text-text-base" style={{ "font-family": SERIF }}>
              <span class="opacity-40" aria-hidden="true">
                {FLEURON}
              </span>
              <span class="tabular-nums">{folio()}</span>
              <Sc class="text-12-regular text-text-weaker">{`of ${pageCount()}`}</Sc>
              <span class="opacity-40" aria-hidden="true">
                {FLEURON}
              </span>
            </div>
            <div class="flex min-w-0 items-center justify-end text-12-mono text-text-weaker">
              <span class="truncate">{`${status()} \u00b7 ${props.source.shareID}`}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export const letterpress: ViewEntry = {
  id: "letterpress",
  label: "letterpress",
  component: LetterpressView,
}