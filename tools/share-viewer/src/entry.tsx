// @refresh reload
import { render } from "solid-js/web"
import { applySettings, readSettings } from "./settings"
import { setToolGrouping } from "../vendor/session-ui/src/components/message-part"
// pre-paint: apply the settings cookie before anything renders (no theme flash)
const __s = readSettings()
applySettings(__s)
setToolGrouping(__s.toolGrouping ?? false)
import { Font } from "@opencode-ai/ui/font"
import { MetaProvider } from "@solidjs/meta"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { I18nProvider } from "@opencode-ai/ui/context"
import {
  pluralCategory,
  pluralKey,
  type UiI18nParams,
  type UiI18nPluralKey,
} from "@opencode-ai/ui/context/i18n"
import { dict as uiEn } from "@opencode-ai/ui/i18n/en"
import { Suspense } from "solid-js"
import { App } from "./app"
import "./app.css"
import "./views/skins.css"

// Provider stack mirrored from the enterprise app shell; en locale only,
// but with the REAL dictionary (raw keys like "ui.tool.shell" rendering on
// the page were this bridge returning String(key)).
const locale = () => "en" as const

function resolveTemplate(text: string, params?: UiI18nParams) {
  if (!params) return text
  return text.replace(/{{\s*([^}]+?)\s*}}/g, (_, rawKey) => {
    const value = params[String(rawKey)]
    return value === undefined ? "" : String(value)
  })
}

const t = (key: keyof typeof uiEn, params?: UiI18nParams) => {
  const value = uiEn[key]
  return resolveTemplate(value ?? String(key), params)
}

const plural = (key: UiI18nPluralKey, count: number, params?: UiI18nParams) =>
  t(pluralKey(key, pluralCategory(locale(), count)), { ...params, count })

render(
  () => (
    <MetaProvider>
      <DialogProvider>
        <MarkedProvider>
          <Font />
          <I18nProvider value={{ locale, t, plural }}>
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
