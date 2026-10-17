// The upstream share page ([shareID].tsx), client-only: identical layout
// and rendering stack (SessionTurn / SessionReview / MessageNav over the
// DataProvider fold), with the solid-start/server pieces replaced by the
// local data source (live worker WS or embedded local snapshot).
//
// Identity model (deliberate):
//   left header    — the DEPLOYMENT (brand logo; links to its git if set)
//   right header   — Open(code)Share itself: github mark -> repo (fixed in
//                    source, not configurable; the product promotes itself)
//   version badge  — the TOOL THAT RAN (opencode Mark + version; other
//                    agents get their own mark later)
//   footer         — brand wordmark image or styled text ("Open(code)Share"
//                    by default)
//
// Viewer settings (cookie, gear panel): theme (system/light/dark +
// mirrobot/midnight/sepia/nord premades), continuous mode (one scroll,
// no per-prompt selector), follow-live scroll (only when already at the
// bottom), text size, default diff style, background-image toggle,
// reasoning expand-all. Header extras: session search (Ctrl+K), copy
// session as markdown, j/k prompt navigation.
import { SessionTurn } from "@opencode-ai/session-ui/session-turn"
import { SessionReview } from "@opencode-ai/session-ui/session-review"
import { DataProvider } from "@opencode-ai/session-ui/context"
import { FileComponentProvider } from "@opencode-ai/ui/context/file"
import { WorkerPoolProvider } from "@opencode-ai/ui/context/worker-pool"
import { getWorkerPools } from "@opencode-ai/session-ui/pierre/worker"
import { MessageNav } from "@opencode-ai/session-ui/message-nav"
import { FileSSR } from "@opencode-ai/session-ui/file-ssr"
import { Logo, Mark } from "@opencode-ai/ui/logo"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Tabs } from "@opencode-ai/ui/tabs"
import { iife } from "@opencode-ai/core/util/iife"
import { DateTime } from "luxon"
import { Title } from "@solidjs/meta"
import { Icon } from "@opencode-ai/ui/icon"
import { createEffect, createMemo, createSignal, ErrorBoundary, For, Match, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useShareSource, type Branding } from "./data-source"
import { SettingsPanel, togglePanel } from "./settings-panel"
import { ReaderView } from "./reader"
import { InfoPanel } from "./views/info-panel"
import { findView, resolveSessionID } from "./views/registry"
import { setVendoredData } from "./views/vendored-part"
import { setToolGrouping } from "../vendor/session-ui/src/components/message-part"

// full-page views (everything except classic/reader, which live in the
// standard chrome) render INSTEAD of SessionView
function FullPageView(props: {
  source: ReturnType<typeof useShareSource>
  settings: OshSettings
  updateSettings: (patch: Partial<OshSettings>) => void
  search: string
  onSearch: (v: string) => void
  sub: () => number | undefined
}) {
  const view = createMemo(() => findView(props.settings.view))
  const sessionID = createMemo(() => resolveSessionID(props.source.data(), props.sub()))
  setVendoredData(props.source.data(), {
    sessionHref: (id) => subHref(props.source, id),
    navigateToSession: (id) => {
      const href = subHref(props.source, id)
      if (!href) return
      if (props.source.prefs().openTasksInNewTab !== false) {
        window.open(href, "_blank")
      } else {
        scrollMemory.set(location.pathname, window.scrollY)
        window.history.pushState({}, "", href)
        window.dispatchEvent(new PopStateEvent("popstate"))
      }
    },
  })
  return (
    <>
      <Show when={view()} keyed>
        {(entry) =>
          entry.component({
            get data() {
              return props.source.data()
            },
            get sessionID() {
              return sessionID()
            },
            source: props.source,
            get settings() {
              return props.settings
            },
            updateSettings: props.updateSettings,
            get search() {
              return props.search
            },
            onSearch: props.onSearch,
          })
        }
      </Show>
    </>
  )
}
import { children, visibleMessages, type ShareData } from "./fold"
import { applySettings, readSettings, writeSettings, type OshSettings } from "./settings"

// scroll memory for in-page session switching: restore on return
const scrollMemory = new Map<string, number>()

// the product's own repo (fixed in source — the right header always
// promotes Open(code)Share; flip on extraction)
const OPENSHARE_REPO_URL = "https://github.com/Mirrowel/Mirrobot-agent"

