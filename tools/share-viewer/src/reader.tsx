// Reader: the second view. An editorial transcript of the same session
// data - sections per prompt, responses as the primary reading surface,
// tool activity as quiet expandable lines, reasoning as collapsed blocks,
// a hover-triggered prompts drawer on wide screens (content takes the
// full window; continuous mode drops the per-prompt chrome entirely).
// Same source, same fold, same settings cookie; a different reading
// instrument.
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { Markdown } from "../vendor/session-ui/src/components/markdown"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { DateTime } from "luxon"
import { Title } from "@solidjs/meta"
import type { ShareData } from "./fold"
import type { useShareSource } from "./data-source"
import type { OshSettings } from "./settings"
import { PageFooter } from "./app"
import { useSessionSections, toolCallLabel, type SessionSection } from "./views/session-data"
import { MetaLine } from "./views/meta-line"
import { VendoredPart } from "./views/vendored-part"
import { sessionModelLabel } from "./views/session-data"

function ReasoningBlock(props: { text: string; defaultOpen: boolean }) {
  const [open, setOpen] = createSignal(props.defaultOpen)
  return (
    <div class="pl-4 border-l-2 border-border-weak-base my-1">
      <button
        class="flex items-center gap-1.5 py-1 bg-transparent border-none cursor-pointer text-12-medium text-text-weaker hover:text-text-base transition-colors duration-150"
        onClick={() => setOpen(!open())}
      >
        <span class="text-icon-weaker-base">
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        </span>
        Thinking
      </button>
      <Show when={open()}>
        <div class="text-text-weaker text-12-regular [&_p]:my-1">
          <Markdown text={props.text} />
        </div>
      </Show>
    </div>
  )
}

function ToolLine(props: { tool: SessionSection["tools"][number]; settings: OshSettings }) {
  const [open, setOpen] = createSignal(props.settings.toolOutput)
  return (
    <div class="w-full">
      <button
        class="group flex items-center gap-2.5 w-full py-1.5 px-2 -mx-2 rounded-md bg-transparent border-none cursor-pointer text-left"
        onClick={() => setOpen(!open())}
      >
        <span class="text-icon-weaker-base group-hover:text-icon-strong-base transition-colors duration-150 shrink-0">
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        </span>
        <Show when={props.settings.toolInfo}>
          <span class="text-12-regular text-text-weaker group-hover:text-text-base transition-colors duration-150 truncate">
            {toolCallLabel(props.tool)}
          </span>
        </Show>
        <span class="text-12-medium text-text-weaker opacity-60 shrink-0">{props.tool.tool}</span>
      </button>
      <Show when={open() && props.tool.output}>
        <pre class="ml-6 mb-3 p-3 max-h-72 overflow-auto rounded-lg border border-border-weak-base bg-background-stronger text-12-mono text-text-weaker whitespace-pre-wrap break-words w-[calc(100%-1.5rem)] box-border">
          {props.tool.output}
        </pre>
      </Show>
    </div>
  )
}

