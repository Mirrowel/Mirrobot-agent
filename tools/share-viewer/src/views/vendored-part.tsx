// The classic tool presentation, reusable by every view: renders a synced
// tool part through the vendored Part component (BasicTool rows, diff
// accordions, todo checklists, expandable outputs, the per-tool open rule).
import { Part } from "../../vendor/session-ui/src/components/message-part"
import { DataProvider } from "@opencode-ai/session-ui/context"
import { FileComponentProvider } from "@opencode-ai/ui/context/file"
import { WorkerPoolProvider } from "@opencode-ai/ui/context/worker-pool"
import { FileSSR } from "@opencode-ai/session-ui/file-ssr"
import type { OshSettings } from "../settings"
import type { ShareData } from "../fold"
import type { ToolEntry } from "./session-data"

// the page's share data + subagent navigation, set once per view mount
// (avoids plumbing it through every ordered-entry component). The nav
// bundle is what makes task rows clickable: the vendored task renderer
// links through data.sessionHref and clicks through data.navigateToSession
export type VendoredNav = {
  sessionHref: (id: string) => string | undefined
  navigateToSession: (id: string) => void
}
let currentData: ShareData | undefined
let currentNav: VendoredNav | undefined
export function setVendoredData(d: ShareData | undefined, nav?: VendoredNav) {
  currentData = d
  currentNav = nav
}

export function VendoredPart(props: { entry: ToolEntry; settings: OshSettings; data?: ShareData }) {
  const data = () => props.data ?? currentData
  const info = () =>
    (data()?.session as any[] | undefined)?.find((s) => s.id === props.entry.part?.sessionID) ?? {}
  return (
    <DataProvider
      data={data() ?? ({ session: [], message: {}, part: {}, model: {}, file: {}, agent: {} } as any)}
      directory={info()?.directory}
      sessionID={props.entry.part?.sessionID}
      onSessionHref={currentNav?.sessionHref}
      onNavigateToSession={currentNav?.navigateToSession}
    >
      <WorkerPoolProvider pools={[]}>
        <FileComponentProvider component={FileSSR as any}>
          <Part
            part={props.entry.part as any}
            message={props.entry.message as any}
            // the per-tool natural-open rule + the toggle on top
            defaultOpen={props.entry.defaultOpen || props.settings.toolOutput || undefined}
          />
        </FileComponentProvider>
      </WorkerPoolProvider>
    </DataProvider>
  )
}
