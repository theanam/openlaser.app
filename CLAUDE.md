# openlaser: working rules

Read `docs/decisions.md` before changing behaviour. The product spec (behaviour) and design handoff (visuals) were the inputs for v1; the decisions log records where the implementation settled.

## Owner's standing rules

- Everything runs in the browser and must deploy as static files to GitHub Pages (relative base, hash routes). Local dev server port: **5190**.
- Commit only when asked. Before committing, run `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e` and make sure all pass. Commit author: `anam.ahmed.a@gmail.com` (set in the local git config).
- Write tests for every feature.
- When a notable feature ships, add it to `src/app/features.ts` and to a step in `src/app/tour/steps.ts` (with an illustration when it helps). `tests/unit/app/tour.test.ts` fails if a feature is missing from the tour.
- After a noticeable UI change, refresh the README screenshots: `pnpm build && pnpm screenshot` (then `pnpm icons` to refresh the social preview).
- Keep the README for visitors: what the app does, screenshots, how to develop. No diary or to-do lists.
- UI copy is short. Use icons where most apps use icons. Avoid "this, not that" phrasing in any text.
- Never use `alert`, `confirm` or `prompt`. Use `confirm()` from `$lib/ui/confirm.svelte`, `toast` from `$lib/ui/toasts.svelte`, and `Dialog` from `$lib/ui/Dialog.svelte` (bits-ui).
- Wrap new UI regions in `ErrorBoundary` so a failure stays local.
- File open/save goes through `$lib/storage/files.ts` (File System Access API first, input/download fallback). Projects are `.olaser`, machine profiles `.json`.
- New keyboard shortcuts go in `src/app/shortcuts.ts`; they appear in Help and the `?` sheet automatically.
- Help links issues to https://github.com/theanam/openlaser.app/issues; everything else to anam.ahmed.a@gmail.com.

## Code rules (from the spec)

- Layers: `project` and `cam` are pure; `machine` knows nothing about projects or CAM; the UI never writes to the serial port directly.
- Units are mm and mm/min everywhere.
- Colours only in `src/styles/tokens.css`; components use `var(--ol-*)`.
- Safety rules in `docs/decisions.md` and the spec §11 are non-negotiable: Stop always visible while connected, never auto-start or auto-resume, laser off while jogging and framing by default.
- Strict TypeScript, files under ~400 lines, no dead code, no TODOs without an issue.
- Package manager: pnpm through Corepack (`corepack pnpm …`).