// Brand-aware mark: configured image or the vendored default
function BrandMark(props: { branding: Branding; class?: string }) {
  return (
    <Show when={props.branding.logoUrl} fallback={null}>
      <img src={props.branding.logoUrl} alt="" class={props.class} />
    </Show>
  )
}

// Page footer: thin rule + brand name + product wordmark (theme tokens so
// it reads on every theme; wordmark image overrides the text)
export function PageFooter(props: { branding: Branding; class?: string }) {
  return (
    <div class={`flex flex-col items-center gap-2 w-full ${props.class ?? ""}`}>
      <div class="w-full max-w-[52rem] border-t border-border-weak-base" />
      <Show
        when={props.branding.wordmarkUrl}
        fallback={
          <div class="text-12-mono text-text-base select-none">
            <Show when={props.branding.name}>
              <span class="text-text-strong">{props.branding.name}</span>
              <span class="text-text-weaker"> · </span>
            </Show>
            <span>Open(code)Share</span>
          </div>
        }
      >
        <img src={props.branding.wordmarkUrl} alt="" class="w-58.5 opacity-60" />
      </Show>
    </div>
  )
}

function applyDocumentBranding(b: Branding) {
  const name = b.name || "openshare"
  if (!document.title.includes(" | ")) document.title = `${document.title} | ${name}`
  let icon = document.querySelector<HTMLLinkElement>("link[rel='icon']")
  if (b.faviconUrl) {
    if (!icon) {
      icon = document.createElement("link")
      icon.rel = "icon"
      document.head.appendChild(icon)
    }
    icon.href = b.faviconUrl
  }
  if (b.accent) document.documentElement.style.setProperty("--openshare-accent", b.accent)
}

function NotFound(props: { status: string }) {
  return (
    <div class="min-h-screen w-full bg-background-base text-text-base flex flex-col items-center justify-center gap-4 p-6 text-center">
      <Mark class="w-16 opacity-40" />
      <p class="text-16-medium">{props.status}</p>
      <p class="text-14-regular text-text-weaker">
        openshare — the encrypted artifact in the run summary is the permanent record.
      </p>
    </div>
  )
}

const STATUS_DOT: Record<string, string> = {
  live: "#22c55e",
  completed: "#3b82f6",
  error: "#ef4444",
  gone: "#6b7280",
  cached: "#8b5cf6",
  waiting: "#eab308",
  "login required": "#eab308",
}

function StatusLine(props: { status: string }) {
  return (
    <div class="flex items-center gap-1.5 text-12-mono text-text-weak whitespace-nowrap">
      <span
        classList={{ "status-dot": props.status === "live", "inline-block": true, "size-1.5": true, "rounded-full": true, "shrink-0": true }}
        style={props.status === "live" ? undefined : { "background-color": STATUS_DOT[props.status] ?? "#6b7280" }}
      />
      <span>{props.status}</span>
      <Show when={props.status === "live"}>
        <span class="animate-pulse">·</span>
      </Show>
    </div>
  )
}

