// @refresh reload
import { render } from "solid-js/web"
import { Font } from "@opencode-ai/ui/font"
import { MetaProvider } from "@solidjs/meta"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { I18nProvider } from "@opencode-ai/ui/context"
import { dict as uiEn } from "@opencode-ai/ui/i18n/en"
import { Suspense } from "solid-js"
import { App } from "./app"
import "./app.css"

// Provider stack mirrored from the enterprise app shell (en locale only —
// the viewer is not localized beyond upstream defaults).
render(
  () => (
    <MetaProvider>
      <DialogProvider>
        <MarkedProvider>
          <Font />
          <I18nProvider value={{ locale: () => "en" as const, t: (key: any, params: any) => String(key), plural: (key: any, count: number) => String(key) }}>
            <Suspense>
              <App />
            </Suspense>
          </I18nProvider>
        </MarkedProvider>
      </DialogProvider>
    </MetaProvider>
  ),
  document.getElementById("root")!,
)
