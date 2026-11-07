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