// A subagent page or the main session — same rendering, bound to one session.
// NOTE: created ONCE by App (never inside a reactive expression that re-runs
// on data/settings changes — a re-created subtree remounts the settings
// panel and resets its open state, live-caught).
function SessionView(props: {
  data: ShareData
  source: ReturnType<typeof useShareSource>
  settings: OshSettings
  updateSettings: (patch: Partial<OshSettings>) => void
  search: string
  sub: () => number | undefined
}) {
  // resolve which session this page renders (main or subagent /N)
  const target = createMemo(() => {
    const data = props.data
    const subs = children(data)
    const n = props.sub()
    if (n == null) return { sessionID: data.sessionID, isSub: false }
    const hit = subs.find((s) => s.index === n)
    return hit
      ? { sessionID: hit.sessionID, isSub: true }
      : { sessionID: data.sessionID, isSub: false }
  })
  const match = createMemo(() => {
    const idx = props.data.session.findIndex((s: any) => s.id === target().sessionID)
    return { found: idx >= 0, index: idx }
  })
  if (!match().found) return <NotFound status="session data not synced yet" />
  const sessionID = () => target().sessionID
  const isSub = () => target().isSub
  const backHref = () => (target().isSub ? `/s/${props.source.shareID}` : undefined)
  const info = createMemo(() => props.data.session[match().index])

  return (
    <>
      <Show when={info().title}>
        <Title>{info().title} | {props.source.branding().name || "openshare"}</Title>
      </Show>
      <WorkerPoolProvider pools={getWorkerPools()}>
        <FileComponentProvider component={FileSSR}>
          <DataProvider
            data={props.data}
            directory={info().directory}
            sessionID={sessionID()}
            onSessionHref={(id) => subHref(props.source, id)}
            onNavigateToSession={(id) => {
              const href = subHref(props.source, id)
              if (!href) return
              if (props.source.prefs().openTasksInNewTab !== false) {
                window.open(href, "_blank")
              } else {
                scrollMemory.set(location.pathname, window.scrollY)
                window.history.pushState({}, "", href)
                window.dispatchEvent(new PopStateEvent("popstate"))
              }
            }}
          >
            {iife(() => {
              const [store, setStore] = createStore({ messageId: undefined as string | undefined })
              const [diffStyle, setDiffStyle] = createSignal<"unified" | "split">(props.settings.diffStyle)
              const messages = createMemo(() => visibleMessages(props.data, sessionID()).filter((m) => m.role === "user"))
              const firstUserMessage = createMemo(() => messages().at(0))
              const activeMessage = createMemo(() => messages().find((m) => m.id === store.messageId) ?? firstUserMessage())
              function setActiveMessage(message: any) {
                setStore("messageId", message ? message.id : undefined)
              }
              const provider = createMemo(() => (activeMessage()?.model as any)?.providerID)
              const modelID = createMemo(() => (activeMessage()?.model as any)?.modelID)
              const model = createMemo(() =>
                props.data.model[sessionID()]?.find((m: any) => m.id === modelID()),
              )
              const modelDisplay = createMemo(() => {
                const name = (model() as any)?.name
                if (name === "") return undefined // sender chose to hide
                return name ?? modelID()
              })
              const diffs = createMemo(() => props.data.session_diff[sessionID()] ?? [])

              const title = () => (
                <div class="flex flex-col gap-4">
                  <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 sm:items-center sm:h-8 justify-start self-stretch">
                    <Show when={isSub()}>
                      <Show when={backHref()} keyed>
                        {(href) => (
                          <a
                            href={href}
                            class="pl-[2.5px] pr-2 flex items-center gap-1.5 bg-surface-strong shadow-xs-border-base w-fit text-12-mono text-text-base no-underline"
                            onclick={() => scrollMemory.set(location.pathname, window.scrollY)}
                          >
                            ← main
                          </a>
                        )}
                      </Show>
                    </Show>
                    <div class="pl-[2.5px] pr-2 flex items-center gap-1.75 bg-surface-strong shadow-xs-border-base w-fit">
                      <Mark class="shrink-0 w-3 my-0.5" />
                      <div class="text-12-mono text-text-base">v{info().version}</div>
                    </div>
                    <div class="flex gap-4 items-center">
                      <div class="flex gap-2 items-center">
                        <Show when={provider()}>
                          <ProviderIcon id={provider()!} class="size-3.5 shrink-0 text-icon-strong-base" />
                        </Show>
                        <div class="text-12-regular text-text-base">{modelDisplay()}</div>
                      </div>
                      <div class="text-12-regular text-text-weaker">
                        {DateTime.fromMillis(info().time.created).toFormat("dd MMM yyyy, HH:mm")}
                      </div>
                    </div>
                  </div>
                  <div class="text-left text-16-medium text-text-strong">{info().title}</div>
                </div>
              )

              const modelChanged = (message: any) => {
                const list = messages()
                const idx = list.findIndex((m) => m.id === message.id)
                if (idx <= 0) return undefined
                const prev = list[idx - 1]?.model as any
                const cur = message.model as any
                if (!cur) return undefined
                if (prev?.providerID === cur.providerID && prev?.modelID === cur.modelID) return undefined
                return `${cur.providerID ?? ""}/${cur.modelID ?? ""}`
              }

              const turns = () => (
                <div class="relative mt-2 pb-8 min-w-0 w-full h-full overflow-y-auto no-scrollbar">
                  <div class="px-4 py-6">{title()}</div>
                  <div class="flex flex-col gap-15 items-start justify-start mt-4">
                    <For each={messages()}>
                      {(message) => (
                        <>
                          <Show when={modelChanged(message)} keyed>
                            {(label) => (
                              <div class="px-4 self-start text-12-mono text-text-weaker border-l-2 border-border-weak-base pl-2 -mt-9">
                                → {label}
                              </div>
                            )}
                          </Show>
                          <SessionTurn
                            shellToolDefaultOpen={props.settings.toolOutput}
                            editToolDefaultOpen={true}
                            sessionID={sessionID()}
                            messageID={message.id}
                            classes={{
                              root: "min-w-0 w-full relative",
                              content: "flex flex-col justify-between !overflow-visible",
                              container: "px-4",
                            }}
                          />
                        </>
                      )}
                    </For>
                  </div>
                  <div class="px-4 pt-20 pb-8 shrink-0">
                    <PageFooter branding={props.source.branding()} />
                  </div>
                </div>
              )

              // settings-filtered search: match user-turn text
              const filtered = createMemo(() => {
                const q = props.search.trim().toLowerCase()
                if (!q) return messages()
                return messages().filter((m) => {
                  for (const p of props.data.part[m.id] ?? []) {
                    const any = p as any
                    if (typeof any.text === "string" && any.text.toLowerCase().includes(q)) return true
                  }
                  return false
                })
              })
              const searching = createMemo(() => props.search.trim().length > 0)

              const wide = createMemo(() => diffs().length === 0)

              return (
                <div class="relative bg-background-stronger w-screen h-screen overflow-hidden flex flex-col">
                  <Show when={props.source.branding().backgroundUrl && props.settings.backgroundOn}>
                    <div class="osh-bg" style={{ "background-image": `url(${props.source.branding().backgroundUrl})` }} />
                  </Show>
                  <header class="h-7 px-4 flex items-center justify-between self-stretch bg-background-base border-b border-border-weak-base relative z-30">
                    <Show
                      when={props.source.branding().linkUrl}
                      fallback={
                        <span class="p-0.5 flex items-center rounded-md border border-border-weak-base bg-background-base">
                          <BrandMark branding={props.source.branding()} class="h-5 rounded" />
                        </span>
                      }
                    >
                      {(href) => (
                        <a href={href()} target="_blank" rel="noreferrer" class="p-0.5 flex items-center rounded-md border border-border-weak-base bg-background-base hover:border-border-strong-base" title={props.source.branding().name || ""}>
                          <BrandMark branding={props.source.branding()} class="h-5 rounded" />
                        </a>
                      )}
                    </Show>
                    <StatusLine status={props.source.status()} />
                    <div class="flex items-center gap-2.5">
                      <button
                        class="text-icon-weaker-base hover:text-icon-strong-base cursor-pointer bg-transparent border-none p-0"
                        title="copy session as markdown"
                        onClick={() => copySessionMarkdown(props.data, sessionID())}
                      >
                        <Icon name="copy" size="small" />
                      </button>
                      <a href={OPENSHARE_REPO_URL} target="_blank" rel="noreferrer" class="text-icon-weaker-base hover:text-icon-strong-base" title="Open(code)Share">
                        <Icon name="github" size="small" />
                      </a>
                      <SettingsPanel
                        settings={props.settings}
                        update={props.updateSettings}
                        branding={props.source.branding()}
                        search={props.search}
                        onSearch={props.onSearch}
                      />
                    </div>
                  </header>
                  <div class="osh-content select-text flex flex-col flex-1 min-h-0 relative z-10">
                    <Show when={props.settings.view !== "reader"}>
                    <div
                      classList={{
                        "hidden w-full flex-1 min-h-0": true,
                        "md:flex": wide(),
                        "lg:flex": !wide(),
                      }}
                    >
                      <div classList={{ "@container relative shrink-0 pt-14 flex flex-col gap-10 min-h-0 w-full": true }}>
                        <div classList={{ "w-full flex justify-start items-start min-w-0 px-6": true }}>
                          <div class={props.settings.centerContent ? "w-full max-w-[52rem] mx-auto" : "w-full"}>{title()}</div>
                        </div>
                        <div class="flex items-start justify-start h-full min-h-0 w-full">
                          <Show when={!props.settings.continuous && messages().length > 1}>
                            <MessageNav
                              class="sticky top-0 shrink-0 py-2 pl-4"
                              messages={messages()}
                              current={activeMessage()}
                              size="compact"
                              onMessageSelect={setActiveMessage}
                              getLabel={(message: any) =>
                                props.data
                                  .part[message.id]?.find((part: any) => part.type === "text")
                                  ?.text.trim()
                                  .split("\n")[0]
                              }
                            />
                          </Show>
                          <Show
                            when={props.settings.continuous}
                            fallback={
                              <SessionTurn
                                sessionID={sessionID()}
                                messageID={store.messageId ?? firstUserMessage()!.id!}
                                classes={{
                                  root: props.settings.centerContent ? "grow max-w-[52rem] mx-auto" : "grow",
                                  content: "flex flex-col justify-between",
                                  container: "w-full pb-20 px-6",
                                }}
                              >
                                <div classList={{ "w-full flex items-center justify-center pb-8 shrink-0": true }}>
                                  <PageFooter branding={props.source.branding()} class="px-6" />
                                </div>
                              </SessionTurn>
                            }
                          >
                            <div class={(props.settings.centerContent ? "grow max-w-[52rem] mx-auto " : "grow ") + "h-full min-h-0 overflow-y-auto"}>
                              <div class="flex flex-col gap-15 items-start justify-start mt-2">
                                <For each={searching() ? filtered() : messages()}>
                                  {(message) => (
                                    <>
                                      <Show when={modelChanged(message)} keyed>
                                        {(label) => (
                                          <div class="px-6 self-start text-12-mono text-text-weaker border-l-2 border-border-weak-base pl-2 -mt-9">
                                            → {label}
                                          </div>
                                        )}
                                      </Show>
                                      <SessionTurn
                                        sessionID={sessionID()}
                                        messageID={message.id}
                                        classes={{
                                          root: "min-w-0 w-full relative",
                                          content: "flex flex-col justify-between !overflow-visible",
                                          container: "w-full pb-20 px-6",
                                        }}
                                      />
                                    </>
                                  )}
                                </For>
                                <Show when={searching() && filtered().length === 0}>
                                  <div class="px-6 text-12-regular text-text-weaker">no prompts match.</div>
                                </Show>
                              </div>
                              <div class="px-6 pt-16 pb-8 shrink-0">
                                <PageFooter branding={props.source.branding()} />
                              </div>
                            </div>
                          </Show>
                        </div>
                      </div>
                      <Show when={diffs().length > 0}>
                        <div class="@container relative grow pt-14 flex-1 min-h-0 border-l border-border-weak-base">
                          <SessionReview
                            diffs={diffs()}
                            diffStyle={diffStyle()}
                            onDiffStyleChange={setDiffStyle}
                            classes={{ root: "pb-20", header: "px-6", container: "px-6" }}
                          />
                        </div>
                      </Show>
                    </div>
                    <Switch>
                      <Match when={diffs().length > 0}>
                        <Tabs classList={{ "md:hidden": wide(), "lg:hidden": !wide() }}>
                          <Tabs.List>
                            <Tabs.Trigger value="session" class="w-1/2" classes={{ button: "w-full" }}>
                              Session
                            </Tabs.Trigger>
                            <Tabs.Trigger value="review" class="w-1/2 !border-r-0" classes={{ button: "w-full" }}>
                              {diffs().length} Files Changed
                            </Tabs.Trigger>
                          </Tabs.List>
                          <Tabs.Content value="session" class="!overflow-hidden">
                            {turns()}
                          </Tabs.Content>
                          <Tabs.Content value="review" class="!overflow-hidden hidden data-[selected]:block">
                            <div class="relative h-full pt-8 overflow-y-auto no-scrollbar">
                              <SessionReview
                                diffs={diffs()}
                                diffStyle={diffStyle()}
                                onDiffStyleChange={setDiffStyle}
                                classes={{ root: "pb-20", header: "px-4", container: "px-4" }}
                              />
                            </div>
                          </Tabs.Content>
                        </Tabs>
                      </Match>
                      <Match when={true}>
                        <div classList={{ "!overflow-hidden": true, "md:hidden": wide(), "lg:hidden": !wide() }}>
                          {turns()}
                        </div>
                      </Match>
                     </Switch>
                    </Show>
                    <Show when={props.settings.view === "reader"}>
                      <ReaderView
                        data={props.data}
                        sessionID={sessionID()}
                        source={props.source}
                        settings={props.settings}
                        search={props.search}
                      />
                    </Show>
                  </div>
                </div>
              )
            })}
          </DataProvider>
        </FileComponentProvider>
      </WorkerPoolProvider>
    </>
  )
}

