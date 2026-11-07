import { describe, expect, it } from 'vitest';
import { encodeFrame, FrameReader, sum16 } from 'libopenlaser/machine/laserpecker/frame';

const bytes = (text: string) => Uint8Array.from(text.split(/\s+/).filter(Boolean), (h) => parseInt(h, 16));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

describe('LaserPecker framing', () => {
  it('frames a command: header, length from func on, sum of func and data', () => {
    // func 0x01 + data 0x10 0x20 0x30 = 0x0061; len = 3 data + func + 2 sum = 6.
    expect(hex(encodeFrame(0x01, [0x10, 0x20, 0x30]))).toBe('aa bb 06 01 10 20 30 00 61');
    expect(hex(encodeFrame(0x00, [0, 0, 0, 0, 0]))).toBe('aa bb 08 00 00 00 00 00 00 00 00');
    expect(hex(encodeFrame(0xff, [0, 0, 0, 0, 0]))).toBe('aa bb 08 ff 00 00 00 00 00 00 ff');
  });

  it('carries the sum big-endian and wraps it at 16 bits', () => {
    // 0xff + 3 × 0xfe = 0x03f9.
    expect(hex(encodeFrame(0xff, [0xfe, 0xfe, 0xfe]))).toBe('aa bb 06 ff fe fe fe 03 f9');
    expect(sum16(new Array(300).fill(0xff))).toBe((300 * 255) & 0xffff);
  });

  it('refuses data that does not fit the length byte', () => {
    expect(() => encodeFrame(0x02, new Array(253).fill(0))).toThrow(RangeError);
    expect(encodeFrame(0x02, new Array(252).fill(0))[2]).toBe(0xff);
  });

  it('reassembles a reply split over several reads', () => {
    const reader = new FrameReader();
    const frame = encodeFrame(0x05, [1, 1, 0, 0, 0]);
    expect(reader.push(frame.subarray(0, 2))).toEqual([]);
    expect(reader.push(frame.subarray(2, 7))).toEqual([]);
    const [out] = reader.push(frame.subarray(7));
    expect(out).toMatchObject({ kind: 'short', func: 0x05 });
    expect(out.kind === 'short' && hex(out.bytes)).toBe(hex(frame));
  });

  it('cuts back-to-back frames in one read and keeps the rest buffered', () => {
    const reader = new FrameReader();
    const a = encodeFrame(0x05, [2, 1, 0, 0, 0]);
    const b = encodeFrame(0x00, [6, 0, 0]);
    const c = encodeFrame(0xff, [1]);
    const joined = new Uint8Array([...a, ...b, ...c.subarray(0, 4)]);
    expect(reader.push(joined).map((f) => f.kind === 'short' && f.func)).toEqual([0x05, 0x00]);
    expect(reader.push(c.subarray(4)).map((f) => f.kind === 'short' && f.func)).toEqual([0xff]);
  });

  it('skips noise and frames with a wrong sum', () => {
    const reader = new FrameReader();
    const good = encodeFrame(0x00, [6, 1, 50]);
    const bad = encodeFrame(0x00, [6, 1, 51]);
    bad[bad.length - 1] ^= 0x01;
    const frames = reader.push(new Uint8Array([0x12, 0xaa, 0x00, ...bad, ...good]));
    expect(frames).toHaveLength(1);
    expect(frames[0].kind === 'short' && hex(frames[0].bytes)).toBe(hex(good));
    expect(reader.skipped).toBeGreaterThan(0);
  });

  it('reads long frames: 4-byte length, payload, sum of the payload', () => {
    const reader = new FrameReader();
    // len 5 = 3 payload bytes + 2 sum bytes; 0x41 + 0x42 + 0x43 = 0x00c6.
    const long = bytes('aa cc 00 00 00 05 41 42 43 00 c6');
    const short = encodeFrame(0x00, [7, 0, 0, 0, 0]);
    const frames = reader.push(new Uint8Array([...short, ...long]));
    expect(frames.map((f) => f.kind)).toEqual(['short', 'long']);
    expect(frames[1].kind === 'long' && Array.from(frames[1].payload)).toEqual([0x41, 0x42, 0x43]);
  });
});
