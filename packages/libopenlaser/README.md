# libopenlaser

Drive laser engravers and cutters from the browser. One library imports and builds the design, turns it into a job, connects to the machine and runs it, with no server, drivers or desktop app.

libopenlaser powers [openlaser](https://openlaser.app), the laser app that runs in your browser.

## Supported machines

| Controller      | Connection                                  | Jobs                                     |
| --------------- | ------------------------------------------- | ---------------------------------------- |
| **GRBL**        | USB (Web Serial)                            | G-code, streamed with character counting |
| **LaserPecker** | Bluetooth (Web Bluetooth), USB (Web Serial) | Raster files uploaded to the device      |
| **Ruida**       | Exported file                               | `.rd` files, run from the laser's panel  |

Every live machine has an in-process virtual device, so you can build and test without hardware.

## Install

```bash
npm i libopenlaser
```

Ships as ES modules with TypeScript types. Units are mm and mm/min throughout.

## Entry points

| Import                  | What's in it                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `libopenlaser/geometry` | Vectors, 2D matrices, paths, Béziers, polygons and Clipper offsets                                          |
| `libopenlaser/project`  | The document model and its operations, machine profiles and presets, material presets, `.olaser` files      |
| `libopenlaser/cam`      | Toolpaths, the G-code emitter, time estimates and per-controller job encoders                               |
| `libopenlaser/machine`  | Transports, the machine connection contract, the GRBL and LaserPecker drivers, job streaming and simulators |
| `libopenlaser/import`   | SVG, DXF, image and G-code importers                                                                        |
| `libopenlaser/fonts`    | Google Fonts and local fonts, HarfBuzz shaping (Bangla and other complex scripts) and text outlines         |
| `libopenlaser/shapes`   | Parametric shapes: stars, polygons, arrows, hearts and more                                                 |
| `libopenlaser/trace`    | Turn a bitmap into vector paths, on a worker when one is available                                          |

## Quick start

Compile a project to G-code and stream it to a GRBL laser:

```ts
import { compileJob } from 'libopenlaser/cam';
import { GrblDriver, JobRunner, WebSerialTransport } from 'libopenlaser/machine';

const plan = compileJob({ project, profile, assets });

// Opening a port must start from a user gesture, such as a click.
button.onclick = async () => {
  const transport = await WebSerialTransport.request();
  const driver = new GrblDriver();
  await driver.connect(transport, profile);

  const runner = new JobRunner(driver);
  runner.onEvent((event) => console.log(event.type));
  await runner.run(plan.gcode);
};
```

`runner.stop()` holds, resets and turns the laser off at any time.

## Fonts

`loadCatalog()` fetches the full Google Fonts list from `fonts/google-fonts.json` beside your page. Call `setCatalogUrl(url)` to load it from somewhere else; without it, the bundled faces are offered. Font files come from the Fontsource CDN and are cached in IndexedDB.

## Safety

Lasers burn and blind. The drivers never start or resume a job on their own, `stop` works at any time without waiting for a reply, framing runs with the laser off or at the lowest power, and a dropped link fails the job. Keep Stop within reach in anything you build, and never leave a running laser unattended.

## Adding a machine

Each controller is a protocol module under `machine/`, an encoder under `cam/` when it needs more than G-code, and an adapter in the app. See [adding-a-machine.md](https://github.com/theanam/openlaser.app/blob/main/docs/adding-a-machine.md).

## Credits

LaserPecker protocol details come from the [LaserPecker protocol notes](https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md) by nerdocs. libopenlaser implements the protocol independently from that description; no code from pyrograph is included. The Ruida `.rd` encoder is ported from [MeerK40t](https://github.com/meerk40t/meerk40t) (MIT).

## License

[MIT](LICENSE)
