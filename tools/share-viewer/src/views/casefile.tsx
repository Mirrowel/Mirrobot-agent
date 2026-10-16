// CASEFILE VIEW — the session as a numbered investigation file. Prompts
// are MEMO entries with index tags, responses are report prose in a
// generous measure, tool calls are EVIDENCE exhibits (tagged, titled,
// collapsible document insets), reasoning is an annotations block.
// Chrome: a folder-tab header with a status stamp, an archive-line
// footer, and settings as an index-card drawer from the right.
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { Markdown } from "../../vendor/session-ui/src/components/markdown"
import { DateTime } from "luxon"
import { Title } from "@solidjs/meta"
import type { ViewEntry } from "./registry"
import type { OshSettings } from "../settings"
import { useSessionSections, toolCallLabel, type SessionSection, type ToolEntry } from "./session-data"
import { SettingsPanel } from "../settings-panel"

const pad = (n: number) => String(n + 1).padStart(2, "0")

function Exhibit(props: { tool: ToolEntry; index: number; settings: OshSettings }) {
  const [open, setOpen] = createSignal(props.settings.toolOutput)
  return (
    <div class="my-2 rounded-lg border border-border-weak-base bg-background-stronger overflow-hidden">
      <button
        class="flex items-center gap-2.5 w-full px-3 py-2 bg-transparent border-none cursor-pointer text-left"
        onClick={() => setOpen(!open())}
      >
        <span class="text-12-mono text-text-weaker shrink-0 border border-border-weak-base rounded px-1">
          E-{pad(props.index)}
        </span>
        <Show when={props.settings.toolInfo}>
          <span class="text-12-regular text-text-base truncate flex-1">{toolCallLabel(props.tool)}</span>
        </Show>
        <span class="text-12-medium text-text-weaker opacity-70 shrink-0">{props.tool.tool}</span>
        <span class="text-icon-weaker-base shrink-0">
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        </span>
      </button>
      <Show when={open() && props.tool.output}>
        <pre class="m-2 mt-0 p-3 max-h-64 overflow-auto rounded-md border border-border-weak-base bg-background-base text-12-mono text-text-weaker whitespace-pre-wrap break-words">
          {props.tool.output}
        </pre>
      </Show>
    </div>
  )
}

function Annotations(props: { text: string; settings: OshSettings }) {
  const [open, setOpen] = createSignal(props.settings.reasoningOpen)
  return (
    <div class="my-2 flex items-start gap-3">
      <span class="text-12-mono text-text-weaker opacity-60 shrink-0 pt-1 w-20 text-right">annot.</span>
      <div class="flex-1 min-w-0">
        <button
          class="flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-12-medium text-text-weaker hover:text-text-base transition-colors duration-150 p-0"
          onClick={() => setOpen(!open())}
        >
          <span class="text-icon-weaker-base">
            <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
          </span>
          reasoning
        </button>
        <Show when={open()}>
          <div class="text-12-regular italic text-text-weaker [&_p]:my-1">
            <Markdown text={props.text} />
          </div>
        </Show>
      </div>
    </div>
  )
}

function Memo(props: { section: SessionSection; settings: OshSettings; continuous: boolean }) {
  const s = props.section
  return (
    <article class="py-7 border-b border-border-weak-base last:border-none">
      {/* memo head */}
      <div class="flex items-start gap-4 mb-3">
        <Show when={!props.continuous}>
          <span class="shrink-0 text-12-mono text-text-weaker border border-border-weak-base rounded px-1.5 py-0.5">
            MEMO {pad(s.index)}
          </span>
        </Show>
        <p class="flex-1 min-w-0 text-16-medium text-text-strong whitespace-pre-wrap">{s.prompt}</p>
      </div>
      {/* annotations */}
      <For each={s.reasoning}>
        {(r) => <Annotations text={r.text} settings={props.settings} />}
      </For>
      {/* evidence */}
      <div class="flex items-start gap-3">
        <span class="hidden sm:block text-12-mono text-text-weaker opacity-60 shrink-0 pt-2 w-20 text-right">evidence</span>
        <div class="flex-1 min-w-0">
          <For each={s.tools}>
            {(t, i) => <Exhibit tool={t} index={i()} settings={props.settings} />}
          </For>
        </div>
      </div>
      {/* report */}
      <div class="flex items-start gap-3 mt-3">
        <span class="hidden sm:block text-12-mono text-text-weaker opacity-60 shrink-0 pt-1 w-20 text-right">report</span>
        <div class="flex-1 min-w-0 text-14-regular text-text-base [&_p]:my-2">
          <Markdown text={s.response} />
        </div>
      </div>
    </article>
  )
}

