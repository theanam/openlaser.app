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
