// BLUEPRINT VIEW: the session as an engineering drafting sheet. A fine
// token-only drafting grid carries the sheet; prompts are issued VIEW
// items with datum diamonds on a construction rail, reasoning is ANNOT
// margin notes, tool calls are globally numbered DETAIL boxes (chamfered
// corners, leader elbows off the rail), responses are the NOTES block.
// Metadata renders as dimension callouts; the footer is a title block
// (ISSUE / DRAWN BY / SHEET / SCALE). Chrome: a drafting strip header
// with the status stamp, and settings as a SHEET PARAMETERS drawer.
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import type { JSX } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { Markdown } from "../../vendor/session-ui/src/components/markdown"
import { DateTime } from "luxon"
import { Title } from "@solidjs/meta"
import type { ViewEntry, ViewProps } from "./registry"
import { useSessionSections, toolCallLabel, type SessionSection, type ToolEntry } from "./session-data"
import { SettingsBody } from "../settings-panel"
import type { OshSettings } from "../settings"

const pad = (n: number) => String(n + 1).padStart(2, "0")

const firstLine = (s: SessionSection) => s.prompt.split("\n")[0]?.slice(0, 90) || "(no prompt text)"

// hollow diamond elbow: leader line from the rail to a content block
function Elbow(props: { solid?: boolean; top?: string }) {
  return (
    <span
      class="pointer-events-none absolute right-full hidden sm:flex items-center w-9 pr-1"
      style={{ top: props.top ?? "16px" }}
      aria-hidden="true"
    >
      <span class={`h-px flex-1 ${props.solid ? "bg-border-base" : "bg-border-weak-base"}`} />
      <span
        class={`size-[5px] rotate-45 shrink-0 ${
          props.solid ? "bg-border-strong-base" : "border border-border-base bg-background-base"
        }`}
      />
    </span>
  )
}

function Detail(props: { tool: ToolEntry; no: string; settings: OshSettings }) {
  const [open, setOpen] = createSignal(props.settings.toolOutput)
  const hasOutput = () => !!props.tool.output
  return (
    <div class="relative my-2">
      <Elbow solid top="15px" />
      <div
        classList={{
          "bp-cut bg-border-weak-base transition-colors duration-150": true,
          "hover:bg-border-strong-base": hasOutput(),
        }}
      >
        <div class="bp-cut-in bg-background-base">
          <button
            class="flex items-center gap-2.5 w-full px-3 py-2 bg-transparent border-none text-left"
            classList={{ "cursor-pointer": hasOutput(), "cursor-default": !hasOutput() }}
            onClick={() => hasOutput() && setOpen(!open())}
          >
            <span class="text-12-mono text-text-strong shrink-0 border-r border-border-weak-base pr-2.5">
              D-{props.no}
            </span>
            <span class="text-12-mono uppercase tracking-wider text-text-weaker shrink-0">
              {props.tool.tool}
            </span>
            <Show when={props.settings.toolInfo}>
              <span class="text-12-regular text-text-base truncate flex-1 min-w-0">
                {toolCallLabel(props.tool)}
              </span>
            </Show>
            <Show when={hasOutput()}>
              <span class="text-icon-weaker-base shrink-0">
                <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
              </span>
            </Show>
          </button>
          <Show when={open() && props.tool.output}>
            <pre class="m-0 px-3 py-2.5 max-h-72 overflow-auto border-t border-border-weak-base bg-surface-inset-base text-12-mono text-text-weaker whitespace-pre-wrap break-words">
              {props.tool.output}
            </pre>
          </Show>
        </div>
      </div>
    </div>
  )
}

function Annotation(props: { text: string; settings: OshSettings }) {
  const [open, setOpen] = createSignal(props.settings.reasoningOpen)
  return (
    <div class="relative my-1.5">
      <Elbow top="9px" />
      <button
        class="flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-12-mono uppercase tracking-widest text-text-weaker hover:text-text-base transition-colors duration-150 p-0"
        onClick={() => setOpen(!open())}
      >
        <span class="text-icon-weaker-base">
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        </span>
        annot.
      </button>
      <Show when={open()}>
        <div class="mt-1 pl-3 border-l border-dashed border-border-weak-base text-12-regular italic text-text-weaker osh-content [&_p]:my-1">
          <Markdown text={props.text} />
        </div>
      </Show>
    </div>
  )
}

function Notes(props: { text: string }) {
  return (
    <div class="relative mt-4">
      <Elbow top="9px" />
      <div class="flex items-center gap-3 mb-2">
        <span class="text-12-mono uppercase tracking-widest text-text-weaker">notes</span>
        <span class="flex-1 h-px bg-border-weak-base" />
      </div>
      <div class="text-14-regular text-text-base osh-content [&_p]:my-2">
        <Markdown text={props.text} />
      </div>
    </div>
  )
}

