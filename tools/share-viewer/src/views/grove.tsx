// GROVE: the session as an organic growth log. Prompts are growth rings
// threaded on the trunk, responses grow as the stem (a softly indented
// reading column), tool calls are roots hanging in the left margin that
// feed a section through curved connectors, and reasoning rests beneath
// as quiet, collapsible undergrowth. Typographic and restrained: design
// tokens only, soft curves, generous air.
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js"
import { Title } from "@solidjs/meta"
import { DateTime } from "luxon"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Markdown } from "../../vendor/session-ui/src/components/markdown"
import type { ViewEntry } from "./registry"
import { toolCallLabel, useSessionSections, type SessionSection, type ToolEntry } from "./session-data"
import { SettingsPanel } from "../settings-panel"
import type { OshSettings } from "../settings"

const pad = (n: number) => String(n).padStart(2, "0")

function RingGlyph(props: { class?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <circle cx="12" cy="12" r="11" stroke="currentColor" stroke-width="0.75" opacity="0.45" />
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" stroke-width="0.75" opacity="0.7" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" />
    </svg>
  )
}

function LeafGlyph(props: { class?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" class={props.class} aria-hidden="true">
      <path
        d="M8 1.5 C 12.2 4.2 12.6 9.4 8 14.5 C 3.4 9.4 3.8 4.2 8 1.5 Z"
        stroke="currentColor"
        stroke-width="1.1"
        stroke-linejoin="round"
      />
      <path d="M8 4.5 L 8 12.5" stroke="currentColor" stroke-width="0.9" opacity="0.6" />
    </svg>
  )
}

function GrassGlyph(props: { class?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" class={props.class} aria-hidden="true">
      <path d="M3 13 C 4.6 9.6 4.8 6.8 4 3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
      <path d="M8 13 C 8 9 8 6 8 2.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
      <path d="M13 13 C 11.4 9.6 11.2 6.8 12 3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
    </svg>
  )
}

// A root: a small tool entry that lives in the left margin on wide
// screens, connected to the stem by a soft arc; its output opens flush
// with the reading column.
function RootEntry(props: { tool: ToolEntry; settings: OshSettings }) {
  const [open, setOpen] = createSignal(props.settings.toolOutput)
  createEffect(
    on(
      () => props.settings.toolOutput,
      (v, prev) => {
        if (prev !== undefined && v !== prev) setOpen(v)
      },
    ),
  )
  const label = () => toolCallLabel(props.tool)
  return (
    <div class="group/root flex flex-col min-w-0 xl:flex-row xl:items-start xl:-ml-[13.5rem]">
      <button
        class="flex items-center gap-1.5 min-w-0 py-0.5 bg-transparent border-none cursor-pointer text-left xl:w-[10.5rem] xl:shrink-0 xl:justify-end"
        title={props.settings.toolInfo ? `${props.tool.tool}: ${label()}` : props.tool.tool}
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        <span class="xl:order-3 shrink-0 text-icon-weaker-base transition-colors duration-150 group-hover/root:text-icon-strong-base">
          <LeafGlyph class="w-3 h-3" />
        </span>
        <Show when={props.settings.toolInfo}>
          <span class="xl:order-2 min-w-0 truncate text-12-regular text-text-weaker transition-colors duration-150 group-hover/root:text-text-base">
            {label()}
          </span>
        </Show>
        <span class="xl:order-1 shrink-0 text-12-mono text-text-weaker opacity-60 transition-opacity duration-150 group-hover/root:opacity-100">
          {props.tool.tool}
        </span>
      </button>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        class="hidden xl:block w-6 h-6 shrink-0 text-border-strong-base opacity-70 transition-opacity duration-150 group-hover/root:opacity-100"
        aria-hidden="true"
      >
        <path d="M0 11 C 13 11 20 13 20 22" stroke="currentColor" stroke-width="1" />
      </svg>
      <Show when={open() && props.tool.output}>
        <pre class="min-w-0 mt-1.5 xl:mt-0 xl:ml-3 xl:flex-1 box-border max-h-72 overflow-auto rounded-lg border border-border-weaker-base bg-background-stronger p-3 text-12-mono text-text-weaker whitespace-pre-wrap break-words">
          {props.tool.output}
        </pre>
      </Show>
    </div>
  )
}

