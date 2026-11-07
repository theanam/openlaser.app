# libopenlaser

[![npm](https://img.shields.io/npm/v/libopenlaser)](https://www.npmjs.com/package/libopenlaser)
[![license](https://img.shields.io/npm/l/libopenlaser)](LICENSE)

Laser engraving and cutting in the browser, as a library. Import or draw a design, turn it into a job, connect to the laser over USB or Bluetooth and run it, with no server, drivers or desktop app.

libopenlaser powers [openlaser](https://openlaser.app), the laser app that runs in a browser tab.

- **Machines**: GRBL lasers over USB, LaserPecker engravers over Bluetooth or USB, and Ruida CO₂ controllers through exported `.rd` files.
- **CAM**: cut lines with kerf offset, hatched fills, and dithered or grayscale image engraving, compiled to G-code or each controller's own format.
- **Design**: SVG, DXF, image and G-code import, Google Fonts text outlines (with HarfBuzz for Bangla and other complex scripts), parametric shapes and bitmap tracing.
- **Data**: nearly 80 machine presets, 1,300+ material presets, and the `.olaser` project format.
- **No hardware needed** to build and test: virtual GRBL and LaserPecker devices answer like the real ones.

## Contents

- [Install](#install)
- [Entry points](#entry-points)
- [Core ideas](#core-ideas)
- [Guides](#guides): [SVG to G-code](#svg-to-g-code) · [GRBL over USB](#grbl-over-usb) · [Without hardware](#without-hardware) · [LaserPecker](#laserpecker) · [Ruida](#ruida) · [Shapes, text and tracing](#shapes-text-and-tracing) · [Projects and presets](#projects-and-presets)
- [The connection contract](#the-connection-contract)
- [Safety](#safety)
- [Adding a machine](#adding-a-machine)

## Install

```bash
npm i libopenlaser
```

ES modules with TypeScript types, for any modern bundler (Vite, webpack, esbuild, Rollup).

| Where                                | What works                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Chrome, Edge, Opera, Brave (desktop) | Everything, including USB (Web Serial) and Bluetooth (Web Bluetooth)             |
| Firefox, Safari                      | Everything except connecting to a laser                                          |
| Web workers                          | CAM, geometry, projects, DXF and G-code import, tracing                          |
| Node                                 | The same, plus the virtual machines. SVG import needs a `DOMParser` (e.g. jsdom) |

Connecting to a laser has to start from a user gesture, such as a click: the browser shows its own port or device picker.

## Entry points

| Import                  | What's in it                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `libopenlaser/project`  | The document model and its operations, machine profiles and presets, material presets, `.olaser` files   |
| `libopenlaser/cam`      | `compileJob` (project → toolpaths → G-code), time estimates and per-controller encoders (`encodeJob`)    |
| `libopenlaser/machine`  | Transports, the connection contract, GRBL and LaserPecker connections, job streaming and virtual devices |
| `libopenlaser/import`   | `importSvg`, `importDxf`, `parseGcode`, `decodeImage`, and mapping imports onto project layers           |
| `libopenlaser/fonts`    | The Google Fonts catalogue, local fonts, HarfBuzz shaping and `outlineText`                              |
| `libopenlaser/shapes`   | `shapePaths`: 24 parametric shapes, from stars and cogs to hearts and spirals                            |
| `libopenlaser/trace`    | `trace`: bitmap to vector paths, on a web worker when one is available                                   |
| `libopenlaser/geometry` | Vectors, 2D matrices, paths, Béziers, polygons and Clipper offsets                                       |

## Core ideas

- **Units are mm and mm/min** everywhere. Power is a percent of the machine's maximum.
- **Bed coordinates are Y-up**, with the origin at the bottom-left of the bed. Each machine profile says which corner its home is in, and the compiler maps to it.
- **A project** holds ordered **layers** (each a burn setting: line, fill or image mode, speed, power, passes) and **objects** (vector paths, text, images) that sit on a layer with a transform. Projects are plain data, and the operations in `project` return new projects, so they suit undo stacks and frameworks.
- **A machine profile** describes the laser: bed size, home corner, controller (`grbl`, `laserpecker`, `ruida`), laser type and power range. `defaultMachineProfile(overrides)` fills in the rest, and `MACHINE_PRESETS` covers nearly 80 real machines.
- **`compileJob`** turns a project and a profile into toolpaths, G-code, bounds, time estimates and warnings. A warning marked `blocking` means the job must not run. Image objects need their pixels passed in `assets` (`decodeImage(blob)` gives them).
- **A connection** is the live link to a laser. Every controller implements the same [contract](#the-connection-contract): `run`, `frame`, `pause`, `resume`, `stop`, a status store and `onLost`.

## Guides

Every guide below is a file in [`examples/`](examples), typechecked and run by the test suite.

### SVG to G-code

```ts
/**
 * SVG in, G-code out. SVG parsing uses the browser's DOMParser; in Node, provide one (jsdom).
 */
import { compileJob } from 'libopenlaser/cam';
import { buildProjectObjectsFromSvg, importSvg } from 'libopenlaser/import';
import { addLayer, addObjects, createProject, defaultMachineProfile, makeId } from 'libopenlaser/project';

export function svgToGcode(svgText: string): string[] {
  // A 400 × 400 mm diode laser on GRBL. Units are mm and mm/min everywhere.
  const profile = defaultMachineProfile({ bedWidth: 400, bedHeight: 400 });

  // Each stroke or fill colour becomes one object on a layer of that colour.
  const drawing = importSvg(svgText);
  const { layersToAdd, objects, assets } = buildProjectObjectsFromSvg(drawing, [], makeId, { name: 'logo' });

  let project = createProject({ name: 'Logo' });
  for (const layer of layersToAdd) project = addLayer(project, { ...layer, power: 60, speed: 1200 });
  project = addObjects(project, objects, assets);

  const plan = compileJob({ project, profile, assets: new Map() });
  for (const warning of plan.warnings) console.warn(warning.message);
  return plan.gcode;
}
```

A red 36 × 16 mm rectangle comes out as:

```gcode
G90
G21
M4 S0
G0 X2 Y2
G1 Y18 F1200 S600
X38
Y2
X2
M5 S0
```

### GRBL over USB

Most diode lasers (Ortur, Sculpfun, Atomstack, Creality Falcon, Two Trees and others) run GRBL. The connection handshakes, streams with GRBL's character-counting flow control, and reports progress and alarms.

```ts
/**
 * Burn a project on a GRBL laser over USB. Call it from a click: the browser shows its port picker.
 */
import { compileJob } from 'libopenlaser/cam';
import { GrblConnection, WebSerialTransport, type RunOutcome } from 'libopenlaser/machine';
import type { MachineProfile, Project } from 'libopenlaser/project';

export async function burnOverUsb(project: Project, profile: MachineProfile): Promise<RunOutcome> {
  const plan = compileJob({ project, profile, assets: new Map() });
  const blocking = plan.warnings.find((w) => w.blocking);
  if (blocking) throw new Error(blocking.message);

  const machine = await GrblConnection.open(await WebSerialTransport.request(), profile);
  machine.onLost((reason) => console.error('Connection lost:', reason));
  try {
    // Keep a Stop button wired to machine.stop() for as long as this runs.
    return await machine.run({ lines: plan.gcode, estimatedSeconds: plan.stats.estimatedSeconds });
  } finally {
    await machine.disconnect();
  }
}
```

`machine.driver` gives lower-level control when you need it: jogging, homing, settings (`$$`), overrides and a console of everything sent and received.

### Without hardware

The virtual GRBL laser simulates the controller, its buffers and motion. It powers openlaser's "Try the virtual machine" and is handy for tests and demos.

```ts
/**
 * Run a job on the built-in virtual GRBL laser: no hardware, works in Node and the browser.
 */
import { GrblConnection, virtualGrblTransport, type RunOutcome } from 'libopenlaser/machine';
import { defaultMachineProfile } from 'libopenlaser/project';

export async function runOnVirtualLaser(gcode: string[]): Promise<RunOutcome> {
  const profile = defaultMachineProfile({ bedWidth: 400, bedHeight: 400 });
  const machine = await GrblConnection.open(virtualGrblTransport(profile), profile);

  machine.status.subscribe((s) => console.log(s.activity, s.progress ?? ''));
  try {
    // Like a real laser with homing switches, it starts in alarm until homed.
    await machine.driver.home();
    await idle(machine);
    // Resolves when the job completes, is stopped (machine.stop()) or fails.
    return await machine.run({ lines: gcode });
  } finally {
    await machine.disconnect();
  }
}

/** Resolves once GRBL reports Idle (its status reports arrive a few times a second). */
function idle(machine: GrblConnection): Promise<void> {
  return new Promise((resolve) => {
    const off = machine.driver.state.subscribe((state) => {
      if (state.status !== 'Idle') return;
      resolve();
      queueMicrotask(() => off());
    });
  });
}
```

`VirtualLaserPecker` does the same for LaserPecker.

### LaserPecker

LaserPecker LP2 to LP5 speak their own protocol: the job is uploaded as a dithered image, then started. The connection reads the model and firmware, frames at the lowest power, and burns one image per burn setting (and per laser on dual-laser models).

```ts
/**
 * Engrave a project on a LaserPecker. In the browser, connect over Bluetooth from a click:
 *
 *   button.onclick = async () => engraveOnLaserPecker(project, await WebBluetoothTransport.request());
 *
 * USB works too: pass `await WebSerialTransport.request()`.
 */
import { encodeJob } from 'libopenlaser/cam';
import {
  DEFAULT_RESOLUTION,
  LaserPeckerConnection,
  type LaserPeckerDriverOptions,
  type RunOutcome,
  type Transport,
} from 'libopenlaser/machine';
import {
  defaultMachineProfile,
  MACHINE_PRESETS,
  machinePresetName,
  presetProfileFields,
  type Project,
} from 'libopenlaser/project';

const LP2 = MACHINE_PRESETS.find((p) => machinePresetName(p) === 'LaserPecker LP2')!;

export async function engraveOnLaserPecker(
  project: Project,
  transport: Transport,
  options: LaserPeckerDriverOptions = {},
): Promise<RunOutcome> {
  const profile = defaultMachineProfile(presetProfileFields(LP2));
  const machine = await LaserPeckerConnection.open(transport, { ...options, baudRate: profile.baudRate });
  try {
    // The connection reads the model and firmware: they decide resolution and image packing.
    const model = machine.device.get().model;
    const resolution = DEFAULT_RESOLUTION;
    const { payload, warnings } = encodeJob(
      'laserpecker',
      { project, profile, assets: new Map() },
      { dpi: resolution.dpi, px: resolution.px, packed: model?.packed ?? false },
    );
    const blocking = warnings.find((w) => w.blocking);
    if (blocking) throw new Error(blocking.message);
    if (!payload) throw new Error('Nothing to engrave');

    // One part per burn setting (power, depth, passes), each an image file the device stores.
    return await machine.run({
      accessory: payload.accessory,
      parts: payload.parts.map((part) => ({
        file: { id: part.file.id, data: part.file.data },
        settings: {
          power: part.power,
          depth: part.depth,
          passes: part.passes,
          x: part.file.x,
          y: part.file.y,
          laserType: part.laserType,
          objectDiameter: payload.objectDiameter,
        },
      })),
    });
  } finally {
    await machine.disconnect();
  }
}
```

### Ruida

Ruida controllers (Thunder Laser, Aeon, OMTech and most CO₂ machines with a DSP panel) run jobs from a USB stick.

```ts
/**
 * Export a project as a Ruida `.rd` file, for CO₂ lasers that run jobs from their own panel.
 * Copy the file to a USB stick, then load, frame and start it on the laser.
 */
import { encodeJob } from 'libopenlaser/cam';
import { defaultMachineProfile, laserTypeDefaults, type Project } from 'libopenlaser/project';

export function exportRuida(project: Project): Uint8Array {
  const profile = defaultMachineProfile({
    ...laserTypeDefaults('co2'),
    controller: 'ruida',
    bedWidth: 600,
    bedHeight: 400,
    originCorner: 'tr',
  });
  const { payload, warnings } = encodeJob('ruida', { project, profile, assets: new Map() }, undefined);
  const blocking = warnings.find((w) => w.blocking);
  if (blocking) throw new Error(blocking.message);
  if (!payload) throw new Error('Nothing to export');
  return payload; // In a browser: new Blob([payload]) and download it as job.rd
}
```

### Shapes, text and tracing

```ts
/**
 * Build designs in code: parametric shapes, text outlines and bitmap tracing, each placed on a
 * layer as a vector object ready for the CAM.
 */
import { outlineText } from 'libopenlaser/fonts';
import { identity, translation, type PathData } from 'libopenlaser/geometry';
import { defaultLayer, makeId, type Layer, type VectorObject } from 'libopenlaser/project';
import { shapePaths } from 'libopenlaser/shapes';
import { trace, traceLayersToPaths, tracePreset, type Pixels } from 'libopenlaser/trace';

export const cutLayer: Layer = defaultLayer({ id: makeId(), mode: 'line', power: 80, speed: 600 });

function vector(name: string, paths: PathData[], x = 0, y = 0): VectorObject {
  const transform = x || y ? translation(x, y) : identity();
  return {
    id: makeId(),
    kind: 'vector',
    layerId: cutLayer.id,
    name,
    locked: false,
    visible: true,
    transform,
    paths,
  };
}

/** A 50 mm star at (20, 20) on the bed. Shapes are generated inside their box, in mm. */
export function star(): VectorObject {
  return vector('Star', shapePaths('star', 50, 50), 20, 20);
}

/**
 * Text as outlines, in any Google Font (downloaded from the Fontsource CDN and cached in
 * IndexedDB). HarfBuzz shapes complex scripts such as Bangla. Null when the font can't load.
 */
export async function textOutline(text: string): Promise<VectorObject | null> {
  const outline = await outlineText({
    text,
    fontFamily: 'Roboto',
    fontSize: 10,
    fontWeight: 400,
    italic: false,
    align: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
  });
  return outline ? vector(text, outline.paths) : null;
}

/**
 * Trace a bitmap (RGBA, like ImageData) into one vector object per colour, sized to `widthMm`.
 * Runs on a web worker when the page has one, else on the calling thread.
 */
export async function traceBitmap(image: Pixels, widthMm: number): Promise<VectorObject[]> {
  const result = await trace(image, tracePreset('logo').options);
  const heightMm = (widthMm * image.height) / image.width;
  return traceLayersToPaths(result, widthMm, heightMm).map((layer) => vector(layer.color, layer.paths));
}
```

Add the objects to a project with `addLayer(project, cutLayer)` and `addObjects(project, objects)`, then compile as above.

### Projects and presets

```ts
/**
 * Save and open `.olaser` files, set up a machine from a preset, and give a layer a material's
 * starting settings.
 */
import {
  defaultMachineProfile,
  deserializeProject,
  MACHINE_PRESETS,
  machinePresetName,
  presetBasis,
  presetLayerPatch,
  presetProfileFields,
  presetsFor,
  serializeProject,
  updateLayer,
  type Project,
} from 'libopenlaser/project';

export async function roundTrip(project: Project): Promise<Project> {
  // A zip with project.json and the image assets.
  const bytes: Uint8Array = await serializeProject(project);
  return deserializeProject(bytes);
}

export function orturProfile() {
  const preset = MACHINE_PRESETS.find((p) => machinePresetName(p) === 'Ortur Laser Master 3 (10W)')!;
  return defaultMachineProfile(presetProfileFields(preset));
}

/** Cutting settings for birch plywood, matched to the laser's kind and power. */
export function cutBirchPlywood(project: Project): Project {
  const profile = orturProfile();
  const preset = presetsFor(presetBasis(profile), 'cut').find((p) => p.material === 'Birch plywood');
  const layer = project.layers[0];
  return preset ? updateLayer(project, layer.id, presetLayerPatch(layer, preset)) : project;
}
```

## The connection contract

`GrblConnection` and `LaserPeckerConnection` both implement `MachineConnection<Job, Frame>`:

| Member                 | What it does                                                                    |
| ---------------------- | ------------------------------------------------------------------------------- |
| `status`               | A store (`subscribe`, `get`) of `{ connection, activity, progress, error }`     |
| `capabilities`         | Whether this machine can `frame`, `pause` and stream a `console`                |
| `run(job)`             | Runs a job; resolves `completed`, `aborted` (stopped) or `failed` with a reason |
| `frame(frame)`         | Traces the job outline with the laser off or at the lowest power                |
| `pause()` / `resume()` | Holds and continues a running job                                               |
| `stop()`               | Stops whatever runs, at once, without waiting for the machine                   |
| `canStop`              | True while something runs, moves or is held                                     |
| `onLost(cb)`           | The link dropped; a running job ends as failed                                  |
| `onConsole(cb)`        | Every line sent and received, where the machine has one                         |
| `disconnect()`         | Closes the link quietly                                                         |

Transports only move bytes: `WebSerialTransport`, `WebBluetoothTransport` (any BLE serial bridge; pass your GATT profiles) and the virtual devices all implement `Transport`, so a connection works over any of them.

## Safety

Lasers burn, blind and start fires. libopenlaser is built so that nothing surprises the person at the machine:

- Nothing starts or resumes unless your code calls `run`, `frame` or `resume`.
- `stop` works at any time and never waits for a reply. On GRBL it holds, resets and turns the laser off (`M5`).
- Framing runs with the laser off, or at the lowest power where the machine needs it on.
- A dropped connection fails the running job and fires `onLost`.

In anything you build, keep a Stop button visible while connected, never start a job without the user asking, and tell people to wear eye protection rated for their laser and never leave it running unattended.

## Adding a machine

A controller is a protocol module and connection under `machine/`, plus an encoder under `cam/` when it needs more than G-code. [adding-a-machine.md](https://github.com/theanam/openlaser.app/blob/main/docs/adding-a-machine.md) walks through it. Pull requests are welcome.

## Versioning

libopenlaser follows semantic versioning. While it is 0.x, minor versions may change the API; patch versions only fix. Every change to the library in the openlaser repository ships as a new version.

## Credits

LaserPecker protocol details come from the [LaserPecker protocol notes](https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md) by nerdocs. libopenlaser implements the protocol independently from that description; no code from pyrograph is included. The Ruida `.rd` encoder is ported from [MeerK40t](https://github.com/meerk40t/meerk40t) (MIT). Polygon offsets use [Clipper2](https://github.com/countertype/clipper2-ts), text shaping [HarfBuzz](https://github.com/harfbuzz/harfbuzzjs) and font parsing [opentype.js](https://github.com/opentypejs/opentype.js).

## License

[MIT](LICENSE)
