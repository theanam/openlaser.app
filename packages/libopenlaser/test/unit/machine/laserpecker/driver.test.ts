import { describe, expect, it } from 'vitest';
import { HandshakeError } from 'libopenlaser/machine/errors';
import { Func, PreviewState, PrintState } from 'libopenlaser/machine/laserpecker/commands';
import {
  LaserPeckerDriver,
  UploadRefusedError,
  type LaserPeckerDriverOptions,
  type UploadFile,
} from 'libopenlaser/machine/laserpecker/driver';
import {
  VirtualLaserPecker,
  type VirtualLaserPeckerOptions,
} from 'libopenlaser/machine/laserpecker/virtual-device';
import { VirtualScheduler } from 'libopenlaser/machine/virtual-scheduler';

async function rig(options: VirtualLaserPeckerOptions = {}, driverOptions: LaserPeckerDriverOptions = {}) {
  const clock = new VirtualScheduler();
  const device = new VirtualLaserPecker({ scheduler: clock, ...options });
  const driver = new LaserPeckerDriver({ scheduler: clock, serialChunkGapMs: 1, ...driverOptions });
  const run = <T>(p: Promise<T>, maxMs?: number) => clock.runUntil(p, maxMs);
  await run(driver.connect(device, 460800));
  return { clock, device, driver, run };
}

/** A tiny job file: 64-byte header with the id at offset 5, then the image. */
function file(id: number, payload = 300): UploadFile {
  const data = new Uint8Array(64 + payload).fill(0xff);
  data[0] = 0x10;
  new DataView(data.buffer).setUint32(5, id);
  return { id, data };
}

const job = { power: 40, depth: 10, passes: 1, x: 5, y: 6 };

