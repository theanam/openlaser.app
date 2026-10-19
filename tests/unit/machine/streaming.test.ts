import { describe, expect, it } from 'vitest';
import type { BurnSegment } from '$lib/machine/simulator/motion';
import type { JobEvent } from '$lib/machine/types';
import { createRig, rasterJob } from './helpers';

/** What the raster job should engrave: every G1 with S > 0, from the previous position. */
function expectedBurns(
  lines: string[],
): { from: { x: number; y: number }; to: { x: number; y: number }; power: number }[] {
  const burns = [];
  let pos = { x: 0, y: 0 };
  for (const line of lines) {
    const x = /X(-?[\d.]+)/.exec(line);
    const y = /Y(-?[\d.]+)/.exec(line);
    const s = /S(\d+)/.exec(line);
    const to = { x: x ? Number(x[1]) : pos.x, y: y ? Number(y[1]) : pos.y };
    if (line.startsWith('G1') && (x || y) && s && Number(s[1]) > 0)
      burns.push({ from: pos, to, power: Number(s[1]) });
    pos = to;
  }
  return burns;
}

const round = (b: Pick<BurnSegment, 'from' | 'to' | 'power'>) => ({
  from: { x: +b.from.x.toFixed(3), y: +b.from.y.toFixed(3) },
  to: { x: +b.to.x.toFixed(3), y: +b.to.y.toFixed(3) },
  power: b.power,
});

