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
import { createEffect, createMemo, createSignal, ErrorBoundary, For, Match, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useShareSource, type Branding } from "./data-source"
import { children, visibleMessages, type ShareData } from "./fold"
import { applySettings, readSettings, writeSettings, type OshSettings } from "./settings"

// scroll memory for in-page session switching: restore on return
const scrollMemory = new Map<string, number>()

// the product's own repo (fixed in source — the right header always
// promotes Open(code)Share; flip on extraction)
const OPENSHARE_REPO_URL = "https://github.com/Mirrowel/Mirrobot-agent"

const GH_MARK = "/branding/github.svg"

// Brand-aware mark: configured image or the vendored default
function BrandMark(props: { branding: Branding; class?: string }) {
  return (
    <Show when={props.branding.logoUrl} fallback={null}>
      <img src={props.branding.logoUrl} alt="" class={props.class} />
    </Show>
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
    <div class="flex items-center gap-1.5 text-11-mono text-text-weak whitespace-nowrap">
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

const THEMES: { id: OshSettings["theme"]; label: string }[] = [
  { id: "system", label: "system" },
  { id: "light", label: "light" },
  { id: "dark", label: "dark" },
  { id: "mirrobot", label: "mirrobot" },
  { id: "midnight", label: "midnight" },
  { id: "sepia", label: "sepia" },
  { id: "nord", label: "nord" },
]

function SettingsPanel(props: {
  settings: OshSettings
  update: (patch: Partial<OshSettings>) => void
  branding: Branding
  search: string
  onSearch: (v: string) => void
}) {
  const [open, setOpen] = createSignal(false)
  const toggle = (key: keyof OshSettings) => props.update({ [key]: !props.settings[key] } as Partial<OshSettings>)
  return (
    <div class="relative">
      <button
        class="osh-gear osh-gear-settings"
        title="settings"
        onClick={() => setOpen(!open())}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M8 4.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5ZM6.5 8a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />
          <path d="M8 0a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V.75A.75.75 0 0 1 8 0Zm0 13a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 13ZM2.44 3.56a.75.75 0 0 1 1.06-1.06l1.06 1.06a.75.75 0 0 1-1.06 1.06L2.44 3.56Zm9.06 9.06a.75.75 0 1 1 1.06 1.06l-1.06 1.06a.75.75 0 1 1-1.06-1.06l1.06-1.06ZM.75 7.25h1.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1 0-1.5Zm13 0h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1 0-1.5ZM3.5 12.62a.75.75 0 1 1-1.06 1.06l-1.06-1.06a.75.75 0 1 1 1.06-1.06l1.06 1.06Zm9.06-9.06a.75.75 0 1 1 1.06-1.06l1.06 1.06a.75.75 0 1 1-1.06 1.06l-1.06-1.06Z" />
        </svg>
      </button>
      <Show when={open()}>
        <div class="osh-panel">
          <h3>theme</h3>
          <div class="osh-row">
            <For each={THEMES}>
              {(t) => (
                <button
                  class="osh-chip"
                  data-on={props.settings.theme === t.id}
                  onClick={() => props.update({ theme: t.id })}
                >
                  {t.label}
                </button>
              )}
            </For>
          </div>
          <h3>text</h3>
          <div class="osh-row">
            <For each={["compact", "normal", "roomy"] as const}>
              {(s) => (
                <button
                  class="osh-chip"
                  data-on={props.settings.textSize === s}
                  onClick={() => props.update({ textSize: s })}
                >
                  {s}
                </button>
              )}
            </For>
          </div>
          <h3>view</h3>
          <div class="osh-toggle-row">
            <span>continuous (one scroll)</span>
            <button class="osh-chip" data-on={props.settings.continuous} onClick={() => toggle("continuous")}>
              {props.settings.continuous ? "on" : "off"}
            </button>
          </div>
          <div class="osh-toggle-row">
            <span>follow live scroll</span>
            <button class="osh-chip" data-on={props.settings.followLive} onClick={() => toggle("followLive")}>
              {props.settings.followLive ? "on" : "off"}
            </button>
          </div>
          <div class="osh-toggle-row">
            <span>reasoning expanded</span>
            <button class="osh-chip" data-on={props.settings.reasoningOpen} onClick={() => toggle("reasoningOpen")}>
              {props.settings.reasoningOpen ? "open" : "collapsed"}
            </button>
          </div>
          <Show when={props.branding.backgroundUrl}>
            <div class="osh-toggle-row">
              <span>background image</span>
              <button class="osh-chip" data-on={props.settings.backgroundOn} onClick={() => toggle("backgroundOn")}>
                {props.settings.backgroundOn ? "on" : "off"}
              </button>
            </div>
          </Show>
          <h3>session search</h3>
          <input
            class="openshare-input"
            placeholder="filter prompts (Ctrl+K)"
            value={props.search}
            onInput={(e) => props.onSearch(e.currentTarget.value)}
          />
        </div>
      </Show>
    </div>
  )
}

// A subagent page or the main session — same rendering, bound to one session.
function SessionView(props: {
  data: ShareData
  sessionID: string
  source: ReturnType<typeof useShareSource>
  isSub: boolean
  backHref: string | undefined
  settings: OshSettings
  updateSettings: (patch: Partial<OshSettings>) => void
  search: string
}) {
  const match = createMemo(() => {
    const idx = props.data.session.findIndex((s: any) => s.id === props.sessionID)
    return { found: idx >= 0, index: idx }
  })
  if (!match().found) return <NotFound status="session data not synced yet" />
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
            sessionID={props.sessionID}
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
              const messages = createMemo(() => visibleMessages(props.data, props.sessionID).filter((m) => m.role === "user"))
              const firstUserMessage = createMemo(() => messages().at(0))
              const activeMessage = createMemo(() => messages().find((m) => m.id === store.messageId) ?? firstUserMessage())
              function setActiveMessage(message: any) {
                setStore("messageId", message ? message.id : undefined)
              }
              const provider = createMemo(() => (activeMessage()?.model as any)?.providerID)
              const modelID = createMemo(() => (activeMessage()?.model as any)?.modelID)
              const model = createMemo(() =>
                props.data.model[props.sessionID]?.find((m: any) => m.id === modelID()),
              )
              const modelDisplay = createMemo(() => {
                const name = (model() as any)?.name
                if (name === "") return undefined // sender chose to hide
                return name ?? modelID()
              })
              const diffs = createMemo(() => props.data.session_diff[props.sessionID] ?? [])

              const title = () => (
                <div class="flex flex-col gap-4">
                  <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 sm:items-center sm:h-8 justify-start self-stretch">
                    <Show when={props.isSub}>
                      <Show when={props.backHref} keyed>
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
                              <div class="px-4 self-start text-11-mono text-text-weaker border-l-2 border-border-weak-base pl-2 -mt-9">
                                → {label}
                              </div>
                            )}
                          </Show>
                          <SessionTurn
                            sessionID={props.sessionID}
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
                  <div class="px-4 flex items-center justify-center pt-20 pb-8 shrink-0">
                    <Show
                      when={props.source.branding().wordmarkUrl}
                      fallback={
                        <div class="text-13-mono opacity-20 select-none">
                          {props.source.branding().name ? `${props.source.branding().name} · ` : ""}
                          Open(code)Share
                        </div>
                      }
                    >
                      <img src={props.source.branding().wordmarkUrl} alt="" class="w-58.5 opacity-25" />
                    </Show>
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
                  <header class="h-7 px-4 flex items-center justify-between self-stretch bg-background-base border-b border-border-weak-base relative z-10">
                    <Show
                      when={props.source.branding().linkUrl}
                      fallback={
                        <span class="pl-1 pr-2 py-0.5 flex items-center rounded" style={{ background: "rgba(10,10,12,.9)" }}>
                          <BrandMark branding={props.source.branding()} class="h-5" />
                        </span>
                      }
                    >
                      {(href) => (
                        <a href={href()} target="_blank" rel="noreferrer" class="osh-hdr-link pl-1 pr-2 py-0.5 rounded" style={{ background: "rgba(10,10,12,.9)" }} title={props.source.branding().name || ""}>
                          <BrandMark branding={props.source.branding()} class="h-5" />
                        </a>
                      )}
                    </Show>
                    <StatusLine status={props.source.status()} />
                    <div class="flex items-center gap-2">
                      <button
                        class="osh-gear"
                        title="copy session as markdown"
                        onClick={() => copySessionMarkdown(props.data, props.sessionID)}
                      >
                        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                          <path d="M4 2a2 2 0 0 1 2-2h5.5a.5.5 0 0 1 .35.15l2 2A.5.5 0 0 1 14 2.5V12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-.5H3.5A1.5 1.5 0 0 1 2 10V4a2 2 0 0 1 2-2Zm2-.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5V3.7L10.8 2H6Zm-4 2a.5.5 0 0 1 1 0v6.5a.5.5 0 0 0 .5.5H6v1.5H3.5a.5.5 0 0 1-.5-.5V3.5Z" />
                        </svg>
                      </button>
                      <a href={OPENSHARE_REPO_URL} target="_blank" rel="noreferrer" class="osh-hdr-link" title="Open(code)Share">
                        <img src={GH_MARK} alt="" class="h-3.5" />
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
                  <div class="select-text flex flex-col flex-1 min-h-0 relative z-10">
                    <div
                      classList={{
                        "hidden w-full flex-1 min-h-0": true,
                        "md:flex": wide(),
                        "lg:flex": !wide(),
                      }}
                    >
                      <div classList={{ "@container relative shrink-0 pt-14 flex flex-col gap-10 min-h-0 w-full": true }}>
                        <div classList={{ "w-full flex justify-start items-start min-w-0 px-6": true }}>
                          <div class="w-full max-w-[52rem] mx-auto">{title()}</div>
                        </div>
                        <div class="flex items-start justify-center h-full min-h-0 w-full">
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
                                sessionID={props.sessionID}
                                messageID={store.messageId ?? firstUserMessage()!.id!}
                                classes={{
                                  root: "grow max-w-[52rem]",
                                  content: "flex flex-col justify-between",
                                  container: "w-full pb-20 px-6",
                                }}
                              >
                                <div classList={{ "w-full flex items-center justify-center pb-8 shrink-0": true }}>
                                  <Show
                                    when={props.source.branding().wordmarkUrl}
                                    fallback={
                                      <div class="text-13-mono opacity-20 select-none">
                                        {props.source.branding().name ? `${props.source.branding().name} · ` : ""}
                                        Open(code)Share
                                      </div>
                                    }
                                  >
                                    <img src={props.source.branding().wordmarkUrl} alt="" class="w-58.5 opacity-25" />
                                  </Show>
                                </div>
                              </SessionTurn>
                            }
                          >
                            <div class="grow max-w-[52rem]">
                              <div class="flex flex-col gap-15 items-start justify-start mt-2">
                                <For each={searching() ? filtered() : messages()}>
                                  {(message) => (
                                    <>
                                      <Show when={modelChanged(message)} keyed>
                                        {(label) => (
                                          <div class="px-6 self-start text-11-mono text-text-weaker border-l-2 border-border-weak-base pl-2 -mt-9">
                                            → {label}
                                          </div>
                                        )}
                                      </Show>
                                      <SessionTurn
                                        sessionID={props.sessionID}
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
                                  <div class="px-6 text-13-regular text-text-weaker">no prompts match.</div>
                                </Show>
                              </div>
                              <div class="px-6 flex items-center justify-center pt-16 pb-8 shrink-0">
                                <Show
                                  when={props.source.branding().wordmarkUrl}
                                  fallback={
                                    <div class="text-13-mono opacity-20 select-none">
                                      {props.source.branding().name ? `${props.source.branding().name} · ` : ""}
                                      Open(code)Share
                                    </div>
                                  }
                                >
                                  <img src={props.source.branding().wordmarkUrl} alt="" class="w-58.5 opacity-25" />
                                </Show>
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
  const parts: string[] = [`# ${data.session.find((s) => s.id === sessionID)?.title ?? sessionID}`, ""]
  for (const m of visibleMessages(data, sessionID)) {
    const role = m.role === "user" ? "## user" : "## assistant"
    parts.push(role, "")
    for (const p of data.part[m.id] ?? []) {
      const any = p as any
      if (p.type === "text" && any.text) parts.push(any.text, "")
      else if (p.type === "tool") parts.push(`> _tool: ${any.tool ?? "tool"}_`, "")
      else if (p.type === "reasoning" && any.text) parts.push("<details><summary>thinking</summary>", "", any.text, "", "</details>", "")
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

  // follow-live: keep the newest content visible, only when already at bottom
  let atBottom = true
  const onScroll = () => {
    atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80
  }
  window.addEventListener("scroll", onScroll, { passive: true })
  createEffect(() => {
    const rev = source.rev()
    const s = settings()
    if (!s.followLive || source.status() !== "live") return
    if (!atBottom) return
    requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight }))
  })
  onCleanup(() => window.removeEventListener("scroll", onScroll))

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

  // Ctrl+K focuses session search
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault()
      document.querySelector<HTMLInputElement>(".osh-panel input")?.focus()
      document.querySelector<HTMLInputElement>(".osh-panel input")?.closest(".osh-panel")?.classList.add("force-open")
      const btn = document.querySelector<HTMLButtonElement>(".osh-gear")
      btn?.click()
      document.querySelector<HTMLInputElement>(".osh-panel input")?.focus()
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
          {(() => {
            const data = source.data()!
            const subs = createMemo(() => children(data))
            const target = createMemo(() => {
              const n = sub()
              if (n == null) return { sessionID: data.sessionID, isSub: false }
              const hit = subs().find((s) => s.index === n)
              return hit
                ? { sessionID: hit.sessionID, isSub: true }
                : { sessionID: data.sessionID, isSub: false }
            })

            return (
              <SessionView
                data={data}
                sessionID={target().sessionID}
                source={source}
                isSub={target().isSub}
                backHref={target().isSub ? `/s/${source.shareID}` : undefined}
                settings={settings()}
                updateSettings={updateSettings}
                search={search()}
              />
            )
          })()}
        </Show>
      </ErrorBoundary>
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