function subHref(source: ReturnType<typeof useShareSource>, childSessionID: string): string | undefined {
  const d = source.data()
  if (!d) return undefined
  const subs = children(d)
  const hit = subs.find((s) => s.sessionID === childSessionID)
  return hit ? `/s/${source.shareID}/${hit.index}` : undefined
}

// serialize the visible session to markdown (clipboard)
async function copySessionMarkdown(data: ShareData, sessionID: string) {
  const info = data.session.find((s: any) => s.id === sessionID) as any
  const parts: string[] = [
    `# ${info?.title ?? sessionID}`,
    "",
    `_model: ${sessionModelLabel(data, sessionID) || "?"} · v${info?.version ?? "?"} · ${info?.directory ?? ""}_`,
    "",
  ]
  for (const m of visibleMessages(data, sessionID)) {
    const role = m.role === "user" ? "## user" : "## assistant"
    parts.push(role, "")
    for (const p of data.part[m.id] ?? []) {
      const any = p as any
      if (p.type === "text" && any.text) parts.push(any.text, "")
      else if (p.type === "reasoning" && any.text) parts.push("<details><summary>thinking</summary>", "", any.text, "", "</details>", "")
      else if (p.type === "tool") {
        const st = any.state ?? {}
        const input = st.input ?? {}
        const inv =
          [input.query, input.command, input.prompt, input.pattern, input.filePath, input.description]
            .find((v: unknown) => typeof v === "string" && v.trim()) ??
          (any.tool === "task" && Array.isArray(input.prompts) ? String(input.prompts[0] ?? "") : "")
        let out = typeof st.output === "string" ? st.output : ""
        if (any.tool === "task") out = ""
        if (out.length > 600) out = out.slice(0, 600) + "…"
        parts.push(`> _tool: ${any.tool ?? "tool"}${inv ? ` — ${String(inv).slice(0, 120)}` : ""}_`, "")
        if (out) parts.push("> ```", out.split("\n").map((l: string) => "> " + l).join("\n"), "> ```", "")
      }
    }
  }
  await navigator.clipboard.writeText(parts.join("\n"))
}