describe('streaming a full job through the simulator', () => {
  it('streams 50,000 lines with chunked, noisy, delayed responses: no overflow, every line once', async () => {
    const rig = await createRig({ sim: { faults: {} } });
    rig.sim.faults = { splitChunks: { maxPieceBytes: 4 }, garbageProbability: 0.002, responseDelayMs: 1 };
    const lines = rasterJob(50_000);
    const firstJobLine = rig.sim.receivedLines.length;
    const events: JobEvent['type'][] = [];
    let lastAcked = 0;
    let monotonic = true;
    rig.runner.onEvent((e) => {
      events.push(e.type);
      if (e.type === 'progress') {
        if (e.progress.acked < lastAcked) monotonic = false;
        lastAcked = e.progress.acked;
      }
    });

    const outcome = await rig.run(rig.runner.run(lines, { estimatedSeconds: 600 }));

    expect(outcome).toBe('completed');
    expect(rig.sim.overflowCount).toBe(0);
    expect(rig.sim.peakRxBytes).toBeLessThanOrEqual(127);
    expect(rig.sim.receivedLines.slice(firstJobLine)).toEqual(lines);
    const progress = rig.runner.progress.get();
    expect(progress).toMatchObject({
      phase: 'completed',
      total: 50_000,
      sent: 50_000,
      acked: 50_000,
      remainingMs: 0,
      error: null,
    });
    expect(progress.elapsedMs).toBeGreaterThan(0);
    expect(monotonic).toBe(true);
    expect(events[0]).toBe('started');
    expect(events.at(-1)).toBe('completed');
    expect(rig.sim.burns.map(round)).toEqual(expectedBurns(lines));
    expect(rig.driver.state.get().status).toBe('Idle');
    expect(rig.runner.active).toBe(false);
  });

  it('polls status every 100 ms while a job runs', async () => {
    const rig = await createRig();
    const job = rig.runner.run(['G1 F600', 'G1 X100']);
    const before = Array.from(rig.sim.receivedBytes()).filter((b) => b === 0x3f).length;
    await rig.clock.advance(1000);
    const during = Array.from(rig.sim.receivedBytes()).filter((b) => b === 0x3f).length - before;
    expect(during).toBeGreaterThanOrEqual(10);
    expect(during).toBeLessThanOrEqual(11);
    await rig.run(job);
  });

  it('maps every error to the exact line with the continue policy', async () => {
    const rig = await createRig();
    const lines = rasterJob(5000);
    const bad = new Map([
      [lines[100], 33],
      [lines[2500], 20],
      [lines[4990], 36],
    ]);
    rig.sim.faults = { lineError: (line) => bad.get(line) ?? null, splitChunks: { maxPieceBytes: 7 } };
    const errors: JobEvent[] = [];
    rig.runner.onEvent((e) => e.type === 'line-error' && errors.push(e));
    const outcome = await rig.run(rig.runner.run(lines, { errorPolicy: 'continue' }));
    expect(outcome).toBe('completed');
    expect(errors).toEqual([
      {
        type: 'line-error',
        code: 33,
        message: expect.stringMatching(/^Invalid gcode ID:33/),
        line: lines[100],
        lineIndex: 100,
      },
      {
        type: 'line-error',
        code: 20,
        message: expect.stringMatching(/^Unsupported command/),
        line: lines[2500],
        lineIndex: 2500,
      },
      { type: 'line-error', code: 36, message: expect.any(String), line: lines[4990], lineIndex: 4990 },
    ]);
    expect(rig.runner.progress.get().acked).toBe(5000);
  });

  it('holds on an error with the stop policy until the user continues', async () => {
    const rig = await createRig();
    const lines = rasterJob(3000);
    rig.sim.faults = { lineError: (line) => (line === lines[1000] ? 22 : null) };
    const job = rig.runner.run(lines);
    await rig.clock.advance(60_000);
    const held = rig.runner.progress.get();
    expect(held.phase).toBe('error-hold');
    expect(held.error).toMatchObject({ code: 22, line: lines[1000], lineIndex: 1000 });
    expect(rig.driver.state.get().status).toBe('Hold');
    // Nothing more is streamed while held beyond what was already in the buffer.
    const sentWhileHeld = held.sent;
    await rig.clock.advance(10_000);
    expect(rig.runner.progress.get().sent).toBe(sentWhileHeld);
    expect(rig.runner.progress.get().sent - rig.runner.progress.get().acked).toBeLessThan(30);

    rig.runner.continueAfterError();
    expect(rig.runner.progress.get()).toMatchObject({ phase: 'running', error: null });
    expect(await rig.run(job)).toBe('completed');
    expect(rig.sim.overflowCount).toBe(0);
  });

  it('can stop from the error hold', async () => {
    const rig = await createRig();
    const lines = rasterJob(2000);
    rig.sim.faults = { lineError: (line) => (line === lines[500] ? 20 : null) };
    const job = rig.runner.run(lines);
    await rig.clock.advance(30_000);
    expect(rig.runner.progress.get().phase).toBe('error-hold');
    await rig.run(rig.runner.stop());
    expect(await job).toBe('aborted');
  });

  it('pauses with a feed hold and resumes with cycle start', async () => {
    const rig = await createRig();
    const lines = rasterJob(4000);
    const events: JobEvent['type'][] = [];
    rig.runner.onEvent((e) => e.type !== 'progress' && events.push(e.type));
    const job = rig.runner.run(lines);
    await rig.clock.advance(5000);
    rig.runner.pause();
    expect(rig.runner.progress.get().phase).toBe('paused');
    await rig.clock.advance(1000);
    expect(rig.driver.state.get()).toMatchObject({ status: 'Hold', subState: 0 });
    const parked = rig.sim.position;
    await rig.clock.advance(5000);
    expect(rig.sim.position).toEqual(parked);
    rig.runner.resume();
    expect(await rig.run(job)).toBe('completed');
    expect(events).toEqual(['started', 'paused', 'resumed', 'completed']);
    expect(rig.sim.overflowCount).toBe(0);
    expect(rig.sim.burns.map(round)).toEqual(expectedBurns(lines).flatMap((b) => splitAt(b, parked)));
  });

  it('resumes even when cycle start arrives during the hold deceleration', async () => {
    const rig = await createRig({ sim: { settings: { 120: 50 } } });
    const job = rig.runner.run(['G1 F6000', 'G1 X300', 'G1 Y300']);
    await rig.clock.advance(1000);
    rig.runner.pause();
    await rig.clock.advance(150);
    expect(rig.driver.state.get()).toMatchObject({ status: 'Hold', subState: 1 });
    rig.runner.resume();
    expect(await rig.run(job, 60_000)).toBe('completed');
    expect(rig.sim.position).toEqual({ x: 300, y: 300, z: 0 });
  });

  it('reflects a hold from outside the app as paused and never resumes by itself', async () => {
    const rig = await createRig();
    const job = rig.runner.run(rasterJob(2000));
    await rig.clock.advance(2000);
    rig.sim.receive(Uint8Array.of(0x21)); // pause button on the machine
    await rig.clock.advance(5000);
    expect(rig.runner.progress.get().phase).toBe('paused');
    expect(rig.driver.state.get().status).toBe('Hold');
    rig.runner.resume();
    expect(await rig.run(job)).toBe('completed');
  });

  it('stops: feed hold, wait for Hold:0, soft reset, then M5 after the welcome', async () => {
    const rig = await createRig();
    const lines = rasterJob(5000);
    const job = rig.runner.run(lines);
    await rig.clock.advance(5000);
    const mark = rig.sim.bytesReceived;
    const linesBefore = rig.sim.receivedLines.length;
    await rig.run(rig.runner.stop());
    expect(await job).toBe('aborted');
    const after = Array.from(rig.sim.receivedBytes().slice(mark)).filter((b) => b !== 0x3f);
    expect(after[0]).toBe(0x21);
    expect(String.fromCharCode(...after.slice(after.indexOf(0x18)))).toBe('\x18M5\n');
    // Nothing from the job ran after the reset, and the job is not replayed later.
    expect(rig.sim.receivedLines.slice(linesBefore)).toEqual(['M5']);
    await rig.clock.advance(5000);
    expect(rig.sim.receivedLines.slice(linesBefore)).toEqual(['M5']);
    // The hold completed before the reset, so position is kept and there is no alarm.
    expect(rig.driver.state.get()).toMatchObject({ status: 'Idle', alarm: null });
    expect(rig.runner.progress.get().phase).toBe('aborted');
  });

  it('resets after 500 ms if the hold does not complete, and surfaces the alarm', async () => {
    const rig = await createRig({ sim: { settings: { 120: 1 } } });
    const job = rig.runner.run(['G1 F6000', 'G1 X300']);
    await rig.clock.advance(1000);
    const started = rig.clock.now();
    await rig.run(rig.runner.stop());
    expect(rig.clock.now() - started).toBeLessThan(1000);
    expect(await job).toBe('aborted');
    await rig.clock.advance(300);
    expect(rig.driver.state.get()).toMatchObject({ status: 'Alarm', alarm: { code: 3 } });
  });

  it('fails the job on an alarm and stops streaming immediately', async () => {
    const rig = await createRig();
    const lines = rasterJob(5000);
    rig.sim.faults = { lineAlarm: (line) => (line === lines[1500] ? 1 : null) };
    const failures: string[] = [];
    rig.runner.onEvent((e) => e.type === 'failed' && failures.push(e.reason));
    const outcome = await rig.run(rig.runner.run(lines));
    expect(outcome).toBe('failed');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^ALARM:1 Hard limit/);
    expect(rig.runner.progress.get().failureReason).toBe(failures[0]);
    const sent = rig.runner.progress.get().sent;
    expect(sent).toBeLessThan(1530);
    await rig.clock.advance(10_000);
    expect(rig.sim.receivedLines.at(-1)).toBe(lines[1500]);
    expect(rig.driver.state.get().alarm?.code).toBe(1);
    await rig.run(rig.driver.unlock());
    expect(await rig.run(rig.driver.sendCommand('G0 X0'))).toEqual({ ok: true });
  });

  it('fails the job with a clear message when the connection drops', async () => {
    const rig = await createRig();
    rig.sim.faults = { disconnectAfterBytes: rig.sim.bytesReceived + 20_000 };
    const outcome = await rig.run(rig.runner.run(rasterJob(5000)));
    expect(outcome).toBe('failed');
    expect(rig.runner.progress.get().failureReason).toMatch(
      /^Connection to the machine was lost \(Connection lost: Device disconnected/,
    );
    expect(rig.driver.state.get().connection).toBe('disconnected');
  });

  it('aborts when the user resets through the driver and fails on an unexpected reset', async () => {
    const rig = await createRig();
    const first = rig.runner.run(rasterJob(2000));
    await rig.clock.advance(1000);
    rig.driver.realtime('soft-reset');
    expect(await rig.run(first)).toBe('aborted');
    await rig.run(rig.driver.unlock());
    await rig.clock.advance(300);

    const second = rig.runner.run(rasterJob(2000));
    await rig.clock.advance(1000);
    rig.sim.receive(Uint8Array.of(0x18));
    expect(await rig.run(second)).toBe('failed');
    expect(rig.runner.progress.get().failureReason).toMatch(/^ALARM:3 Abort during cycle/);
  });

  it('refuses to start unless connected, idle and free of alarms', async () => {
    const rig = await createRig({ connect: false });
    await expect(rig.runner.run(['G0 X1'])).rejects.toThrow(/not connected/);
    await rig.run(rig.driver.connect(rig.transport, (await import('./helpers')).testProfile()));
    await rig.clock.advance(250);
    await expect(rig.runner.run(['G0 X1'])).rejects.toThrow(/alarm/);
    await rig.run(rig.driver.unlock());
    await rig.clock.advance(250);
    await expect(rig.runner.run(['G0 X1', 'G0 X2 (why?)'])).rejects.toThrow(/Line 2 contains a realtime/);
    const job = rig.runner.run(['G1 F100', 'G1 X10']);
    await expect(rig.runner.run(['G0 X1'])).rejects.toThrow(/already running/);
    await rig.run(job);
  });
});

/** A burn interrupted by a feed hold is recorded as two segments split at the hold point. */
function splitAt(b: ReturnType<typeof expectedBurns>[number], at: { x: number; y: number }) {
  const onSegment =
    Math.abs((b.to.x - b.from.x) * (at.y - b.from.y) - (b.to.y - b.from.y) * (at.x - b.from.x)) < 1e-6 &&
    at.x > Math.min(b.from.x, b.to.x) + 1e-9 &&
    at.x < Math.max(b.from.x, b.to.x) - 1e-9;
  if (!onSegment) return [b];
  const mid = { x: +at.x.toFixed(3), y: +at.y.toFixed(3) };
  return [
    { ...b, to: mid },
    { ...b, from: mid },
  ];
}
