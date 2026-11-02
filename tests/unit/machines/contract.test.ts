/**
 * The machine adapter contract, run against every registered adapter. A new adapter gets these
 * tests by being listed in the registry; a live one also needs a payload fixture below.
 */
import { describe, expect, it } from 'vitest';
import { ADAPTERS, adapterFor, CONTROLLER_IDS, DEFAULT_ADAPTER, machineKind } from '$app/machines/registry';
import type { LiveMachine } from '$app/machines/types';
import type { MachineConnection, Transport, Unsubscribe } from '$lib/machine';
import { VirtualScheduler } from '$lib/machine';
import { Listeners } from '$lib/machine/store';
import { defaultMachineProfile } from '$lib/project/factory';
import { parseMachineProfile, serializeMachineProfile } from '$lib/project/machine-file';

/** Payloads each live adapter's encoder would produce, small enough for a virtual device. */
interface Fixture {
  /** Finishes in a few seconds. */
  job: unknown;
  /** Runs long enough to pause and stop. */
  longJob: unknown;
  frame: unknown;
  /** Gets a freshly connected machine ready for jobs. */
  prepare?: (connection: MachineConnection, clock: VirtualScheduler) => Promise<void>;
}

function gcodeJob(moves: number): { lines: string[] } {
  const lines = ['G90', 'G21', 'M4 S0', 'G0 X10 Y10', 'G1 F600'];
  for (let i = 0; i < moves; i++) lines.push(`G1 X${10 + (i % 2) * 20} Y${10 + i * 0.2} S500`);
  return { lines: [...lines, 'M5', 'G0 X0 Y0'] };
}

/** A LaserPecker job file: 64-byte header (id at offset 5) and a 20 × 20 image. */
function laserPeckerJob(id: number) {
  const data = new Uint8Array(64 + 400).fill(0xff);
  data[0] = 0x10;
  new DataView(data.buffer).setUint32(5, id);
  return {
    parts: [{ file: { id, data }, settings: { power: 20, depth: 10, passes: 1, x: 10, y: 10 } }],
    accessory: null,
  };
}

const FIXTURES: Record<string, Fixture> = {
  laserpecker: {
    job: laserPeckerJob(1),
    longJob: laserPeckerJob(2),
    frame: { rect: { x: 10, y: 10, width: 20, height: 20 }, px: 4 },
  },
  grbl: {
    job: gcodeJob(4),
    longJob: gcodeJob(400),
    frame: ['G90', 'G21', 'G0 X10 Y10', 'G1 X30 F3000 S0', 'G1 Y30', 'G1 X10', 'G1 Y10', 'G0 X0 Y0'],
    async prepare(connection, clock) {
      // The simulator may boot locked, as a machine with homing does.
      const driver = (
        connection as unknown as { driver: { state: { get(): { status: string } }; unlock(): Promise<void> } }
      ).driver;
      if (driver.state.get().status === 'Alarm') await clock.runUntil(driver.unlock());
    },
  },
};

/** Wraps a transport so a test can cut the link the way a cable pull or BLE dropout does. */
class DroppableTransport implements Transport {
  private readonly drops = new Listeners<string>();
  private dropped = false;

  constructor(private readonly inner: Transport) {}

  get kind() {
    return this.inner.kind;
  }

  get connected() {
    return !this.dropped && this.inner.connected;
  }

  open(options: { baudRate: number }) {
    return this.inner.open(options);
  }

  close() {
    return this.inner.close();
  }

  write(data: Uint8Array) {
    if (this.dropped) return Promise.reject(new Error('Link lost'));
    return this.inner.write(data);
  }

  onData(cb: (chunk: Uint8Array) => void): Unsubscribe {
    return this.inner.onData((chunk) => !this.dropped && cb(chunk));
  }

  onDisconnect(cb: (reason: string) => void): Unsubscribe {
    const a = this.inner.onDisconnect(cb);
    const b = this.drops.add(cb);
    return () => (a(), b());
  }

  drop(): void {
    this.dropped = true;
    void this.inner.close();
    this.drops.emit('Link lost');
  }
}

const LIVE = ADAPTERS.filter((a): a is typeof a & { live: LiveMachine } => a.live !== null);

describe('machine registry', () => {
  it('has unique ids, the default first', () => {
    expect(new Set(CONTROLLER_IDS).size).toBe(ADAPTERS.length);
    expect(DEFAULT_ADAPTER.id).toBe('grbl');
    expect(adapterFor('no-such-machine')).toBe(DEFAULT_ADAPTER);
    expect(adapterFor(undefined)).toBe(DEFAULT_ADAPTER);
  });

  it('round-trips every controller id through a machine file, and falls back for unknown ones', () => {
    for (const adapter of ADAPTERS) {
      const profile = defaultMachineProfile({ controller: adapter.id, ...adapter.profileDefaults });
      expect(parseMachineProfile(serializeMachineProfile(profile), CONTROLLER_IDS).controller).toBe(
        adapter.id,
      );
    }
    const stray = serializeMachineProfile(defaultMachineProfile({ controller: 'no-such-machine' }));
    expect(parseMachineProfile(stray, CONTROLLER_IDS).controller).toBe(DEFAULT_ADAPTER.id);
  });

  it('tags machines with their controller', () => {
    expect(machineKind({ controller: 'grbl', laserType: 'diode' })).toBe('');
    expect(machineKind({ controller: 'ruida', laserType: 'co2' })).toBe('CO₂ · Ruida');
    expect(machineKind({ controller: 'laserpecker', laserType: 'diode' })).toBe('LaserPecker');
  });

  it.each(ADAPTERS.map((a) => [a.id, a] as const))('%s describes itself completely', (_id, adapter) => {
    expect(adapter.label).not.toBe('');
    expect(adapter.exportLabel).not.toBe('');
    expect(adapter.panel).toBeTruthy();
    if (!adapter.live) return;
    // A real way in, and a virtual one for dry runs and these tests.
    expect(adapter.live.transports.some((t) => !t.virtual)).toBe(true);
    expect(adapter.live.transports.filter((t) => t.virtual)).toHaveLength(1);
    expect(adapter.controls).toBeTruthy();
    expect(FIXTURES[adapter.id], `contract fixture for ${adapter.id}`).toBeDefined();
  });
});

