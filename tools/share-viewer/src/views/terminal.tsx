// TERMINAL VIEW — the session as a scrollback log. Monospace throughout,
// no cards, no rules: prompts are shell lines, tools are command echoes
// with output blocks, responses are terminal prose. Chrome is a pair of
// statusbars. Settings open as a framed overlay.
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { Markdown } from "../../vendor/session-ui/src/components/markdown"
import { DateTime } from "luxon"
import { Title } from "@solidjs/meta"
import type { ViewEntry } from "./registry"
import { useSessionSections, toolCallLabel, type SessionSection, type ToolEntry } from "./session-data"
import { MetaLine } from "./meta-line"
import { VendoredPart } from "./vendored-part"
import { sessionModelLabel } from "./session-data"
import { SettingsBody } from "../settings-panel"
import type { OshSettings } from "../settings"

function ToolEcho(props: { tool: ToolEntry; settings: OshSettings }) {
  const [userOpen, setOpen] = createSignal<boolean | undefined>(undefined)
  const open = () => userOpen() ?? (props.tool.defaultOpen || props.settings.toolOutput)
  return (
    <div class="mb-1.5">
      <button
        class="w-full text-left bg-transparent border-none cursor-pointer p-0 font-mono text-12-regular text-text-weaker hover:text-text-base transition-colors duration-150"
        onClick={() => setOpen(!open())}
      >
        <span class="opacity-50">[</span>
        {props.tool.tool}
        <span class="opacity-50">]</span>
        <Show when={props.settings.toolInfo}>
          <span class="opacity-80"> {toolCallLabel(props.tool)}</span>
        </Show>
      </button>
      <Show when={open() && props.tool.output}>
        <pre class="my-1 ml-4 pl-3 border-l border-border-weak-base text-12-mono text-text-weaker whitespace-pre-wrap break-words max-h-64 overflow-auto">
          {props.tool.output}
        </pre>
      </Show>
    </div>
  )
}

function ReasoningEcho(props: { text: string; settings: OshSettings }) {
  const [userOpen, setOpen] = createSignal<boolean | undefined>(undefined)
  const open = () => userOpen() ?? props.settings.reasoningOpen
  return (
    <div class="mb-1.5">
      <button
        class="bg-transparent border-none cursor-pointer p-0 font-mono text-12-regular italic text-text-weaker hover:text-text-base transition-colors duration-150"
        onClick={() => setOpen(!open())}
      >
        {open() ? "· thinking —" : "· thinking …"}
      </button>
      <Show when={open()}>
        <div class="ml-4 pl-3 border-l border-border-weak-base text-12-regular italic text-text-weaker [&_p]:my-1">
          <Markdown text={props.text} />
        </div>
      </Show>
    </div>
  )
}

function SectionLog(props: { section: SessionSection; index: number; settings: OshSettings; continuous: boolean; data: any }) {
  return (
    <div class="mb-5">
      <Show when={!props.continuous}>
        <div class="font-mono text-12-mono text-text-weaker opacity-60 mb-1">
          <span class="opacity-60">#</span>
          {props.index + 1}
        </div>
      </Show>
      <MetaLine section={props.section} data={props.data} class="text-12-mono text-text-weaker opacity-80 mb-0.5" />
      <div class="font-mono text-14-mono text-text-strong whitespace-pre-wrap mb-1.5">
        <span class="text-icon-strong-base opacity-70">❯ </span>
        {props.section.prompt}
      </div>
      <For each={props.section.ordered}>
        {(e) => (
          <Show
            when={e.kind !== "reasoning"}
            fallback={<ReasoningEcho text={(e as any).text} settings={props.settings} />}
          >
            <Show
              when={e.kind !== "text"}
              fallback={
                <div class="text-14-regular text-text-base whitespace-pre-wrap pl-2">
                  {(e as any).text}
                </div>
              }
            >
              <VendoredPart entry={e as any} settings={props.settings} />
            </Show>
          </Show>
        )}
      </For>
      <Show when={props.section.response}>
        <div class="font-mono text-14-regular text-text-base [&_p]:my-1.5 [&_code]:font-mono">
          <Markdown text={props.section.response} />
        </div>
      </Show>
    </div>
  )
}

