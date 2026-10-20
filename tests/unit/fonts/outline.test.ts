import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error opentype.js ships no type declarations; narrowed to OtFont below.
import * as opentype from 'opentype.js';
import type { PathData, Vec2 } from '$lib/geometry/types';
import { textToPaths, type OtFont, type TextLayoutSpec } from '$lib/fonts/outline';

const bytes = readFileSync(resolve(process.cwd(), 'tests/fixtures/fonts/geist-latin-400-normal.ttf'));
let font: OtFont;

beforeAll(() => {
  // The UMD build exposes the API on `default`; the ESM build on the namespace.
  const ns = opentype as unknown as { parse?: unknown; default?: unknown };
  const ot = (ns.parse ? ns : ns.default) as { parse(b: ArrayBuffer): OtFont };
  font = ot.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
});

const spec = (text: string, over: Partial<TextLayoutSpec> = {}): TextLayoutSpec => ({
  text,
  fontSize: 10,
  align: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
  ...over,
});

function points(p: PathData): Vec2[] {
  const out = [p.start];
  for (const s of p.segments) out.push(...(s.type === 'C' ? [s.c1, s.c2, s.to] : [s.to]));
  return out;
}

function bounds(paths: PathData[]) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of paths)
    for (const { x, y } of points(p)) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return { x0, y0, x1, y1 };
}

const scale = () => 10 / font.unitsPerEm;

describe('textToPaths', () => {
  it('outlines "Laser" as closed contours of lines and cubics only', () => {
    const out = textToPaths(spec('Laser'), font);
    expect(out.paths.length).toBeGreaterThanOrEqual(5);
    for (const p of out.paths) {
      expect(p.closed).toBe(true);
      expect(p.segments.length).toBeGreaterThanOrEqual(2);
      expect(p.segments.every((s) => s.type === 'L' || s.type === 'C')).toBe(true);
      const last = p.segments[p.segments.length - 1].to;
      expect(last.x).toBeCloseTo(p.start.x, 9);
      expect(last.y).toBeCloseTo(p.start.y, 9);
    }
    expect(out.paths.some((p) => p.segments.some((s) => s.type === 'C'))).toBe(true);
  });

  it('is Y-up: the block spans 0..height with cap tops near the top and the baseline above 0', () => {
    const out = textToPaths(spec('HH'), font);
    const s = scale();
    expect(out.height).toBeCloseTo((font.ascender - font.descender) * s, 9);
    const b = bounds(out.paths);
    const baseline = out.height - font.ascender * s;
    // H sits on the baseline and rises to cap height (~0.7 em) above it.
    expect(b.y0).toBeCloseTo(baseline, 1);
    expect(b.y1).toBeGreaterThan(baseline + 6);
    expect(b.y1).toBeLessThanOrEqual(out.height);
    expect(out.height - b.y1).toBeLessThan(3);
    expect(b.x0).toBeGreaterThanOrEqual(0);
    expect(b.x1).toBeLessThanOrEqual(out.width + 1e-9);
    expect(out.width).toBeCloseTo(font.getAdvanceWidth('HH', 10, { kerning: true }), 9);
  });

  it('letter spacing widens the block by the gaps between glyphs', () => {
    const plain = textToPaths(spec('HHHH'), font);
    const loose = textToPaths(spec('HHHH', { letterSpacing: 200 }), font);
    // 3 gaps × 0.2 em × 10 mm.
    expect(loose.width - plain.width).toBeCloseTo(6, 9);
    const pb = bounds(plain.paths);
    const lb = bounds(loose.paths);
    expect(lb.x1 - lb.x0 - (pb.x1 - pb.x0)).toBeCloseTo(6, 6);
  });

  it('center and right alignment shift the narrower line against the widest', () => {
    const lineOf = (out: ReturnType<typeof textToPaths>, top: boolean) => {
      const mid = out.height - font.ascender * scale() - 0.6 * 10;
      return bounds(out.paths.filter((p) => bounds([p]).y0 > mid === top));
    };
    const left = textToPaths(spec('HHHHHH\nH'), font);
    const center = textToPaths(spec('HHHHHH\nH', { align: 'center' }), font);
    const right = textToPaths(spec('HHHHHH\nH', { align: 'right' }), font);
    expect(center.width).toBeCloseTo(left.width, 9);
    // The wide line does not move.
    expect(lineOf(center, true).x0).toBeCloseTo(lineOf(left, true).x0, 9);
    const hAdvance = font.getAdvanceWidth('H', 10, { kerning: true });
    const slack = left.width - hAdvance;
    expect(lineOf(center, false).x0 - lineOf(left, false).x0).toBeCloseTo(slack / 2, 6);
    expect(lineOf(right, false).x0 - lineOf(left, false).x0).toBeCloseTo(slack, 6);
  });

  it('each extra line adds lineHeight × fontSize, empty lines included', () => {
    const one = textToPaths(spec('H'), font);
    const two = textToPaths(spec('H\nH', { lineHeight: 1.5 }), font);
    expect(two.height - one.height).toBeCloseTo(15, 9);
    const gap = textToPaths(spec('H\n\nH'), font);
    expect(gap.height - one.height).toBeCloseTo(24, 9);
    // The empty line emits nothing: still just two H outlines.
    expect(gap.paths).toHaveLength(2);
    // First line stays at the top; the second sits two pitches lower.
    const [a, b] = gap.paths.map((p) => bounds([p]).y0).sort((x, y) => y - x);
    expect(a - b).toBeCloseTo(24, 6);
  });

  it('empty and whitespace-only text produce no paths and zero width', () => {
    for (const text of ['', '   ', '\n']) {
      const out = textToPaths(spec(text), font);
      expect(out.paths).toEqual([]);
      expect(out.width).toBe(0);
    }
  });
});

