// Per-prompt presentation line, classic-style: "Build · glm-5.3 · 10:17 PM"
import { Show } from "solid-js"
import type { ShareData } from "../fold"
import { sessionModelLabel, type SessionSection } from "./session-data"

export function MetaLine(props: { section: SessionSection; data: ShareData; class?: string }) {
  const modelShort = () => {
    const m = props.section.model
    if (m?.modelID) return m.modelID
    const full = sessionModelLabel(props.data, (props.section as any).id)
    return full.includes("/") ? full.split("/").slice(1).join("/") : full
  }
  const time = () =>
    props.section.at
      ? new Date(props.section.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : undefined
  return (
    <Show when={props.section.mode || modelShort() || time()}>
      <div class={props.class ?? "text-12-mono text-text-weaker"}>
        {props.section.mode}
        {props.section.mode && (modelShort() || time()) ? " · " : ""}
        {modelShort()}
        {modelShort() && time() ? " · " : ""}
        {time()}
      </div>
    </Show>
  )
}