function TerminalView(props: Parameters<ViewEntry["component"]>[0]) {
  const info = createMemo(() => props.data.session.find((s: any) => s.id === props.sessionID))
  const sections = useSessionSections(props.data, props.sessionID)
  const continuous = () => props.settings.continuous
  const [menuOpen, setMenuOpen] = createSignal(false)

  const filtered = createMemo(() => {
    const q = props.search.trim().toLowerCase()
    if (!q) return sections()
    return sections().filter((s) => s.prompt.toLowerCase().includes(q) || s.response.toLowerCase().includes(q))
  })

  // follow-live: keep the bottom in view while live and at bottom
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

  const statusLabel = () => props.source.status()
  const statusColor = () => (statusLabel() === "live" ? "#4ade80" : statusLabel() === "error" ? "#f87171" : "#7aa2f7")

  return (
    <div class="flex flex-col flex-1 min-h-0 relative z-10 font-mono">
      <Title>{info()?.title} | {props.source.branding().name || "openshare"}</Title>

      {/* top statusbar */}
      <div class="h-7 px-3 flex items-center justify-between gap-4 bg-background-stronger border-b border-border-weak-base shrink-0 text-12-mono text-text-weaker">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-text-strong truncate">{info()?.title ?? "session"}</span>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="flex items-center gap-1.5">
            <Mark class="h-3" />
            <span class="text-text-base">v{info()?.version}</span>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="inline-block size-1.5 rounded-full" style={{ background: statusColor() }} />
            {statusLabel()}
          </span>
          <button
            class="bg-transparent border border-border-weak-base rounded px-1.5 text-12-mono text-text-weaker hover:text-text-base hover:border-border-strong-base cursor-pointer transition-colors duration-150"
            onClick={() => setMenuOpen(true)}
          >
            :set
          </button>
        </div>
      </div>

      {/* scrollback */}
      <div ref={scrollEl} onScroll={onScroll} class="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div class="max-w-[72rem] mx-auto px-5 py-4">
          <div class="font-mono text-12-mono text-text-weaker opacity-60 mb-4">
            {DateTime.fromMillis(info()?.time?.created ?? Date.now()).toFormat("dd MMM yyyy HH:mm")}
            {" · "}
            {sessionModelLabel(props.data, props.sessionID)}
          </div>
          <Show when={filtered().length > 0} fallback={<div class="text-12-regular text-text-weaker py-10">no matches in scrollback.</div>}>
            <For each={filtered()}>
              {(s) => <SectionLog section={s} index={sections().indexOf(s)} settings={props.settings} continuous={continuous()} data={props.data} />}
            </For>
          </Show>
        </div>
      </div>

      {/* statusline */}
      <div class="h-6 px-3 flex items-center justify-between gap-4 bg-background-stronger border-t border-border-weak-base shrink-0 text-12-mono text-text-weaker">
        <div class="flex items-center gap-2 min-w-0">
          <Show when={props.source.branding().logoUrl}>
            <img src={props.source.branding().logoUrl} alt="" class="h-3 rounded-sm" />
          </Show>
          <span class="truncate">
            {props.source.branding().wordmarkUrl
              ? ""
              : `${props.source.branding().name ? props.source.branding().name + " · " : ""}Open(code)Share`}
          </span>
          {props.source.branding().wordmarkUrl ? <img src={props.source.branding().wordmarkUrl} alt="" class="h-3.5" /> : null}
        </div>
        <div class="shrink-0 flex items-center gap-3">
          <span>{filtered().length}/{sections().length} prompts</span>
          <span>terminal</span>
        </div>
      </div>

      {/* settings overlay */}
      <Show when={menuOpen()}>
        <div
          class="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-[8vh]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMenuOpen(false)
          }}
        >
          <div class="w-[19rem] max-h-[75vh] overflow-y-auto rounded-lg border border-border-weak-base bg-background-base shadow-xl">
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
                class="w-full text-left bg-transparent border-none cursor-pointer text-12-mono text-text-weaker hover:text-text-base py-1 transition-colors duration-150"
                onClick={() => setMenuOpen(false)}
              >
                :q — close settings
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}

export const terminal = {
  id: "terminal",
  label: "terminal",
  component: TerminalView,
}