describe('outlineText', () => {
  afterEach(() => {
    vi.doUnmock('$lib/fonts/loader');
    vi.resetModules();
  });

  const obj = {
    text: 'Hello',
    fontFamily: 'Geist',
    fontSize: 10,
    fontWeight: 400,
    italic: false,
    align: 'left' as const,
    lineHeight: 1.2,
    letterSpacing: 0,
  };

  it('parses bytes from the loader once and caches the parsed font', async () => {
    vi.resetModules();
    const getFontBytes = vi.fn(async () => new Uint8Array(bytes));
    vi.doMock('$lib/fonts/loader', () => ({ getFontBytes }));
    const { outlineText } = await import('$lib/fonts/outline');
    const a = await outlineText(obj);
    const b = await outlineText({ ...obj, text: 'World' });
    expect(a!.paths.length).toBeGreaterThan(4);
    expect(b!.width).toBeGreaterThan(0);
    expect(getFontBytes).toHaveBeenCalledTimes(1);
    expect(getFontBytes).toHaveBeenCalledWith({ family: 'Geist', weight: 400, style: 'normal' });
  });

  it('asks the loader for the italic face', async () => {
    vi.resetModules();
    const getFontBytes = vi.fn(async () => new Uint8Array(bytes));
    vi.doMock('$lib/fonts/loader', () => ({ getFontBytes }));
    const { outlineText } = await import('$lib/fonts/outline');
    await outlineText({ ...obj, italic: true, fontWeight: 700 });
    expect(getFontBytes).toHaveBeenCalledWith({ family: 'Geist', weight: 700, style: 'italic' });
  });

  it('returns null when the face is unavailable', async () => {
    vi.resetModules();
    vi.doMock('$lib/fonts/loader', () => ({ getFontBytes: async () => null }));
    const { outlineText } = await import('$lib/fonts/outline');
    expect(await outlineText(obj)).toBeNull();
  });
});

describe('overlapping glyph contours', () => {
  const area = async (paths: import('$lib/geometry/types').PathData[], rule: 'evenodd' | 'nonzero') => {
    const { union } = await import('$lib/geometry/clipper');
    const { flattenPath } = await import('$lib/geometry/path');
    const { signedArea } = await import('$lib/geometry/polygon');
    const rings = union(
      paths.map((p) => flattenPath(p, undefined, 0.005).points),
      rule,
    );
    return rings.reduce((n, r) => n + signedArea(r), 0);
  };
  const spec = { fontSize: 20, align: 'left' as const, lineHeight: 1.2, letterSpacing: 0 };

  it('merges a "t" whose bar crosses its stem, so it burns solid by either fill rule', async () => {
    const { paths } = textToPaths({ ...spec, text: 't' }, font);
    const evenOdd = await area(paths, 'evenodd');
    const nonZero = await area(paths, 'nonzero');
    expect(Math.abs(evenOdd)).toBeGreaterThan(1);
    expect(Math.abs(evenOdd - nonZero)).toBeLessThan(Math.abs(nonZero) * 0.002);
  });

  it('keeps the curves of glyphs without overlaps', () => {
    const { paths } = textToPaths({ ...spec, text: 'o' }, font);
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => p.segments.some((s) => s.type === 'C'))).toBe(true);
  });
});
