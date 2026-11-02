import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error opentype.js ships no type declarations; narrowed to OtFont below.
import * as opentype from 'opentype.js';
import type { PathData } from '$lib/geometry/types';
import { union } from '$lib/geometry/clipper';
import { flattenPath } from '$lib/geometry/path';
import { signedArea } from '$lib/geometry/polygon';
import { textToPaths, type OtFont, type TextLayoutSpec } from '$lib/fonts/outline';
import { splitRuns } from '$lib/fonts/runs';
import { codePointsIn, dominantScript, FALLBACK_FAMILIES, subsetFor, subsetsFor } from '$lib/fonts/scripts';
import { createShaper, type Shaper } from '$lib/fonts/shaping';

const read = (name: string) => {
  const b = readFileSync(resolve(process.cwd(), 'tests/fixtures/fonts', name));
  return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

let latin: OtFont;
let bengali: Shaper;

beforeAll(async () => {
  const ns = opentype as unknown as { parse?: unknown; default?: unknown };
  const ot = (ns.parse ? ns : ns.default) as { parse(b: ArrayBuffer): OtFont };
  latin = ot.parse(read('noto-sans-bengali-latin-400-normal.ttf').buffer as ArrayBuffer);
  bengali = (await createShaper(read('noto-sans-bengali-bengali-400-normal.ttf')))!;
});

// Noto Sans Bengali has 1000 units per em, so at 10 mm one unit is 0.01 mm.
const spec = (text: string, over: Partial<TextLayoutSpec> = {}): TextLayoutSpec => ({
  text,
  fontSize: 10,
  align: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
  ...over,
});

function xRange(paths: PathData[]) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of paths) {
    for (const pt of [p.start, ...p.segments.map((s) => s.to)]) {
      lo = Math.min(lo, pt.x);
      hi = Math.max(hi, pt.x);
    }
  }
  return { lo, hi };
}

/** Advances of each shaped glyph, from where its outline starts. */
const shaped = (text: string) => bengali.shape(text, 0, 0, 10, 0);

describe('scripts', () => {
  it('finds the subset a character lives in', () => {
    expect(subsetFor('ক'.codePointAt(0)!)).toBe('bengali');
    expect(subsetFor('A'.codePointAt(0)!)).toBeNull();
    expect(subsetFor('Ж'.codePointAt(0)!)).toBe('cyrillic');
    // The danda is shared: the font's own subset wins.
    expect(subsetFor(0x0964, ['devanagari'])).toBe('devanagari');
    expect(subsetFor(0x0964)).toBe('bengali');
  });

  it('lists the subsets a text needs and its main script', () => {
    expect(subsetsFor('Hi আমার সোনার বাংলা')).toEqual(['bengali']);
    expect(subsetsFor('Text')).toEqual([]);
    expect(dominantScript('আমার Text')).toBe('bengali');
    expect(dominantScript('Text')).toBeNull();
  });

  it('falls back to the Noto family of each script', () => {
    expect(FALLBACK_FAMILIES.bengali).toBe('Noto Sans Bengali');
    expect(FALLBACK_FAMILIES.cyrillic).toBe('Noto Sans');
    expect(codePointsIn('Hi কি', 'bengali')).toEqual([0x0995, 0x09bf]);
    expect(codePointsIn('Hi কি', 'cyrillic')).toEqual([]);
  });

  it('keeps spaces and joiners inside a run', () => {
    const runs = splitRuns('Hi আমার সোনার‌বাংলা', [bengali], (cp) => cp < 0x100);
    expect(runs.map((r) => [r.text, r.shaper ? 'bn' : 'latin'])).toEqual([
      ['Hi ', 'latin'],
      ['আমার সোনার‌বাংলা', 'bn'],
    ]);
  });
});