function Sheet(props: { section: SessionSection; continuous: boolean; settings: OshSettings; detailNo: (sectionIndex: number, toolIndex: number) => string }) {
  const s = props.section
  return (
    <article
      data-bp-id={s.id}
      class="relative scroll-mt-16"
      classList={{
        "sm:pl-9": true,
        "border-t border-border-weak-base mt-8 pt-8 first:mt-0 first:pt-0 first:border-t-0": !props.continuous,
        "mt-7 first:mt-0": props.continuous,
      }}
    >
      <span class="hidden sm:block absolute left-0 top-0 bottom-0 w-px bg-border-weak-base" aria-hidden="true" />
      <span
        class="hidden sm:block absolute -left-1 top-2 size-2 rotate-45 border border-border-strong-base bg-background-base"
        aria-hidden="true"
      />
      <div class="flex items-start gap-3">
        <Show
          when={!props.continuous}
          fallback={<span class="mt-2 size-1.5 bg-border-strong-base shrink-0" aria-hidden="true" />}
        >
          <span class="shrink-0 text-12-mono text-text-strong border border-border-base px-1.5 py-0.5">
            V-{pad(s.index)}
          </span>
        </Show>
        <p class="flex-1 min-w-0 text-16-medium text-text-strong whitespace-pre-wrap osh-content">
          {s.prompt || "(no prompt text)"}
        </p>
      </div>
      <For each={s.ordered}>
        {(e, i) => (
          <Show
            when={e.kind !== "reasoning"}
            fallback={<Annotation text={(e as any).text} settings={props.settings} />}
          >
            <Detail tool={e as any} no={props.detailNo(s.index, s.ordered.filter((x) => x.kind === "tool").indexOf(e as any))} settings={props.settings} />
          </Show>
        )}
      </For>
      <Show when={s.response}>
        <Notes text={s.response} />
      </Show>
    </article>
  )
}

function TitleBlockCell(props: { label: string; children: JSX.Element; span?: boolean }) {
  return (
    <div class="bg-background-base px-3 py-2 min-w-0" classList={{ "sm:col-span-2": props.span }}>
      <div class="text-12-mono uppercase tracking-widest text-text-weaker">{props.label}</div>
      <div class="text-12-mono text-text-base truncate">{props.children}</div>
    </div>
  )
}

