// Reader: the second view. An editorial transcript of the same session
// data - sections per prompt, responses as the primary reading surface,
// tool activity as quiet expandable lines, reasoning as collapsed blocks,
// a sticky table of contents on wide screens. Same source, same fold,
// same settings cookie; a different reading instrument.
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Markdown } from "../vendor/session-ui/src/components/markdown"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { DateTime } from "luxon"
import { Title } from "@solidjs/meta"
import type { ShareData } from "./fold"
import { visibleMessages } from "./fold"
import type { useShareSource } from "./data-source"
import type { OshSettings } from "./settings"
import { PageFooter } from "./app"

type AnyPart = { type: string; text?: string; tool?: string; state?: any; [k: string]: any }

function toolVerb(part: AnyPart): string {
  const tool = (part.tool ?? "tool").toLowerCase()
  const state = part.state
  if (state?.title) {
    const t = String(state.title)
    const colon = t.indexOf(":")
    return (colon > 0 ? t.slice(colon + 1) : t).trim() || tool
  }
  return tool
}

function toolOutput(part: AnyPart): string | undefined {
  const out = part.state?.output ?? part.state?.metadata
  if (out == null) return undefined
  if (typeof out === "string") return out.trim() || undefined
  try {
    return JSON.stringify(out, null, 2)
  } catch {
    return String(out)
  }
}

function ActivityLine(props: { part: AnyPart }) {
  const [open, setOpen] = createSignal(false)
  const output = createMemo(() => toolOutput(props.part))
  return (
    <div class="w-full">
      <button
        class="group flex items-center gap-2.5 w-full py-1.5 pl-2 pr-2 -mx-2 rounded-md bg-transparent border-none cursor-pointer text-left"
        onClick={() => setOpen(!open())}
      >
        <span class="text-icon-weaker-base group-hover:text-icon-strong-base transition-colors duration-150 shrink-0">
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        </span>
        <span class="text-12-regular text-text-weaker group-hover:text-text-base transition-colors duration-150 truncate">
          {toolVerb(props.part)}
        </span>
        <Show when={props.part.tool}>
          <span class="text-12-medium text-text-weaker opacity-60 shrink-0">{props.part.tool}</span>
        </Show>
      </button>
      <Show when={open() && output()}>
        <pre class="ml-6 mb-3 p-3 max-h-72 overflow-auto rounded-lg border border-border-weak-base bg-background-stronger text-12-mono text-text-weaker whitespace-pre-wrap break-words w-[calc(100%-1.5rem)] box-border">
          {output()}
        </pre>
      </Show>
    </div>
  )
}

function ReasoningBlock(props: { part: AnyPart; defaultOpen: boolean }) {
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
          <Markdown text={props.part.text ?? ""} />
        </div>
      </Show>
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

  // sections: one per user message, carrying the assistant parts that
  // follow it until the next user message
  const sections = createMemo(() => {
    const msgs = visibleMessages(props.data, props.sessionID)
    const out: { id: string; prompt: string; model: any; parts: AnyPart[]; response: string }[] = []
    let current: (typeof out)[number] | undefined
    for (const m of msgs) {
      if (m.role === "user") {
        const parts = props.data.part[m.id] ?? []
        const prompt = (parts.find((p: any) => p.type === "text") as AnyPart | undefined)?.text?.trim() ?? ""
        current = { id: m.id, prompt, model: (m as any).model, parts: [], response: "" }
        out.push(current)
        continue
      }
      if (!current) continue
      for (const p of (props.data.part[m.id] ?? []) as AnyPart[]) {
        if (p.type === "text") current.response += (current.response ? "\n\n" : "") + (p.text ?? "")
        else if (p.type === "tool" || p.type === "reasoning") current.parts.push(p)
      }
    }
    return out
  })

  const modelChanged = (idx: number) => {
    const cur = sections()[idx]?.model
    if (!cur) return undefined
    const prev = sections()[idx - 1]?.model
    if (prev?.providerID === cur.providerID && prev?.modelID === cur.modelID && idx !== 0) return undefined
    return `${cur.providerID ?? ""}/${cur.modelID ?? ""}`
  }

  // search: keep sections whose prompt or response matches
  const filtered = createMemo(() => {
    const q = props.search.trim().toLowerCase()
    if (!q) return sections()
    return sections().filter(
      (s) => s.prompt.toLowerCase().includes(q) || s.response.toLowerCase().includes(q),
    )
  })
  const searching = createMemo(() => props.search.trim().length > 0)

  // mini-TOC: the section currently in view
  const [activeSection, setActiveSection] = createSignal(0)
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
    scrollEl?.querySelector(`[data-section-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const promptTitle = (s: { prompt: string }) =>
    (s.prompt.split("\n")[0] || "(empty prompt)").slice(0, 60)

  return (
    <div class="flex flex-1 min-h-0 relative z-10">
      <Title>{info()?.title} | {props.source.branding().name || "openshare"}</Title>
      {/* mini-TOC rail */}
      <nav class="hidden xl:flex flex-col gap-1 w-56 shrink-0 border-r border-border-weak-base p-4 overflow-y-auto no-scrollbar">
        <div class="text-12-medium text-text-weaker tracking-wider uppercase mb-2">prompts</div>
        <For each={sections()}>
          {(s, i) => (
            <button
              class="flex items-baseline gap-2 py-1 px-2 -mx-2 rounded-md text-left bg-transparent border-none cursor-pointer transition-colors duration-150"
              classList={{
                "bg-surface-base": activeSection() === i(),
              }}
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
      </nav>

      {/* the transcript */}
      <div
        ref={scrollEl}
        class="flex-1 min-h-0 overflow-y-auto no-scrollbar"
      >
        <div class="max-w-[46rem] mx-auto px-6 pt-10 pb-8">
          {/* session head */}
          <div class="flex flex-col gap-2 mb-10">
            <div class="flex items-center gap-3 text-12-regular text-text-weaker">
              <Show when={(info()?.model as any)?.providerID}>
                <span class="flex items-center gap-1.5">
                  <ProviderIcon id={(info()!.model as any).providerID} class="size-3.5 shrink-0 text-icon-strong-base" />
                </span>
              </Show>
              <span class="text-12-mono">{info()?.version}</span>
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
                  return (
                    <section
                      data-section={idx}
                      data-section-id={section.id}
                      class="pt-8 first:pt-0 border-t border-border-weak-base first:border-none"
                    >
                      <div class="flex items-baseline gap-3 mb-4">
                        <span class="text-12-mono text-text-weaker shrink-0">{String(idx + 1).padStart(2, "0")}</span>
                        <p class="text-14-medium text-text-strong whitespace-pre-wrap">{section.prompt}</p>
                      </div>
                      <Show when={modelChanged(idx)}>
                        {(label) => (
                          <div class="text-12-mono text-text-weaker mb-3">→ {label()}</div>
                        )}
                      </Show>
                      <div class="flex flex-col gap-3">
                        <For each={section.parts}>
                          {(p) => (
                            <Show
                              when={p.type !== "reasoning"}
                              fallback={<ReasoningBlock part={p} defaultOpen={props.settings.reasoningOpen} />}
                            >
                              <ActivityLine part={p} />
                            </Show>
                          )}
                        </For>
                        <Show when={section.response}>
                          <div class="text-14-regular text-text-base">
                            <Markdown text={section.response} />
                          </div>
                        </Show>
                      </div>
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