describe('Bangla shaping', () => {
  it('draws ি before its consonant (কি)', () => {
    const [ikar, ka] = shaped('কি').glyphs.map((g) => g.commands);
    const start = (c: typeof ikar) => Math.min(...c.flatMap((k) => ('x' in k ? [k.x] : [])));
    expect(start(ikar)).toBeLessThan(start(ka));
  });

  it('joins ক্ষ into one conjunct glyph', () => {
    const run = shaped('ক্ষ');
    expect(run.glyphs).toHaveLength(1);
    expect(run.advance).toBeCloseTo(8.59, 2);
  });

  it('splits ো around its consonant (কো)', () => {
    const run = shaped('কো');
    expect(run.glyphs).toHaveLength(3);
    expect(run.advance).toBeCloseTo(3.61 + 8.07 + 2.66, 2);
  });

  it('puts reph on top without advancing (র্ক)', () => {
    expect(shaped('র্ক').advance).toBeCloseTo(8.07, 2);
  });

  it('adds letter spacing between clusters, never inside one', () => {
    const tight = bengali.shape('কো', 0, 0, 10, 0).advance;
    expect(bengali.shape('কো', 0, 0, 10, 100).advance).toBeCloseTo(tight + 1, 5);
  });
});

describe('text outlines with Bangla', () => {
  it('outlines Bangla words from the shaped glyphs, with nothing missing', () => {
    const out = textToPaths(spec('আমার সোনার বাংলা'), latin, [bengali]);
    expect(out.missing).toBeUndefined();
    expect(out.paths.length).toBeGreaterThan(10);
    expect(out.width).toBeGreaterThan(40);
  });

  it('lays out mixed Latin and Bangla on one line, left to right', () => {
    const hi = textToPaths(spec('Hi'), latin, [bengali]);
    const both = textToPaths(spec('Hi বাংলা'), latin, [bengali]);
    const bangla = textToPaths(spec('বাংলা'), latin, [bengali]);
    const space = latin.getAdvanceWidth(' ', 10, { kerning: true, tracking: 0 });
    expect(both.width).toBeCloseTo(hi.width + space + bangla.width, 3);
    expect(xRange(both.paths).hi).toBeGreaterThan(xRange(hi.paths).hi + 5);
  });

  it('keeps Latin-only text exactly as before', () => {
    expect(textToPaths(spec('Laser 42'), latin, [bengali])).toEqual(textToPaths(spec('Laser 42'), latin));
  });

  it('reports Bangla letters as missing without a Bangla face', () => {
    expect(textToPaths(spec('কি'), latin).missing).toEqual(['ক', 'ি']);
  });
});

/** Ring areas, sorted: merging the outlines again must give the same, i.e. nothing overlaps. */
function overlapFree(paths: PathData[]): boolean {
  const rings = paths.map((p) => flattenPath(p, undefined, 0.005).points);
  const areas = (list: { x: number; y: number }[][]) =>
    list.map((r) => Math.abs(signedArea(r))).sort((a, b) => a - b);
  const before = areas(rings);
  const after = areas(union(rings, 'nonzero'));
  return (
    before.length === after.length &&
    before.every((a, i) => Math.abs(a - after[i]!) <= Math.max(1e-6, a * 1e-3))
  );
}

describe('overlapping glyphs', () => {
  it('merges glyphs that overlap each other, as one outline (ঔ শ্রী)', () => {
    const shapedRings = shaped('ঔ শ্রী').glyphs.length;
    const out = textToPaths(spec('ঔ শ্রী'), latin, [bengali]);
    expect(overlapFree(out.paths)).toBe(true);
    expect(shapedRings).toBeGreaterThan(2);
  });

  it('leaves glyphs that only sit side by side alone', () => {
    // A merge flattens a ring into hundreds of short lines; untouched glyphs keep a few curves.
    const out = textToPaths(spec('Laser HIT'), latin, [bengali]);
    expect(out.paths.map((p) => p.segments.length)).toEqual([6, 23, 8, 31, 18, 6, 18, 12, 12, 8]);
    expect(out.paths.filter((p) => p.segments.some((seg) => seg.type === 'C'))).toHaveLength(6);
  });
});
