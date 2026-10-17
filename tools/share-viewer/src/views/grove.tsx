// GROVE: the growth-log skin over the shared base. Prompts are growth rings
// threaded on the trunk, tool calls are roots hanging in the left margin
// that feed the stem through hand-drawn arcs, reasoning rests beneath as
// quiet undergrowth, responses open as blooms. Typographic and restrained:
// design tokens only, soft curves, generous air.
import { Show, createSignal } from "solid-js"
import { DateTime } from "luxon"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { BaseSessionView, type Skin, type SkinWrappers } from "./base-view"
import { saveSettingsScroll, restoreSettingsScroll, SettingsBody } from "../settings-panel"
import type { ViewEntry } from "./registry"

const pad = (n: number) => String(n).padStart(2, "0")

// ------------------------------------------------------------- glyphs ----
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

function BloomGlyph(props: { class?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" class={props.class} aria-hidden="true">
      <circle cx="8" cy="8" r="1.5" stroke="currentColor" stroke-width="0.9" />
      <path d="M8 6.5 C 8 4.4 8.1 3.1 8.2 2.5 C 10.4 3.3 10.5 5.2 8 6.5 Z" stroke="currentColor" stroke-width="0.85" stroke-linejoin="round" />
      <path d="M9.5 8 C 11.6 8 12.9 8.1 13.5 8.2 C 12.7 10.4 10.8 10.5 9.5 8 Z" stroke="currentColor" stroke-width="0.85" stroke-linejoin="round" />
      <path d="M8 9.5 C 8 11.6 7.9 12.9 7.8 13.5 C 5.6 12.7 5.5 10.8 8 9.5 Z" stroke="currentColor" stroke-width="0.85" stroke-linejoin="round" />
      <path d="M6.5 8 C 4.4 8 3.1 7.9 2.5 7.8 C 3.3 5.6 5.2 5.5 6.5 8 Z" stroke="currentColor" stroke-width="0.85" stroke-linejoin="round" />
    </svg>
  )
}

// -------------------------------------------------------------- chrome ----
// the canopy: the grove name in a ring, the session title, and the growing
// facts (version, model, status) with settings dropping out of a pill.
function CanopyHeader(props: Parameters<NonNullable<SkinWrappers["Header"]>>[0]) {
  const [menuOpen, setMenuOpen] = createSignal(false)
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const live = () => props.status === "live"
  return (
    <>
      <header class="h-10 px-4 flex items-center justify-between gap-4 self-stretch bg-background-base border-b border-border-weak-base relative z-30">
        <div class="flex items-center gap-2 min-w-0">
          <Show when={props.isSub && props.onBack}>
            <button
              class="flex items-center gap-1 shrink-0 bg-transparent border-none cursor-pointer text-12-regular text-text-weaker hover:text-text-base transition-colors duration-150"
              onClick={() => props.onBack?.()}
            >
              <Icon name="arrow-left" size="small" />
              main
            </button>
          </Show>
          <RingGlyph class="w-4 h-4 shrink-0 text-icon-weaker-base" />
          <span class="text-14-medium text-text-strong truncate">{info()?.title ?? "session"}</span>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <span class="flex items-center gap-1.5 h-7 px-2 rounded-full border border-border-weak-base text-12-mono text-text-weaker">
            <Mark class="h-3 shrink-0" />
            <span class="text-text-base">v{info()?.version ?? "?"}</span>
          </span>
          <Show when={props.model}>
            <span class="hidden lg:inline text-12-mono text-text-weaker truncate max-w-48">{props.model}</span>
          </Show>
          <span class="flex items-center gap-1.5 h-7 px-2 rounded-full border border-border-weak-base text-12-regular text-text-weaker">
            <span
              classList={{
                "inline-block size-1.5 shrink-0 rounded-full": true,
                "status-dot animate-pulse": live(),
                "bg-icon-weak-base": !live(),
              }}
            />
            {props.status}
          </span>
          <button
            class="flex items-center gap-1 h-7 px-2.5 rounded-full border border-border-weak-base bg-background-stronger text-12-regular text-text-weaker hover:text-text-base hover:border-border-strong-base cursor-pointer transition-colors duration-150"
            onClick={() => setMenuOpen(!menuOpen())}
          >
            <span class="hidden sm:block">settings</span>
            <Icon name="chevron-down" size="small" classList={{ "rotate-180": menuOpen() }} />
          </button>
        </div>
      </header>

      <Show when={menuOpen()}>
        <div
          class="fixed top-10 right-4 z-[70] w-72 max-h-[calc(100vh-4rem)] overflow-y-auto p-4 rounded-xl border border-border-weak-base bg-background-base shadow-xl"
          onScroll={(e) => saveSettingsScroll(e.currentTarget)}
          ref={restoreSettingsScroll}
        >
          <SettingsBody
            settings={props.settings}
            update={props.updateSettings}
            branding={props.source.branding()}
            search={props.search}
            onSearch={props.onSearch}
          />
        </div>
      </Show>
    </>
  )
}

