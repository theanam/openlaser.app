import { describe, expect, it } from 'vitest';
import {
  accessoryInSettings,
  Func,
  previewRectCommand,
  PreviewState,
  printStartCommand,
  settingsWithAccessory,
} from '$lib/machine/laserpecker/commands';
import { LaserPeckerConnection, type LaserPeckerJob } from '$lib/machine/laserpecker/connection';
import { encodeFrame } from '$lib/machine/laserpecker/frame';
import { VirtualLaserPecker } from '$lib/machine/laserpecker/virtual-device';
import { VirtualScheduler } from '$lib/machine/virtual-scheduler';

const data = (frame: Uint8Array) => Array.from(frame.subarray(4, frame.length - 2));

/** A settings reply: 19 fields from offset 4, each set to its own offset so the mapping shows. */
function settingsReply(): Uint8Array {
  return encodeFrame(
    0x00,
    Array.from({ length: 19 }, (_, i) => 4 + i),
  );
}

describe('LaserPecker accessories and lasers on the wire', () => {
  it('sends the laser type and the rotary diameter (×100) with the print start', () => {
    const d = data(
      printStartCommand({
        fileId: 1,
        power: 50,
        depth: 10,
        x: 0,
        y: 0,
        passes: 1,
        laserType: 1,
        objectDiameter: 72.5,
      }),
    );
    expect(d[13]).toBe(1);
    expect([d[14], d[15]]).toEqual([0x1c, 0x52]);
    expect(
      data(printStartCommand({ fileId: 1, power: 50, depth: 10, x: 0, y: 0, passes: 1 })).slice(13, 16),
    ).toEqual([0, 0, 0]);
  });

  it('frames on a rotary with the rotary preview and the diameter', () => {
    const d = data(previewRectCommand({ x: 0, y: 0, width: 10, height: 10 }, 4, 60));
    expect(d[0]).toBe(PreviewState.rotary);
    expect([d[12], d[13]]).toEqual([0x17, 0x70]);
    expect(data(previewRectCommand({ x: 0, y: 0, width: 10, height: 10 }, 4))[0]).toBe(
      PreviewState.rectangle,
    );
  });

  it('writes the settings back as read, with only the accessory flags changed', () => {
    const frame = settingsWithAccessory(settingsReply(), 'rotary');
    expect(frame[3]).toBe(Func.settings);
    // Leading 1; reply offsets 4–7; 0 for the safety slot; 10–14; the rotary and slide flags; 17–21; 0; 23.
    expect(data(frame)).toEqual([1, 4, 5, 6, 7, 0, 10, 11, 12, 13, 14, 1, 0, 17, 18, 19, 20, 21, 0, 0]);
    expect(data(settingsWithAccessory(settingsReply(), 'slide')).slice(11, 13)).toEqual([0, 1]);
    expect(data(settingsWithAccessory(settingsReply(), null)).slice(11, 13)).toEqual([0, 0]);
  });

  it('writes a Z direction of 2 as 0', () => {
    const fields = Array.from({ length: 19 }, () => 0);
    fields[7] = 2;
    expect(data(settingsWithAccessory(encodeFrame(0x00, fields), null))[7]).toBe(0);
  });

  it('reads which accessory the settings say is on', () => {
    const fields = Array.from({ length: 19 }, () => 0);
    expect(accessoryInSettings(encodeFrame(0x00, fields))).toBeNull();
    fields[11] = 1;
    expect(accessoryInSettings(encodeFrame(0x00, fields))).toBe('rotary');
    fields[11] = 0;
    fields[12] = 1;
    expect(accessoryInSettings(encodeFrame(0x00, fields))).toBe('slide');
  });
});

function file(id: number) {
  const bytes = new Uint8Array(64 + 100).fill(0xff);
  bytes[0] = 0x10;
  new DataView(bytes.buffer).setUint32(5, id);
  return { id, data: bytes };
}