function CasefileView(props: Parameters<ViewEntry["component"]>[0]) {
  const info = createMemo(() => props.data.session.find((s: any) => s.id === props.sessionID))
  const sections = useSessionSections(props.data, props.sessionID)
  const [drawer, setDrawer] = createSignal(false)

  const filtered = createMemo(() => {
    const q = props.search.trim().toLowerCase()
    if (!q) return sections()
    return sections().filter((s) => s.prompt.toLowerCase().includes(q) || s.response.toLowerCase().includes(q))
  })

  // follow-live
  let scrollEl: HTMLDivElement | undefined
  let atBottom = true
  createEffect(() => {
    props.source.rev()
    if (props.source.status() === "live" && props.settings.followLive && atBottom && scrollEl) {
      scrollEl.scrollTop = scrollEl.scrollHeight
    }
  })
  const onScroll = () => {
    const el = scrollEl
    if (el) atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const status = () => props.source.status()
  const stampColor = () =>
    status() === "live" ? "text-icon-strong-base border-icon-strong-base" : status() === "error" ? "text-red-400 border-red-400" : "text-text-weaker border-border-strong-base"

  const fileNo = () => (props.sessionID.replace(/^ses_/, "").slice(0, 8) || "00000000").toUpperCase()

  return (
    <div class="flex flex-col flex-1 min-h-0 relative z-10">
      <Title>{info()?.title} | {props.source.branding().name || "openshare"}</Title>

      {/* folder tab header */}
      <header class="shrink-0 px-5 pt-3 bg-background-stronger border-b border-border-weak-base">
        <div class="flex items-end justify-between gap-4">
          <div class="flex items-end gap-3 min-w-0">
            <div class="px-3 py-1 rounded-t-lg border border-b-0 border-border-weak-base bg-background-base text-12-mono text-text-weaker">
              CASE {fileNo()}
            </div>
            <h1 class="text-16-medium text-text-strong truncate pb-1">{info()?.title}</h1>
          </div>
          <div class="flex items-center gap-3 pb-1.5 shrink-0">
            <span class="text-12-mono text-text-weaker flex items-center gap-1.5">
              <Mark class="h-3" />
              v{info()?.version}
            </span>
            <span
              class="text-12-mono uppercase tracking-widest border rounded px-1.5 py-0.5 rotate-[-2deg]"
              classList={{
                [stampColor()]: true,
              }}
            >
              {status()}
            </span>
            <button
              class="flex items-center gap-1.5 bg-transparent border border-border-weak-base rounded px-2 py-1 text-12-regular text-text-weaker hover:text-text-base hover:border-border-strong-base cursor-pointer transition-colors duration-150"
              onClick={() => setDrawer(true)}
            >
              <Icon name="bullet-list" size="small" />
              index
            </button>
          </div>
        </div>
      </header>

      {/* the file */}
      <div ref={scrollEl} onScroll={onScroll} class="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div class="max-w-[52rem] mx-auto px-6 py-6">
          <div class="text-12-mono text-text-weaker opacity-70 mb-6">
            FILED {DateTime.fromMillis(info()?.time?.created ?? Date.now()).toFormat("dd MMM yyyy HH:mm")}
            {" · "}MEMOS {sections().length}
          </div>
          <Show when={filtered().length > 0} fallback={<div class="text-14-regular text-text-weaker py-16">nothing in the file matches.</div>}>
            <For each={filtered()}>
              {(s) => <Memo section={s} settings={props.settings} continuous={props.settings.continuous} />}
            </For>
          </Show>
          {/* archive line */}
          <div class="mt-10 pt-4 border-t border-border-weak-base flex items-center justify-between gap-4 text-12-mono text-text-weaker">
            <span class="flex items-center gap-2 min-w-0">
              <Show when={props.source.branding().logoUrl}>
                <img src={props.source.branding().logoUrl} alt="" class="h-4 rounded-sm" />
              </Show>
              <span class="truncate">
                {props.source.branding().wordmarkUrl
                  ? ""
                  : `${props.source.branding().name ? props.source.branding().name + " · " : ""}Open(code)Share`}
              </span>
              {props.source.branding().wordmarkUrl ? <img src={props.source.branding().wordmarkUrl} alt="" class="h-3.5" /> : null}
            </span>
            <a
              href="https://github.com/Mirrowel/Mirrobot-agent"
              target="_blank"
              rel="noreferrer"
              class="text-icon-weaker-base hover:text-icon-strong-base"
            >
              <Icon name="github" size="small" />
            </a>
          </div>
        </div>
      </div>

      {/* index-card drawer */}
      <Show when={drawer()}>
        <div class="fixed inset-0 z-40" onClick={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <div
            class="absolute top-0 right-0 bottom-0 w-[19rem] max-w-[85vw] overflow-y-auto border-l border-border-weak-base bg-background-base shadow-xl p-4"
            style={{ "animation": "osh-slide-in 180ms ease-out" }}
          >
            <div class="flex items-center justify-between pb-2">
              <span class="text-14-medium text-text-strong">Index</span>
              <button
                class="bg-transparent border-none cursor-pointer text-icon-weaker-base hover:text-icon-strong-base p-1"
                onClick={() => setDrawer(false)}
              >
                <Icon name="close-small" size="small" />
              </button>
            </div>
            <SettingsPanel
              settings={props.settings}
              update={props.updateSettings}
              branding={props.source.branding()}
              search={props.search}
              onSearch={props.onSearch}
            />
          </div>
        </div>
      </Show>
    </div>
  )
}

export const casefile = {
  id: "casefile",
  label: "casefile",
  component: CasefileView,
}