function Undergrowth(props: { text: string; settings: OshSettings }) {
  const [open, setOpen] = createSignal(props.settings.reasoningOpen)
  createEffect(
    on(
      () => props.settings.reasoningOpen,
      (v, prev) => {
        if (prev !== undefined && v !== prev) setOpen(v)
      },
    ),
  )
  return (
    <div>
      <button
        class="group/ug flex items-center gap-2 py-1.5 bg-transparent border-none cursor-pointer text-12-mono text-text-weaker hover:text-text-base transition-colors duration-150"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        <span class="text-icon-weaker-base transition-colors duration-150 group-hover/ug:text-icon-strong-base">
          <GrassGlyph class="w-3 h-3" />
        </span>
        <span>undergrowth</span>
        <span class="text-icon-weaker-base">
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        </span>
      </button>
      <Show when={open()}>
        <div class="mb-2 text-12-regular italic text-text-weaker [&_p]:my-1">
          <Markdown text={props.text} />
        </div>
      </Show>
    </div>
  )
}

function SectionView(props: {
  section: SessionSection
  settings: OshSettings
  continuous: boolean
  modelLabel?: string
}) {
  const reasoning = () => props.section.reasoning.filter((r) => r.text.trim())
  return (
    <section
      class="relative"
      classList={{
        "mt-14 first:mt-0 border-l border-border-weaker-base pl-7": !props.continuous,
        "mt-10 first:mt-0": props.continuous,
      }}
    >
      <Show
        when={!props.continuous}
        fallback={
          <div class="relative mb-3 flex items-baseline gap-2 min-w-0">
            <span class="absolute -left-2 top-1 text-icon-weaker-base" aria-hidden="true">
              <RingGlyph class="w-4 h-4" />
            </span>
            <p class="min-w-0 text-14-medium text-text-weaker whitespace-pre-wrap break-words">
              {props.section.prompt || "(empty prompt)"}
            </p>
            <Show when={props.modelLabel}>
              <span class="shrink-0 text-12-mono text-text-weaker opacity-80">{props.modelLabel}</span>
            </Show>
          </div>
        }
      >
        <div class="relative mb-5">
          <span class="absolute -left-3 -top-0.5 text-icon-weaker-base" aria-hidden="true">
            <RingGlyph class="w-6 h-6" />
          </span>
          <div class="text-12-mono uppercase tracking-widest text-text-weaker">
            ring {pad(props.section.index + 1)}
            <Show when={props.modelLabel}>
              <span class="normal-case tracking-normal"> · {props.modelLabel}</span>
            </Show>
          </div>
          <p class="mt-1.5 text-14-medium text-text-strong whitespace-pre-wrap break-words">
            {props.section.prompt || "(empty prompt)"}
          </p>
        </div>
      </Show>

      <Show when={props.section.tools.length > 0}>
        <div class="mb-5 flex flex-col gap-1.5">
          <For each={props.section.tools}>{(t) => <RootEntry tool={t} settings={props.settings} />}</For>
        </div>
      </Show>

      <Show when={props.section.response.trim()}>
        <div class="text-14-regular text-text-base">
          <Markdown text={props.section.response} />
        </div>
      </Show>

      <Show when={reasoning().length > 0}>
        <div class="mt-6 flex flex-col border-t border-dashed border-border-weaker-base pt-2">
          <For each={reasoning()}>{(r) => <Undergrowth text={r.text} settings={props.settings} />}</For>
        </div>
      </Show>
    </section>
  )
}

