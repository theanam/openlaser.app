import { GrblDriver, type GrblDriverOptions } from '$lib/machine/grbl/driver';
import { JobRunner, type JobRunnerOptions } from '$lib/machine/job/runner';
import { GrblSimulator, type GrblSimulatorOptions } from '$lib/machine/simulator/simulator';
import { SimulatorTransport } from '$lib/machine/transport/simulator-transport';
import { VirtualScheduler } from '$lib/machine/virtual-scheduler';
import type { MachineProfile } from '$lib/project/types';

export function testProfile(overrides: Partial<MachineProfile> = {}): MachineProfile {
  return {
    id: 'test',
    name: 'Test laser',
    bedWidth: 400,
    bedHeight: 400,
    originCorner: 'bl',
    laserType: 'diode',
    controller: 'grbl',
    constantPower: false,
    speedUnit: 'mm/min',
    baudRate: 115200,
    maxS: 1000,
    laserModeRequired: true,
    defaultJogSpeed: 3000,
    frameSpeed: 3000,
    framePowerPercent: 0,
    supportsAirAssist: false,
    gcodeHeader: '',
    gcodeFooter: '',
    ...overrides,
  };
}

export interface Rig {
  clock: VirtualScheduler;
  sim: GrblSimulator;
  transport: SimulatorTransport;
  driver: GrblDriver;
  runner: JobRunner;
  /** Drives the virtual clock until the promise settles. */
  run<T>(promise: Promise<T>, maxMs?: number): Promise<T>;
}

export interface RigOptions {
  sim?: Omit<GrblSimulatorOptions, 'scheduler'>;
  driver?: Omit<GrblDriverOptions, 'scheduler'>;
  runner?: Omit<JobRunnerOptions, 'scheduler'>;
  profile?: Partial<MachineProfile>;
  /** Connect and unlock the boot alarm (default true). */
  connect?: boolean;
}

export async function createRig(options: RigOptions = {}): Promise<Rig> {
  const clock = new VirtualScheduler();
  const sim = new GrblSimulator({ scheduler: clock, ...options.sim });
  const transport = new SimulatorTransport(sim);
  const driver = new GrblDriver({
    scheduler: clock,
    wallClock: () => 1_700_000_000_000 + clock.now(),
    ...options.driver,
  });
  const runner = new JobRunner(driver, { scheduler: clock, ...options.runner });
  const run = <T>(promise: Promise<T>, maxMs?: number) => clock.runUntil(promise, maxMs);
  if (options.connect ?? true) {
    await run(driver.connect(transport, testProfile(options.profile)));
    if (driver.state.get().status !== 'Idle') {
      await run(driver.unlock());
      await clock.advance(250);
    }
  }
  return { clock, sim, transport, driver, runner, run };
}

/** A raster-like job: short G1 moves with power changes, every line well under 80 chars. */
export function rasterJob(lineCount: number): string[] {
  const lines = ['G90', 'G21', 'M4 S0', 'G0 X10 Y10', 'G1 F6000'];
  let x = 10;
  let y = 10;
  for (let i = lines.length; i < lineCount - 2; i++) {
    x = x >= 200 ? 10 : x + 0.25;
    if (x === 10) y += 0.1;
    lines.push(`G1 X${x.toFixed(2)} Y${y.toFixed(2)} S${(i * 37) % 1000}`);
  }
  lines.push('M5 S0', 'G0 X0 Y0');
  return lines;
}