function SectionBody(props: { section: SessionSection; settings: OshSettings }) {
  return (
    <div class="flex flex-col gap-3">
      <For each={props.section.ordered}>
        {(e) => (
          <Show
            when={e.kind !== "reasoning"}
            fallback={<ReasoningBlock text={(e as any).text} defaultOpen={props.settings.reasoningOpen} />}
          >
            <Show
              when={e.kind !== "text"}
              fallback={
                <div class="text-14-regular text-text-base">
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
  )
}

export function ReaderView(props: {
  data: ShareData
  sessionID: string
  source: ReturnType<typeof useShareSource>
  settings: OshSettings
  search: string
}) {
  const info = createMemo(() => props.data.session.find((s: any) => s.id === props.sessionID))
  const sections = useSessionSections(props.data, props.sessionID)
  const continuous = () => props.settings.continuous

  const modelChanged = (idx: number) => {
    const cur = sections()[idx]?.model
    if (!cur?.providerID && !cur?.modelID) return undefined
    const label = `${cur.providerID ?? ""}/${cur.modelID ?? ""}`
    if (label === "/") return undefined
    const prev = sections()[idx - 1]?.model
    const prevLabel = prev ? `${prev.providerID ?? ""}/${prev.modelID ?? ""}` : ""
    if (idx !== 0 && prevLabel === label) return undefined
    return label
  }

  const filtered = createMemo(() => {
    const q = props.search.trim().toLowerCase()
    if (!q) return sections()
    return sections().filter(
      (s) => s.prompt.toLowerCase().includes(q) || s.response.toLowerCase().includes(q),
    )
  })
  const searching = createMemo(() => props.search.trim().length > 0)

  const [activeSection, setActiveSection] = createSignal(0)
  const [drawerOpen, setDrawerOpen] = createSignal(false)
  let scrollEl: HTMLDivElement | undefined
  onMount(() => {
    if (!("IntersectionObserver" in window)) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.section)
            if (!Number.isNaN(idx)) setActiveSection(idx)
          }
        }
      },
      { root: scrollEl, rootMargin: "-10% 0px -80% 0px" },
    )
    for (const el of scrollEl?.querySelectorAll("[data-section]") ?? []) obs.observe(el)
    onCleanup(() => obs.disconnect())
  })

  const scrollToSection = (id: string) => {
    setDrawerOpen(false)
    scrollEl?.querySelector(`[data-section-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const promptTitle = (s: SessionSection) =>
    (s.prompt.split("\n")[0] || "(empty prompt)").slice(0, 60)

  return (
    <div class="flex flex-1 min-h-0 relative z-10">
      <Title>{info()?.title} | {props.source.branding().name || "openshare"}</Title>

      {/* hover drawer: a slim rail; hovering (or focusing) it slides the
          prompt list over the content - the window stays full-width */}
      <Show when={!continuous()}>
        <div
          class="hidden xl:block w-3 shrink-0 group/toc relative z-20"
          onMouseEnter={() => setDrawerOpen(true)}
          onMouseLeave={() => setDrawerOpen(false)}
        >
          <div class="absolute inset-y-0 left-0 w-full bg-transparent" />
          <div
            class="absolute inset-y-0 left-0 w-64 border-r border-border-weak-base bg-background-base p-4 overflow-y-auto transition-transform duration-200"
            style={{ transform: drawerOpen() ? "translateX(0)" : "translateX(-100%)", "margin-left": "0" }}
          >
            <div class="text-12-medium text-text-weaker tracking-[0.14em] uppercase mb-2">prompts</div>
            <For each={sections()}>
              {(s, i) => (
                <button
                  class="flex items-baseline gap-2 py-1 px-2 -mx-2 rounded-md text-left bg-transparent border-none cursor-pointer transition-colors duration-150"
                  classList={{ "bg-surface-base": activeSection() === i() }}
                  onClick={() => scrollToSection(s.id)}
                >
                  <span
                    classList={{
                      "text-12-mono shrink-0": true,
                      "text-text-strong": activeSection() === i(),
                      "text-text-weaker": activeSection() !== i(),
                    }}
                  >
                    {String(i() + 1).padStart(2, "0")}
                  </span>
                  <span
                    classList={{
                      "text-12-regular truncate": true,
                      "text-text-base": activeSection() === i(),
                      "text-text-weaker": activeSection() !== i(),
                    }}
                  >
                    {promptTitle(s)}
                  </span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* the transcript */}
      <div ref={scrollEl} class="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div class="max-w-[46rem] mx-auto px-6 pt-10 pb-8">
          {/* session head */}
          <div class="flex flex-col gap-2 mb-10">
            <div class="flex items-center gap-3 text-12-regular text-text-weaker">
              <span class="flex items-center gap-1 bg-background-stronger border border-border-weak-base rounded px-1.5 py-0.5">
                <Mark class="h-3 shrink-0" />
                <span class="text-12-mono text-text-base">{info()?.version}</span>
              </span>
              <Show when={(info()?.model as any)?.providerID}>
                <ProviderIcon id={(info()!.model as any).providerID} class="size-3.5 shrink-0 text-icon-strong-base" />
              </Show>
              <span>{sessionModelLabel(props.data, props.sessionID)}</span>
              <span>{DateTime.fromMillis(info()?.time?.created ?? Date.now()).toFormat("dd MMM yyyy, HH:mm")}</span>
            </div>
            <h1 class="text-20-medium text-text-strong">{info()?.title}</h1>
          </div>

          <Show
            when={filtered().length > 0}
            fallback={<div class="text-14-regular text-text-weaker py-16">no prompts match.</div>}
          >
            <div class="flex flex-col">
              <For each={filtered()}>
                {(section) => {
                  const idx = sections().indexOf(section)
                  const marker = (
                    <div class="flex items-baseline gap-3 mb-4">
                      <span class="text-12-mono text-text-weaker shrink-0">{String(idx + 1).padStart(2, "0")}</span>
                      <p class="text-14-medium text-text-strong whitespace-pre-wrap">{section.prompt}</p>
                    </div>
                  )
                  return (
                    <section
                      data-section={idx}
                      data-section-id={section.id}
                      classList={{
                        "border-t border-border-weak-base first:border-none": !continuous(),
                        "pt-8 first:pt-0": !continuous(),
                        "pt-5": continuous(),
                      }}
                    >
                      <Show when={!continuous()} fallback={
                        <div class="flex items-baseline gap-2 mb-3">
                          <span class="text-12-mono text-text-weaker opacity-60">❯</span>
                          <p class="text-14-medium text-text-base whitespace-pre-wrap">{section.prompt}</p>
                        </div>
                      }>
                        {marker}
                      </Show>
                      <Show when={!continuous()}>
                        <MetaLine section={section} data={props.data} class="text-12-mono text-text-weaker mb-3" />
                      </Show>
                      <SectionBody section={section} settings={props.settings} />
                    </section>
                  )
                }}
              </For>
            </div>
          </Show>

          <div class="pt-16">
            <PageFooter branding={props.source.branding()} />
          </div>
        </div>
      </div>
    </div>
  )
}