describe.each(LIVE.map((a) => [a.id, a] as const))('%s connection contract', (id, adapter) => {
  const fixture = () => FIXTURES[id];

  async function connect() {
    const clock = new VirtualScheduler();
    const profile = defaultMachineProfile({ controller: id, ...adapter.profileDefaults });
    const transport = new DroppableTransport(adapter.live.virtual(profile, { scheduler: clock }));
    const connection = await clock.runUntil(adapter.live.open(transport, profile, { scheduler: clock }));
    await fixture().prepare?.(connection, clock);
    await clock.advance(500);
    const lost: string[] = [];
    connection.onLost((reason) => lost.push(reason));
    /** Advances the clock until `check` holds. */
    const until = async (check: () => boolean, maxMs = 60_000) => {
      for (let t = 0; t < maxMs && !check(); t += 50) await clock.advance(50);
      expect(check()).toBe(true);
    };
    return { clock, transport, connection, lost, until };
  }

  it('connects idle, with nothing to stop', async () => {
    const { connection } = await connect();
    expect(connection.status.get()).toMatchObject({ connection: 'connected', activity: 'idle' });
    expect(connection.canStop).toBe(false);
  });

  it('runs a job to completion and comes back idle', async () => {
    const { clock, connection, until } = await connect();
    expect(await clock.runUntil(connection.run(fixture().job))).toEqual({ outcome: 'completed' });
    await until(() => connection.status.get().activity === 'idle');
    expect(connection.canStop).toBe(false);
  });

  it('stops a running job at once', async () => {
    const { clock, connection, until } = await connect();
    const done = connection.run(fixture().longJob);
    await until(() => connection.status.get().activity === 'running');
    expect(connection.canStop).toBe(true);
    await clock.runUntil(connection.stop());
    expect(await clock.runUntil(done)).toEqual({ outcome: 'aborted' });
    await until(() => !connection.canStop);
  });

  it('pauses and resumes only when asked', async () => {
    const { clock, connection, until } = await connect();
    if (!connection.capabilities.pause) return;
    const done = connection.run(fixture().longJob);
    await until(() => connection.status.get().activity === 'running');
    await connection.pause();
    await until(() => connection.status.get().activity === 'paused');
    await clock.advance(5000);
    expect(connection.status.get().activity).toBe('paused');
    await connection.resume();
    await until(() => connection.status.get().activity === 'running');
    await clock.runUntil(connection.stop());
    expect((await clock.runUntil(done)).outcome).toBe('aborted');
  });

  it('frames, and Stop ends a frame', async () => {
    const { clock, connection, until } = await connect();
    if (!connection.capabilities.frame) return;
    const done = connection.frame(fixture().frame);
    await until(() => connection.status.get().activity === 'framing');
    expect(connection.canStop).toBe(true);
    await clock.runUntil(connection.stop());
    expect(['aborted', 'completed']).toContain((await clock.runUntil(done)).outcome);
    await until(() => !connection.canStop);
  });

  it('fails the job and reports a dropped link, never resuming', async () => {
    const { clock, transport, connection, lost, until } = await connect();
    const done = connection.run(fixture().longJob);
    await until(() => connection.status.get().activity === 'running');
    transport.drop();
    expect((await clock.runUntil(done)).outcome).toBe('failed');
    await until(() => connection.status.get().connection === 'disconnected');
    expect(lost).toHaveLength(1);
    expect(connection.canStop).toBe(false);
  });

  it('disconnects quietly', async () => {
    const { clock, connection, lost } = await connect();
    await clock.runUntil(connection.disconnect());
    expect(connection.status.get().connection).toBe('disconnected');
    expect(lost).toEqual([]);
  });
});

describe('detecting machines on a port', () => {
  const withProbe = LIVE.filter((a) => a.live.probe);

  it.each(withProbe.map((a) => [a.id, a] as const))(
    '%s recognises its own device and no other',
    async (_id, adapter) => {
      for (const other of LIVE) {
        const clock = new VirtualScheduler();
        const profile = defaultMachineProfile({ controller: other.id, ...other.profileDefaults });
        const transport = other.live.virtual(profile, { scheduler: clock });
        const own = defaultMachineProfile({ controller: adapter.id, ...adapter.profileDefaults });
        const found = await clock.runUntil(adapter.live.probe!(transport, own, { scheduler: clock }));
        if (other === adapter) expect(found?.baudRate).toBeGreaterThan(0);
        else expect(found).toBeNull();
        // The port is left closed for the real connection.
        expect(transport.connected).toBe(false);
      }
    },
  );
});
