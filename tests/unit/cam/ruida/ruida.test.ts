import { describe, expect, it } from 'vitest';
import {
  decode14,
  decode35,
  encode14,
  encode35,
  encodePower,
  encodeSpeed,
  swizzleByte,
  unswizzle,
  unswizzleByte,
} from '$lib/cam/ruida/encode';
import { emitRuida } from '$lib/cam/ruida';
import type { Toolpath } from '$lib/cam/types';

// Vectors produced by MeerK40t's rdjob.py encoders (the reference implementation).
describe('Ruida encoding matches the reference', () => {
  it('swizzles bytes with magic 0x88', () => {
    const input = [0x00, 0x01, 0x7f, 0x80, 0x88, 0xa8, 0xd7, 0xff];
    expect(input.map((b) => swizzleByte(b))).toEqual([137, 9, 119, 138, 130, 162, 96, 120]);
    for (let b = 0; b < 256; b++) expect(unswizzleByte(swizzleByte(b))).toBe(b);
  });

  it('packs numbers into 7-bit groups', () => {
    expect([0, 1000, 123456789, 400000].map(encode35)).toEqual([
      [0, 0, 0, 0, 0],
      [0, 0, 0, 7, 104],
      [0, 58, 111, 26, 21],
      [0, 0, 24, 53, 0],
    ]);
    expect([0, 16383, 1123, -3328].map(encode14)).toEqual([
      [0, 0],
      [127, 127],
      [8, 99],
      [102, 0],
    ]);
    expect([0, 50, 100, 12.5].map(encodePower)).toEqual([
      [0, 0],
      [63, 127],
      [127, 127],
      [15, 127],
    ]);
    expect([100, 16.6667].map(encodeSpeed)).toEqual([
      [0, 0, 6, 13, 32],
      [0, 0, 1, 2, 26],
    ]);
    expect(decode35(encode35(-5000))).toBe(-5000);
    expect(decode14(encode14(1234))).toBe(1234);
  });
});

/** Splits an unswizzled job into commands: a byte ≥ 0x80 starts one, data bytes are < 0x80. */
function commands(bytes: Uint8Array): number[][] {
  const out: number[][] = [];
  for (const b of bytes) {
    if (b >= 0x80) out.push([b]);
    else out[out.length - 1]!.push(b);
  }
  return out;
}

const hex = (c: number[]) =>
  c.slice(0, c[0] === 0x88 || c[0] === 0xa8 || c[0] === 0xd7 || c[0] === 0xf0 || c[0] === 0xea ? 1 : 2);

describe('emitRuida', () => {
  const square: Toolpath = {
    layerId: 'cut',
    feed: 1200, // 20 mm/s
    airAssist: true,
    runs: [{ points: [10, 10, 30, 10, 30, 30, 10, 30, 10, 10], power: 60 }],
  };
  const engrave: Toolpath = {
    layerId: 'photo',
    feed: 18000,
    airAssist: false,
    runs: [{ points: [0, 50, 5, 50, 10, 50, 15, 50], power: [20, 0, 40] }],
  };
  const settings = {
    layers: new Map([
      ['cut', { color: '#ff0000' }],
      ['photo', { color: '#0000ff' }],
    ]),
    airAssist: true,
  };

  it('writes a header, per-layer settings and moves, a checksum and end of file', () => {
    const plain = unswizzle(emitRuida([square, engrave], settings));
    const cmds = commands(plain);
    expect(cmds[0]).toEqual([0xd8, 0x10]);
    expect(cmds.at(-1)).toEqual([0xd7]);
    // The checksum is the byte sum of everything before it, plus the end-of-file byte.
    const sumAt = cmds.findIndex((c) => c[0] === 0xe5 && c[1] === 0x05);
    const before = cmds.slice(0, sumAt).flat();
    expect(decode35(cmds[sumAt]!, 2)).toBe(before.reduce((a, b) => a + b, 0) + 0xd7);
    // Layer speeds in µm/s and two layers declared.
    const speeds = cmds.filter((c) => c[0] === 0xc9 && c[1] === 0x04);
    expect(speeds.map((c) => [c[2], decode35(c, 3)])).toEqual([
      [0, 20000],
      [1, 300000],
    ]);
    expect(cmds.find((c) => c[0] === 0xca && c[1] === 0x22)).toEqual([0xca, 0x22, 1]);
  });

  it('cuts at absolute µm positions and travels with the laser off', () => {
    const cmds = commands(unswizzle(emitRuida([square], settings)));
    const moves = cmds.filter((c) => c[0] === 0x88 || c[0] === 0xa8);
    expect(
      moves.map((c) => [c[0] === 0xa8 ? 'cut' : 'move', decode35(c, 1) / 1000, decode35(c, 6) / 1000]),
    ).toEqual([
      ['move', 10, 10],
      ['cut', 30, 10],
      ['cut', 30, 30],
      ['cut', 10, 30],
      ['cut', 10, 10],
    ]);
    // Air assist on for this layer.
    expect(cmds).toContainEqual([0xca, 0x01, 0x13]);
  });

  it('changes power along a grayscale run and skips laser-off segments', () => {
    const cmds = commands(unswizzle(emitRuida([engrave], settings))).map(hex);
    const body = cmds.slice(cmds.findIndex((c) => c[0] === 0xca && c[1] === 0x02));
    const kinds = body
      .filter((c) => c[0] === 0x88 || c[0] === 0xa8 || (c[0] === 0xc6 && c[1] === 0x02))
      .map((c) => (c[0] === 0x88 ? 'move' : c[0] === 0xa8 ? 'cut' : 'power'));
    expect(kinds).toEqual(['power', 'move', 'power', 'cut', 'move', 'power', 'cut']);
    expect(cmds).toContainEqual([0xca, 0x01]);
  });

  it('refuses an empty job', () => {
    expect(() => emitRuida([], settings)).toThrow();
  });
});
