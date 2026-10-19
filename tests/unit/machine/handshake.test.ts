import { describe, expect, it } from 'vitest';
import { HandshakeError } from '$lib/machine/errors';
import { GrblDriver } from '$lib/machine/grbl/driver';
import { Listeners } from '$lib/machine/store';
import type { Transport } from '$lib/machine/types';
import { VirtualScheduler } from '$lib/machine/virtual-scheduler';
import { createRig, testProfile } from './helpers';

/** A port that accepts writes and never answers. */
class SilentTransport implements Transport {
  readonly kind = 'simulator' as const;
  connected = false;
  closed = 0;
  written: number[] = [];
  private readonly data = new Listeners<Uint8Array>();
  async open(): Promise<void> {
    this.connected = true;
  }
  async close(): Promise<void> {
    this.connected = false;
    this.closed++;
  }
  async write(bytes: Uint8Array): Promise<void> {
    this.written.push(...bytes);
  }
  onData(cb: (chunk: Uint8Array) => void) {
    return this.data.add(cb);
  }
  onDisconnect() {
    return () => undefined;
  }
}

describe('handshake', () => {
  it('reads $I and $$ and reports firmware, buffer size and settings', async () => {
    const rig = await createRig({ connect: false });
    const result = await rig.run(rig.driver.connect(rig.transport, testProfile()));
    expect(result).toMatchObject({
      firmware: { name: 'grbl', version: '1.1h.20190825' },
      rxSize: 128,
      laserModeOff: false,
      bedSizeMismatch: null,
    });
    expect(result.settings[30]).toBe('1000');
    expect(result.settings[130]).toBe('400.000');
    expect(rig.driver.state.get().connection).toBe('connected');
    expect(rig.driver.state.get().settings[32]).toBe('1');
    const sentLines = rig.driver.console
      .entries()
      .filter((e) => e.direction === 'sent')
      .map((e) => e.text);
    expect(sentLines.slice(0, 2)).toEqual(['$I', '$$']);
    // Nothing was sent before the welcome: no reset was needed.
    expect(rig.sim.receivedBytes()[0]).toBe('$'.charCodeAt(0));
  });

  it('sends a soft reset when no welcome arrives within 2.5 s', async () => {
    const rig = await createRig({ connect: false, sim: { welcomeOnOpen: false } });
    const result = await rig.run(rig.driver.connect(rig.transport, testProfile()));
    expect(result.firmware.name).toBe('grbl');
    expect(rig.sim.receivedBytes()[0]).toBe(0x18);
    expect(rig.clock.now()).toBeGreaterThanOrEqual(2500);
    expect(rig.clock.now()).toBeLessThan(3000);
  });

  it('fails with a clear message when the device never answers', async () => {
    const clock = new VirtualScheduler();
    const driver = new GrblDriver({ scheduler: clock });
    const transport = new SilentTransport();
    await expect(clock.runUntil(driver.connect(transport, testProfile()))).rejects.toThrow(HandshakeError);
    expect(transport.written).toEqual([0x18]);
    expect(transport.closed).toBe(1);
    expect(clock.now()).toBe(5000);
    expect(driver.state.get().connection).toBe('disconnected');
  });

  it('uses the RX buffer size from [OPT:]', async () => {
    const rig = await createRig({ connect: false, sim: { rxBufferSize: 256 } });
    const result = await rig.run(rig.driver.connect(rig.transport, testProfile()));
    expect(result.rxSize).toBe(256);
    expect(rig.driver.rxSize).toBe(256);
  });

  it('reports laser mode off and a bed size mismatch', async () => {
    const rig = await createRig({ connect: false, sim: { settings: { 32: 0, 130: 300 } } });
    const result = await rig.run(rig.driver.connect(rig.transport, testProfile()));
    expect(result.laserModeOff).toBe(true);
    expect(result.bedSizeMismatch).toEqual({ width: 300, height: 400 });
  });

  it('survives line noise while the board boots', async () => {
    const rig = await createRig({ connect: false, sim: { bootGarbage: true } });
    await rig.run(rig.driver.connect(rig.transport, testProfile()));
    expect(rig.driver.console.entries().some((e) => e.kind === 'unknown')).toBe(true);
    expect(rig.driver.state.get().connection).toBe('connected');
  });

  it('polls status every 200 ms when idle, as a realtime byte', async () => {
    const rig = await createRig();
    const before = Array.from(rig.sim.receivedBytes()).filter((b) => b === 0x3f).length;
    await rig.clock.advance(1000);
    const after = Array.from(rig.sim.receivedBytes()).filter((b) => b === 0x3f).length;
    expect(after - before).toBe(5);
    expect(rig.driver.state.get().mpos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('refuses to connect twice', async () => {
    const rig = await createRig();
    await expect(rig.driver.connect(rig.transport, testProfile())).rejects.toThrow(/Already connected/);
  });
});
