// The upstream share page ([shareID].tsx), client-only: identical layout
// and rendering stack (SessionTurn / SessionReview / MessageNav over the
// DataProvider fold), with the solid-start/server pieces replaced by the
// local data source (live worker polling or embedded local snapshot).
import { SessionTurn } from "@opencode-ai/session-ui/session-turn"
import { SessionReview } from "@opencode-ai/session-ui/session-review"
import { DataProvider } from "@opencode-ai/session-ui/context"
import { FileComponentProvider } from "@opencode-ai/ui/context/file"
import { WorkerPoolProvider } from "@opencode-ai/ui/context/worker-pool"
import { getWorkerPools } from "@opencode-ai/session-ui/pierre/worker"
import { MessageNav } from "@opencode-ai/session-ui/message-nav"
import { FileSSR } from "@opencode-ai/session-ui/file-ssr"
import { Logo, Mark } from "@opencode-ai/ui/logo"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Tabs } from "@opencode-ai/ui/tabs"
import { iife } from "@opencode-ai/core/util/iife"
import { Binary } from "@opencode-ai/core/util/binary"
import { DateTime } from "luxon"
import { Title } from "@solidjs/meta"
import { createMemo, createSignal, ErrorBoundary, For, Match, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useShareSource } from "./data-source"

function NotFound(props: { status: string }) {
  return (
    <div class="min-h-screen w-full bg-background-base text-text-base flex flex-col items-center justify-center gap-4 p-6 text-center">
      <Mark class="w-16 opacity-40" />
      <p class="text-16-medium">{props.status}</p>
      <p class="text-14-regular text-text-weaker">
        mirrobot share — the encrypted artifact in the run summary is the permanent record.
      </p>
    </div>
  )
}

