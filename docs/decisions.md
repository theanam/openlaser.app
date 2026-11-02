# Decisions

Append-only log of architecture and product decisions. Newest entries go at the end of each section.

## Product and naming

- **Name.** The app is `openlaser` (domain `openlaser.app`), replacing the "Kerfwright" working name. `APP_NAME` lives in `src/lib/config/app.ts`.
- **Project files use `.olaser`.** The design handoff proposed `.olp`; the owner chose `.olaser`. A project file is a zip with `project.json` and `assets/<id>.<ext>`. Plain JSON with base64 assets is also accepted on open.
- **Machine profiles save as `.json`** (`{ format: "openlaser-machine", version: 1, profile }`). A bare profile object also imports.
- **License: MIT**, matching the owner's other open-source projects. The spec listed GPL-3.0-or-later as an option.
- **Units: millimetres only in v1.** Inch display is deferred.
- **Shape tools ship early.** Rectangle, ellipse and measure are in the design's tool rail, so they ship with v1. Text (and the font picker it needs) stays in M8+.
- **Hosting.** The build uses a relative base (`./`) so it runs from a GitHub Pages project path or a custom domain. Pages and help/about use hash routes (`#/help`, `#/about`).

## Dependencies

- **Svelte 5, Vite 8, TypeScript strict, Vitest 5, Playwright** per the spec. pnpm 10 is pinned through `packageManager` (Corepack).
- **bits-ui** (headless, tree-shakeable) for dialogs, alert dialogs, dropdown menus and popovers. Native `alert`/`confirm`/`prompt` are never used.
- **@lucide/svelte** for icons, imported per icon (`@lucide/svelte/icons/<name>`). Lucide has no brand icons, so the GitHub mark is an inline SVG.
- **@fontsource/geist-sans and @fontsource/geist-mono** self-host Geist (OFL) so the PWA works offline. Only the Latin subsets in weights 400/500/600 (sans) and 400/500 (mono) are bundled.
- **clipper2-ts** (BSL-1.0): a maintained pure-TypeScript port of Clipper2. It tree-shakes and needs no WASM loading, which suits workers. `geometry/clipper.ts` scales to integer µm (×1000) and hides that from callers. `clipper2-js` was rejected: unmaintained since 2024 and it declares Angular peer dependencies.
- **idb** for IndexedDB, **fflate** for `.olaser` archives, **nanoid** for ids, **fast-check** for property tests, **fake-indexeddb** and **jsdom** for tests.

## Project layer

- **Undo/redo uses immutable snapshots.** Every operation in `project/operations.ts` returns a new Project, so a history entry is a reference and assets (Blobs) are shared. History is capped at 200 steps. Drags and scrubs coalesce into one step by key.
- **Imported art is centred on the bed and kept upright on screen.** On origins other than bottom-left the screen mirrors bed space, so the importer pre-flips art so it reads correctly on screen and on the material.
- **Layers are never empty.** A layer exists only while it holds objects: every commit (and every project opened) drops empty layers, so deleting the last object on a layer removes the layer, and undo brings both back. New layers are created in the same step as the objects that go on them; the + button makes a new layer from the selection.
- **Clicking a layer selects everything on it** (and makes it active), so its objects show on the bed with the selection box and size. Hovering a layer row makes its objects glow. Rows offer "Move selection here" when other objects are selected.
- **Cut and paste keep layers:** the clipboard carries the copied objects' layers, so a layer removed by Cut comes back with its settings on paste.
- **Trace layers group by power** (5 % steps, darkest first). A layer is a set of burn settings, so colors that burn alike share one; a 24-color photo trace lands on a handful of layers.
- **Layers persist and hold objects (supersedes "Layers are never empty").** A layer is a set of burn settings that stays until deleted, so + adds an empty layer and deleting the last object keeps its layer. The Layers panel lists each layer's objects under it; objects drag from one layer to another, and object rows select, hide and glow on the bed like layer rows. Deleting a layer with objects asks where they go (`deleteDestinations`: layers that fit every object, same mode first, nearest in run order first); only when no other layer fits does the dialog say the objects go too. Images fit image layers, vectors and text fit line and fill layers. A trace that replaces its photo still removes the photo's layer when that empties it.

## CAM (vector)

- **Fill region:** each object is resolved with even-odd, so compound paths and text keep their holes. Objects then merge with non-zero, so overlapping objects stay filled where they overlap.
- **Fill scanlines** are computed by direct even-odd crossings on the merged region. This is exact in floating point and fast. Lines sit on a global grid at (k + ½)·interval in the rotated frame, so separate jobs and cross-hatch passes line up. 0°, 90°, 180° and 270° are exact. Bidirectional fills alternate per non-empty scanline.
- **Kerf offset:** each closed contour is offset on its own. Outlines grow and holes shrink for a positive kerf, judged by nesting depth. Contours that collapse are dropped.
- **Ordering** applies to line layers only. Greedy nearest-neighbour where a path becomes available only after every path it contains is done; open paths inside a closed shape count as contained. Ties go to the lower index. The first layer starts from 0,0; later layers start where the previous ended.
- **Layer `visible` is display-only.** `output` decides whether a layer is in the job; `object.visible` decides whether an object is.
- **Mismatched objects are skipped:** images on line/fill layers and vectors on image layers. The layer settings panel says so.
- **Origin anchors follow the screen.** `anchorPoint` uses the profile's origin corner, so "top" means the top as drawn. The anchor is taken from laser-on bounds. A missing machine position or user origin falls back to 0,0 so export still works; starting such a job is blocked in the UI.
- **Warnings:** one blocking `out-of-bounds` per job (covers overscan and travel); `missing-asset` and `empty-job` are blocking; `speed-exceeds-max` (once per layer), `text-unsupported` and `open-path-fill` are not.
- **Emitter:** M4 is set once in the header. Toolpaths marked constant switch with `M3 S0` and back with `M4 S0`. S0 stays modal from the header. Zero-length moves are skipped in both optimized and unoptimized output so the two stay comparable. Positions track rounded values so there is no drift. Debug comments use `; <layer name>`.
- **Stats:** burn distance counts G1 with S > 0; travel counts G0 plus laser-off G1.
- **Time estimate:** trapezoid per move with GRBL-style junction-deviation corner speeds and backward/forward planner passes. Defaults when limits are unknown: G0 at 3000 mm/min, 500 mm/s² per axis, junction deviation 0.01 mm. G1 feeds are capped only when $110/$111 are known.

