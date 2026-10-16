// Type-only surface of @opencode-ai/client/promise (from the vendored
// client tgz dist/promise/generated/types.d.ts). Everything in session-ui
// imports this via `import type`, so it erases at build time.
export type FileDiffInfo = {
  file: string
  patch: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
}
export {}