export function App() {
  const source = useShareSource()

  return (
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
      <Show when={source.data()} fallback={<NotFound status={source.status()} />}>
        {(data) => {
          const match = createMemo(() => Binary.search(data().session, data().sessionID, (s) => s.id))
          if (!match().found) return <NotFound status={source.status()} />
          const info = createMemo(() => data().session[match().index])

          return (
            <>
              <Show when={info().title}>
                <Title>{info().title} | mirrobot</Title>
              </Show>
              <WorkerPoolProvider pools={getWorkerPools()}>
                <FileComponentProvider component={FileSSR}>
                  <DataProvider data={data()} directory={info().directory}>
                    {iife(() => {
                      const [store, setStore] = createStore({
                        messageId: undefined as string | undefined,
                      })
                      const messages = createMemo(() =>
                        data().sessionID
                          ? (data().message[data().sessionID]?.filter((m) => m.role === "user") ?? []).sort(
                              (a, b) => a.time.created - b.time.created,
                            )
                          : [],
                      )
                      const firstUserMessage = createMemo(() => messages().at(0))
                      const activeMessage = createMemo(
                        () => messages().find((m) => m.id === store.messageId) ?? firstUserMessage(),
                      )
                      function setActiveMessage(message: any) {
                        setStore("messageId", message ? message.id : undefined)
                      }
                      const provider = createMemo(() => activeMessage()?.model?.providerID)
                      const modelID = createMemo(() => activeMessage()?.model?.modelID)
                      const model = createMemo(() => data().model[data().sessionID]?.find((m: any) => m.id === modelID()))
                      const diffs = createMemo(() => data().session_diff[data().sessionID] ?? [])
                      const [diffStyle, setDiffStyle] = createSignal<"unified" | "split">("unified")

                      const title = () => (
                        <div class="flex flex-col gap-4">
                          <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 sm:items-center sm:h-8 justify-start self-stretch">
                            <div class="pl-[2.5px] pr-2 flex items-center gap-1.75 bg-surface-strong shadow-xs-border-base w-fit">
                              <Mark class="shrink-0 w-3 my-0.5" />
                              <div class="text-12-mono text-text-base">v{info().version}</div>
                            </div>
                            <div class="flex gap-4 items-center">
                              <div class="flex gap-2 items-center">
                                <Show when={provider()}>
                                  <ProviderIcon id={provider()!} class="size-3.5 shrink-0 text-icon-strong-base" />
                                </Show>
                                <div class="text-12-regular text-text-base">{model()?.name ?? modelID()}</div>
                              </div>
                              <div class="text-12-regular text-text-weaker">
                                {DateTime.fromMillis(info().time.created).toFormat("dd MMM yyyy, HH:mm")}
                              </div>
                            </div>
                          </div>
                          <div class="text-left text-16-medium text-text-strong">{info().title}</div>
                        </div>
                      )

                      const turns = () => (
                        <div class="relative mt-2 pb-8 min-w-0 w-full h-full overflow-y-auto no-scrollbar">
                          <div class="px-4 py-6">{title()}</div>
                          <div class="flex flex-col gap-15 items-start justify-start mt-4">
                            <For each={messages()}>
                              {(message) => (
                                <SessionTurn
                                  sessionID={data().sessionID}
                                  messageID={message.id}
                                  classes={{
                                    root: "min-w-0 w-full relative",
                                    content: "flex flex-col justify-between !overflow-visible",
                                    container: "px-4",
                                  }}
                                />
                              )}
                            </For>
                          </div>
                          <div class="px-4 flex items-center justify-center pt-20 pb-8 shrink-0">
                            <Logo class="w-58.5 opacity-12" />
                          </div>
                        </div>
                      )

                      const wide = createMemo(() => diffs().length === 0)

                      return (
                        <div class="relative bg-background-stronger w-screen h-screen overflow-hidden flex flex-col">
                          <header class="h-12 px-6 py-2 flex items-center justify-between self-stretch bg-background-base border-b border-border-weak-base">
                            <div class="">
                              <Mark />
                            </div>
                            <div class="text-11-mono text-text-weaker">{source.status()}</div>
                            <div class="flex gap-3 items-center">
                              <IconButton
                                as={"a"}
                                href="https://github.com/anomalyco/opencode"
                                target="_blank"
                                icon="github"
                                variant="ghost"
                              />
                            </div>
                          </header>
                          <div class="select-text flex flex-col flex-1 min-h-0">
                            <div
                              classList={{
                                "hidden w-full flex-1 min-h-0": true,
                                "md:flex": wide(),
                                "lg:flex": !wide(),
                              }}
                            >
                              <div classList={{ "@container relative shrink-0 pt-14 flex flex-col gap-10 min-h-0 w-full": true }}>
                                <div classList={{ "w-full flex justify-start items-start min-w-0 px-6": true }}>{title()}</div>
                                <div class="flex items-start justify-start h-full min-h-0">
                                  <Show when={messages().length > 1}>
                                    <MessageNav
                                      class="sticky top-0 shrink-0 py-2 pl-4"
                                      messages={messages()}
                                      current={activeMessage()}
                                      size="compact"
                                      onMessageSelect={setActiveMessage}
                                      getLabel={(message: any) =>
                                        data()
                                          .part[message.id]?.find((part: any) => part.type === "text")
                                          ?.text.trim()
                                          .split("\n")[0]
                                      }
                                    />
                                  </Show>
                                  <SessionTurn
                                    sessionID={data().sessionID}
                                    messageID={store.messageId ?? firstUserMessage()!.id!}
                                    classes={{
                                      root: "grow",
                                      content: "flex flex-col justify-between",
                                      container: "w-full pb-20 px-6",
                                    }}
                                  >
                                    <div classList={{ "w-full flex items-center justify-center pb-8 shrink-0": true }}>
                                      <Logo class="w-58.5 opacity-12" />
                                    </div>
                                  </SessionTurn>
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
                                      <SessionReview diffs={diffs()} classes={{ root: "pb-20", header: "px-4", container: "px-4" }} />
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
        }}
      </Show>
    </ErrorBoundary>
  )
}