export function App() {
  const source = useShareSource()
  const [sub, setSub] = createSignal<number | undefined>(source.sub)
  const [settings, setSettings] = createSignal<OshSettings>(readSettings())
  const [search, setSearch] = createSignal("")

  const updateSettings = (patch: Partial<OshSettings>) => {
    if (patch.toolGrouping !== undefined) setToolGrouping(patch.toolGrouping)
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      writeSettings(next)
      applySettings(next)
      // reasoning toggle: DOM pass over already-rendered details
      if (patch.reasoningOpen !== undefined) {
        document.querySelectorAll("details.reasoning-collapse").forEach((d) => {
          ;(d as HTMLDetailsElement).open = patch.reasoningOpen!
        })
      }
      return next
    })
  }

  // follow-live: keep the newest content visible, only when already at
  // bottom (evaluated at fire time - a fresh load starts at the top and
  // must never jump down)
  createEffect(() => {
    const rev = source.rev()
    const s = settings()
    if (!s.followLive || source.status() !== "live") return
    const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80
    if (!atBottom) return
    requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight }))
  })

  // in-page navigation (popstate) re-parses the sub segment
  window.addEventListener("popstate", () => {
    const parts = location.pathname.split("/").filter(Boolean)
    const i = parts.indexOf("s")
    const n = i >= 0 && parts[i + 2] && /^\d+$/.test(parts[i + 2]) ? Number(parts[i + 2]) : undefined
    setSub(n)
    requestAnimationFrame(() => {
      const saved = scrollMemory.get(location.pathname)
      if (saved != null) window.scrollTo(0, saved)
    })
  })

  // j/k keyboard navigation between prompts
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key !== "j" && e.key !== "k") return
    const d = source.data()
    if (!d) return
    const sessionID = sub == null || sub() == null ? d.sessionID : undefined
    const sid = sessionID ?? d.sessionID
    const msgs = visibleMessages(d, sid).filter((m) => m.role === "user")
    const current = msgs.findIndex((m) => location.hash.includes(m.id))
    const next = e.key === "j" ? Math.min(current + 1, msgs.length - 1) : Math.max(current - 1, 0)
    msgs[next]?.id && document.querySelector(`[data-timeline-part-id="${msgs[next].id}"]`)?.scrollIntoView({ behavior: "smooth" })
  })

  // Ctrl+K opens the panel and focuses search
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault()
      togglePanel()
      setTimeout(() => document.querySelector<HTMLInputElement>("input[placeholder^='filter']")?.focus(), 60)
    }
  })

  createEffect(() => {
    applyDocumentBranding(source.branding())
  })

  return (
    <Show when={!source.needsAuth()} fallback={<LoginCard source={source} />}>
      <ErrorBoundary
        fallback={(error) => {
          console.error(error)
          const details = error instanceof Error ? (error.stack ?? error.message) : String(error)
          return (
            <div class="min-h-screen w-full bg-background-base text-text-base flex flex-col items-center justify-center gap-4 p-6 text-center">
              <p class="text-16-medium">Unable to render this share.</p>
              <p class="text-14-regular text-text-weaker">Check the console for more details.</p>
              <pre class="text-12-mono text-left whitespace-pre-wrap break-words w-full max-w-200 bg-background-stronger rounded-md p-4">
                {details}
              </pre>
            </div>
          )
        }}
      >
        <Show when={source.ready()} fallback={<NotFound status={source.status()} />}>
          <FullPageView source={source} settings={settings()} updateSettings={updateSettings} search={search()} onSearch={setSearch} sub={sub} />
          <Show when={settings().view === "classic" || settings().view === "reader"}>
          <SessionView
            data={source.data()!}
            source={source}
            settings={settings()}
            updateSettings={updateSettings}
            search={search()}
            sub={sub}
          />
          </Show>
        </Show>
      </ErrorBoundary>
      <InfoPanel data={source.data()} sessionID={source.data().sessionID} source={source} />
    </Show>
  )
}

