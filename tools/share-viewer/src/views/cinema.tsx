// CINEMA VIEW - the session as a shooting script. Each prompt opens a
// scene: a caps slugline (compressed prompt) over courier action lines
// (the full prompt). The response is a dialogue block credited to the
// model, tool calls are italic stage directions with the tool name as
// the parenthetical, reasoning is the writer's notes. Chrome: a
// production strip on top (status as production slug), a script footer
// below, settings in a drawer from the right. Continuous mode trades
// numbered sluglines for "cut to:" transitions.
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { Markdown } from "../../vendor/session-ui/src/components/markdown"
import { DateTime } from "luxon"
import { Title } from "@solidjs/meta"
import type { ViewEntry } from "./registry"
import { useSessionSections, toolCallLabel, type SessionSection, type ToolEntry } from "./session-data"
import { SettingsBody, togglePanel, closePanel } from "../settings-panel"
import type { OshSettings } from "../settings"

// compress a prompt into a slugline: first meaningful line, markdown
// stripped, trimmed to one breath. Uppercase is applied by CSS.
function slugline(prompt: string): string {
  const line = (prompt.split("\n").find((l) => l.trim().length > 0) ?? "")
    .replace(/[`*_#>~[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!line) return "(silent)"
  if (line.length <= 58) return line
  const cut = line.slice(0, 58)
  const space = cut.lastIndexOf(" ")
  return (space > 24 ? cut.slice(0, space) : cut).trimEnd() + "..."
}

// the speaking part credited to the model: first segment of the model
// id (claude-sonnet-4-5 -> CLAUDE), ASSISTANT when unusable
function castName(model?: { providerID?: string; modelID?: string }): string {
  const head = (model?.modelID ?? "").split(/[-._]/)[0] ?? ""
  if (head && head.length <= 10 && !/^\d+$/.test(head)) return head.toUpperCase()
  return "ASSISTANT"
}

function StageDirection(props: { tool: ToolEntry; settings: OshSettings }) {
  const [open, setOpen] = createSignal(props.settings.toolOutput)
  return (
    <div class="my-1">
      <button
        class="group flex items-center gap-2 w-full text-left bg-transparent border-none cursor-pointer py-0.5"
        onClick={() => setOpen(!open())}
      >
        <span class="text-icon-weaker-base group-hover:text-icon-strong-base transition-colors duration-150 shrink-0">
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        </span>
        <span class="text-12-mono text-text-weaker group-hover:text-text-base transition-colors duration-150 shrink-0">
          ({props.tool.tool})
        </span>
        <Show when={props.settings.toolInfo}>
          <span class="text-12-regular italic text-text-weaker group-hover:text-text-base transition-colors duration-150 truncate min-w-0">
            {toolCallLabel(props.tool)}
          </span>
        </Show>
      </button>
      <Show when={open() && props.tool.output}>
        <pre class="ml-5 mt-1 mb-2 p-3 max-h-64 overflow-auto rounded-md border border-border-weak-base bg-background-stronger text-12-mono text-text-weaker whitespace-pre-wrap break-words">
          {props.tool.output}
        </pre>
      </Show>
    </div>
  )
}

function WritersNotes(props: { text: string; settings: OshSettings }) {
  const [open, setOpen] = createSignal(props.settings.reasoningOpen)
  return (
    <div class="my-1">
      <button
        class="group flex items-center gap-1.5 bg-transparent border-none cursor-pointer py-0.5"
        onClick={() => setOpen(!open())}
      >
        <span class="text-icon-weaker-base group-hover:text-icon-strong-base transition-colors duration-150">
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        </span>
        <span class="text-12-regular italic text-text-weaker group-hover:text-text-base transition-colors duration-150">
          writer's notes
        </span>
      </button>
      <Show when={open()}>
        <div class="mt-1 pl-5 text-12-regular italic text-text-weaker [&_p]:my-1">
          <Markdown text={props.text} />
        </div>
      </Show>
    </div>
  )
}

function Dialogue(props: { section: SessionSection }) {
  const s = props.section
  return (
    <div class="mt-4 pl-5 sm:pl-10">
      <div class="text-12-mono uppercase tracking-widest text-text-weaker">{castName(s.model)}</div>
      <div class="mt-1.5 max-w-[40rem] text-14-regular text-text-base [&_p]:my-2 [&_li_p]:my-1">
        <Markdown text={s.response} />
      </div>
    </div>
  )
}

function Scene(props: { section: SessionSection; sceneNo: number; numbered: boolean; tight: boolean; settings: OshSettings }) {
  const s = props.section
  const head = () => (props.numbered ? `Scene ${props.sceneNo}. ` : "") + slugline(s.prompt)
  return (
    <section classList={{ "pt-10": !props.tight, "pt-3": props.tight }}>
      <h2 class="text-14-mono uppercase tracking-wide text-text-strong">{head()}</h2>
      <Show when={s.prompt}>
        <p class="mt-3 text-14-mono leading-relaxed text-text-base whitespace-pre-wrap">{s.prompt}</p>
      </Show>
      <div class="mt-3 pl-1 sm:pl-3">
        <For each={s.reasoning}>{(r) => <WritersNotes text={r.text} settings={props.settings} />}</For>
        <For each={s.tools}>{(t) => <StageDirection tool={t} settings={props.settings} />}</For>
      </div>
      <Show when={s.response}>
        <Dialogue section={s} />
      </Show>
    </section>
  )
}

function CinemaView(props: Parameters<ViewEntry["component"]>[0]) {
  const info = createMemo(() => props.data.session.find((s: any) => s.id === props.sessionID))
  const sections = useSessionSections(props.data, props.sessionID)
  const continuous = () => props.settings.continuous
  const [drawer, setDrawer] = createSignal(false)

  const searching = createMemo(() => props.search.trim().length > 0)
  const filtered = createMemo(() => {
    const q = props.search.trim().toLowerCase()
    if (!q) return sections()
    return sections().filter(
      (s) =>
        s.prompt.toLowerCase().includes(q) ||
        s.response.toLowerCase().includes(q) ||
        s.tools.some(
          (t) =>
            t.tool.toLowerCase().includes(q) ||
            t.title.toLowerCase().includes(q) ||
            (t.output ?? "").toLowerCase().includes(q),
        ),
    )
  })

  // follow-live: keep the newest page visible only while at the bottom
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

  const status = () => props.source.status()
  const slugClass = () =>
    status() === "live"
      ? "text-icon-strong-base border-icon-strong-base"
      : status() === "error"
        ? "text-red-400 border-red-400"
        : "text-text-weaker border-border-strong-base"

  const openDrawer = () => {
    setDrawer(true)
    togglePanel()
  }
  const closeDrawer = () => {
    setDrawer(false)
    closePanel()
  }

  const byline = () => {
    const m = info()?.model as any
    if (!m?.providerID && !m?.modelID) return undefined
    return `${m.providerID ?? ""}/${m.modelID ?? ""}`
  }

  const brand = props.source.branding

  return (
    <div class="flex flex-col flex-1 min-h-0 relative z-10">
      <Title>{info()?.title} | {brand().name || "openshare"}</Title>

      {/* production strip */}
      <header class="shrink-0 h-10 px-4 flex items-center justify-between gap-3 bg-background-stronger border-b border-border-weak-base">
        <div class="flex items-center gap-2.5 min-w-0">
          <Show when={brand().logoUrl}>
            <a href={brand().linkUrl ?? "#"} target="_blank" rel="noreferrer" class="shrink-0">
              <img src={brand().logoUrl} alt="" class="h-4 rounded-sm" />
            </a>
          </Show>
          <span class="text-12-mono uppercase tracking-widest text-text-weaker truncate">shooting script</span>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span
            class="text-12-mono uppercase tracking-widest border rounded px-1.5 py-0.5"
            classList={{ [slugClass()]: true }}
          >
            {status()}
          </span>
          <span class="flex items-center gap-1.5 text-12-mono text-text-weaker">
            <Mark class="h-3 shrink-0" />
            v{info()?.version ?? "?"}
          </span>
          <button
            class="flex items-center gap-1.5 bg-transparent border border-border-weak-base rounded px-2 py-1 text-12-regular text-text-weaker hover:text-text-base hover:border-border-strong-base cursor-pointer transition-colors duration-150"
            onClick={openDrawer}
          >
            <Icon name="settings-gear" size="small" />
            settings
          </button>
          <a
            href="https://github.com/Mirrowel/Mirrobot-agent"
            target="_blank"
            rel="noreferrer"
            class="text-icon-weaker-base hover:text-icon-strong-base"
          >
            <Icon name="github" size="small" />
          </a>
        </div>
      </header>

      {/* the script */}
      <div ref={scrollEl} onScroll={onScroll} class="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div class="osh-content max-w-[48rem] mx-auto px-6 pt-14 pb-10">
          {/* title page */}
          <div class="text-center">
            <div class="text-12-mono uppercase tracking-widest text-text-weaker">a session, typeset</div>
            <h1 class="mt-3 text-20-medium uppercase tracking-widest text-text-strong break-words">
              {info()?.title ?? "untitled session"}
            </h1>
            <div class="mt-3 text-12-mono text-text-weaker">
              <Show when={byline()}>
                written by {byline()}
                {" · "}
              </Show>
              {DateTime.fromMillis(info()?.time?.created ?? Date.now()).toFormat("dd MMM yyyy HH:mm")}
              {" · "}
              {sections().length} scenes
            </div>
          </div>

          <div class="mt-12 text-14-mono uppercase text-text-weaker">fade in:</div>

          <Show when={searching() && filtered().length === 0}>
            <div class="py-16 text-center">
              <div class="text-14-mono uppercase tracking-wide text-text-strong">no matching scenes</div>
              <p class="mt-2 text-12-regular text-text-weaker">
                No scene in this script matches the filter. Clear the search in settings to read the full draft.
              </p>
            </div>
          </Show>
          <Show when={!searching() && sections().length === 0}>
            <div class="py-16 text-center">
              <div class="text-14-mono uppercase tracking-wide text-text-strong">no scenes yet</div>
              <p class="mt-2 text-12-regular text-text-weaker">
                This script has no scenes yet. If the session is live, new scenes appear here as they happen.
              </p>
            </div>
          </Show>

          <For each={filtered()}>
            {(s) => {
              const flowing = continuous() && !searching()
              return (
                <>
                  <Show when={flowing}>
                    <div class="pt-10 text-center text-12-mono uppercase tracking-widest text-text-weaker">cut to:</div>
                  </Show>
                  <Scene
                    section={s}
                    sceneNo={sections().indexOf(s) + 1}
                    numbered={!flowing}
                    tight={flowing}
                    settings={props.settings}
                  />
                </>
              )
            }}
          </For>

          <Show when={sections().length > 0}>
            <div class="pt-12 text-center text-12-mono uppercase tracking-widest text-text-weaker">
              {status() === "live" ? "continued..." : "fade out."}
            </div>
          </Show>
        </div>
      </div>

      {/* script footer */}
      <footer class="shrink-0 h-7 px-4 flex items-center justify-between gap-3 bg-background-stronger border-t border-border-weak-base text-12-mono text-text-weaker">
        <span class="flex items-center gap-2 min-w-0">
          <Show when={brand().logoUrl}>
            <img src={brand().logoUrl} alt="" class="h-3 rounded-sm" />
          </Show>
          <span class="truncate">
            {brand().wordmarkUrl ? "" : `${brand().name ? brand().name + " · " : ""}Open(code)Share`}
          </span>
          {brand().wordmarkUrl ? <img src={brand().wordmarkUrl} alt="" class="h-3.5" /> : null}
        </span>
        <span class="shrink-0">
          {searching() ? `${filtered().length}/${sections().length}` : sections().length} scenes · cinema
        </span>
      </footer>

      {/* settings drawer */}
      <Show when={drawer()}>
        <div
          class="fixed inset-0 z-40 bg-black/30"
          role="dialog"
          aria-label="settings"
          onClick={(e) => e.target === e.currentTarget && closeDrawer()}
        >
          <div
            class="absolute top-0 right-0 bottom-0 w-[19rem] max-w-[85vw] overflow-y-auto border-l border-border-weak-base bg-background-base shadow-xl p-4 [&_.osh-gear-settings]:hidden"
            style={{ animation: "osh-slide-in 180ms ease-out" }}
          >
            <div class="flex items-center justify-between pb-2">
              <span class="text-14-medium text-text-strong">Settings</span>
              <button
                class="bg-transparent border-none cursor-pointer text-icon-weaker-base hover:text-icon-strong-base p-1"
                onClick={closeDrawer}
              >
                <Icon name="close-small" size="small" />
              </button>
            </div>
            <SettingsBody
              settings={props.settings}
              update={props.updateSettings}
              branding={brand() as any}
              search={props.search}
              onSearch={props.onSearch}
            />
          </div>
        </div>
      </Show>
    </div>
  )
}

export const cinema: ViewEntry = {
  id: "cinema",
  label: "cinema",
  component: CinemaView,
}
