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
