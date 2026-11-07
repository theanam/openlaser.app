import { describe, expect, it } from 'vitest';
import {
  encodePayload,
  encodeRasterFile,
  laserPeckerJob,
  rasterizeJob,
  toDeviceFrame,
  type JobBitmap,
} from 'libopenlaser/cam/laserpecker';
import { DEFAULT_IMAGE_SETTINGS } from 'libopenlaser/cam/raster';
import type { RasterSource } from 'libopenlaser/cam/types';
import { compileInput, imageObject, layer, profile, project, rectPath, vectorObject } from '../fixtures';

const lp = profile({ controller: 'laserpecker', originCorner: 'tl', bedWidth: 100, bedHeight: 100 });

function bitmap(rows: string[], extra: Partial<JobBitmap> = {}): JobBitmap {
  const width = rows[0].length;
  const burn = Uint8Array.from(rows.join(''), (c) => (c === '#' ? 1 : 0));
  return { left: 0, top: 0, width, height: rows.length, burn, dpi: 254, ...extra };
}

/** The bitmap back as text, for readable expectations. */
function picture(b: JobBitmap): string[] {
  const out: string[] = [];
  for (let y = 0; y < b.height; y++) {
    out.push(Array.from(b.burn.subarray(y * b.width, (y + 1) * b.width), (v) => (v ? '#' : '.')).join(''));
  }
  return out;
}

describe('LaserPecker raster file', () => {
  it('packs one byte per pixel: 0x00 burns, 0xFF skips', () => {
    expect(Array.from(encodePayload(bitmap(['#.', '.#']), false))).toEqual([0x00, 0xff, 0xff, 0x00]);
  });

  it('packs one bit per pixel, MSB first, rows padded with skip bits', () => {
    // 10 wide: two bytes per row. Row 0 burns pixels 0 and 9; row 1 burns pixel 1.
    const out = encodePayload(bitmap(['#........#', '.#........']), true);
    expect(Array.from(out)).toEqual([0b01111111, 0b10111111, 0b10111111, 0b11111111]);
  });

  it('writes the 64-byte header: tag, size, id, step, position, dpi, name', () => {
    const file = encodeRasterFile(bitmap(['##', '#.'], { left: 300, top: 2, dpi: 1016 / 3 }), {
      px: 3,
      packed: false,
      name: 'Coaster',
    });
    const h = file.data.subarray(0, 64);
    const view = new DataView(h.buffer, h.byteOffset);
    expect(h[0]).toBe(0x10);
    expect([view.getUint16(1), view.getUint16(3)]).toEqual([2, 2]);
    expect(view.getUint32(5)).toBe(file.id);
    expect(h[9]).toBe(3);
    expect([view.getUint16(10), view.getUint16(12), view.getUint16(14)]).toEqual([300, 2, 338]);
    expect(new TextDecoder().decode(h.subarray(34, 41))).toBe('Coaster');
    expect(h[41]).toBe(0);
    expect(file.data.length).toBe(64 + 4);
    expect([file.x, file.y]).toEqual([300, 2]);
    expect(encodeRasterFile(bitmap(['#']), { px: 4, packed: true, name: '' }).data[0]).toBe(0x60);
  });

  it('bases the id on the image and its placement, never on the name', () => {
    const opts = { px: 4, packed: false, name: 'A' };
    const base = encodeRasterFile(bitmap(['#.', '.#']), opts).id;
    expect(encodeRasterFile(bitmap(['#.', '.#']), { ...opts, name: 'B' }).id).toBe(base);
    expect(encodeRasterFile(bitmap(['#.', '##']), opts).id).not.toBe(base);
    expect(encodeRasterFile(bitmap(['#.', '.#'], { left: 1 }), opts).id).not.toBe(base);
    expect(encodeRasterFile(bitmap(['#.', '.#']), { ...opts, px: 2 }).id).not.toBe(base);
    expect(base).not.toBe(0);
  });

  it('cuts long names to 29 bytes on a character boundary', () => {
    const file = encodeRasterFile(bitmap(['#']), { px: 4, packed: false, name: 'é'.repeat(20) });
    const name = file.data.subarray(34, 64);
    expect(new TextDecoder().decode(name.subarray(0, 28))).toBe('é'.repeat(14));
    expect(Array.from(name.subarray(28))).toEqual([0, 0]);
  });
});

