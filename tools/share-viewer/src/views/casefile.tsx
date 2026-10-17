// casefile: the investigation-dossier skin over the shared base. Prompts
// are MEMO blocks, tool calls are exhibit-numbered evidence rows, reasoning
// is an annotations block, responses are report prose. Chrome: a folder-tab
// header with a rotated status stamp, settings as an index-card drawer from
// the right, an archive-line footer.
import { Show, createSignal } from "solid-js"
import { BaseSessionView, type Skin, type SkinWrappers } from "./base-view"
import { SettingsBody } from "../settings-panel"
import type { ViewEntry } from "./registry"
import type { SessionSection } from "./session-data"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { DateTime } from "luxon"
import { Title } from "@solidjs/meta"

const pad = (n: number) => String(n + 1).padStart(2, "0")

const fileNo = (sessionID: string) =>
  (sessionID.replace(/^ses_/, "").slice(0, 8) || "00000000").toUpperCase()

function modelLabel(s: SessionSection) {
  if (s.model?.providerID && s.model?.modelID) return `${s.model.providerID}/${s.model.modelID}`
  return s.model?.modelID ?? ""
}

function filedLine(s: SessionSection) {
  const at = DateTime.fromMillis(s.at ?? Date.now()).toFormat("dd MMM yyyy HH:mm")
  const model = modelLabel(s)
  return model ? `${at} · ${model}` : at
}

function CasefileHeader(props: Parameters<NonNullable<SkinWrappers["Header"]>>[0]) {
  const [drawer, setDrawer] = createSignal(false)
  const info = () => (props.data.session as any[]).find((s) => s.id === props.sessionID)
  const stampColor = () =>
    props.status === "live"
      ? "text-icon-strong-base border-icon-strong-base"
      : props.status === "error"
        ? "text-icon-critical-base border-icon-critical-base"
        : "text-text-weaker border-border-strong-base"
  return (
    <>
      <Title>{info()?.title} | {props.source.branding().name || "openshare"}</Title>
      <header class="shrink-0 px-5 pt-3 bg-background-stronger border-b border-border-weak-base relative z-30">
        <div class="flex items-end justify-between gap-4">
          <div class="flex items-end gap-3 min-w-0">
            <Show when={props.isSub && props.onBack}>
              <button
                class="flex items-center gap-1 self-center bg-transparent border-none cursor-pointer text-12-regular text-text-weaker hover:text-text-base shrink-0 transition-colors duration-150"
                onClick={() => props.onBack?.()}
              >
                <Icon name="arrow-left" size="small" />
                main
              </button>
            </Show>
            <div class="px-3 py-1 rounded-t-lg border border-b-0 border-border-weak-base bg-background-base text-12-mono text-text-weaker">
              CASE {fileNo(props.sessionID)}
            </div>
            <h1 class="text-16-medium text-text-strong truncate pb-1">{info()?.title ?? "session"}</h1>
          </div>
          <div class="flex items-center gap-3 pb-1.5 shrink-0">
            <span class="text-12-mono text-text-weaker flex items-center gap-1.5">
              <Mark class="h-3" />
              v{info()?.version ?? "?"}
            </span>
            <span
              class="text-12-mono uppercase tracking-widest border rounded px-1.5 py-0.5 rotate-[-2deg]"
              classList={{ [stampColor()]: true }}
            >
              {props.status}
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
      <Show when={drawer()}>
        <div class="fixed inset-0 z-40" onClick={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <div
            class="absolute top-0 right-0 bottom-0 w-[19rem] max-w-[85vw] overflow-y-auto border-l border-border-weak-base bg-background-base shadow-xl p-4"
            style={{ animation: "osh-slide-in 180ms ease-out" }}
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
    </>
  )
}

function ArchiveLine(props: Parameters<NonNullable<SkinWrappers["Footer"]>>[0]) {
  const b = () => props.source.branding()
  return (
    <div class="shrink-0 px-6 py-3 border-t border-border-weak-base bg-background-base">
      <div class="max-w-[52rem] mx-auto flex items-center justify-between gap-4 text-12-mono text-text-weaker">
        <span class="flex items-center gap-2 min-w-0">
          <Show when={b().logoUrl}>
            <img src={b().logoUrl} alt="" class="h-4 rounded-sm" />
          </Show>
          <span class="truncate">
            {b().wordmarkUrl ? "" : `${b().name ? b().name + " · " : ""}Open(code)Share`}
          </span>
          <Show when={b().wordmarkUrl}>
            <img src={b().wordmarkUrl} alt="" class="h-3.5" />
          </Show>
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
  )
}

export const casefileSkin: Skin = {
  id: "casefile",
  mode: "composed",
  columnClass: "max-w-[52rem] mx-auto px-6 py-6",
  wrappers: {
    Header: CasefileHeader,
    Footer: ArchiveLine,
    TurnWrap: (p) => (
      <article class="py-7 border-b border-border-weak-base last:border-none">
        <Show when={p.index === 0}>
          <div class="text-12-mono text-text-weaker opacity-70 mb-6">FILED {filedLine(p.section)}</div>
        </Show>
        {p.children}
      </article>
    ),
    PromptWrap: (p) => (
      <div class="flex items-start gap-4 mb-3">
        <span class="shrink-0 text-12-mono text-text-weaker border border-border-weak-base rounded px-1.5 py-0.5">
          MEMO {pad(p.section.index)}
        </span>
        <div class="flex-1 min-w-0">{p.children}</div>
      </div>
    ),
    ToolWrap: (p) => (
      <div class="flex items-start gap-3 my-2">
        <span class="hidden sm:flex flex-col items-end gap-1 shrink-0 pt-1.5 w-20">
          <span class="text-12-mono text-text-weaker opacity-60">evidence</span>
          <span class="text-12-mono text-text-weaker border border-border-weak-base rounded px-1">E-{pad(p.index)}</span>
        </span>
        <div class="flex-1 min-w-0">{p.children}</div>
      </div>
    ),
    ReasoningWrap: (p) => (
      <div class="flex items-start gap-3 my-1">
        <span class="hidden sm:block text-12-mono text-text-weaker opacity-60 shrink-0 pt-1 w-20 text-right">annot.</span>
        <div class="flex-1 min-w-0">{p.children}</div>
      </div>
    ),
    ResponseWrap: (p) => <div class="report-prose">{p.children}</div>,
  },
}

export function CasefileView(props: Parameters<ViewEntry["component"]>[0]) {
  return <BaseSessionView {...props} skin={casefileSkin} />
}

export const casefile = {
  id: "casefile",
  label: "casefile",
  component: CasefileView,
}