describe('LaserPeckerConnection jobs', () => {
  async function rig() {
    const clock = new VirtualScheduler();
    const device = new VirtualLaserPecker({ scheduler: clock, progressStep: 50, stepMs: 500 });
    const connection = await clock.runUntil(
      LaserPeckerConnection.open(device, { scheduler: clock, serialChunkGapMs: 1 }),
    );
    return { clock, device, connection };
  }

  const settings = { power: 30, depth: 10, passes: 1, x: 0, y: 0 };

  it('switches the rotary on, then burns each laser’s part in turn', async () => {
    const { clock, device, connection } = await rig();
    const job: LaserPeckerJob = {
      accessory: 'rotary',
      parts: [
        { file: file(1), settings: { ...settings, laserType: 0, objectDiameter: 50 } },
        { file: file(2), settings: { ...settings, laserType: 1, objectDiameter: 50 } },
      ],
    };
    expect(await clock.runUntil(connection.run(job))).toEqual({ outcome: 'completed' });
    expect(device.settings[11]).toBe(1);
    const starts = device.received.filter((f) => f[0] === Func.print && f[1] === 1);
    expect(starts.map((f) => f[14])).toEqual([0, 1]);
    expect(device.objectDiameter).toBe(50);
  });

  it('leaves the settings alone when they already match', async () => {
    const { clock, device, connection } = await rig();
    await clock.runUntil(connection.run({ accessory: null, parts: [{ file: file(3), settings }] }));
    expect(device.funcs).not.toContain(Func.settings);
  });

  it('stops after a stopped part and never starts the next', async () => {
    const { clock, device, connection } = await rig();
    const done = connection.run({
      accessory: null,
      parts: [
        { file: file(4), settings },
        { file: file(5), settings },
      ],
    });
    for (let t = 0; t < 10_000 && connection.status.get().activity !== 'running'; t += 50)
      await clock.advance(50);
    await clock.runUntil(connection.stop());
    expect(await clock.runUntil(done)).toEqual({ outcome: 'aborted' });
    expect(device.files.has(5)).toBe(false);
  });

  it('frames as the rotary turns when given a diameter', async () => {
    const { clock, device, connection } = await rig();
    const done = connection.frame({ rect: { x: 0, y: 0, width: 10, height: 10 }, px: 4, objectDiameter: 40 });
    await clock.advance(100);
    expect(device.objectDiameter).toBe(40);
    await clock.runUntil(connection.stop());
    expect((await clock.runUntil(done)).outcome).toBe('aborted');
  });
});

describe('a device that sends every reply twice (LP3 over Bluetooth)', () => {
  const settings = { power: 30, depth: 10, passes: 1, x: 0, y: 0 };

  async function rig() {
    const clock = new VirtualScheduler();
    const device = new VirtualLaserPecker({
      scheduler: clock,
      doubleReplies: true,
      progressStep: 50,
      stepMs: 500,
    });
    const connection = await clock.runUntil(
      LaserPeckerConnection.open(device, { scheduler: clock, serialChunkGapMs: 1 }),
    );
    return { clock, device, connection };
  }

  it('never takes a repeated status reply for the settings', async () => {
    const { clock, device, connection } = await rig();
    // Polls keep running; jobs start right after one, when the repeat is about to arrive.
    for (let i = 0; i < 3; i++) {
      await clock.advance(1000);
      const done = connection.run({ accessory: null, parts: [{ file: file(10 + i), settings }] });
      expect(await clock.runUntil(done)).toEqual({ outcome: 'completed' });
    }
    // Settings stay untouched on flat-bed jobs: no write ever went out.
    expect(device.funcs).not.toContain(Func.settings);
  });

  it('still switches the rotary on, from the real settings reply', async () => {
    const { clock, device, connection } = await rig();
    await clock.advance(1000);
    const done = connection.run({ accessory: 'rotary', parts: [{ file: file(20), settings }] });
    expect(await clock.runUntil(done)).toEqual({ outcome: 'completed' });
    const write = device.received.find((f) => f[0] === Func.settings)!;
    // Every field but the rotary flag is the device's own (all zero here), not status bytes.
    expect(write.slice(1)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('sends the infrared laser type and the pulse frequency', async () => {
    const { clock, device, connection } = await rig();
    await clock.runUntil(
      connection.run({
        accessory: null,
        parts: [{ file: file(30), settings: { ...settings, laserType: 1, frequency: 40 } }],
      }),
    );
    const start = device.received.find((f) => f[0] === Func.print && f[1] === 1)!;
    expect([start[14], start[19]]).toEqual([1, 40]);
  });
});
