// Viewer settings: JSON cookie (osh_settings, 1yr), read pre-paint by
// entry.tsx to set html[data-osh-theme] / text size without a flash.
export type OshSettings = {
  view: string
  theme: "system" | "light" | "dark" | "mirrobot" | "midnight" | "sepia" | "nord"
  continuous: boolean
  followLive: boolean
  textSize: "compact" | "normal" | "roomy"
  readText: "compact" | "normal" | "large"
  diffStyle: "unified" | "split"
  backgroundOn: boolean
  reasoningOpen: boolean
  centerContent: boolean
  toolInfo: boolean
  toolOutput: boolean
}

export const SETTINGS_DEFAULTS: OshSettings = {
  view: "classic",
  theme: "system",
  continuous: false,
  followLive: true,
  textSize: "normal",
  readText: "normal",
  diffStyle: "unified",
  backgroundOn: true,
  reasoningOpen: false,
  centerContent: false,
  toolInfo: true,
  toolOutput: false,
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

// Apply to <html>: theme attribute + scale attributes. Called pre-paint.
export function applySettings(s: OshSettings) {
  const html = document.documentElement
  if (s.theme === "system") delete html.dataset.oshTheme
  else html.dataset.oshTheme = s.theme
  // interface scale (root font — rem paddings scale with it)
  html.dataset.oshText =
    s.textSize === "compact" ? "compact" : s.textSize === "roomy" ? "roomy" : "normal"
  // reading text size (markdown content only)
  html.dataset.oshReadText =
    s.readText === "compact" ? "compact" : s.readText === "large" ? "large" : "normal"
  html.dataset.oshReasoning = s.reasoningOpen ? "open" : "collapsed"
  // tool invocation info + extra output expansion (the vendored per-tool
  // rule still governs what shows naturally - see toolDefaultOpen)
  html.dataset.oshToolInfo = s.toolInfo ? "on" : "off"
  html.dataset.oshToolOutput = s.toolOutput ? "on" : "off"
}

export const TEXT_SIZES: Record<string, string> = {
  compact: "95%",
  normal: "100%",
  roomy: "110%",
}
