// reader: the editorial skin over the shared base - hover-TOC navigation,
// quiet section markers, continuous-leaning single column.
import { For, Show, createSignal } from "solid-js"
import { BaseSessionView } from "./views/base-view"
import type { Skin, SkinWrappers } from "./views/base-view"
import type { ViewEntry } from "./views/registry"
import { MetaLine } from "./views/meta-line"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { sessionModelLabel } from "./views/session-data"

function promptTitle(s: { prompt: string }) {
  return s.prompt.trim().split("\n")[0].slice(0, 60) || "(no prompt)"
}

function HoverToc(props: { sections: { id: string; prompt: string }[]; active: number; onSelect: (i: number) => void }) {
  return (
    <div class="w-48 flex flex-col gap-0.5">
      <div class="text-12-medium text-text-weaker tracking-[0.14em] uppercase mb-2 px-2">prompts</div>
      <For each={props.sections}>
        {(s, i) => (
          <button
            class="flex items-baseline gap-2 py-1 px-2 rounded-md text-left bg-transparent border-none cursor-pointer transition-colors duration-150"
            classList={{ "bg-surface-base": props.active === i() }}
            onClick={() => props.onSelect(i())}
          >
            <span class="text-12-mono shrink-0" classList={{ "text-text-strong": props.active === i(), "text-text-weaker": props.active !== i() }}>
              {String(i() + 1).padStart(2, "0")}
            </span>
            <span class="text-12-regular truncate" classList={{ "text-text-base": props.active === i(), "text-text-weaker": props.active !== i() }}>
              {promptTitle(s)}
            </span>
          </button>
        )}
      </For>
    </div>
  )
}

function ReaderHeader(props: Parameters<NonNullable<SkinWrappers["Header"]>>[0]) {
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  return (
    <header class="h-14 px-6 flex items-center justify-between self-stretch bg-background-base border-b border-border-weak-base relative z-30">
      <div class="flex items-center gap-3 min-w-0">
        <Show when={props.isSub && props.onBack}>
          <button
            class="flex items-center gap-1 text-12-regular text-text-weaker hover:text-text-base bg-transparent border-none cursor-pointer shrink-0"
            onClick={() => props.onBack?.()}
          >
            <Icon name="arrow-left" size="small" />
            main
          </button>
        </Show>
        <h1 class="text-16-medium text-text-strong truncate">{info()?.title ?? "session"}</h1>
      </div>
      <div class="flex items-center gap-2.5 shrink-0">
        <span class="flex items-center gap-1.5 bg-surface-strong px-2 py-0.5 rounded-md shadow-xs-border-base">
          <Mark class="w-3" />
          <span class="text-12-mono text-text-base">v{info()?.version ?? "?"}</span>
          <Show when={(info()?.model as any)?.providerID}>
            <ProviderIcon id={(info()?.model as any).providerID} class="w-3.5 text-icon-base" />
          </Show>
          <Show when={props.model}>
            <span class="text-12-mono text-text-base">{props.model}</span>
          </Show>
        </span>
        <span class="text-12-regular text-text-weaker">{props.status}</span>
      </div>
    </header>
  )
}

export const readerSkin: Skin = {
  id: "reader",
  mode: "composed",
  columnClass: "max-w-[46rem] mx-auto px-6 py-8 flex flex-col gap-10",
  wrappers: {
    Header: ReaderHeader,
    Nav: HoverToc as any,
    PromptWrap: (p) => (
      <div class="pt-4 border-t border-border-weak-base first:border-none first:pt-0">
        <div class="flex items-baseline gap-3 mb-1">
          <span class="text-12-mono text-text-weaker">§</span>
          {p.children}
        </div>
      </div>
    ),
  },
}

export function ReaderView(props: Parameters<ViewEntry["component"]>[0]) {
  return <BaseSessionView {...props} skin={readerSkin} />
}
