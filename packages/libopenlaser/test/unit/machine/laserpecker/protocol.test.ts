import { describe, expect, it } from 'vitest';
import {
  announceFileCommand,
  exitCommand,
  previewRectCommand,
  previewStopCommand,
  printControlCommand,
  printStartCommand,
  queryCommand,
  PrintState,
} from 'libopenlaser/machine/laserpecker/commands';
import { encodeFrame } from 'libopenlaser/machine/laserpecker/frame';
import { formatFirmware, modelFromVersion, resolutionByPx } from 'libopenlaser/machine/laserpecker/models';
import {
  errorText,
  jobFinished,
  parseFileIds,
  parseFileReply,
  parseStatus,
  parseVersion,
} from 'libopenlaser/machine/laserpecker/replies';

const data = (frame: Uint8Array) => Array.from(frame.subarray(4, frame.length - 2));

describe('LaserPecker commands', () => {
  it('queries with the sub-command and four zero bytes', () => {
    expect(data(queryCommand(3))).toEqual([3, 0, 0, 0, 0]);
    expect(exitCommand()[3]).toBe(0xff);
  });

  it('lays out a print start: power, inverted depth, id, pixel position, repeats', () => {
    const frame = printStartCommand({
      fileId: 0x01020304,
      power: 60,
      depth: 20,
      x: 300,
      y: 0x0102,
      passes: 2,
    });
    const d = data(frame);
    expect(frame[3]).toBe(0x01);
    expect(d).toHaveLength(23);
    expect(d.slice(0, 3)).toEqual([1, 60, 81]);
    expect(d.slice(3, 7)).toEqual([1, 2, 3, 4]);
    expect(d.slice(7, 11)).toEqual([0x01, 0x2c, 0x01, 0x02]);
    expect(d[12]).toBe(2);
    expect(d[21]).toBe(1);
  });

  it('clamps power, depth and passes into range', () => {
    const d = data(printStartCommand({ fileId: 1, power: 0, depth: 250, x: -5, y: 0, passes: 0 }));
    expect(d.slice(0, 3)).toEqual([1, 1, 1]);
    expect(d.slice(7, 9)).toEqual([0, 0]);
    expect(d[12]).toBe(1);
  });

  it('sends pause, resume and stop with only the state set', () => {
    for (const state of [PrintState.pause, PrintState.resume, PrintState.stop]) {
      const d = data(printControlCommand(state));
      expect(d[0]).toBe(state);
      expect(d.slice(1).every((b) => b === 0)).toBe(true);
    }
  });

  it('frames a rectangle in 0.1 mm at the lowest power', () => {
    const d = data(previewRectCommand({ x: 10, y: 2.5, width: 40.2, height: 30 }, 4));
    expect(d).toEqual([2, 0x01, 0x92, 0x01, 0x2c, 0x00, 0x64, 0x00, 0x19, 0, 4, 1, 0, 0]);
    expect(data(previewStopCommand())[0]).toBe(3);
  });

  it('announces the byte count, header included', () => {
    expect(data(announceFileCommand(64 + 0x012345))).toEqual([1, 0x00, 0x01, 0x23, 0x85, 0]);
  });
});

/** A status reply with `extra` fields after the base 21 bytes of data. */
function status(fields: Record<number, number>, length = 21): Uint8Array {
  const d = new Array<number>(length).fill(0);
  for (const [offset, value] of Object.entries(fields)) d[Number(offset) - 4] = value;
  return encodeFrame(0x00, d);
}

