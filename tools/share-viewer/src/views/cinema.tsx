// CINEMA: the shooting-script skin over the shared base. The header is
// the production strip and title card, prompts open scenes under caps
// mono sluglines, tool calls are stage directions with the tool name as
// the parenthetical, reasoning is the writer's notes margin, responses
// are dialogue blocks credited to the cast. Continuous mode trades
// numbered sluglines for "cut to:" transitions. The base owns scroll,
// search, follow-live and the vendored tool pipeline; this file only
// arranges and decorates.
import { Show, createComputed, createSignal } from "solid-js"
import { Title } from "@solidjs/meta"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { BaseSessionView, type Skin, type SkinWrappers } from "./base-view"
import type { ViewEntry } from "./registry"
import { useSessionSections, type SessionSection } from "./session-data"
import { SettingsBody } from "../settings-panel"

type HeaderProps = Parameters<NonNullable<SkinWrappers["Header"]>>[0]
type FooterProps = Parameters<NonNullable<SkinWrappers["Footer"]>>[0]
type TurnProps = Parameters<NonNullable<SkinWrappers["TurnWrap"]>>[0]
type ToolProps = Parameters<NonNullable<SkinWrappers["ToolWrap"]>>[0]
type ResponseProps = Parameters<NonNullable<SkinWrappers["ResponseWrap"]>>[0]

// the script's presentation mode, tracked from the header (the only
// wrapper that sees settings) so the turns can restyle around it
const [flowing, setFlowing] = createSignal(false)
// the speaking part of the current scene, tracked from its turn
const [cast, setCast] = createSignal<SessionSection["model"]>(undefined)
// the title card, computed in the header (which sees data) and typeset
// above the first scene (presentation-only plumbing)
type Card = { title?: string; byline?: string; date?: string; scenes?: number }
const [card, setCard] = createSignal<Card>({})

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

// production strip and title card: back-to-main, the session title as
// the picture title, version, model and status as the production slug,
// settings in a drawer from the right
function CinemaHeader(props: HeaderProps) {
  const [drawer, setDrawer] = createSignal(false)
  const sections = useSessionSections(props.data, props.sessionID)
  createComputed(() => setFlowing(props.settings.continuous))
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const b = () => props.source.branding()
  createComputed(() => {
    const i = info()
    setCard({
      title: i?.title,
      byline: props.model || undefined,
      date: i?.time?.created
        ? new Date(i.time.created).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
        : undefined,
      scenes: sections().length,
    })
  })
  const slugClass = () =>
    props.status === "live"
      ? "text-icon-strong-base border-icon-strong-base"
      : props.status === "error"
        ? "text-icon-critical-base border-icon-critical-base"
        : "text-text-weaker border-border-strong-base"
  return (
    <>
      <Title>{info()?.title ?? "session"} | {b().name || "openshare"}</Title>
      <header class="shrink-0 px-4 py-2 flex items-center justify-between gap-3 bg-background-stronger border-b border-border-weak-base relative z-30">
        <div class="flex items-center gap-2.5 min-w-0">
          <Show when={props.isSub && props.onBack}>
            <button
              class="flex items-center gap-1 bg-transparent border-none cursor-pointer text-12-regular text-text-weaker hover:text-text-base shrink-0 transition-colors duration-150"
              onClick={() => props.onBack?.()}
            >
              <Icon name="arrow-left" size="small" />
              main
            </button>
          </Show>
          <Show when={b().logoUrl}>
            <a href={b().linkUrl ?? "#"} target="_blank" rel="noreferrer" class="shrink-0">
              <img src={b().logoUrl} alt="" class="h-4 rounded-sm" />
            </a>
          </Show>
          <div class="min-w-0">
            <div class="text-12-mono uppercase tracking-widest text-text-weaker">shooting script</div>
          </div>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="hidden sm:flex items-center gap-1.5 text-12-mono text-text-weaker">
            <Mark class="h-3" />
            v{info()?.version ?? "?"}
          </span>
          <Show when={props.model}>
            <span class="hidden md:inline text-12-mono text-text-weaker truncate max-w-48">{props.model}</span>
          </Show>
          <span
            class="text-12-mono uppercase tracking-widest border rounded px-1.5 py-0.5"
            classList={{ [slugClass()]: true }}
          >
            {props.status}
          </span>
          <button
            class="flex items-center gap-1.5 bg-transparent border border-border-weak-base rounded px-2 py-1 text-12-regular text-text-weaker hover:text-text-base hover:border-border-strong-base cursor-pointer transition-colors duration-150"
            onClick={() => setDrawer(true)}
          >
            <Icon name="settings-gear" size="small" />
            <span class="hidden sm:inline">settings</span>
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
      <Show when={drawer()}>
        <div
          class="fixed inset-0 z-40 bg-black/30"
          role="dialog"
          aria-label="settings"
          onClick={(e) => e.target === e.currentTarget && setDrawer(false)}
        >
          <div
            class="absolute top-0 right-0 bottom-0 w-[19rem] max-w-[85vw] overflow-y-auto border-l border-border-weak-base bg-background-base shadow-xl p-4"
            style={{ animation: "osh-slide-in 180ms ease-out" }}
          >
            <div class="flex items-center justify-between pb-2">
              <span class="text-14-medium text-text-strong">Settings</span>
              <button
                class="bg-transparent border-none cursor-pointer text-icon-weaker-base hover:text-icon-strong-base p-1"
                onClick={() => setDrawer(false)}
              >
                <Icon name="close-small" size="small" />
              </button>
            </div>
            <SettingsBody
              settings={props.settings}
              update={props.updateSettings}
              branding={b() as any}
              search={props.search}
              onSearch={props.onSearch}
            />
          </div>
        </div>
      </Show>
    </>
  )
}

