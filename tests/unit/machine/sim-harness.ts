import { GrblSimulator, type GrblSimulatorOptions } from '$lib/machine/simulator/simulator';
import { VirtualScheduler } from '$lib/machine/virtual-scheduler';

/** Talks to a simulator directly, byte for byte, without the driver. */
export function bareSimulator(options: Omit<GrblSimulatorOptions, 'scheduler'> = {}) {
  const clock = new VirtualScheduler();
  const sim = new GrblSimulator({ scheduler: clock, ...options });
  let text = '';
  sim.onOutput((bytes) => {
    for (const b of bytes) text += String.fromCharCode(b);
  });
  return {
    clock,
    sim,
    /** Complete lines received so far (CR stripped, empty lines dropped). */
    lines: () =>
      text
        .split('\n')
        .slice(0, -1)
        .map((l) => l.replace(/\r/g, ''))
        .filter((l) => l !== ''),
    clear: () => {
      text = '';
    },
    send: (data: string | number[]) => {
      sim.receive(
        typeof data === 'string' ? Uint8Array.from(data, (c) => c.charCodeAt(0)) : Uint8Array.from(data),
      );
    },
    /** Sends `?` and returns the status report body. */
    status: (): string => {
      const before = text.length;
      sim.receive(Uint8Array.of(0x3f));
      const report = text.slice(before).trim();
      return report;
    },
  };
}

/** A powered-on, unlocked simulator. */
export function readySimulator(options: Omit<GrblSimulatorOptions, 'scheduler'> = {}) {
  const harness = bareSimulator(options);
  harness.sim.powerOn();
  harness.send('$X\n');
  harness.clear();
  return harness;
}
