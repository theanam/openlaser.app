import { describe, expect, it } from 'vitest';
import { CommandError, DisconnectedError, MachineBusyError, ResetError } from '$lib/machine/errors';
import { REALTIME_BYTES } from '$lib/machine/grbl/realtime';
import type { RealtimeCommand } from '$lib/machine/types';
import { createRig } from './helpers';

const sentText = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe('GrblDriver commands', () => {
  it('resolves ok and error results and records the last error', async () => {
    const rig = await createRig();
    expect(await rig.run(rig.driver.sendCommand('G0 X1'))).toEqual({ ok: true });
    const result = await rig.run(rig.driver.sendCommand('G1 X5'));
    expect(result).toMatchObject({
      ok: false,
      code: 22,
      message: expect.stringMatching(/^Undefined feed rate/),
    });
    expect(rig.driver.state.get().lastError).toMatchObject({ code: 22, line: 'G1 X5' });
  });

  it('rejects non-ASCII and multi-line commands', async () => {
    const rig = await createRig();
    await expect(rig.driver.sendCommand('G0 X1\nG0 X2')).rejects.toThrow(RangeError);
    await expect(rig.driver.sendCommand('G0 X1°')).rejects.toThrow(RangeError);
  });

  it('maps every realtime command to its byte and never queues them', async () => {
    const rig = await createRig();
    // Fill the queue with a slow command so a queued byte would be visibly late.
    const homing = rig.driver.home();
    for (const cmd of Object.keys(REALTIME_BYTES) as RealtimeCommand[]) {
      if (cmd === 'soft-reset') continue;
      const before = rig.sim.bytesReceived;
      rig.driver.realtime(cmd);
      await Promise.resolve();
      expect(Array.from(rig.sim.receivedBytes().slice(before))).toEqual([REALTIME_BYTES[cmd]]);
    }
    rig.driver.realtime('cycle-start');
    await rig.run(homing);
  });

  it('jogs with $J=G91 G21 and switches a manual laser off first', async () => {
    const rig = await createRig();
    const start = rig.sim.bytesReceived;
    await rig.run(rig.driver.jog({ x: 10, y: -2.5 }, 3000));
    expect(sentText(rig.sim.receivedBytes().slice(start)).replace(/\?/g, '')).toBe(
      '$J=G91 G21 X10 Y-2.5 F3000\n',
    );
    await rig.clock.advance(1000);
    expect(rig.sim.position).toEqual({ x: 10, y: -2.5, z: 0 });

    await rig.run(rig.driver.sendCommand('M3 S10'));
    const mark = rig.sim.bytesReceived;
    await rig.run(rig.driver.jog({ x: 5 }, 1000));
    expect(sentText(rig.sim.receivedBytes().slice(mark)).replace(/\?/g, '')).toBe(
      'M5\n$J=G91 G21 X5 F1000\n',
    );
    await rig.clock.advance(1000);
    expect(rig.sim.burns).toEqual([]);
  });

  it('throws a CommandError when the controller rejects a jog', async () => {
    const rig = await createRig({ sim: { settings: { 20: 1 } } });
    await rig.run(rig.driver.home());
    await expect(rig.run(rig.driver.jog({ x: -10 }, 1000))).rejects.toBeInstanceOf(CommandError);
  });

  it('continuous jog runs to the soft limit and stops on cancel', async () => {
    const rig = await createRig();
    await rig.run(rig.driver.home());
    await rig.clock.advance(300);
    await rig.run(rig.driver.startContinuousJog({ x: 1 }, 6000));
    const jogLine = rig.driver.console
      .entries()
      .filter((e) => e.text.startsWith('$J='))
      .at(-1);
    expect(jogLine?.text).toBe('$J=G91 G21 X400 F6000');
    await rig.clock.advance(1000);
    rig.driver.cancelJog();
    await rig.clock.advance(300);
    expect(rig.driver.state.get().status).toBe('Idle');
    expect(rig.sim.position.x).toBeCloseTo(100, 0);
  });

  it('homes and unlocks', async () => {
    const rig = await createRig({ connect: false });
    await rig.run(rig.driver.connect(rig.transport, (await import('./helpers')).testProfile()));
    await rig.clock.advance(250);
    expect(rig.driver.state.get().status).toBe('Alarm');
    await rig.run(rig.driver.unlock());
    await rig.clock.advance(250);
    expect(rig.driver.state.get().status).toBe('Idle');
    expect(rig.driver.state.get().homed).toBe(false);
    await rig.run(rig.driver.home());
    expect(rig.driver.state.get().homed).toBe(true);
  });

  it('resets before unlocking after a critical alarm', async () => {
    const rig = await createRig({ sim: { faults: { lineAlarm: (line) => (line === 'G0 X5' ? 1 : null) } } });
    void rig.driver.sendCommand('G0 X5').catch(() => undefined);
    await rig.clock.advance(300);
    expect(rig.driver.state.get()).toMatchObject({ status: 'Alarm', alarm: { code: 1 } });
    const mark = rig.sim.bytesReceived;
    await rig.run(rig.driver.unlock());
    expect(sentText(rig.sim.receivedBytes().slice(mark)).replace(/\?/g, '')).toBe('\x18$X\n');
    await rig.clock.advance(300);
    expect(rig.driver.state.get()).toMatchObject({ status: 'Idle', alarm: null });
  });

  it('reads and writes settings', async () => {
    const rig = await createRig();
    await rig.run(rig.driver.writeSetting(110, '5000'));
    expect(rig.sim.settings[110]).toBe(5000);
    const settings = await rig.run(rig.driver.readSettings());
    expect(settings[110]).toBe('5000.000');
    await expect(rig.run(rig.driver.writeSetting(999, '1'))).rejects.toMatchObject({ code: 3 });
    await expect(rig.driver.writeSetting(1, 'a b')).rejects.toThrow(RangeError);
  });

  it('logs console traffic with directions and kinds', async () => {
    const rig = await createRig();
    const seen: string[] = [];
    rig.driver.onConsole((e) => seen.push(`${e.direction}:${e.kind}:${e.text}`));
    await rig.run(rig.driver.sendCommand('G4 P0'));
    await rig.clock.advance(200);
    expect(seen).toContain('sent:command:G4 P0');
    expect(seen).toContain('received:ok:ok');
    expect(seen.some((s) => s.startsWith('received:status:<Idle'))).toBe(true);
  });
});