function LoginCard(props: { source: ReturnType<typeof useShareSource> }) {
  const [login, setLogin] = createSignal("")
  const [password, setPassword] = createSignal("")
  const b = () => props.source.branding()
  createEffect(() => {
    applyDocumentBranding(b())
  })
  const state = () => props.source.authState()
  const countdown = () => {
    const ms = state().retryAfterMs ?? 0
    if (ms <= 0) return undefined
    const s = Math.ceil(ms / 1000)
    return s > 90 ? `${Math.ceil(s / 60)} min` : `${s}s`
  }
  return (
    <div class="min-h-screen w-full bg-background-base text-text-base flex flex-col items-center justify-center gap-6 p-6">
      <Show when={b().logoUrl} fallback={<Mark class="w-12 opacity-90" />}>
        <img src={b().logoUrl} alt="" class="w-10 rounded-lg" />
      </Show>
      <div class="flex flex-col gap-3 w-full max-w-72">
        <div class="text-16-medium text-center">{b().name || "openshare"}</div>
        <div class="text-12-regular text-text-weaker text-center -mt-2">re:share — this session is protected</div>
        <input
          class="openshare-input"
          placeholder="login"
          autocomplete="username"
          value={login()}
          onInput={(e) => setLogin(e.currentTarget.value)}
        />
        <input
          class="openshare-input"
          type="password"
          placeholder="password"
          autocomplete="current-password"
          value={password()}
          onInput={(e) => setPassword(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") props.source.auth(login(), password())
          }}
        />
        <Show when={state().message}>
          <div class="text-12-regular text-red-500 text-center">
            {state().message}{countdown() ? ` — retry in ${countdown()}` : ""}
          </div>
        </Show>
        <button
          class="openshare-button"
          disabled={state().busy || !!countdown()}
          onClick={() => props.source.auth(login(), password())}
        >
          {state().busy ? "checking…" : "view session"}
        </button>
      </div>
    </div>
  )
}
