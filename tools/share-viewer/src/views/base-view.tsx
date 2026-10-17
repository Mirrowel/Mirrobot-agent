// The shared base every view rides. ONE logic source: the same components
// classic uses (the vendored tool pipeline via VendoredPart, the reasoning
// block, MetaLine, the review column, the nav) with per-view SKINS that
// only arrange and restyle them. Skins may override pieces (discouraged
// but possible); they never reimplement data handling.
//
// Two content modes:
//  - "pipeline": the vendored SessionTurn renders a turn (maximum classic
//    fidelity - grouping, diffs, todos, everything)
//  - "composed": the base lays out prompt / ordered entries / response
//    itself from the shared section model, skin wrappers around each
//    element kind (current experimental views map here)
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, onMount, type Component, type JSX } from "solid-js"
import { Markdown } from "../../vendor/session-ui/src/components/markdown"
import { MetaLine } from "./meta-line"
import { VendoredPart } from "./vendored-part"
import { useSessionSections, type SessionSection, type ToolEntry, type ReasoningEntry, type TextEntry } from "./session-data"
import type { ViewProps } from "./registry"
import type { OshSettings } from "../settings"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { sessionModelLabel } from "./session-data"

// ---------------------------------------------------------------- skin ----
export type SkinWrappers = {
  TurnWrap?: Component<{ section: SessionSection; index: number; children: JSX.Element }>
  PromptWrap?: Component<{ section: SessionSection; children: JSX.Element }>
  ToolWrap?: Component<{ entry: ToolEntry; index: number; children: JSX.Element }>
  ReasoningWrap?: Component<{ entry: ReasoningEntry; children: JSX.Element }>
  ResponseWrap?: Component<{ text: string; children: JSX.Element }>
  Header?: Component<ViewProps & { model: string; status: string; onBack?: () => void; isSub: boolean }>
  Footer?: Component<ViewProps>
  Nav?: Component<{
    sections: SessionSection[]
    active: number
    onSelect: (i: number) => void
  }>
}

export type Skin = {
  id: string
  mode: "pipeline" | "composed"
  wrappers: SkinWrappers
  // content column class (layout identity)
  columnClass?: string
  // render the review column (diffs) - on for pipeline skins, skins opt in
  review?: boolean
}

const Identity = (props: { children: JSX.Element }) => <>{props.children}</>

function wrappersOf(skin: Skin): Required<SkinWrappers> {
  return {
    TurnWrap: skin.wrappers.TurnWrap ?? Identity,
    PromptWrap: skin.wrappers.PromptWrap ?? Identity,
    ToolWrap: skin.wrappers.ToolWrap ?? Identity,
    ReasoningWrap: skin.wrappers.ReasoningWrap ?? Identity,
    ResponseWrap: skin.wrappers.ResponseWrap ?? Identity,
    Header: skin.wrappers.Header ?? DefaultHeader,
    Footer: skin.wrappers.Footer ?? DefaultFooter,
    Nav: skin.wrappers.Nav,
  }
}

// -------------------------------------------------------------- pieces ----
export function DefaultHeader(props: ViewProps & { model: string; status: string; onBack?: () => void; isSub: boolean }) {
  return (
    <header class="h-9 px-4 flex items-center justify-between self-stretch bg-background-base border-b border-border-weak-base relative z-30">
      <div class="flex items-center gap-2 min-w-0">
        <Show when={props.isSub && props.onBack}>
          <button
            class="flex items-center gap-1 text-12-regular text-text-weaker hover:text-text-base bg-transparent border-none cursor-pointer"
            onClick={() => props.onBack?.()}
          >
            <Icon name="arrow-left" size="small" />
            main
          </button>
        </Show>
        <span class="text-13-medium text-text-strong truncate">{props.source.data().session.find((s: any) => s.id === props.sessionID)?.title ?? "session"}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1.5 text-12-mono text-text-weaker">
          <Mark class="w-3" />
          <span>v{props.source.data().session.find((s: any) => s.id === props.sessionID)?.version ?? "?"}</span>
        </span>
        <Show when={props.model}>
          <span class="text-12-mono text-text-weaker truncate max-w-48">{props.model}</span>
        </Show>
        <span class="text-12-regular text-text-weaker">{props.status}</span>
      </div>
    </header>
  )
}

export function DefaultFooter(props: ViewProps) {
  return (
    <div class="px-6 py-6 text-center text-12-mono text-text-weaker select-none">
      {(props.source.branding().name ? props.source.branding().name + " · " : "") + "Open(code)Share"}
    </div>
  )
}

