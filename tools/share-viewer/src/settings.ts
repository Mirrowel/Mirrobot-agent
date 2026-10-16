// Viewer settings: JSON cookie (osh_settings, 1yr), read pre-paint by
// entry.tsx to set html[data-osh-theme] / text size without a flash.
export type OshSettings = {
  theme: "system" | "light" | "dark" | "mirrobot" | "midnight" | "sepia" | "nord"
  continuous: boolean
  followLive: boolean
  textSize: "compact" | "normal" | "roomy"
  diffStyle: "unified" | "split"
  backgroundOn: boolean
  reasoningOpen: boolean
}

export const SETTINGS_DEFAULTS: OshSettings = {
  theme: "system",
  continuous: false,
  followLive: true,
  textSize: "normal",
  diffStyle: "unified",
  backgroundOn: true,
  reasoningOpen: false,
}

const COOKIE = "osh_settings"

export function readSettings(): OshSettings {
  try {
    for (const part of document.cookie.split(";")) {
      const [k, ...v] = part.trim().split("=")
      if (k === COOKIE) {
        const parsed = JSON.parse(decodeURIComponent(v.join("=")))
        return { ...SETTINGS_DEFAULTS, ...parsed }
      }
    }
  } catch {}
  return { ...SETTINGS_DEFAULTS }
}

export function writeSettings(s: OshSettings) {
  // not HttpOnly by design: the viewer reads its own settings cookie
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(s))}; Path=/; Max-Age=31536000; SameSite=Lax`
}

// Apply to <html>: theme attribute + text-size scale. Called pre-paint.
export function applySettings(s: OshSettings) {
  const html = document.documentElement
  if (s.theme === "system") delete html.dataset.oshTheme
  else html.dataset.oshTheme = s.theme
  html.dataset.oshText =
    s.textSize === "compact" ? "compact" : s.textSize === "roomy" ? "roomy" : "normal"
  html.dataset.oshReasoning = s.reasoningOpen ? "open" : "collapsed"
}

export const TEXT_SIZES: Record<string, string> = {
  compact: "95%",
  normal: "100%",
  roomy: "110%",
}