describe('LaserPecker replies', () => {
  it('reads a status reply at frame offsets', () => {
    const s = parseStatus(
      status({
        4: 1,
        5: 1,
        6: 42,
        7: 60,
        9: 0,
        11: 0xde,
        12: 0xad,
        13: 0xbe,
        14: 0xef,
        15: 33,
        18: 1,
        24: 2,
      }),
    );
    expect(s).toMatchObject({
      mode: 'engraving',
      subState: 1,
      progress: 42,
      power: 60,
      errorCode: 0,
      fileId: 0xdeadbeef,
      temperature: 33,
      passesDone: 1,
      link: 2,
    });
  });

  it('reads missing trailing fields as null on short replies', () => {
    const s = parseStatus(status({ 4: 6 }, 13));
    expect(s).toMatchObject({ mode: 'idle', temperature: 0, passesDone: null, link: null });
    expect(parseStatus(encodeFrame(0x00, [6, 0]))).toBeNull();
    expect(parseStatus(encodeFrame(0x05, new Array(21).fill(0)))).toBeNull();
  });

  it('maps modes and tells when a job is over', () => {
    expect(parseStatus(status({ 4: 2 }))?.mode).toBe('framing');
    expect(parseStatus(status({ 4: 5, 9: 3 }))?.mode).toBe('error');
    expect(parseStatus(status({ 4: 9 }))?.mode).toBe('unknown');
    expect(jobFinished(parseStatus(status({ 4: 6, 5: 255 }))!)).toBe(true);
    expect(jobFinished(parseStatus(status({ 4: 6, 5: 4 }))!)).toBe(false);
    expect(jobFinished(parseStatus(status({ 4: 1 }))!)).toBe(false);
  });

  it('reads the firmware and hardware version', () => {
    expect(parseVersion(encodeFrame(0x00, [0x01, 0x3c, 0x01, 0x32, 0x1e, 0x86, 0, 0]))).toEqual({
      software: 316,
      hardware: '01 32 1e 86',
    });
  });

  it('lists stored file ids', () => {
    const frame = encodeFrame(0x00, [2, 0, 0, 0, 7, 0xff, 0, 0, 1]);
    expect(parseFileIds(frame)).toEqual([7, 0xff000001]);
    expect(parseFileIds(encodeFrame(0x00, [0, 0, 0, 0, 0]))).toEqual([]);
  });

  it('tells ready, stored and a refused transfer apart', () => {
    expect(parseFileReply(encodeFrame(0x05, [1, 1, 0, 0, 0]))).toEqual({ kind: 'ready' });
    expect(parseFileReply(encodeFrame(0x05, [2, 1, 0, 0, 0]))).toEqual({ kind: 'stored' });
    expect(parseFileReply(encodeFrame(0x05, [1, 0, 0, 0, 0]))).toEqual({ kind: 'other' });
    // A stuck device answers with the exit code and echoes the length.
    expect(parseFileReply(encodeFrame(0xff, [1, 0, 0, 0x10, 0x40]))).toEqual({ kind: 'refused' });
  });

  it('describes device errors', () => {
    expect(errorText(3)).toBe('Laser too hot');
    expect(errorText(99)).toBe('Device error 99');
  });
});

describe('LaserPecker models', () => {
  it('recognises LP2 firmware and whether it takes packed images', () => {
    expect(modelFromVersion(316)).toMatchObject({ name: 'LP2', packed: true });
    expect(modelFromVersion(305)).toMatchObject({ name: 'LP2', packed: false });
    expect(modelFromVersion(316).resolutions.map((r) => r.label)).toEqual(['1K', '1.3K', '2K']);
    expect(modelFromVersion(5100)).toMatchObject({ name: 'LaserPecker', packed: false });
    // An LP4's version reply over Bluetooth (2026-11).
    const lp4 = parseVersion(
      Uint8Array.from([0xaa, 0xbb, 0x0b, 0x00, 0x02, 0x90, 0xff, 0xff, 0xff, 0xff, 0x00, 0x03, 0x04, 0x91]),
    );
    expect(lp4?.software).toBe(656);
    expect(modelFromVersion(656).name).toBe('LP4');
    expect(modelFromVersion(656).resolutions.map((r) => r.label)).toEqual(['1K', '2K', '4K']);
    expect(modelFromVersion(5100).resolutions.map((r) => r.px)).toEqual([4, 3, 2, 1]);
  });

  it('formats firmware versions and finds resolutions', () => {
    expect(formatFirmware(316)).toBe('3.16');
    expect(formatFirmware(305)).toBe('3.05');
    expect(formatFirmware(3712)).toBe('3712');
    expect(resolutionByPx(2).dpi).toBe(508);
    expect(resolutionByPx(9).px).toBe(4);
  });
});