function GroveView(props: Parameters<ViewEntry["component"]>[0]) {
  const info = createMemo(() => props.data.session.find((s: any) => s.id === props.sessionID))
  const sections = useSessionSections(props.data, props.sessionID)
  const continuous = () => props.settings.continuous

  const query = createMemo(() => props.search.trim().toLowerCase())
  const searching = createMemo(() => query().length > 0)

  const filtered = createMemo(() => {
    const q = query()
    if (!q) return sections()
    return sections().filter(
      (s) =>
        s.prompt.toLowerCase().includes(q) ||
        s.response.toLowerCase().includes(q) ||
        s.reasoning.some((r) => r.text.toLowerCase().includes(q)) ||
        s.tools.some((t) => t.tool.toLowerCase().includes(q) || toolCallLabel(t).toLowerCase().includes(q)),
    )
  })

  const ringCount = () => sections().length
  const rootCount = () => sections().reduce((n, s) => n + s.tools.length, 0)

  const modelLabelFor = (section: SessionSection) => {
    const cur = section.model
    if (!cur) return undefined
    const prev = sections()[section.index - 1]?.model
    if (section.index !== 0 && prev?.providerID === cur.providerID && prev?.modelID === cur.modelID) return undefined
    return `${cur.providerID ?? ""}/${cur.modelID ?? ""}`
  }

  // follow-live: keep the newest growth visible while live and at bottom
  let scrollEl: HTMLDivElement | undefined
  let atBottom = true
  const onScroll = () => {
    const el = scrollEl
    if (el) atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  createEffect(() => {
    props.source.rev()
    if (props.source.status() === "live" && props.settings.followLive && atBottom && scrollEl) {
      scrollEl.scrollTop = scrollEl.scrollHeight
    }
  })

  const branding = () => props.source.branding()
  const backgroundUrl = () => (branding() as any).backgroundUrl as string | undefined
  const created = () => DateTime.fromMillis((info() as any)?.time?.created ?? Date.now()).toFormat("dd MMM yyyy, HH:mm")
  const providerID = () => (info() as any)?.model?.providerID as string | undefined
  const modelID = () => (info() as any)?.model?.modelID as string | undefined

  const emptyState = (
    <div class="flex flex-col items-start gap-3 pl-7 py-20">
      <RingGlyph class="w-8 h-8 text-icon-weaker-base opacity-70" />
      <p class="text-14-medium text-text-base">This session is still a seedling</p>
      <p class="text-12-regular text-text-weaker">Rings appear here as prompts arrive and the grove grows.</p>
    </div>
  )

  const noMatch = (
    <div class="flex flex-col items-start gap-3 pl-7 py-20">
      <GrassGlyph class="w-6 h-6 text-icon-weaker-base opacity-70" />
      <p class="text-14-medium text-text-base">No rings match "{props.search.trim()}"</p>
      <button
        class="bg-transparent border-none cursor-pointer p-0 text-12-regular text-text-weaker underline underline-offset-2 hover:text-text-base transition-colors duration-150"
        onClick={() => props.onSearch("")}
      >
        clear the filter
      </button>
    </div>
  )

  return (
    <div class="relative flex flex-col flex-1 min-h-0 bg-background-base text-text-base">
      <Title>{info()?.title ?? "session"} | {branding().name || "openshare"}</Title>

      <Show when={backgroundUrl() && props.settings.backgroundOn}>
        <div class="osh-bg" style={{ "background-image": `url(${backgroundUrl()})` }} />
      </Show>

      <header class="relative z-30 shrink-0 h-10 px-4 flex items-center justify-between gap-4 bg-background-base border-b border-border-weak-base">
        <div class="flex items-center gap-2 min-w-0">
          <Show
            when={branding().logoUrl}
            fallback={<span class="text-12-mono text-text-weaker truncate">{branding().name || "grove"}</span>}
          >
            <Show
              when={branding().linkUrl}
              fallback={<img src={branding().logoUrl} alt="" class="h-4 w-auto rounded-sm" />}
            >
              <a
                href={branding().linkUrl}
                target="_blank"
                rel="noreferrer"
                class="flex items-center"
                title={branding().name || ""}
              >
                <img src={branding().logoUrl} alt="" class="h-4 w-auto rounded-sm" />
              </a>
            </Show>
            <Show when={branding().name}>
              <span class="hidden lg:block text-12-mono text-text-weaker truncate">{branding().name}</span>
            </Show>
          </Show>
        </div>

        <div class="flex items-center gap-2 shrink-0 text-12-mono text-text-weaker">
          <span
            classList={{
              "inline-block size-1.5 shrink-0 rounded-full": true,
              "status-dot animate-pulse": props.source.status() === "live",
              "bg-icon-weak-base": props.source.status() !== "live",
            }}
          />
          <span>{props.source.status()}</span>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <div class="hidden md:flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-full border border-border-weak-base bg-background-stronger text-text-weaker focus-within:border-border-strong-base transition-colors duration-150">
            <span class="text-icon-weaker-base">
              <Icon name="magnifying-glass" size="small" />
            </span>
            <input
              class="w-32 lg:w-40 bg-transparent border-none outline-none text-12-regular text-text-base placeholder:text-text-weaker"
              placeholder="filter rings"
              aria-label="filter rings"
              autocomplete="off"
              value={props.search}
              onInput={(e) => props.onSearch(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") props.onSearch("")
              }}
            />
          </div>
          <a
            href="https://github.com/Mirrowel/Mirrobot-agent"
            target="_blank"
            rel="noreferrer"
            class="p-1 text-icon-weaker-base hover:text-icon-strong-base transition-colors duration-150"
            title="Open(code)Share"
          >
            <Icon name="github" size="small" />
          </a>
          <Show when={info()?.version}>
            <span class="flex items-center gap-1.5 h-7 px-2 rounded-full border border-border-weak-base text-12-mono text-text-weaker">
              <Mark class="h-3 shrink-0" />
              <span class="text-text-base">v{info()?.version}</span>
            </span>
          </Show>
          <div class="flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border border-border-weak-base bg-background-stronger">
            <span class="hidden sm:block text-12-regular text-text-weaker">settings</span>
            <SettingsPanel
              settings={props.settings}
              update={props.updateSettings}
              branding={{ backgroundUrl: backgroundUrl() }}
              search={props.search}
              onSearch={props.onSearch}
            />
          </div>
        </div>
      </header>

      <div
        ref={scrollEl}
        onScroll={onScroll}
        class="osh-content no-scrollbar relative z-10 flex-1 min-h-0 overflow-y-auto"
      >
        <div class="mx-auto w-full max-w-[38rem] px-6 pt-10 pb-2 xl:max-w-[48rem] xl:pl-[12rem]">
          <div class="relative pl-7 mb-12">
            <span class="absolute right-0 top-0 hidden sm:block text-icon-weaker-base opacity-20" aria-hidden="true">
              <RingGlyph class="w-16 h-16" />
            </span>
            <div class="text-12-mono uppercase tracking-widest text-text-weaker">
              grove · {created()} · {ringCount()} rings · {rootCount()} roots
            </div>
            <h1 class="mt-3 text-20-medium text-text-strong break-words">{info()?.title ?? "session"}</h1>
            <Show when={providerID()}>
              <div class="mt-4 flex items-center gap-1.5 text-12-mono text-text-weaker">
                <ProviderIcon id={providerID()!} class="size-3.5 shrink-0 text-icon-strong-base" />
                <span>{modelID() ?? "model"}</span>
              </div>
            </Show>
          </div>

          <Show when={searching() && filtered().length > 0}>
            <div class="flex items-center gap-3 pl-7 mb-8 text-12-mono text-text-weaker">
              <span>
                {filtered().length} of {ringCount()} rings match "{props.search.trim()}"
              </span>
              <button
                class="bg-transparent border-none cursor-pointer p-0 text-text-weaker underline underline-offset-2 hover:text-text-base transition-colors duration-150"
                onClick={() => props.onSearch("")}
              >
                clear
              </button>
            </div>
          </Show>

          <Show when={ringCount() > 0} fallback={emptyState}>
            <Show when={filtered().length > 0} fallback={noMatch}>
              <div classList={{ "relative border-l border-border-weaker-base pl-7": continuous() }}>
                <For each={filtered()}>
                  {(s) => (
                    <SectionView
                      section={s}
                      settings={props.settings}
                      continuous={continuous()}
                      modelLabel={modelLabelFor(s)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Show>

          <footer class="flex flex-col items-center gap-3 pl-7 pt-20 pb-10">
            <div class="flex items-center gap-3 w-full">
              <div class="h-px flex-1 bg-border-weaker-base" />
              <RingGlyph class="w-4 h-4 text-icon-weaker-base opacity-70" />
              <div class="h-px flex-1 bg-border-weaker-base" />
            </div>
            <Show
              when={branding().wordmarkUrl}
              fallback={
                <div class="text-12-mono text-text-weaker select-none">
                  <Show when={branding().name}>
                    <span class="text-text-base">{branding().name}</span>
                    <span> · </span>
                  </Show>
                  <span>Open(code)Share</span>
                </div>
              }
            >
              <img src={branding().wordmarkUrl} alt="" class="h-4 opacity-70" />
            </Show>
          </footer>
        </div>
      </div>
    </div>
  )
}

export const grove: ViewEntry = {
  id: "grove",
  label: "grove",
  component: GroveView,
}