describe('rasterizeJob', () => {
  it('maps bed corners to the device frame (top-left, y down)', () => {
    expect(toDeviceFrame(lp)(10, 20)).toEqual({ x: 10, y: 20 });
    expect(toDeviceFrame({ ...lp, originCorner: 'bl' })(10, 20)).toEqual({ x: 10, y: 80 });
    expect(toDeviceFrame({ ...lp, originCorner: 'br' })(10, 20)).toEqual({ x: 90, y: 80 });
  });

  const fill = layer({
    id: 'fill',
    mode: 'fill',
    fill: { interval: 0.1, angle: 0, bidirectional: true, overscan: 0, crossHatch: false },
  });

  it('draws a filled rectangle onto the pixel grid at the device resolution', () => {
    const p = project([fill], [vectorObject('r', 'fill', [rectPath(10, 30, 10, 5)])]);
    const { bitmap: b, layers } = rasterizeJob(compileInput(p, { profile: lp }), 254);
    expect(layers).toBe(1);
    expect(b).toMatchObject({ left: 100, top: 300, width: 100, height: 50 });
    expect(b!.burn.every((v) => v === 1)).toBe(true);
  });

  it('keeps line outlines on their edge pixels', () => {
    const line = layer({ id: 'line', mode: 'line' });
    const p = project([line], [vectorObject('r', 'line', [rectPath(1, 1, 0.4, 0.3)])]);
    const b = rasterizeJob(compileInput(p, { profile: lp }), 254).bitmap!;
    expect(picture(b)).toEqual(['####', '#..#', '####']);
  });

  it('ignores the job origin: the device burns at bed positions', () => {
    const p = project([fill], [vectorObject('r', 'fill', [rectPath(10, 30, 10, 5)])], {
      origin: 'current-position',
    });
    expect(rasterizeJob(compileInput(p, { profile: lp }), 254).bitmap).toMatchObject({ left: 100, top: 300 });
  });

  /** 2×2 image: top-left and bottom-right black. */
  const checker: RasterSource = {
    width: 2,
    height: 2,
    data: Uint8ClampedArray.from([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255]),
  };
  const images = layer({
    id: 'img',
    mode: 'image',
    image: { ...DEFAULT_IMAGE_SETTINGS, algorithm: 'threshold' },
  });

  it('dithers images straight onto the device grid, upright as placed', () => {
    // As the importer places art on a top-left machine: object top (y = height) at bed y = 0.
    const img = imageObject('i', 'img', 'a', 4, 4, [1, 0, 0, -1, 2, 4]);
    const input = compileInput(project([images], [img]), { profile: lp, assets: new Map([['a', checker]]) });
    const b = rasterizeJob(input, 25.4).bitmap!;
    expect([b.left, b.top]).toEqual([2, 0]);
    expect(picture(b)).toEqual(['##..', '##..', '..##', '..##']);
  });

  it('flips images the design mirrors', () => {
    const img = imageObject('i', 'img', 'a', 4, 4, [-1, 0, 0, -1, 6, 4]);
    const input = compileInput(project([images], [img]), { profile: lp, assets: new Map([['a', checker]]) });
    expect(picture(rasterizeJob(input, 25.4).bitmap!)).toEqual(['..##', '..##', '##..', '##..']);
  });

  it('has no bitmap for an empty job', () => {
    const { bitmap: b, warnings } = rasterizeJob(compileInput(project([fill], []), { profile: lp }), 254);
    expect(b).toBeNull();
    expect(warnings.map((w) => w.code)).toContain('empty-job');
  });

  it('builds the job file and the framing rectangle in mm', () => {
    const p = project([fill], [vectorObject('r', 'fill', [rectPath(10, 30, 10, 5)])]);
    const job = laserPeckerJob(compileInput(p, { profile: lp }), { dpi: 254, px: 4, packed: true });
    expect(job.frame).toEqual({ x: 10, y: 30, width: 10, height: 5 });
    expect(job.file).toMatchObject({ x: 100, y: 300 });
    expect(job.file!.data.length).toBe(64 + Math.ceil(100 / 8) * 50);
  });
});
