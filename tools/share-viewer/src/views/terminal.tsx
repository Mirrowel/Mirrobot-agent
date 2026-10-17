// terminal: the scrollback skin over the shared base - tmux-style
// statusbars top and bottom, everything monospace, prompts as ^ lines.
import { Show, createSignal } from "solid-js"
import { BaseSessionView, type Skin, type SkinWrappers } from "./base-view"
import { SettingsBody } from "../settings-panel"
import { saveSettingsScroll, restoreSettingsScroll } from "../settings-panel"
import type { ViewEntry } from "./registry"
import { MetaLine } from "./meta-line"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { DateTime } from "luxon"
import type { SessionSection } from "./session-data"

function StatusBar(props: Parameters<NonNullable<SkinWrappers["Header"]>>[0]) {
  const [menuOpen, setMenuOpen] = createSignal(false)
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const statusColor = () =>
    props.status === "live" ? "#4ade80" : props.status === "error" ? "#f87171" : "#7aa2f7"
  return (
    <>
      <div class="h-7 px-3 flex items-center justify-between gap-4 bg-background-stronger border-b border-border-weak-base shrink-0 text-12-mono text-text-weaker font-mono relative z-30">
        <div class="flex items-center gap-3 min-w-0">
          <Show when={props.isSub && props.onBack}>
            <button
              class="flex items-center gap-1 bg-transparent border-none cursor-pointer text-12-mono text-text-weaker hover:text-text-base shrink-0"
              onClick={() => props.onBack?.()}
            >
              &lt; main
            </button>
          </Show>
          <span class="text-text-strong truncate">{info()?.title ?? "session"}</span>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="flex items-center gap-1.5">
            <Mark class="h-3" />
            <span class="text-text-base">v{info()?.version}</span>
          </span>
          <Show when={props.model}>
            <span class="truncate max-w-56 text-text-base hidden sm:inline">{props.model}</span>
          </Show>
          <span class="flex items-center gap-1.5">
            <span class="inline-block size-1.5 rounded-full" style={{ background: statusColor() }} />
            {props.status}
          </span>
          <button
            class="bg-transparent border border-border-weak-base rounded px-1.5 text-12-mono text-text-weaker hover:text-text-base hover:border-border-strong-base cursor-pointer transition-colors duration-150"
            onClick={() => setMenuOpen(!menuOpen())}
          >
            :set
          </button>
        </div>
      </div>
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
    </>
  )
}

function StatusLine(props: Parameters<NonNullable<SkinWrappers["Footer"]>>[0]) {
  const b = () => props.source.branding()
  return (
    <div class="h-6 px-3 flex items-center justify-between gap-4 bg-background-stronger border-t border-border-weak-base shrink-0 text-12-mono text-text-weaker font-mono">
      <div class="flex items-center gap-2 min-w-0">
        <Show when={b().logoUrl}>
          <img src={b().logoUrl} alt="" class="h-3 rounded-sm" />
        </Show>
        <span class="truncate">
          {b().wordmarkUrl ? "" : `${b().name ? b().name + " · " : ""}Open(code)Share`}
        </span>
        {b().wordmarkUrl ? <img src={b().wordmarkUrl} alt="" class="h-3.5" /> : null}
      </div>
      <div class="shrink-0 flex items-center gap-3">
        <span>terminal</span>
        <a
          href="https://github.com/Mirrowel/Mirrobot-agent"
          target="_blank"
          rel="noreferrer"
          class="text-icon-weaker-base hover:text-icon-strong-base"
          title="Open(code)Share"
        >
          <Icon name="github" size="small" />
        </a>
      </div>
    </div>
  )
}

export const terminalSkin: Skin = {
  id: "terminal",
  mode: "composed",
  columnClass: "max-w-[72rem] mx-auto px-5 py-4 font-mono flex flex-col gap-5",
  wrappers: {
    Header: StatusBar,
    Footer: StatusLine,
    PromptWrap: (p) => (
      <div class="mb-1">
        <Show when={p.section.at}>
          <span class="text-12-mono text-text-weaker opacity-60 mr-2">
            {DateTime.fromMillis(p.section.at!).toFormat("HH:mm")}
          </span>
        </Show>
        <span class="text-icon-strong-base opacity-70 mr-1">❯</span>
        {p.children}
      </div>
    ),
    ToolWrap: (p) => <div class="pl-3 border-l border-border-weak-base my-0.5">{p.children}</div>,
    ReasoningWrap: (p) => <div class="pl-3 opacity-80">{p.children}</div>,
    ResponseWrap: (p) => <div class="pl-3 my-1">{p.children}</div>,
  },
}

export function TerminalView(props: Parameters<ViewEntry["component"]>[0]) {
  return <BaseSessionView {...props} skin={terminalSkin} />
}

export const terminal = {
  id: "terminal",
  label: "terminal",
  component: TerminalView,
}