describe('LaserPeckerDriver', () => {
  it('reads the version and status on connect, then polls once a second', async () => {
    const { clock, device, driver } = await rig();
    const s = driver.state.get();
    expect(s.connection).toBe('connected');
    expect(s.version?.software).toBe(316);
    expect(s.model?.name).toBe('LP2');
    expect(s.status?.mode).toBe('idle');
    const before = device.funcs.length;
    await clock.advance(3000);
    expect(device.funcs.slice(before)).toEqual([Func.query, Func.query, Func.query]);
  });

  it('fails the handshake when the device never answers', async () => {
    const clock = new VirtualScheduler();
    const device = new VirtualLaserPecker({ scheduler: clock });
    device.silent = true;
    const driver = new LaserPeckerDriver({ scheduler: clock });
    await expect(clock.runUntil(driver.connect(device, 460800))).rejects.toThrow(HandshakeError);
    expect(driver.state.get().connection).toBe('disconnected');
    expect(device.connected).toBe(false);
  });

  it('frames at the lowest power and stops the preview', async () => {
    const { device, driver, run } = await rig();
    await run(driver.frame({ x: 10, y: 20, width: 30, height: 40 }, 4));
    const preview = device.received.find((f) => f[0] === Func.preview)!;
    expect(preview[1]).toBe(PreviewState.rectangle);
    expect(preview[12]).toBe(1);
    expect(driver.state.get().activity).toBe('framing');
    await run(driver.stopFrame());
    const previews = device.received.filter((f) => f[0] === Func.preview).map((f) => f[1]);
    expect(previews).toEqual([PreviewState.rectangle, PreviewState.stop]);
    expect(device.mode).toBe(6);
    expect(driver.state.get().activity).toBe('idle');
  });

  it('uploads raw after exit and announce, then starts, and finishes on the device’s word', async () => {
    const { device, driver, run } = await rig();
    const f = file(0x1234abcd);
    const result = await run(driver.engrave(f, job));
    expect(result).toEqual({ outcome: 'completed' });
    expect(device.files.get(0x1234abcd)).toEqual(f.data);
    // Query ids (cache check), exit, announce, print start; never exit after the raw upload.
    const sequence = device.funcs.filter((fn) => fn !== Func.query);
    expect(sequence).toEqual([Func.exit, Func.file, Func.print]);
    const start = device.received.find((r) => r[0] === Func.print)!;
    expect(start.slice(1, 4)).toEqual([PrintState.start, 40, 91]);
    expect(driver.state.get()).toMatchObject({ activity: 'idle', progress: 100 });
  });

  it('waits for a slow transfer to finish before expecting the file stored', async () => {
    // 25 chunks 100 ms apart take 2.5 s, longer than the 1 s the device has to answer after.
    const { device, driver, run } = await rig({}, { serialChunkGapMs: 100, uploadReplyMs: 1000 });
    const f = file(0x51, 50_000);
    expect(await run(driver.engrave(f, job), 60_000)).toEqual({ outcome: 'completed' });
    expect(device.files.get(0x51)).toEqual(f.data);
  });

  it('reports upload and job progress', async () => {
    const { clock, driver } = await rig({ progressStep: 25, stepMs: 1000 });
    const seen: string[] = [];
    driver.state.subscribe((s) => {
      if (s.activity === 'uploading' && s.uploaded > 0) seen.push(`up ${s.uploaded}`);
      if (s.activity === 'engraving' && s.progress > 0) seen.push(`job ${s.progress}`);
    });
    const done = driver.engrave(file(9, 5000), job);
    await clock.runUntil(done);
    expect(seen).toContain('up 2048');
    expect(seen).toContain('up 5064');
    expect(seen.some((s) => s.startsWith('job'))).toBe(true);
  });

  it('skips the upload when the device already holds this exact file', async () => {
    const { device, driver, run } = await rig();
    await run(driver.engrave(file(77), job));
    const before = device.received.length;
    await run(driver.engrave(file(77), job));
    expect(device.funcs.slice(before).filter((fn) => fn !== Func.query)).toEqual([Func.print]);
  });

  it('tells the user to power-cycle a device that refuses uploads', async () => {
    const { device, driver, run } = await rig({ refuseUploads: true });
    const result = await run(driver.engrave(file(5), job));
    expect(result).toEqual({ outcome: 'failed', reason: new UploadRefusedError().message });
    expect(device.funcs).not.toContain(Func.print);
    expect(driver.state.get().activity).toBe('idle');
  });

  it('pauses and resumes only when asked', async () => {
    const { clock, device, driver } = await rig({ progressStep: 10, stepMs: 1000 });
    const done = driver.engrave(file(3), job);
    await clock.advance(2500);
    await driver.pause();
    expect(driver.state.get().activity).toBe('paused');
    await clock.advance(10_000);
    expect(driver.state.get().activity).toBe('paused');
    const progress = device.progress;
    expect(progress).toBeLessThan(100);
    await driver.resume();
    expect(await clock.runUntil(done)).toEqual({ outcome: 'completed' });
    const states = device.received.filter((r) => r[0] === Func.print).map((r) => r[1]);
    expect(states).toEqual([PrintState.start, PrintState.pause, PrintState.resume]);
  });

  it('stops a running job with the stop commands at once', async () => {
    const { clock, device, driver } = await rig({ progressStep: 5, stepMs: 1000 });
    const done = driver.engrave(file(4), job);
    await clock.advance(3000);
    const before = device.received.length;
    await clock.runUntil(driver.stop());
    expect(device.received.slice(before).map((r) => r.slice(0, 2))).toEqual([
      [Func.print, PrintState.stop],
      [Func.preview, PreviewState.stop],
      [Func.exit, 0],
    ]);
    expect(await done).toEqual({ outcome: 'aborted' });
    expect(device.mode).toBe(6);
    expect(driver.state.get().activity).toBe('idle');
  });

  it('stops an upload part way and never starts the job', async () => {
    const { clock, device, driver } = await rig({}, { serialChunkGapMs: 50 });
    const done = driver.engrave(file(8, 50_000), job);
    await clock.advance(120);
    expect(driver.state.get().activity).toBe('uploading');
    await driver.stop();
    expect(await clock.runUntil(done)).toEqual({ outcome: 'aborted' });
    expect(device.received.some((r) => r[0] === Func.print && r[1] === PrintState.start)).toBe(false);
  });

  it('notices a dropped link: the job fails and the driver disconnects', async () => {
    const { clock, device, driver } = await rig({ progressStep: 5, stepMs: 1000 });
    const lost: string[] = [];
    driver.lost.add((r) => lost.push(r));
    const done = driver.engrave(file(6), job);
    await clock.advance(2000);
    device.dropLink();
    expect(await clock.runUntil(done)).toEqual({ outcome: 'failed', reason: 'Bluetooth link lost' });
    expect(lost).toEqual(['Bluetooth link lost']);
    expect(driver.state.get().connection).toBe('disconnected');
  });

  it('gives up on a device that stops answering polls', async () => {
    const { clock, device, driver } = await rig();
    const lost: string[] = [];
    driver.lost.add((r) => lost.push(r));
    device.silent = true;
    await clock.advance(20_000);
    expect(lost).toEqual(['No reply from the laser.']);
    expect(driver.state.get().connection).toBe('disconnected');
  });

  it('fails a job the device reports as an error', async () => {
    const { clock, device, driver } = await rig({ progressStep: 5, stepMs: 1000 });
    const done = driver.engrave(file(11), job);
    await clock.advance(2000);
    [device.mode, device.errorCode] = [5, 3];
    expect(await clock.runUntil(done)).toEqual({ outcome: 'failed', reason: 'Laser too hot' });
    expect(driver.state.get().activity).toBe('idle');
  });

  it('refuses a second job while one runs', async () => {
    const { clock, driver } = await rig({ progressStep: 5, stepMs: 1000 });
    void driver.engrave(file(1), job);
    await clock.advance(100);
    await expect(driver.engrave(file(2), job)).rejects.toThrow(/busy/);
    await expect(driver.frame({ x: 0, y: 0, width: 1, height: 1 }, 4)).rejects.toThrow(/busy/);
  });
});
