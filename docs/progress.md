# Progress

## v1 (M0–M7) — 2026-10-20

Built in one pass from SPEC.md and the design handoff.

- **M0 Foundation:** Vite 8, Svelte 5, strict TypeScript, ESLint, Prettier, Vitest, Playwright, CI and Pages workflows, design tokens, Geist fonts, unsupported-browser state on the start screen.
- **M1 Simulator and protocol:** GRBL simulator with RX/planner limits and fault injection, line and status parsers, full error and alarm tables, GrblDriver with handshake, JobRunner with character counting. 50,000-line streaming test with chunked, noisy responses: no overflow.
- **M2 Connect, console, jog:** Web Serial transport with reconnect, machine panel, jog pad (step and hold-to-jog), home, unlock, console with history, copy and log download, `$$` viewer and editor.
- **M3 G-code sender:** open G-code files, preview, frame by file bounds, run, pause, resume, stop, error policy, wake lock, leave-page guard, safety checklist.
- **M4 Canvas, SVG, line and fill:** canvas navigation, selection, move, scale, rotate, marquee, numeric fields with 9-point anchor, SVG importer with colour-to-layer dialog, line and fill CAM, emitter and optimizer, preview with scrubber, origin modes, bounds warnings, G-code export.
- **M5 Images:** image import with DPI metadata, tone adjustments, seven dithering modes, worker-based previews, raster scanlines with RLE, bidirectional and overscan.
- **M6 Projects and persistence:** `.olaser` files, autosave and session restore, recent projects, undo and redo, machine profiles with `.json` import and export, preferences, settings backup and restore, onboarding (last tour step).
- **M7 PWA and polish:** offline precache, update toast that never reloads mid-job, keyboard shortcuts, overrides, air assist, batched preview rendering, README with screenshots.

Extras requested by the owner: first-run tour, help and about pages, error boundaries around every region, SEO and social tags, 1:1 vector print template, GitHub links, Peacock colour.

Tests: Vitest unit, property and golden suites (CAM, raster, simulator streaming, optimizer equivalence through the simulator, project files, storage, UI logic) and Playwright e2e flows against the virtual machine.

### Manual test checklist (real GRBL laser)

1. Connect laser lists the USB port; the handshake shows the firmware and RX size.
2. Machine with `$22=1` connects in Alarm; Unlock and Home both clear it.
3. Jog 0.1, 1, 10 and 50 mm steps in each direction; holding a jog button moves continuously and stops on release.
4. With `$32=0`, the laser-mode warning appears and "Enable $32=1" writes the setting.
5. Frame traces the job outline with the laser off; with frame power set to 1%, a faint dot appears and turns off after framing.
6. Start a short line job at low power: the safety checklist appears once per session, and the burn matches the preview.
7. Pause holds motion; Resume continues the same line.
8. Stop (button and Esc) halts within a moment, the laser turns off, and the machine reports Idle or Alarm.
9. Unplug the USB cable mid-job: the app reports a failed job, and the laser stops when its buffer empties.
10. Overrides change speed and power while running; reset returns to 100%.
11. A 100 × 100 mm photo at 254 dpi streams without stutter.
12. `$$` backup saves a file; restore writes back only changed values after confirmation.