// script footer: the fade line, the brand row, the scene count
function ScriptFooter(props: FooterProps) {
  const sections = useSessionSections(props.data, props.sessionID)
  const b = () => props.source.branding()
  return (
    <footer class="shrink-0 bg-background-stronger border-t border-border-weak-base">
      <Show when={sections().length > 0}>
        <div class="pt-3 text-center text-12-mono uppercase tracking-widest text-text-weaker">
          {props.source.status() === "live" ? "continued..." : "fade out."}
        </div>
      </Show>
      <div class="h-7 px-4 flex items-center justify-between gap-3 text-12-mono text-text-weaker">
        <span class="flex items-center gap-2 min-w-0">
          <Show when={b().logoUrl}>
            <img src={b().logoUrl} alt="" class="h-3 rounded-sm" />
          </Show>
          <span class="truncate">
            {b().wordmarkUrl ? "" : `${b().name ? b().name + " · " : ""}Open(code)Share`}
          </span>
          <Show when={b().wordmarkUrl}>
            <img src={b().wordmarkUrl} alt="" class="h-3.5" />
          </Show>
        </span>
        <span class="shrink-0">{sections().length} scenes · cinema</span>
      </div>
    </footer>
  )
}

// one scene: the title card and fade in above the first, cut to:
// transitions in flowing mode
const cardMeta = () => {
  const c = card()
  const parts: string[] = []
  if (c.byline) parts.push(`written by ${c.byline}`)
  if (c.date) parts.push(c.date)
  if (c.scenes != null) parts.push(`${c.scenes} scenes`)
  return parts.join(" · ")
}
function Scene(props: TurnProps) {
  createComputed(() => setCast(props.section.model))
  return (
    <section classList={{ "pt-3": flowing(), "pt-10": !flowing() }}>
      <Show when={props.index === 0}>
        <div class="pb-10 text-center">
          <div class="text-12-mono uppercase tracking-widest text-text-weaker">a session, typeset</div>
          <h1 class="mt-3 text-20-medium uppercase tracking-widest text-text-strong break-words">
            {card().title ?? "untitled session"}
          </h1>
          <Show when={cardMeta()}>
            <div class="mt-3 text-12-mono text-text-weaker">{cardMeta()}</div>
          </Show>
        </div>
        <div class="pb-4 text-center text-14-mono uppercase text-text-weaker">fade in:</div>
      </Show>
      <Show when={flowing()}>
        <div class="pb-3 text-center text-12-mono uppercase tracking-widest text-text-weaker">cut to:</div>
      </Show>
      {props.children}
    </section>
  )
}

export const cinemaSkin: Skin = {
  id: "cinema",
  mode: "composed",
  columnClass: "osh-content max-w-[48rem] mx-auto px-6 pt-10 pb-8",
  wrappers: {
    Header: CinemaHeader,
    Footer: ScriptFooter,
    TurnWrap: Scene,
    PromptWrap: (p) => (
      <div class="cinema-action">
        <h2 class="text-14-mono uppercase tracking-wide text-text-strong">
          <Show when={!flowing()}>
            <span class="text-text-weaker">Scene {p.section.index + 1}. </span>
          </Show>
          {slugline(p.section.prompt)}
        </h2>
        <div class="mt-3 pl-1 sm:pl-3">{p.children}</div>
      </div>
    ),
    ToolWrap: (p) => (
      <div class="my-1.5 pl-3 sm:pl-8">
        <div class="cinema-paren text-12-mono italic text-text-weaker">({p.entry.tool})</div>
        {p.children}
      </div>
    ),
    ReasoningWrap: (p) => <div class="my-1 pl-3 sm:pl-8 cinema-notes">{p.children}</div>,
    ResponseWrap: (p: ResponseProps) => (
      <div class="cinema-dialogue mt-4 pl-5 sm:pl-10">
        <div class="text-12-mono uppercase tracking-widest text-text-weaker">{castName(cast())}</div>
        <div class="mt-1.5 max-w-[40rem]">{p.children}</div>
      </div>
    ),
  },
}

export const cinema: ViewEntry = {
  id: "cinema",
  label: "cinema",
  component: (p) => <BaseSessionView {...p} skin={cinemaSkin} />,
}