function GroveFooter(props: Parameters<NonNullable<SkinWrappers["Footer"]>>[0]) {
  const b = () => props.source.branding()
  return (
    <footer class="px-6 py-10 flex flex-col items-center gap-3 select-none">
      <div class="flex items-center gap-3 w-full">
        <div class="h-px flex-1 bg-border-weaker-base" />
        <RingGlyph class="w-4 h-4 text-icon-weaker-base opacity-70" />
        <div class="h-px flex-1 bg-border-weaker-base" />
      </div>
      <Show
        when={b().wordmarkUrl}
        fallback={
          <div class="text-12-mono text-text-weaker">
            <Show when={b().name}>
              <span class="text-text-base">{b().name}</span>
              <span> · </span>
            </Show>
            <span>Open(code)Share</span>
          </div>
        }
      >
        <img src={b().wordmarkUrl} alt="" class="h-4 opacity-70" />
      </Show>
    </footer>
  )
}

// ---------------------------------------------------------------- skin ----
export const groveSkin: Skin = {
  id: "grove",
  mode: "composed",
  columnClass: "osh-content mx-auto w-full max-w-[38rem] px-6 pt-10 pb-8 flex flex-col xl:max-w-[48rem] xl:pl-[12rem]",
  wrappers: {
    Header: CanopyHeader,
    Footer: GroveFooter,

    // the trunk: one hairline per turn, segments joined by padding so the
    // line reads as a single trunk running the length of the season.
    TurnWrap: (p) => (
      <div class="relative pl-7 border-l border-border-weaker-base py-8 first:py-0">
        <Show when={p.index === 0}>
          <div class="relative mb-7">
            <span class="absolute right-0 top-0 hidden sm:block text-icon-weaker-base opacity-20" aria-hidden="true">
              <RingGlyph class="w-14 h-14" />
            </span>
            <div class="text-12-mono uppercase tracking-widest text-text-weaker">
              grove
              <Show when={p.section.at}>
                {" · "}
                {DateTime.fromMillis(p.section.at!).toFormat("dd MMM yyyy")}
              </Show>
            </div>
          </div>
        </Show>
        {p.children}
      </div>
    ),

    // a ring threaded on the trunk, and the season label above the prompt
    PromptWrap: (p) => (
      <div class="relative mb-5">
        <span class="absolute -left-10 -top-1 text-icon-weaker-base" aria-hidden="true">
          <RingGlyph class="w-6 h-6" />
        </span>
        <div class="text-12-mono uppercase tracking-widest text-text-weaker">
          ring {pad(p.section.index + 1)}
          <Show when={p.section.at}>
            <span class="normal-case tracking-normal">
              {" · "}
              {DateTime.fromMillis(p.section.at!).toFormat("dd MMM, HH:mm")}
            </span>
          </Show>
        </div>
        <div class="mt-1.5">{p.children}</div>
      </div>
    ),

    // a root: the leaf and its hand-drawn arc hang in the left gutter and
    // the arc lands on the trunk; the vendored row and its output open
    // flush with the reading measure
    ToolWrap: (p) => (
      <div class="group/root flex flex-col min-w-0 my-0.5 xl:flex-row xl:items-start xl:-ml-40">
        <div class="hidden xl:flex items-start justify-end shrink-0 w-40">
          <span class="mt-1.5 shrink-0 text-icon-weaker-base opacity-70 transition-opacity duration-150 group-hover/root:opacity-100">
            <LeafGlyph class="w-3 h-3" />
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            class="w-6 h-6 shrink-0 text-border-strong-base opacity-70 transition-opacity duration-150 group-hover/root:opacity-100"
            aria-hidden="true"
          >
            <path d="M0 11 C 13 11 20 13 20 22" stroke="currentColor" stroke-width="1" />
          </svg>
        </div>
        <div class="min-w-0 mt-1.5 xl:mt-0 xl:pl-7 xl:flex-1">{p.children}</div>
      </div>
    ),

    // undergrowth: a quiet dashed layer beneath the bloom (skins.css
    // swaps the label for the grass mark and the word undergrowth)
    ReasoningWrap: (p) => <div class="grove-undergrowth">{p.children}</div>,

    // a bloom: the response opens off the stem in a soft petal of surface
    ResponseWrap: (p) => (
      <div class="grove-bloom relative my-6">
        <span class="absolute -left-9 top-3 hidden xl:block text-icon-weaker-base opacity-70" aria-hidden="true">
          <BloomGlyph class="w-3.5 h-3.5" />
        </span>
        <div class="rounded-[12px_18px_12px_20px] border border-border-weaker-base bg-surface-raised-base px-5 py-4">
          {p.children}
        </div>
      </div>
    ),
  },
}

export function GroveView(props: Parameters<ViewEntry["component"]>[0]) {
  return <BaseSessionView {...props} skin={groveSkin} />
}

export const grove: ViewEntry = {
  id: "grove",
  label: "grove",
  component: GroveView,
}