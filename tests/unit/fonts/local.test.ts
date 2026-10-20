// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FontFileError,
  hasLocalFamily,
  loadSystemFonts,
  localFamilies,
  localFontBytes,
  readFontFile,
  removeUploadedFont,
  resetLocalFonts,
  restoreUploadedFonts,
  uploadFont,
} from '$lib/fonts/local';
import { collectionSize, extractFromCollection, fontFormat, parseStyleName } from '$lib/fonts/sfnt';

const TTF = new Uint8Array(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/fonts/geist-latin-400-normal.ttf')),
);

const file = (bytes: Uint8Array) => ({ arrayBuffer: async () => bytes.slice().buffer });

/** A TrueType collection holding `count` copies of the fixture, with absolute table offsets. */
function collection(count: number): Uint8Array {
  const src = new DataView(TTF.buffer, TTF.byteOffset, TTF.byteLength);
  const numTables = src.getUint16(4);
  const dirSize = 12 + numTables * 16;
  const header = 12 + count * 4;
  const fontSize = dirSize + TTF.length;
  const out = new Uint8Array(header + count * fontSize);
  const w = new DataView(out.buffer);
  out.set([0x74, 0x74, 0x63, 0x66], 0); // 'ttcf'
  w.setUint32(4, 0x00010000);
  w.setUint32(8, count);
  for (let i = 0; i < count; i++) {
    const dir = header + i * fontSize;
    const data = dir + dirSize;
    w.setUint32(12 + i * 4, dir);
    out.set(TTF.subarray(0, dirSize), dir);
    out.set(TTF, data);
    for (let t = 0; t < numTables; t++) {
      const at = dir + 12 + t * 16 + 8;
      w.setUint32(at, data + src.getUint32(12 + t * 16 + 8));
    }
  }
  return out;
}

describe('sfnt helpers', () => {
  it('sniffs font formats', () => {
    expect(fontFormat(TTF)).toBe('ttf');
    expect(fontFormat(new TextEncoder().encode('OTTO'))).toBe('otf');
    expect(fontFormat(new TextEncoder().encode('wOFF'))).toBe('woff');
    expect(fontFormat(new TextEncoder().encode('wOF2'))).toBe('woff2');
    expect(fontFormat(collection(2))).toBe('ttc');
    expect(fontFormat(new TextEncoder().encode('<svg'))).toBe('unknown');
  });

  it('pulls one font out of a collection', async () => {
    const ttc = collection(2);
    expect(collectionSize(ttc)).toBe(2);
    const { info } = await readFontFile(extractFromCollection(ttc, 1));
    expect(info.family).toBe('Geist');
    expect(() => extractFromCollection(ttc, 2)).toThrow(RangeError);
  });

  it('reads weight and slant from style names', () => {
    expect(parseStyleName('Regular')).toEqual({ weight: 400, italic: false });
    expect(parseStyleName('Semibold Italic')).toEqual({ weight: 600, italic: true });
    expect(parseStyleName('Extra Light')).toEqual({ weight: 200, italic: false });
    expect(parseStyleName('Bold Condensed Oblique')).toEqual({ weight: 700, italic: true });
    expect(parseStyleName('Black')).toEqual({ weight: 900, italic: false });
  });
});

describe('uploaded fonts', () => {
  beforeEach(() => resetLocalFonts());
  afterEach(async () => {
    await removeUploadedFont('Geist');
    resetLocalFonts();
  });

  it('adds a TTF under its own family name and keeps it for next time', async () => {
    expect(await uploadFont(file(TTF))).toBe('Geist');
    expect(localFamilies()).toEqual([
      expect.objectContaining({ family: 'Geist', source: 'uploaded', weights: [400], italic: false }),
    ]);
    expect(await localFontBytes({ family: 'geist', weight: 700, style: 'normal' })).toHaveLength(TTF.length);

    resetLocalFonts();
    expect(hasLocalFamily('Geist')).toBe(false);
    await restoreUploadedFonts();
    expect(hasLocalFamily('Geist')).toBe(true);

    await removeUploadedFont('Geist');
    expect(hasLocalFamily('Geist')).toBe(false);
    resetLocalFonts();
    await restoreUploadedFonts();
    expect(hasLocalFamily('Geist')).toBe(false);
  });

  it('takes a font out of a collection file', async () => {
    expect(await uploadFont(file(collection(3)))).toBe('Geist');
  });

  it('explains files it cannot use', async () => {
    await expect(uploadFont(file(new TextEncoder().encode('wOF2xxxx')))).rejects.toThrow(/WOFF2/);
    await expect(uploadFont(file(new TextEncoder().encode('hello world')))).rejects.toThrow(FontFileError);
  });
});

describe('system fonts', () => {
  afterEach(() => {
    delete (window as { queryLocalFonts?: unknown }).queryLocalFonts;
    resetLocalFonts();
  });

  it('lists installed families and reads a face on demand', async () => {
    let reads = 0;
    const face = (style: string) => ({
      family: 'Geist',
      fullName: `Geist ${style}`,
      postscriptName: `Geist-${style}`,
      style,
      blob: async () => {
        reads++;
        return file(TTF);
      },
    });
    (window as unknown as { queryLocalFonts: () => Promise<unknown[]> }).queryLocalFonts = async () => [
      face('Regular'),
      face('Bold Italic'),
    ];
    expect(await loadSystemFonts()).toBe(1);
    expect(localFamilies()).toEqual([
      expect.objectContaining({ family: 'Geist', source: 'system', weights: [400], italic: true }),
    ]);
    expect(reads).toBe(0);
    expect(await localFontBytes({ family: 'Geist', weight: 400, style: 'normal' })).toHaveLength(TTF.length);
    await localFontBytes({ family: 'Geist', weight: 400, style: 'normal' });
    expect(reads).toBe(1);
  });
});