export function ReasoningBlock(props: { text: string; settings: OshSettings }) {
  return (
    <details class="reasoning-collapse group my-1" open={props.settings.reasoningOpen || undefined}>
      <summary class="flex items-center gap-2 cursor-pointer list-none select-none py-1">
        <span class="flex items-center gap-1.5 text-12-medium text-text-weaker group-hover:text-text-base transition-colors duration-150">
          <Icon name="brain" size="small" />
          thinking
        </span>
      </summary>
      <div class="ml-1 border-l-2 border-border-weak-base pl-3 my-1 text-13-regular text-text-weaker">
        <Markdown text={props.text} />
      </div>
    </details>
  )
}

// ---------------------------------------------------------------- base ----
export function BaseSessionView(props: ViewProps & { skin: Skin }) {
  const w = wrappersOf(props.skin)
  const sections = useSessionSections(props.data, props.sessionID)
  const [active, setActive] = createSignal(0)
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const model = () => sessionModelLabel(props.data, props.sessionID)
  const continuous = () => props.settings.continuous

  // search filter
  const q = () => props.search.trim().toLowerCase()
  const visible = createMemo(() => {
    if (!q()) return sections()
    return sections().filter(
      (s) => s.prompt.toLowerCase().includes(q()) || s.response.toLowerCase().includes(q()),
    )
  })

  // follow-live (bottom-anchored only)
  let scroller!: HTMLDivElement
  createEffect(() => {
    void props.source.rev()
    if (!props.settings.followLive || props.source.status() !== "live") return
    const el = scroller
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottom) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }))
  })

  const back = () => {
    window.history.pushState({}, "", `/s/${props.source.shareID}`)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
  const isSub = () => {
    const parts = location.pathname.split("/").filter(Boolean)
    const i = parts.indexOf("s")
    return i >= 0 && parts[i + 2] && /^\d+$/.test(parts[i + 2])
  }

  const TurnBody = (p: { section: SessionSection; index: number }) => (
    <w.TurnWrap section={p.section} index={p.index}>
      <w.PromptWrap section={p.section}>
        <div class="py-2">
          <p class="text-14-medium text-text-strong whitespace-pre-wrap break-words">{p.section.prompt}</p>
          <MetaLine section={p.section} data={props.data} />
        </div>
      </w.PromptWrap>
      <For each={p.section.ordered}>
        {(e) => (
          <Show
            when={e.kind !== "reasoning"}
            fallback={
              <w.ReasoningWrap entry={e as ReasoningEntry}>
                <ReasoningBlock text={(e as ReasoningEntry).text} settings={props.settings} />
              </w.ReasoningWrap>
            }
          >
            <Show
              when={e.kind !== "text"}
              fallback={
                <w.ResponseWrap text={(e as TextEntry).text}>
                  <div class="text-14-regular text-text-base my-2 osh-content">
                    <Markdown text={(e as TextEntry).text} />
                  </div>
                </w.ResponseWrap>
              }
            >
              <w.ToolWrap entry={e as ToolEntry} index={p.section.ordered.slice(0, p.section.ordered.indexOf(e)).filter((x) => x.kind === "tool").length}>
                <VendoredPart entry={e as ToolEntry} settings={props.settings} />
              </w.ToolWrap>
            </Show>
          </Show>
        )}
      </For>
    </w.TurnWrap>
  )

  return (
    <div data-view={props.skin.id} class="flex flex-col h-screen w-full bg-background-base text-text-base">
      <w.Header {...props} model={model()} status={props.source.status()} onBack={back} isSub={isSub()} />
      <div class="flex flex-1 min-h-0">
        <Show when={w.Nav && !continuous()}>
          <nav class="shrink-0 py-3 pl-3 pr-1 overflow-y-auto no-scrollbar">
            {(() => {
              const NavSkin = w.Nav!
              return <NavSkin sections={visible()} active={active()} onSelect={setActive} />
            })()}
          </nav>
        </Show>
        <div ref={scroller} class="flex-1 min-w-0 overflow-y-auto">
          <div class={props.skin.columnClass ?? "max-w-3xl mx-auto px-6 py-6 flex flex-col gap-8"}>
            <For each={visible()}>
              {(s, i) => (
                <Show when={continuous() || !w.Nav} fallback={<Show when={active() === i()}><TurnBody section={s} index={i()} /></Show>}>
                  <TurnBody section={s} index={i()} />
                </Show>
              )}
            </For>
            <Show when={visible().length === 0}>
              <div class="text-13-regular text-text-weaker py-10 text-center">no prompts match the search</div>
            </Show>
          </div>
        </div>
      </div>
      <w.Footer {...props} />
    </div>
  )
}