## CAM (raster) and importers

- **Rotated images are rejected** with a blocking `rotated-image` warning and no runs. Mirroring (negative scale) works. The angle field is disabled for selections containing images.
- **Grayscale before resampling** (both linear, a quarter of the cost). Downsampling averages areas; upsampling is bilinear on pixel centres.
- **Transparency** is kept through resampling and composited over white after tone adjustments, so transparent areas never burn, even inverted.
- **Tone:** brightness ±2.55 × value; contrast 259(c+255)/255(259−c); gamma `out = in^(1/gamma)`. Order: brightness, contrast, gamma, invert.
- **Dithering:** error diffusion thresholds at 128 with serpentine scanning; Atkinson keeps its 6/8 error; ordered is Bayer 8×8.
- **Pass-through** skips tone and dithering but still resamples to the DPI grid, then thresholds at 128 (or maps linearly for grayscale).
- **Grayscale power:** levels 1–255 map linearly onto minPower–power; white is power 0.
- **Raster runs:** one run per burned scanline; in-row gaps stay as power-0 segments; overscan is power-0 segments; bidirectional alternates over burned lines only. compileJob repeats passes.
- **SVG colour mapping:** a stroked shape goes to its stroke colour as a line group, even with a fill; fill-only shapes go to fill groups. Closed paths end with an explicit `L` back to the start.
- **SVG styles:** presentation attributes, then `<style>` rules (simple compound selectors), then `style`. Gradients become their first stop colour; patterns their fallback or black. `text`, `use`, `foreignObject`, `clip-path`, `mask` and `filter` are counted and reported after import.
- **Embedded SVG images:** raster `data:` URIs only.
- **G-code preview parser** assumes G17 with incremental I/J (GRBL default); G4/G10/G28/G30/G38.x/G92 axis words are parameters; arcs flatten at 0.05 mm. `splitGcodeLines` strips comments only; lines of 80+ characters are reported and never rewritten.
- **Image DPI metadata** comes from PNG pHYs, JPEG JFIF and EXIF; values outside 10–10000 dpi are ignored; default 254 dpi, shrunk to fit the bed.
- **Palette names:** the last three palette colours are named Coral, Sky and Bone.

## UI

- **Canvas** is Canvas 2D. Vector objects cache an object-space `Path2D` and are transformed with `addPath`, so strokes keep a constant pixel width. The toolpath preview batches moves into bed-space `Path2D` chunks of 16k moves per power shade, so million-segment jobs redraw with a few dozen stroke calls.
- **Image previews** are dithered in a worker at up to 1.5 MP, tinted in the layer colour and cached per object and settings. The raw image shows faintly while a preview computes.
- **Two workers:** compile on one (a newer compile restarts it), parsing and image previews on the other, so a long photo compile never blocks previews.
- **Esc stops a job from anywhere,** including text fields. Every other shortcut stays out of text fields (SPEC §9.6) and out of open dialogs.
- **Browser shortcuts are remapped:** ⌘/Ctrl+N, O, S, ⇧S, I, E, P, Z, ⇧Z, Y, C, X, V, D, A, 0, =, −. Digits match by physical key so Shift+1/Shift+2 work on any layout. `P` toggles Design and Preview (Tab stays for focus navigation).
- **Printing:** the template is a true vector SVG in millimetres (curves stay curves), with corner marks and a 50 mm scale bar. Actual size or fit to page.
- **Error boundaries** (`<svelte:boundary>`) wrap every region: top bar, tools, canvas, each side panel, console, status bar, dialogs, tour and pages. A failure shows a compact retry card in place of that region only.
- **First-run tour** is stored as a flag in `localStorage` (`openlaser.tour.v1`). Its last step picks a machine profile, which covers the spec's onboarding step. Every entry in `src/app/features.ts` must appear in a tour step; a unit test enforces it.
- **Stop stays visible on Help and About** while a machine is connected (a sticky Stop strip), so navigating away never hides it.
- **`machine.svelte.ts` is kept as one file (~500 lines)** so the safety-critical start, frame and stop flow reads top to bottom. Wake lock and console batching live in `machine-support.ts`.
- **Machine presets** (`src/lib/project/machine-presets.ts`): 55 GRBL lasers researched from manufacturer and retailer pages (October 2026), plus three generic sizes. Sizes are working travel, which can be smaller than the honeycomb or frame (the Two Trees TS3 is 300 × 200 mm on a 300 × 300 bed). Air assist is preset only where the maker documents M8. Stock non-GRBL machines (xTool D1, Jinsoku app firmware, Snapmaker, LaserPecker) are left out. Presets are searchable and grouped by brand in the tour and in Machine profiles.
- **Aspect lock is off by default** so W and H edit independently, as typed. The chain button turns it on; Shift still keeps aspect while dragging a corner handle.
- **New text and library shapes are placed upright on every origin corner.** On beds homed at the top or right the screen mirrors bed space; imports already pre-flipped for that, but the Text tool and drawn library shapes placed object space as is, so text came out upside down on top-left machines (LaserPecker) and mirrored on Ruida's top-right. They now take the same flip (`uprightIn`, `uprightTextAt` in `src/app/lib/placement.ts`), with the click as the text's top-left on screen. Text made before the fix keeps its old transform.
- **Shape tools are one-shot:** drawing a rectangle or ellipse returns to the Select tool with the new shape selected.

