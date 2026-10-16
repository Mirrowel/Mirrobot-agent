# Building a share view

A view is a **full-page reading instrument** for one opencode session:
you own the header chrome, the content, the footer, and the settings
presentation. "Same features, completely different page." The goal is
experiments the operator will pick from — be bold, be distinct, but be
complete.

## Your file

Work in exactly ONE file: `src/views/<your-id>.tsx`. Do not edit shared
files (registry, settings, panel, app.tsx, fold, data-source). The
integrator registers your view.

## Contract

```tsx
import type { ViewEntry } from "./registry"

export const myView: ViewEntry = {
  id: "myid",          // lowercase, unique, used in the settings cookie
  label: "myid",       // shown in the settings segmented control
  component: MyView,   // (props: ViewProps) => JSX.Element
}
```

`ViewProps`: `{ data, sessionID, source, settings, updateSettings, search, onSearch }`.

## Data (src/views/session-data.ts — use it, don't reinvent)

- `useSessionSections(data, sessionID)` → `SessionSection[]`:
  `{ id, index, prompt, model?, tools: ToolEntry[], reasoning, response }`
- `ToolEntry`: `{ tool, title, output?, part }` — title is the full
  invocation text (the query is usually after the first `:`),
  output is the rendered result text.
- `toolCallLabel(entry)` → the human part of the title.
- Raw access if you need it: `data.session` (info list), `data.part`
  (parts by message id), `visibleMessages(data, sessionID)`.

## Features every view must support

- **Theme**: use the design tokens (`bg-background-base`,
  `text-text-base`, `border-border-weak-base`, `text-icon-weaker-base`,
  the `text-12-mono`-family utilities...). Never raw hex. Themes
  (light/dark/mirrobot/nord/...) then work for free.
- **settings.toolInfo** — hide tool invocation titles/queries when false.
- **settings.toolOutput** — expand tool outputs by default when true
  (collapsing must always be possible).
- **settings.reasoningOpen** — default expansion for reasoning.
- **settings.continuous** — your view decides what "one seamless flow,
  no per-prompt navigation chrome" means; honor it.
- **settings.followLive** — while `source.status() === "live"`, keep the
  newest content visible only when already at the bottom.
- **settings.search** — filter/jump sections; empty-result state required.
- **settings.readText / textSize** — automatic if you use the token
  text utilities (`text-12-mono`, `text-14-regular`, ...). Do NOT invent
  classes like `text-13-regular` — they don't exist.
- **Auth/loading states**: your view renders only when
  `source.ready()`; keep rendering cheap on empty data (the parent
  gates for you, but don't crash on empty arrays).
- Error/skeleton polish is welcome, empty states must not be "nothing
  here".

## Settings UI

You may import and render the shared panel:

```tsx
import { SettingsPanel } from "../settings-panel"
```

and restyle/reposition it inside your chrome — or build your own
settings surface from `settings` + `updateSettings`. Every view ships
a settings entry point (gear, command, whatever fits your concept).
A view without visible settings access fails review.

## Brand

- Header: your design. Include: the deployment logo (`source.branding().logoUrl`,
  link `source.branding().linkUrl`), the openshare github mark (right
  side, fixed: `<a href="https://github.com/Mirrowel/Mirrobot-agent">`
  with `<Icon name="github" size="small" />`), status
  (`source.status()`), the settings entry, and the session version with
  the opencode mark (`import { Mark } from "@opencode-ai/ui/logo"`).
- Footer: your design; include `source.branding().wordmarkUrl` or the
  text `${branding().name ? branding().name + " · " : ""}Open(code)Share`.
- Page `<Title>`: `${info.title} | ${branding().name || "openshare"}`.

## Craft rules (impeccable, product register)

- Load a design skill (`impeccable` and/or `frontend-design`) and follow it.
- No em dashes. Anywhere. Ever.
- No side-stripe accents, no gradient text, no glassmorphism-by-default,
  no hero-metric templates, no identical card grids.
- Motion only for state, 150–250 ms, ease-out.
- Self-verify: `npm run build` must pass with your file in place
  (it may fail on OTHER agents' concurrent files — a clean build of
  YOUR file via `npx tsc --noEmit -p tsconfig.json` is the honest check;
  report either way).
- Return: your view id, one-paragraph design statement, the file path,
  build status.