describe('soft reset', () => {
  it('rejects pending commands with ResetError and never replays them', async () => {
    const rig = await createRig();
    // Fill the planner so later commands wait in the queue and in flight.
    const pending: Promise<unknown>[] = [];
    await rig.run(rig.driver.sendCommand('G1 F100'));
    for (let i = 1; i <= 40; i++) pending.push(rig.driver.sendCommand(`G1 X${i}`));
    await rig.clock.advance(50);
    const settled = pending.map((p) =>
      p.then(
        () => 'ok',
        (e: unknown) => e,
      ),
    );
    const reset = rig.driver.softReset();
    const results = await Promise.all(settled);
    expect(results.filter((r) => r instanceof ResetError).length).toBeGreaterThan(20);
    await rig.run(reset);
    const linesBefore = rig.sim.receivedLines.length;
    await rig.clock.advance(2000);
    expect(rig.sim.receivedLines.length).toBe(linesBefore);
    // Reset during motion: the alarm is surfaced and $X is offered.
    expect(rig.driver.state.get()).toMatchObject({ status: 'Alarm', alarm: { code: 3 } });
    await rig.run(rig.driver.unlock());
    expect(await rig.run(rig.driver.sendCommand('G0 X1'))).toEqual({ ok: true });
  });

  it('treats an unexpected welcome as a reset', async () => {
    const rig = await createRig();
    await rig.run(rig.driver.sendCommand('G1 F10'));
    const pending = Array.from({ length: 40 }, (_, i) =>
      rig.driver.sendCommand(`G1 X${i + 1}`).catch((e: unknown) => e),
    );
    await rig.clock.advance(10);
    rig.sim.receive(Uint8Array.of(0x18)); // the board resets on its own
    const results = await rig.run(Promise.all(pending));
    expect(results.filter((r) => r instanceof ResetError).length).toBeGreaterThan(20);
    expect(rig.driver.console.entries().some((e) => e.text === 'Controller reset unexpectedly')).toBe(true);
  });
});

describe('connection lifecycle', () => {
  it('rejects pending commands on disconnect and refuses new ones', async () => {
    const rig = await createRig();
    await rig.run(rig.driver.sendCommand('G1 F10'));
    const results = Array.from({ length: 30 }, (_, i) =>
      rig.driver.sendCommand(`G1 X${i}`).catch((e: unknown) => e),
    );
    await rig.clock.advance(5);
    await rig.run(rig.driver.disconnect());
    const settled = await Promise.all(results);
    expect(settled.filter((r) => r instanceof DisconnectedError).length).toBeGreaterThanOrEqual(10);
    for (const r of settled) expect(r instanceof DisconnectedError || (r as { ok: boolean }).ok).toBe(true);
    expect(rig.driver.state.get().connection).toBe('disconnected');
    expect(rig.transport.connected).toBe(false);
    await expect(rig.driver.sendCommand('G0 X0')).rejects.toBeInstanceOf(DisconnectedError);
    await rig.driver.disconnect();
  });

  it('notices a cable pull', async () => {
    const rig = await createRig();
    rig.sim.faults = { disconnectAfterBytes: rig.sim.bytesReceived + 3 };
    await expect(rig.run(rig.driver.sendCommand('G0 X10'))).rejects.toBeInstanceOf(DisconnectedError);
    expect(rig.driver.state.get().connection).toBe('disconnected');
    expect(rig.driver.console.entries().at(-1)?.text).toMatch(/Connection lost: Device disconnected/);
  });

  it('rejects manual commands while a job holds the stream', async () => {
    const rig = await createRig();
    const job = rig.runner.run(['G1 F100', 'G1 X50']);
    await expect(rig.driver.sendCommand('G0 X0')).rejects.toBeInstanceOf(MachineBusyError);
    await expect(rig.driver.jog({ x: 1 }, 100)).rejects.toBeInstanceOf(MachineBusyError);
    await rig.run(job);
    expect(await rig.run(rig.driver.sendCommand('G0 X0'))).toEqual({ ok: true });
  });
});