## Text and shapes (from curvesmith)

- **Text objects cache their outlines.** CAM is pure and cannot load fonts, so a `TextObject` stores `paths` (Y-up mm) next to its text and style. Edits commit at once; the outlines follow as a silent update to the same undo step. Text without outlines (font not loaded) is a blocking CAM warning, so a job never silently drops it.
- **Fonts:** the Google Fonts catalogue (`public/fonts/google-fonts.json`, from Fontsource via `pnpm fonts:update`), single-face TTFs from the Fontsource CDN cached in IndexedDB, outlines via opentype.js (lazy-loaded). Picker rows preview with Google's css2 `&text=` subset. Workbox caches fonts and previews so they work offline once seen. Default font: Geist 500 (bundled, monolinear, sturdy at small sizes).
- **Text block anchoring:** new text puts its top-left at the click; when outlines change size the top-left stays fixed.
- **Shape library** ported from curvesmith (28 shapes). Shapes are stretched to fill their box exactly so the drawn size is the cut size. A vector made with the Shapes tool keeps a `shape` spec (kind, params, box) so its parameters stay editable.
- **Console placement:** always visible at the bottom of the right column, next to the machine controls, with a draggable height.
- **Enter in picker search** picks the first result and calls `preventDefault`, so the keypress cannot reopen the popover through its trigger.

## Image tracing (from curvesmith)

- **Engine** ported from curvesmith (`src/lib/trace`): OKLab palette, speckle merge, contour loops, staircase removal, Schneider curve fitting and corner detection, in a module worker. A new trace restarts the worker so the live preview follows the settings.
- **Laser defaults:** every preset sets `stacked: false`. Stacked colour layers overlap underneath each other, which a laser would burn twice.
- **White means no burn:** traced regions lighter than 92% luminance (the paper background) never become layers.
- **Placement:** one fill (or line) layer and vector object per traced colour, using the image's own transform, so the trace sits exactly over the photo. The image is removed (and its layer when emptied), or kept hidden underneath. With colour and gray traces, layer power scales with darkness.
- **Size:** images are downscaled to 1,600 px on the long side before tracing, which keeps the live preview responsive and is finer than a diode laser's spot at typical sizes.
- **Shortcut:** Shift+T. ⌘/Ctrl+Shift+T is reserved by Chrome (reopen closed tab) and never reaches the page.
- curvesmith's AI background removal and upscaling (onnxruntime) are not ported yet.
- **Stepper carets** on every number field. Click steps once, holding repeats after 400 ms, Shift ×10, Alt ×0.1; a press-and-hold is one undo step.
- **Power presets:** on power fields (layer power, min power, frame power) the unit itself ("% ⌄") opens a dropdown of common levels, so there is only one set of carets; typing any value still works.
- **Selection size on the bed:** a width × height pill (mm, one decimal) sits under the selection box and follows drags and edits.

## Framing and the pre-flight

