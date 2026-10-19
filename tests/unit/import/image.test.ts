import { describe, expect, it } from 'vitest';
import { defaultImageSize, isImageFileName, readImageDpi, sniffImageMime } from '$lib/import/image';

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >>> 8) & 255, n & 255];
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngChunk(type: string, data: number[]): number[] {
  return [...u32(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
}

function png(phys?: { x: number; y: number; unit: number }): Uint8Array {
  const ihdr = pngChunk('IHDR', [...u32(10), ...u32(10), 8, 6, 0, 0, 0]);
  const physChunk = phys ? pngChunk('pHYs', [...u32(phys.x), ...u32(phys.y), phys.unit]) : [];
  return Uint8Array.from([
    ...PNG_SIGNATURE,
    ...ihdr,
    ...physChunk,
    ...pngChunk('IDAT', [0]),
    ...pngChunk('IEND', []),
  ]);
}

function jpegSegment(marker: number, body: number[]): number[] {
  return [0xff, marker, ...u16(body.length + 2), ...body];
}

function jfif(units: number, x: number, y: number): number[] {
  return jpegSegment(0xe0, [...ascii('JFIF'), 0, 1, 2, units, ...u16(x), ...u16(y), 0, 0]);
}

/** Minimal TIFF/EXIF with XResolution, YResolution and ResolutionUnit in IFD0. */
function exif(little: boolean, x: number, y: number, unit: number): number[] {
  const w16 = (n: number) => (little ? u16(n).reverse() : u16(n));
  const w32 = (n: number) => (little ? u32(n).reverse() : u32(n));
  const ifdOffset = 8;
  const entries = 3;
  const dataOffset = ifdOffset + 2 + entries * 12 + 4;
  const tiff = [
    ...ascii(little ? 'II' : 'MM'),
    ...w16(42),
    ...w32(ifdOffset),
    ...w16(entries),
    ...w16(0x011a),
    ...w16(5),
    ...w32(1),
    ...w32(dataOffset),
    ...w16(0x011b),
    ...w16(5),
    ...w32(1),
    ...w32(dataOffset + 8),
    ...w16(0x0128),
    ...w16(3),
    ...w32(1),
    ...w16(unit),
    0,
    0,
    ...w32(0),
    ...w32(x),
    ...w32(1),
    ...w32(y),
    ...w32(1),
  ];
  return jpegSegment(0xe1, [...ascii('Exif'), 0, 0, ...tiff]);
}

const jpeg = (...segments: number[][]) => Uint8Array.from([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 0, 2]);

describe('sniffImageMime', () => {
  it('recognises the supported formats', () => {
    expect(sniffImageMime(png())).toBe('image/png');
    expect(sniffImageMime(jpeg())).toBe('image/jpeg');
    expect(sniffImageMime(Uint8Array.from(ascii('GIF89a')))).toBe('image/gif');
    expect(sniffImageMime(Uint8Array.from(ascii('BM....')))).toBe('image/bmp');
    expect(sniffImageMime(Uint8Array.from(ascii('RIFF\0\0\0\0WEBPVP8 ')))).toBe('image/webp');
    expect(sniffImageMime(Uint8Array.from(ascii('<svg')))).toBeNull();
  });
});

describe('readImageDpi', () => {
  it('reads PNG pHYs in pixels per metre', () => {
    const dpi = readImageDpi(png({ x: 11811, y: 11811, unit: 1 }));
    expect(dpi?.x).toBeCloseTo(300, 0);
    expect(dpi?.y).toBeCloseTo(300, 0);
  });

  it('ignores PNG aspect-only pHYs and missing chunks', () => {
    expect(readImageDpi(png({ x: 1, y: 1, unit: 0 }))).toBeNull();
    expect(readImageDpi(png())).toBeNull();
  });

  it('reads JFIF density in dpi and dots per cm', () => {
    expect(readImageDpi(jpeg(jfif(1, 300, 150)))).toEqual({ x: 300, y: 150 });
    const perCm = readImageDpi(jpeg(jfif(2, 100, 100)));
    expect(perCm?.x).toBeCloseTo(254, 6);
  });

  it('falls back to EXIF resolution (both byte orders)', () => {
    expect(readImageDpi(jpeg(jfif(0, 1, 1), exif(true, 254, 254, 2)))).toEqual({ x: 254, y: 254 });
    expect(readImageDpi(jpeg(exif(false, 200, 100, 2)))).toEqual({ x: 200, y: 100 });
    expect(readImageDpi(jpeg(exif(false, 100, 100, 3)))?.x).toBeCloseTo(254, 6);
  });

  it('prefers JFIF over EXIF and rejects implausible values', () => {
    expect(readImageDpi(jpeg(jfif(1, 96, 96), exif(true, 300, 300, 2)))).toEqual({ x: 96, y: 96 });
    expect(readImageDpi(jpeg(jfif(1, 1, 1)))).toBeNull();
  });
});

describe('defaultImageSize', () => {
  const bed = { width: 400, height: 300 };

  it('uses 254 DPI (0.1 mm/px) without metadata', () => {
    expect(defaultImageSize({ width: 1000, height: 500 }, null, bed)).toEqual({
      width: 100,
      height: 50,
      clamped: false,
    });
  });

  it('uses embedded DPI', () => {
    const size = defaultImageSize({ width: 300, height: 600 }, { x: 300, y: 300 }, bed);
    expect(size.width).toBeCloseTo(25.4, 6);
    expect(size.height).toBeCloseTo(50.8, 6);
  });

  it('shrinks to fit the bed keeping the aspect ratio', () => {
    const size = defaultImageSize({ width: 8000, height: 2000 }, null, bed);
    expect(size.clamped).toBe(true);
    expect(size.width).toBeCloseTo(400, 6);
    expect(size.height).toBeCloseTo(100, 6);
  });
});

describe('isImageFileName', () => {
  it('accepts PNG, JPEG, WebP, BMP and GIF', () => {
    for (const name of ['a.png', 'b.JPG', 'c.jpeg', 'd.webp', 'e.bmp', 'f.gif'])
      expect(isImageFileName(name)).toBe(true);
    expect(isImageFileName('g.tiff')).toBe(false);
  });
});

describe('AVIF', () => {
  it('sniffs AVIF from its ftyp box and accepts the extension', async () => {
    const { sniffImageMime, isImageFileName } = await import('$lib/import/image');
    const avif = new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0]);
    expect(sniffImageMime(avif)).toBe('image/avif');
    expect(isImageFileName('photo.AVIF')).toBe(true);
  });
});
