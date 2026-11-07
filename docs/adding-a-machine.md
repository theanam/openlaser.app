# Adding a machine

openlaser drives every machine through an adapter. GRBL and Ruida are adapters; a new controller
is one more, with no changes to the shared UI. Work through the layers bottom up. Each layer keeps
its rules: the machine layer knows nothing about projects or CAM, CAM is pure, and the UI never
writes to a port.

## 1. Machine layer: `packages/libopenlaser/src/machine/<id>/` (live machines only)

Skip this for machines that run exported files from their own panel, like Ruida.

- **Protocol**: framing, command builders and reply parsers, each with unit tests against
  hand-built byte vectors.
- **Transport**: reuse `WebSerialTransport` (USB serial) or `WebBluetoothTransport` (BLE serial
  bridges, pass your GATT profiles). A new transport implements `Transport` in
  `packages/libopenlaser/src/machine/types.ts` and adds its kind to `TransportKind`.
- **Connection**: a class implementing `MachineConnection<Job, Frame>` from
  `packages/libopenlaser/src/machine/adapter.ts`. `Job` and `Frame` are whatever your CAM encoder produces. The
  contract's safety rules are not optional: nothing starts or resumes unless asked, `stop` works
  at any time without waiting for a reply, and a dropped link fails the job and fires `onLost`.
- **Virtual device**: an in-process `Transport` that answers like the real machine. It powers the
  "Virtual …" connect button and the shared contract tests.
- **Exports**: the machine and CAM layers live in `libopenlaser`, and the app sees only its entry
  points. Export what the app needs from `packages/libopenlaser/src/machine/index.ts` (and
  `cam/index.ts` for the encoder), put the tests in `packages/libopenlaser/test`, and bump the
  library's version.

## 2. CAM layer: `packages/libopenlaser/src/cam/<id>/` (machines that take more than G-code)

- An encoder: `JobEncoder<Options, Payload>` from `packages/libopenlaser/src/cam/encoders.ts`, turning a
  `CompileInput` into your payload (bytes, a file plus metadata). Build on `compileJob` for
  toolpaths and on `packages/libopenlaser/src/cam/raster` for images. Keep it pure.
- Add one line to `ENCODERS` in `packages/libopenlaser/src/cam/encoders.ts`. The CAM worker looks encoders up there
  by id, and `encodeInWorker(id, …)` runs yours off the main thread.

G-code machines need no encoder: they use the preview compile.

## 3. App layer: `src/app/machines/<id>/`

- `index.ts` exports a `MachineAdapter` (`src/app/machines/types.ts`): id, label, tag, profile
  defaults, capabilities, export, and for live machines `live` (transports, a reactive
  `MachineSession`, `open` and `virtual`).
- A `panel` component for the Machine panel body, and for live machines a `controls` component
  pinned under the side panel with Start, Frame and the shared `StopButton`.
- The session runs the shared pre-flight: set `safetyRequest` before every job, as GRBL does.
  Wrap new UI regions in `ErrorBoundary`.
- Presets go in `packages/libopenlaser/src/project/machine-presets.ts` with `controller: '<id>'`. A preset can carry
  the machine's lasers (`laserSources`), accessories (rotaries, slides) and their mode G-code.
  Work area, rotary scaling, laser switching and mode G-code are handled for every adapter
  (`packages/libopenlaser/src/project/accessories.ts`); a machine on its own protocol reads the accessory and each
  layer's laser from its encoder input, as LaserPecker does.

## 4. Register it

Add the adapter to `ADAPTERS` in `src/app/machines/registry.ts`. That line puts it in Machine
profiles, routes Stop, Esc, the pre-flight and the top bar to it, validates `controller` in
machine files, and runs the shared contract tests against it.

## 5. Tests and docs

- `tests/unit/machines/contract.test.ts` runs against every registered adapter. A live adapter
  adds a payload fixture there (a short job, a long job, a frame); the suite fails until it does.
- Unit tests for the protocol, connection and encoder; an e2e test for the panel on the virtual
  device.
- Add the feature to `src/app/features.ts` and a tour step, write the decisions down in
  `docs/decisions.md`, and refresh the README.