export function BlueprintView(props: ViewProps) {
  const info = createMemo(() => props.data.session.find((s: any) => s.id === props.sessionID))
  const sections = useSessionSections(props.data, props.sessionID)
  const [drawer, setDrawer] = createSignal(false)

  const filtered = createMemo(() => {
    const q = props.search.trim().toLowerCase()
    if (!q) return sections()
    return sections().filter(
      (s) => s.prompt.toLowerCase().includes(q) || s.response.toLowerCase().includes(q),
    )
  })
  const searching = createMemo(() => props.search.trim().length > 0)

  // global running D-NN numbering for tool details across the whole sheet
  const detailNo = createMemo(() => {
    const prefixes = new Map<number, number>()
    let run = 0
    for (const s of sections()) {
      prefixes.set(s.index, run)
      run += s.tools.length
    }
    return (sectionIndex: number, toolIndex: number) =>
      String((prefixes.get(sectionIndex) ?? 0) + toolIndex + 1).padStart(2, "0")
  })

  // follow-live: stick to the bottom only when the reader already is
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
  const stampClass = () =>
    status() === "live"
      ? "border-icon-success-base text-icon-success-base"
      : status() === "error"
        ? "border-icon-critical-base text-icon-critical-base"
        : "border-border-strong-base text-text-weaker"

  const dwgNo = () => (props.sessionID.replace(/^ses_/, "").slice(0, 8) || "00000000").toUpperCase()
  const issued = () => DateTime.fromMillis(info()?.time?.created ?? Date.now()).toFormat("dd MMM yyyy HH:mm")
  const drawnBy = () => {
    const m = (info()?.model as any) ?? sections()[0]?.model
    if (!m?.providerID && !m?.modelID) return "n/a"
    return `${m.providerID ?? "?"}/${m.modelID ?? "?"}`
  }

  const scrollTo = (id: string) => {
    scrollEl?.querySelector(`[data-bp-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div class="flex flex-col flex-1 min-h-0 relative z-10">
      <style>{`
        .bp-grid {
          background-image:
            linear-gradient(to right, color-mix(in oklab, var(--border-weak-base) 85%, transparent) 1px, transparent 1px),
            linear-gradient(to bottom, color-mix(in oklab, var(--border-weak-base) 85%, transparent) 1px, transparent 1px),
            linear-gradient(to right, color-mix(in oklab, var(--border-weak-base) 45%, transparent) 1px, transparent 1px),
            linear-gradient(to bottom, color-mix(in oklab, var(--border-weak-base) 45%, transparent) 1px, transparent 1px);
          background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px;
        }
        .bp-cut, .bp-cut-in {
          clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%);
        }
        .bp-dim {
          position: relative;
          height: 1px;
          background: var(--border-strong-base);
        }
        .bp-dim::before, .bp-dim::after {
          content: "";
          position: absolute;
          top: 50%;
          margin-top: -4px;
          border-top: 4px solid transparent;
          border-bottom: 4px solid transparent;
        }
        .bp-dim::before { left: 0; border-left: 7px solid var(--border-strong-base); }
        .bp-dim::after { right: 0; border-right: 7px solid var(--border-strong-base); }
      `}</style>
      <Title>{info()?.title ?? "session"} | {props.source.branding().name || "openshare"}</Title>

      {/* drafting strip header */}
      <header class="shrink-0 flex items-center gap-3 h-11 px-4 bg-background-stronger border-b border-border-base">
        <Show when={props.source.branding().logoUrl}>
          <a href={props.source.branding().linkUrl || "#"} class="shrink-0 flex items-center">
            <img src={props.source.branding().logoUrl} alt="" class="h-4 w-auto" />
          </a>
        </Show>
        <span class="hidden sm:inline text-12-mono text-text-weaker shrink-0">DWG {dwgNo()}</span>
        <span class="hidden sm:block h-4 w-px bg-border-weak-base shrink-0" />
        <h1 class="min-w-0 flex-1 truncate text-14-medium text-text-strong">{info()?.title ?? "session"}</h1>
        <div class="relative hidden md:block w-40 shrink-0">
          <span class="absolute left-2 top-1/2 -translate-y-1/2 text-icon-weaker-base pointer-events-none">
            <Icon name="magnifying-glass" size="small" />
          </span>
          <input
            class="w-full box-border pl-7 pr-2 py-1 bg-transparent border border-border-weak-base text-12-mono text-text-base placeholder:text-text-weaker outline-none focus:border-icon-strong-base transition-colors duration-150"
            placeholder="LOCATE"
            value={props.search}
            onInput={(e) => props.onSearch(e.currentTarget.value)}
          />
        </div>
        <a
          href="https://github.com/Mirrowel/Mirrobot-agent"
          target="_blank"
          rel="noreferrer"
          class="shrink-0 text-icon-weaker-base hover:text-icon-strong-base"
        >
          <Icon name="github" size="small" />
        </a>
        <span class="hidden sm:flex items-center gap-1.5 text-12-mono text-text-weaker shrink-0">
          <Mark class="h-3" />
          v{info()?.version}
        </span>
        <span
          class={`flex items-center gap-1.5 border px-1.5 py-0.5 text-12-mono uppercase tracking-widest shrink-0 ${stampClass()}`}
        >
          <Show when={status() === "live"}>
            <span class="size-1.5 rounded-full bg-icon-success-base animate-pulse" aria-hidden="true" />
          </Show>
          {status()}
        </span>
        <button
          class="flex items-center gap-1.5 shrink-0 bg-transparent border border-border-weak-base px-2 py-1 text-12-mono uppercase tracking-wider text-text-weaker hover:text-text-base hover:border-border-strong-base cursor-pointer transition-colors duration-150"
          onClick={() => setDrawer(true)}
        >
          <Icon name="settings-gear" size="small" />
          <span class="hidden sm:inline">params</span>
        </button>
      </header>

      {/* the sheet */}
      <div ref={scrollEl} onScroll={onScroll} class="flex-1 min-h-0 overflow-y-auto no-scrollbar bp-grid">
        <div class="max-w-[56rem] mx-auto px-3 sm:px-6 py-6">
          <div class="relative border border-border-base px-4 sm:px-8 pt-8 pb-0">
            {/* registration ticks */}
            <span class="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-border-strong-base" aria-hidden="true" />
            <span class="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-border-strong-base" aria-hidden="true" />
            <span class="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-border-strong-base" aria-hidden="true" />
            <span class="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-border-strong-base" aria-hidden="true" />

            {/* title + dimension callouts */}
            <div class="text-12-mono uppercase tracking-widest text-text-weaker">project</div>
            <h2 class="mt-1 text-20-medium text-text-strong break-words">{info()?.title ?? "session"}</h2>
            <div class="relative my-6 h-8" aria-hidden="true">
              <div class="bp-dim absolute inset-x-0 top-1/2 -translate-y-1/2" />
              <span class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background-base px-3 text-12-mono uppercase tracking-widest text-text-weaker whitespace-nowrap">
                issue {issued()}
              </span>
            </div>
            <div class="flex flex-wrap gap-x-5 gap-y-1 text-12-mono uppercase tracking-wider text-text-weaker -mt-2 mb-8">
              <span>drawn by {drawnBy()}</span>
              <span>dwg no. {dwgNo()}</span>
              <span>rev v{info()?.version ?? "?"}</span>
            </div>

            {/* bill of materials: the sheet nav, dropped in continuous flow */}
            <Show when={!props.settings.continuous && sections().length > 0}>
              <div class="border border-border-weak-base bg-background-base">
                <div class="flex items-center justify-between gap-3 px-3 py-2 border-b border-border-weak-base bg-background-stronger">
                  <span class="text-12-mono uppercase tracking-widest text-text-weaker">bill of materials</span>
                  <span class="text-12-mono text-text-weaker">
                    {filtered().length} of {sections().length}
                  </span>
                </div>
                <div class="max-h-56 overflow-y-auto">
                  <For each={filtered()}>
                    {(s) => (
                      <button
                        class="grid grid-cols-[2.75rem_1fr_4rem] items-baseline gap-2 w-full px-3 py-1.5 text-left bg-transparent border-none first:border-t-0 border-t border-border-weak-base hover:bg-surface-base-hover cursor-pointer transition-colors duration-150"
                        onClick={() => scrollTo(s.id)}
                      >
                        <span class="text-12-mono text-text-strong">{pad(s.index)}</span>
                        <span class="text-12-regular text-text-base truncate">{firstLine(s)}</span>
                        <span class="text-12-mono text-text-weaker text-right">
                          {s.tools.length > 0 ? `D:${s.tools.length}` : "-"}
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* the issued views */}
            <Show
              when={sections().length > 0}
              fallback={
                <div class="border border-dashed border-border-strong-base px-4 py-12 text-center">
                  <div class="text-12-mono uppercase tracking-widest text-text-weaker">sheet empty</div>
                  <div class="text-14-regular text-text-weaker mt-1">no issued prompts on this drawing yet.</div>
                </div>
              }
            >
              <Show
                when={filtered().length > 0}
                fallback={
                  <div class="mt-8 border border-dashed border-border-strong-base px-4 py-10 text-center">
                    <div class="text-12-mono uppercase tracking-widest text-text-weaker">no match</div>
                    <div class="text-14-regular text-text-weaker mt-1">locate returned no items on this sheet.</div>
                    <button
                      class="mt-3 bg-transparent border border-border-weak-base px-3 py-1 text-12-mono uppercase tracking-wider text-text-weaker hover:text-text-base hover:border-border-strong-base cursor-pointer transition-colors duration-150"
                      onClick={() => props.onSearch("")}
                    >
                      clear locate
                    </button>
                  </div>
                }
              >
                <div class="pt-8">
                  <For each={filtered()}>
                    {(s) => (
                      <Sheet
                        section={s}
                        continuous={props.settings.continuous}
                        settings={props.settings}
                        detailNo={detailNo()}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </Show>

            {/* title block */}
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-px bg-border-weak-base border-t border-border-base -mx-4 sm:-mx-8 mt-10">
              <TitleBlockCell label="title" span>
                <span class="flex items-center gap-2 min-w-0">
                  <Show when={props.source.branding().logoUrl}>
                    <img src={props.source.branding().logoUrl} alt="" class="h-3.5 rounded-sm shrink-0" />
                  </Show>
                  <Show
                    when={props.source.branding().wordmarkUrl}
                    fallback={
                      <span class="truncate">
                        {props.source.branding().name ? props.source.branding().name + " · " : ""}Open(code)Share
                      </span>
                    }
                  >
                    <img src={props.source.branding().wordmarkUrl} alt="" class="h-3.5" />
                  </Show>
                </span>
              </TitleBlockCell>
              <TitleBlockCell label="issue">{issued()}</TitleBlockCell>
              <TitleBlockCell label="drawn by">{drawnBy()}</TitleBlockCell>
              <TitleBlockCell label="sheet">
                {sections().length} sht · scale nts
              </TitleBlockCell>
            </div>
          </div>
        </div>
      </div>

      {/* sheet parameters drawer */}
      <Show when={drawer()}>
        <div
          class="fixed inset-0 z-40"
          onClick={(e) => e.target === e.currentTarget && setDrawer(false)}
        >
          <div
            class="absolute top-0 right-0 bottom-0 w-[19rem] max-w-[85vw] overflow-y-auto border-l border-border-base bg-background-base p-4"
            style={{ animation: "osh-slide-in 180ms ease-out" }}
          >
            <div class="flex items-center justify-between pb-2 border-b border-border-weak-base">
              <span class="text-12-mono uppercase tracking-widest text-text-weaker">sheet parameters</span>
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

export const blueprint: ViewEntry = {
  id: "blueprint",
  label: "blueprint",
  component: BlueprintView,
}