- **Framing has its own section,** pinned above Start job: Frame once, Frame until stopped, laser off or low power (0.1–5 %, the spec's cap), and frame speed. A loop runs frame passes back to back through the job runner, so Stop behaves the same; "Finish this pass" ends the loop gently. Turning low power on asks for confirmation (eye protection).
- **The pre-flight shows on every job start,** stricter than SPEC §11.7. It shows the hazards with illustrations, the job's size, time, peak power and layers, and whether this outline was framed (with "Frame first"). The first job of a session needs each hazard ticked; later jobs show them pre-confirmed for a one-click start.
- **Frame panel layout:** two equal fields (Laser 0–5 %, where 0 is off, with presets; Speed) and one Frame button with an attached Repeat toggle. Turning the laser on for framing asks for confirmation.
- **Stop is enabled only when there is something to stop** (a job, a frame, or a Run/Jog/Home/Hold/Door/Check state); it stays visible while connected. This departs from DESIGN §7 ("never disabled") at the owner's request: an always-live Stop at idle sent a feed hold that stranded the machine in Hold.
- **Job ghost.** While a job or frame runs from a user or current origin, the design view draws a faint copy of the output layers moved by the job's origin offset (`JobPlan.offset`, captured at start so a current-origin ghost does not follow the head). Absolute jobs have a zero offset and draw nothing extra.
- **Burning layer.** The emitter records each layer's first G-code line (`layerStarts`); the machine store maps the runner's acked line count onto it, and the layer's row shows a pulsing "Burning" tag with a red border. Frames show none.
- **Toasts go by the clock.** Each toast stores its wall-clock expiry; one timer sweeps the next expiry and the Toaster sweeps again on `visibilitychange` and `focus`, since hidden tabs throttle timers and left toasts up long after their ring had drained. A repeat of a message already showing folds into it (×N) and restarts its time; toasts with actions and other tones stay separate.
- **Stop outside a job:** a jog is ended with jog-cancel (machine returns to Idle); other manual motion gets feed hold then soft reset, so nothing queued resumes later. Any hold outside a job shows a banner with Resume (`~`) and Clear (reset).
- **Import formats:** SVG; DXF (ASCII); PNG, JPEG, WebP, AVIF, BMP, GIF (first frame); G-code (.gcode, .nc, .gc, .ngc, .txt); .olaser. AVIF decodes natively in Chromium; TIFF and HEIC would need bundled decoders and are left out.
- **Two ways in:** the Image tool (in the tool rail with the drawing tools, ⌘I) takes SVG, DXF and raster images; Open (⌘O) takes .olaser projects and G-code. Dropping files on the canvas accepts all of them. A file that lost its extension is sniffed on Open: a zip or openlaser JSON is a project, anything else is G-code.
- **Console auto-scroll** follows the newest line (keyed on the last entry, since the line count stops changing once the 2,000-line view is full). A header toggle and a preference turn it off.

## DXF import

- **ASCII DXF only.** Binary DXF is rare and gets a message asking for ASCII.
- **Entities:** LINE, LWPOLYLINE and POLYLINE (with bulges), CIRCLE, ARC, ELLIPSE, SPLINE and INSERT (nested, rotated, scaled, arrayed). Arcs and ellipses become exact cubics; splines are evaluated as NURBS and sampled 24 times per knot span; fit-point-only splines become Catmull-Rom cubics. Planar entities with extrusion (0,0,-1) are mirrored as AutoCAD does.
- **Skipped and reported:** text, dimensions and leaders, hatches, solids and meshes, entities on off or frozen layers. Paper space is ignored.
- **Units:** `$INSUNITS` (in, ft, mm, cm, m); unset means mm. The import dialog switches units.
- **Colors:** true color, then ACI, then BYLAYER, with BYBLOCK and layer 0 inheriting from the INSERT. ACI 7 shows black. Each color becomes a line layer through the SVG mapping, so the dialog and layer matching are shared.
- **Chaining:** open pieces of one color whose endpoints meet (within 1e-4 drawing units) are joined, and a chain that returns to its start becomes a closed shape so fills and kerf offsets work on CAD outlines.
- **Bed contrast:** the canvas draws each layer in an ink mixed toward white (dark bed) or black (light bed) until it reaches 4.5:1 against the bed (`src/app/canvas/ink.ts`). The layer keeps its own color, so color matching on later imports still works.

## Connection help

- **“Laser not showing up?”** opens a four-step walkthrough (power, USB or Bluetooth, driver, last checks) from the Machine panel and the start screen, and as a Help section. Closing the port picker without a choice shows a toast that links to it.
- **Driver steps follow the user agent** (Windows, macOS, Linux, ChromeOS) with tabs for the others. Links go to the chip makers: WCH for CH340/CH341, Silicon Labs for CP210x. Linux covers the dialout group and brltty grabbing CH340 ports.
- **Bluetooth:** the port picker runs without filters, so paired Bluetooth serial ports (Chrome 117+) are listed. Wi-Fi is out of scope.

## Analytics

- **Google Analytics on the public site only.** `scripts/gtag.ts` injects the gtag snippet at build time when `OPENLASER_GTAG_ID` is set, which only the Pages workflow does. Dev, CI, e2e and self-hosted builds carry no tag. The ID is validated so nothing else can be injected.

## Outline tool

- **One outline around the selection, always.** Each object's area is taken even-odd (as it burns), all objects are merged non-zero, then offset with Clipper2. Open lines join as strokes as wide as the offset; images and unloaded text count as their frame.
- **Separate parts are bridged.** When the offset leaves more than one outer edge, the outline is closed morphologically (grow, then shrink, round joins) with the smallest radius that leaves one edge, found by doubling and bisection, then eased ×3 so bridges are broad curves. Parts too far apart for that fall back to the convex hull. The outline never comes closer to any object than the offset.
- **Defaults:** 3 mm, round corners, outer edge only (holes dropped: key-ring blanks and sticker cuts). Negative offsets inset.
- **Result:** one vector object in bed coordinates on an "Outline" line layer, created when missing and reused after that. Preview is drawn dashed in the cut colour while the options are open.

## Local fonts

- **Uploaded fonts** (TTF, OTF, WOFF, TTC) are parsed with opentype.js and stored in IndexedDB (`openlaser-user-fonts`), so they come back on the next visit. WOFF2 is refused: opentype.js cannot read it.
- **System fonts** use the Local Font Access API (Chrome and Edge). The first listing asks permission from a click; afterwards they load at startup when the permission is already granted. Faces are read on demand. Collections (.ttc, common on macOS) are split in `sfnt.ts` and the face matching the PostScript name is used.
- **Precedence:** a local family wins over a Google family with the same name. Text keeps its outlines in the project, so a project still burns on a machine without the font; editing that text there falls back to the cached outlines until the font is available.

## Text position

- **Text keeps its top edge across edits.** Re-outlining shifts the object by the difference in block height (line boxes from the font's ascender and descender). The height the current outlines were made for is stored as `TextObject.blockHeight`; measuring the tallest glyph instead made text creep down by the ascender gap on every edit. Text saved before the field existed uses the glyph measure once.
- **Fonts without the letters.** A font that lacks the text's characters outlines to nothing but still has a block height. That height is stored like any other and anchors the transform (the size estimate is only for text never outlined), and text outlined to nothing is not re-outlined until it changes: before, the two together moved such text by the difference on every pass, forever. The outliner reports the missing characters (`charToGlyphIndex` = 0); see the font fallback below for what the user sees.
- **Editing in place.** A textarea is laid over the text object with a CSS matrix built from the bed transform and the object transform (`text-edit.ts`), so it pans, zooms and rotates with the outlines. The canvas skips drawing that object while it is edited; the textarea shows the live text in the layer's ink, and outlines update underneath as you type. CSS centres glyphs in the line box while the outliner puts the first baseline one ascender down, so the box is shifted by half the difference. Esc, Ctrl/⌘+Enter or a click elsewhere ends editing; text left empty is deleted.

## Aspect ratio

- **Proportions are kept by default** for text, images and imported or traced art (SVG, DXF, traces, outlines): their proportions are the design. Rectangles, ellipses (`VectorObject.drawn`) and library shapes are drawn to size and stretch freely. The chain button overrides the default for the current selection only; Shift while dragging a handle flips the setting for that drag.
- **Overlapping glyph contours are merged.** Fonts fill by the non-zero rule, so contours may overlap (the bar of a "t" over its stem). Burned even-odd that overlap was a hole, and in line mode it added cuts inside the letter. `textToPaths` outlines glyph by glyph and merges any glyph whose contours overlap (Clipper2 non-zero union, 0.005 mm flattening); glyphs without overlaps keep their curves. `TEXT_OUTLINE_VERSION` (stored as `TextObject.outlineVersion`) re-outlines older text once on open, in place.

## CO₂ lasers

- **Profiles carry `laserType` (diode, co2), `controller` (grbl, ruida), `constantPower` and `speedUnit`.** Choosing CO₂ turns on constant power (M3: M4 drops power at corners, below where a tube fires), mm/s speeds and air assist. Older profiles load with diode GRBL defaults.
- **GRBL CO₂** keeps the normal connect and detection flow. Detection never guesses a CO₂ preset from bed size alone: a GRBL handshake looks the same from a tube and a diode, so CO₂ presets need their name in the firmware text. The pre-flight check adds water cooling. Layers under 10 % power show a hint that tubes rarely fire there.
- **Ruida** controllers run jobs from their own panel. Their profiles hide connect, console and job origin, and Export writes an `.rd` file (`src/lib/cam/ruida`), ported from MeerK40t's rdjob.py (MIT): the same header, per-layer settings, absolute moves in µm, checksum and 0x88 swizzle. Encoders are tested against vectors produced by MeerK40t's own functions. Jobs compile with an absolute origin, so they burn where they sit on screen. Live Ruida control (USB or UDP) is out of scope for now: browsers cannot open UDP sockets, and USB needs testing on hardware.
- **Presets:** generic Ruida sizes, Thunder Laser Nova 24/35/51/63, Aeon Mira 5/7/9, OMTech 16×24, 20×28, 24×40, a generic GRBL CO₂ and a K40 with a GRBL board. Sizes from the makers' spec pages, checked 2026-10.

## LaserPecker

- **Source and licence.** The only protocol source is the LaserPecker protocol notes by nerdocs (`docs/protocol.md` in nerdocs/pyrograph). That repository's code is GPL-3.0, so nothing else in it, nor the `laserpecker` PyPI package, was read. openlaser's implementation is written from the notes alone and stays MIT; the README, About page and each protocol module credit the notes. Test vectors are built by hand.
- **An adapter like the others.** The protocol, BLE transport, driver, virtual device and raster encoder live in `src/lib/machine/laserpecker`, `src/lib/machine/transport/web-bluetooth.ts` and `src/lib/cam/laserpecker`. `LaserPeckerConnection` meets the machine contract (a job is the file plus power, depth, passes and position; a frame is a rectangle and resolution step), `laserpecker` in `ENCODERS` builds the file in the CAM worker, and the app adapter (`src/app/machines/laserpecker`) adds the panel, pinned controls, status badge and session. No shared UI checks for LaserPecker. Its connect, Stop and controls follow the connected machine, so picking another profile while it is connected leaves them on screen.
- **Transports.** Bluetooth first (Web Bluetooth, `WebBluetoothTransport`), USB second through the existing Web Serial transport at 460800 baud. The BLE transport tries the three bridge services in the order the notes give, writes without response in 179-byte chunks at least 100 ms apart, and reports `gattserverdisconnected` as a disconnect. Splitting and joining of replies is done by the protocol's `FrameReader`, so serial and BLE share it. The CP210x dongle (AT commands) and Wi-Fi are out of scope.
- **Requests one at a time.** Several queries answer with the same function code and no sub-command echo, so the link sends one request at a time and gives the next frame its matcher accepts to it. Frames nobody waits for (the device acknowledges uploads on its own) are logged and dropped. Status polls every second; five missed polls in a row count as a lost link. Polling pauses during an upload, because the device reads anything sent then as file data.
- **Upload.** Ask for stored file ids; when the job's id is already there, skip the upload. Otherwise: exit, announce the byte count (header included), write the header and image raw (2048 bytes every 50 ms over USB, BLE pacing in the transport), wait for the stored acknowledgement, then start. Nothing is sent after the raw data. A refusal that answers with the exit code is a stuck device: the user is told to switch it off and on.
- **File id from content.** The device keeps a file per id and ignores a re-upload under a known id, so the id is a 32-bit FNV-1a hash of the header's geometry fields (tag, size, step, position, dpi) and the image. The name is left out: renaming a project does not re-upload. Zero is never used.
- **Raster only.** The job becomes one 1-bit bitmap on the device grid: image layers go through `processRaster` at the device DPI (grayscale becomes Floyd–Steinberg, since the device has no grey levels); line and fill layers are drawn from their toolpaths, a pixel wherever a burning segment passes. A point on the far edge of the bounds belongs to the last pixel. Images are packed 1 bit per pixel when the firmware is known to take it (LP2 version ranges from the notes), else 1 byte per pixel. G-code and vector uploads are not implemented: their payloads are undocumented.
- **One power per job (superseded below).** The device burns a file at one power and depth; the panel first held its own Power, Depth and Passes.
- **Positions.** LaserPecker presets home top-left. CAM maps bed mm to the device frame (top-left, y down) from the profile's origin corner, and jobs always use bed positions (the job origin setting is hidden).
- **Safety.** Stop is on screen whenever a LaserPecker is connected, live whenever the driver is busy or the device reports a job or frame (also one started from its own button), and sends print stop, preview stop and exit without waiting. Stop during an upload abandons it before the start command. Nothing starts or resumes on its own; a dropped link fails the job. Framing traces the outline at preview power 1 and asks for confirmation once per session; it runs until Stop framing or Stop. The pre-flight checklist is shared with GRBL.
- **Models.** LP2: 100 × 100 mm, 1K / 1.3K / 2K. LP3: 115 × 80 mm (an oval area per LaserPecker's spec page) with 1K / 2K / 4K; the 4K step code and the LP3's limits are guesses until checked on a device. Unknown firmware gets every step.
- **Virtual LaserPecker.** An in-process device (`VirtualLaserPecker`) answers like an LP2 3.16. Unit tests drive the driver against it on a virtual clock, the shared adapter contract runs on it, the panel offers it for dry runs and e2e uses it.

## Machine adapters

- **Every controller is an adapter.** The owner wants new machines added without touching the shared UI, so machine support is three layers, one folder each, plus registry lines: a machine-layer connection (`MachineConnection` in `src/lib/machine/adapter.ts`), a CAM encoder (`ENCODERS` in `src/lib/cam/encoders.ts`) when G-code is not enough, and an app adapter (`MachineAdapter`, listed in `src/app/machines/registry.ts`). Steps in `docs/adding-a-machine.md`.
- **The UI asks the registry.** Stop, Esc, the Help/About Stop strip, the pre-flight, leaving the page, the reload prompt, the machine switcher, the top bar's connect and export, the Machine panel and the console all go through `connectedSession()`, `activeAdapter()` or `shownAdapter()` and the adapter's capabilities (`jobOrigin`, `console`, `gcode`). Nothing outside an adapter checks a controller id. The Machine panel shows the connected machine, else the selected one, so Stop and the controls never vanish when the profile changes.
- **Connections are opaque to payloads.** `run(job)` and `frame(frame)` take whatever that controller's encoder produces; the machine layer still knows nothing about projects or CAM. Common status: connection, activity (idle, framing, sending, running, paused, stopping, busy), progress and error.
- **GRBL is wrapped, not rewritten.** `GrblConnection` holds the existing `GrblDriver` and `JobRunner`; `machine.svelte.ts` builds them through it and its Stop delegates to it (the jog-cancel / hold-then-reset logic moved there unchanged). The rest of the GRBL UI (jog pad, console, overrides, device settings, framing loop) is the GRBL adapter's panel and controls. The existing unit and e2e tests pass unedited.
- **Ruida is an adapter without a live link.** Its encoder is `ruidaEncoder` (absolute origin, MeerK40t-derived emitter); its panel is the USB-stick steps. `compileJob` no longer checks for Ruida: `CompileInput.absoluteOrigin` is set by the preview for adapters without `jobOrigin`.
- **`profile.controller` is a registered adapter id** (`LaserController = string`). `parseMachineProfile` takes the registered ids and falls back to the first; `adapterFor` falls back to GRBL for profiles naming an adapter that is gone.
- **Contract tests.** `tests/unit/machines/contract.test.ts` checks every registered adapter (unique ids, complete description, machine-file round trip) and drives every live one over its virtual device through a droppable mock transport: connect idle, run to completion, stop mid-job, pause and resume, frame and stop, a dropped link fails the job and fires `onLost`, disconnect is quiet.

## Accessories, rotary and laser sources

- **Hardware lives in the machine profile.** LightBurn makes LaserPecker users press console M-code buttons to change laser or mode and retype the work area for each mode. openlaser keeps it in the profile: `laserSources` (label, wavelength, select G-code, device code), `accessories` (rotary or slide: work area, start G-code, rotary setup) and `flatModeGcode`. Profiles from older versions load with none. Machine files keep them and drop malformed entries.
- **One switch per job.** The Machine panel's Setup (`AccessoryPicker`, shown for every adapter whose profile has accessories) picks Flat bed or an accessory, stored in the project's job settings with the object diameter, so it is undoable and travels with the design. Everything else follows from it in `src/lib/project/accessories.ts`: the work area (canvas, bounds check, preview), the mode G-code at the start of every job (flat or accessory), and the rotary's axis mapping. The choice locks while a job runs.
- **Rotary maths.** A rotary unrolls the object: the work area is the rotary's width by one circumference (π × diameter), capped by the most the rotary turns through. Roller: controller units per surface mm = units per turn ÷ (π × roller diameter), whatever the object. Chuck: units per turn ÷ (π × object diameter). On the A axis the units are degrees and Y words go out as A. Machines that convert surface mm themselves (LaserPecker's own protocol) take positions unscaled (`deviceScales`). The emitter applies the mapping as it writes each move, so toolpaths, bounds, stats and the preview stay in surface mm; the preview parser reads A or scaled Y back the same way; framing uses the same mapping. The head position GRBL reports is converted back to surface mm for the current-position origin; an A-axis rotary starts at its current angle.
- **Laser per layer.** With two or more sources a layer picks one (first by default). G-code jobs switch with the laser off (`M5 S0`, the select G-code, then the layer's laser mode again) whenever the next layer's laser differs, in layer order; layers are not reordered. LaserPecker's own protocol burns one file at one laser type, so its encoder builds one file per laser in order of first use, each at its first layer's power, and the connection runs them back to back as one job. A stopped or failed part ends the job.
- **LaserPecker accessories on its own protocol.** The print start and the rectangle preview carry the object diameter (× 100); a rotary frame uses the rotary preview mode. Before a job the connection reads the device settings and, when the rotary or slide flag differs, writes them back with only that flag changed (every other byte as read, per the protocol notes). Unverified on hardware.
- **LP4 and LP5 on the G-code path.** LaserPecker's LightBurn guides run them as GRBL devices with M-codes: M3010/M3011 pick the 450 nm or 1064 nm laser, M3030/M3031/M3032 select normal, slide and rotary modes, max S 255. Their presets are GRBL profiles carrying those as laser sources, flat-mode and accessory G-code, with the numbers from LaserPecker's own LightBurn device files (`LP4.lbdev`, `LP5 Regular Mode.lbdev`, `LP5 Slide Extension Mode.lbdev`, read 2026-11): 460800 baud, S 255, origin top left (their Mirror Y). LP4 160 × 120 mm, slide 160 × 300, rotary a chuck on Y at 256 mm per turn, up to 628 mm around; LP5 120 × 160 mm, slide 300 × 160 (LightBurn does not drive the LP5 rotary). LP2 presets carry a slide (100 × 300) and a rotary (up to 628 mm around), the LP3 its electric roller (65 × 65); those sizes need confirming on devices.

## Complex scripts (Bangla and others)

- **Subsets on demand.** Fontsource serves each Google font as one file per subset. The catalogue now lists each family's non-latin subsets (`google-fonts.json` field 6, numbered CJK slices left out; 113 → 160 KB), and the loader fetches, caches and registers a subset face (`{id}-{subset}-{weight}-{style}`, with its `unicode-range` so the editor draws it) only when a text has characters from it. Latin faces keep their old cache keys. `src/lib/fonts/scripts.ts` maps characters to subsets.
- **HarfBuzz for everything outside latin.** opentype.js cannot reorder or combine Indic glyphs (ি before its consonant, ো around it, conjuncts such as ক্ষ, reph). Each line is split into runs: latin characters stay on the primary face through opentype.js, byte for byte as before; other scripts go to HarfBuzz (harfbuzzjs 1.6.3, MIT, 441 KB WASM loaded on first use) with that subset's face, or the whole file for uploaded and system fonts, which carry every script in one file. Spaces and joiners (ZWJ, ZWNJ) stay inside their run so a word is never split. Glyph outlines come from HarfBuzz and pass through the same path conversion and overlap merge. Letter spacing goes between clusters, never between a consonant and its marks. Runs are laid out left to right: a line that is all Arabic or Hebrew shapes correctly, mixed right-to-left and left-to-right lines are not reordered.
- **Outline version 3.** Text saved earlier re-outlines once on open (in place); text an older outliner drew as nothing (Bangla before this) gets its outlines then.
- **Offline.** The WASM is in the PWA precache; subset faces join the Fontsource runtime cache and IndexedDB like latin ones. Vite does not pre-bundle harfbuzzjs in dev, so it finds its WASM next to itself.
- **Picker.** When the text is mostly one non-latin script, the font picker opens filtered to fonts that have it (a chip named for the script, e.g. "Bangla", toggles the filter).
- **Tests** use Noto Sans Bengali's latin and bengali subset files (OFL-1.1, licence in `tests/fixtures/fonts`): ি order, the ক্ষ conjunct, the ো split, reph advance, spacing per cluster, mixed lines, Latin output unchanged, and an e2e that types Bangla, picks the font through the filter and burns it.

## LaserPecker on hardware (LP3, first runs)

- **The LP3 advertises "LaserPecker-III<id>".** Bluetooth names map the roman numeral to the model (longest first, since the id is hex): "LP3-109BFB". Firmware ranges are known only for the LP2, so the panel takes the model from the name for the rest.
- **The LP3 sends every reply twice** over Bluetooth. A frame identical to the one just received within 250 ms is dropped before matching (`DUPLICATE_WINDOW_MS`), and the settings read accepts no frame with the status reply's length. Without these, a request sent right after a status poll could take the repeated status as its answer. For the settings read that meant writing status bytes back as device settings. A flat-bed job whose settings cannot be read leaves them alone; only accessory jobs need them.
- **The LP3 ran a job without firing:** status showed engraving (mode 1), progress to 99 % and a finished pass, but nothing burned. It is a 1064 nm fiber laser. The print start said laser type 0 (blue) with pulse frequency 0. The LP3 preset now carries one infrared laser (laser type 1), and the panel has a pulse-frequency field for infrared lasers (Auto = 0, or 26–60 kHz). Which of the two the LP3 needs is not confirmed yet.

## LaserPecker burn settings live on the layers

- **One set of settings.** The panel's own Power, Depth and Passes sat next to the layer's and confused. Layers now carry them for LaserPeckers too; the panel keeps only what belongs to the machine (resolution, infrared pulse frequency).
- **Depth is a speed unit.** Profiles can show speeds as `depth` (1–100), LaserPecker's own measure. LaserPecker's LightBurn guide gives the scale: depth 1–100 = 24000–240 mm/min, so speed = 24000 / depth and layers still store mm/min (`src/lib/project/depth.ts`). Every LaserPecker preset uses it, the G-code LP4 and LP5 included, where it matches LightBurn's mapping.
- **Different settings in one job.** The device takes one laser, power, depth and pass count per file, so the encoder makes one file per distinct setting, in layer order, and the connection burns them back to back after one Start. Layers that share a setting share a file.
- **No scan settings on the bitmap path.** On LaserPecker's own protocol the job is one bitmap at the device resolution: fills are rasterised solid at that pitch, and fill interval and angle, overscan, direction, cross-hatch, image line density and min power are hidden (`scanSettings` capability) and ignored by the encoder.

## Font fallback

- **Letters the chosen font lacks come from a fallback, quietly.** As browsers and other apps do: for each script in the text that the chosen font cannot draw, the script's Google Noto family loads at the nearest weight (`FALLBACK_FAMILIES` in `src/lib/fonts/scripts.ts`: Noto Sans Bengali for Bangla, Noto Sans Devanagari, Noto Sans Arabic, …; Noto Sans for Greek, Cyrillic, Vietnamese and extended Latin). The chosen font's own glyphs always win; only uncovered letters fall back, so a Latin font with Bangla text keeps its Latin letters. No toast.
- **Only what nothing can draw is reported.** Characters no face could draw (offline before the fallback was cached, or scripts without a fallback such as CJK and emoji) are stored on the text (`missingGlyphs`). Start job then warns, non-blocking, which letters will not burn; text with no outlines at all stays a blocking warning, and the canvas label says no font could draw it.
- **Export and Start recompile when the design changes mid-compile** (outlines arriving from a font, say), up to three times, so they no longer fail with "Nothing to export yet" right after a font change.

## Connecting: one button, detected machine

- **One Connect button** (`ConnectButton`, in the top bar, start screen and Machine panel): the click uses the last method, its menu offers USB and Bluetooth. Virtual machines keep their own buttons.
- **Detection is part of the adapter contract.** A live adapter may offer `probe(transport, profile)`: open the picked port, ask in its own protocol, close it, and say the baud rate that answered (and the model when the reply names it). On USB the selected machine's adapter probes first, then the others in registry order. GRBL: a soft reset and `$I`, answered by "Grbl…", "FluidNC" or `[VER:`, tried at the profile's rate, 115200, then 460800 (LaserPecker LP4 and LP5). LaserPecker: a version query at 460800, answered by an AA BB frame (model from the firmware version). Probes send nothing that moves a machine. Bluetooth reaches LaserPeckers only, and the advertised name gives the model.
- **Then the profile follows.** The selected profile when it fits; else an existing profile of that kind (same model when known); else a new one from the model's preset, or the adapter's defaults; with the baud rate that answered (`chooseProfile`). A switch says "Found <profile>". The adapter's session then connects over the transport already picked (`connectTransport`), so GRBL's own model detection still runs after the handshake.
- **LP3 firmware.** One LP3 reported firmware 5515; 5500–5599 is taken as LP3 (1K, 2K, 4K) until more units are seen.

## Switching machines keeps the design upright

- **The project records the home corner it was laid out for** (`Project.designCorner`). When the active machine's corner differs (switching from a bottom-left GRBL laser to a top-left LaserPecker, or editing the profile's origin), the whole design is mirrored about its own centre in machine space (`src/lib/project/orientation.ts`). The screen mirrors too, so the art reads the same way up with the same layout; it keeps its machine position, so art by the home corner stays by the home corner; and switching back restores the exact coordinates, whatever the bed sizes. The re-layout is not an undo step: undoing restores an older snapshot, which is then re-laid out for the current machine the same way.
- **Projects without a recorded corner** are taken as laid out for the machine they are open on and are never moved; the corner is recorded from then on. (Guessing from the profile a project was created with was wrong whenever art was added after a switch.)
- **Connect button:** the method's own icon (USB or Bluetooth) on the button, and a menu of icon, name and a check on the method in use. **Machine picker:** the whole machine card opens it.
- **Electric Roller on the LP4: not in the preset yet.** It fits the LP4 as well as the LP3, but LaserPecker's LightBurn files cover only the Rotary Extension, so its mode and scaling are unknown. It returns once it can be tried on a device. The Setup switch shortens LaserPecker's names ("Rotary", "Roller") and keeps the full name in the title.
- **Imported images are placed upright too.** Image imports used a plain offset, so on machines homed at the top (LaserPecker; Ruida's top-right) they showed upside down, unlike SVG, DXF, text and shapes, which were already flipped to match the screen. They now go through the same upright placement (`imagePlacement`); images cannot rotate but may mirror, and CAM, the canvas and the LaserPecker raster all handle mirrored images. Images placed before the fix keep their transform: re-import them.

## Material presets

- **One picker on each layer** (`MaterialPicker`, under the layer's settings) with Engrave and Cut kept apart; image layers see engraving only. A cut preset makes the layer a line layer. Picking one sets power, speed, passes, the fill interval or image DPI, air assist when the source states it, and the laser on two-laser machines. The layer shows the preset's name only while its numbers still match.
- **What a machine gets.** LaserPeckers get their own model's table (matched by the profile name), with depth turned into speed and filters for the laser (450 / 1064 nm) and resolution. Other machines are matched by their laser and optical power (`MachineProfile.laserWatts`, filled from the model name when it has one rating): the nearest class at or below it among diode 5/10/20/40 W and CO₂ 40/60/80/100 W. Without a wattage the picker asks for one and saves it to the profile.
- **Data and sources.** Every row keeps its source URL and maker (`brand`), since several makers publish values for the same material and class. LaserPecker: its published per-model tables. Diode: Creality, Ortur, xTool, AtomStack and Sculpfun charts. CO₂: Thunder Laser, Boss Laser, AEON and OMTech charts (midpoints where a range is given). Where no pass count is published, one pass. Fetched 2026-11; the tables are data files under `src/lib/project/materials/`, one per model or wattage class.
- **PVC and vinyl are never offered**: burning them releases chlorine gas, which harms people and machines. LaserPecker's LP4 table lists PVC; those rows are dropped.
- **Presets are starting points.** The picker says so; values vary with the exact machine, focus and material batch.
