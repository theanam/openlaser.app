import { describe, expect, it } from 'vitest';
import { pathsBounds } from '$lib/geometry/path';
import type { PathData, Vec2 } from '$lib/geometry/types';
import {
  SHAPES,
  SHAPE_GROUPS,
  defaultParams,
  isShapeKind,
  shapeDef,
  shapeGlyphPath,
  shapePaths,
  type ShapeKind,
} from '$lib/shapes';

const KINDS = SHAPES.map((s) => s.kind);
const CLOSED = SHAPES.filter((s) => !s.open).map((s) => s.kind);

const W = 200;
const H = 120;

/** Path end point: the last segment's target, or the start for an empty path. */
const lastPoint = (p: PathData): Vec2 => p.segments[p.segments.length - 1]?.to ?? p.start;
const allPoints = (paths: PathData[]): Vec2[] =>
  paths.flatMap((p) => [
    p.start,
    ...p.segments.flatMap((s) => (s.type === 'L' ? [s.to] : [s.c1, s.c2, s.to])),
  ]);

/** The bolt's zig-zag spans only 12–88% of its width by design, so it touches just the top and bottom. */
const EDGE_EXCEPTIONS: Partial<Record<ShapeKind, number>> = { bolt: 2 };

describe('shape catalog', () => {
  it('has unique kinds covering every curvesmith shape plus star and polygon', () => {
    expect(new Set(KINDS).size).toBe(KINDS.length);
    for (const k of [
      'triangle',
      'diamond',
      'trapezoid',
      'parallelogram',
      'gem',
      'polygon',
      'star',
      'doubleStar',
      'squareStar',
      'flower',
      'cog',
      'arrow',
      'chevron',
      'cross',
      'bolt',
      'heart',
      'shield',
      'donut',
      'frame',
      'pie',
      'arc',
      'segment',
      'crescent',
      'spiral',
      'calloutRect',
      'calloutEllipse',
      'cloud',
      'tear',
    ])
      expect(KINDS).toContain(k);
    for (const s of SHAPES) expect(SHAPE_GROUPS).toContain(s.group);
  });

  it('stores percents as fractions and validates kinds', () => {
    expect(defaultParams('star')).toEqual({ points: 5, inner: 0.48 });
    expect(defaultParams('polygon')).toEqual({ sides: 6 });
    expect(defaultParams('cog')).toEqual({ teeth: 10, depth: 0.18, toothWidth: 0.45, hole: 0.3 });
    expect(defaultParams('arrow').double).toBe(false);
    expect(isShapeKind('heart')).toBe(true);
    expect(isShapeKind('rectangle')).toBe(false);
    expect(shapeDef('spiral').open).toBe(true);
  });
});

describe('shape geometry', () => {
  it.each(KINDS)('%s builds finite, non-empty geometry', (kind) => {
    const paths = shapePaths(kind, W, H, defaultParams(kind));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.segments.length).toBeGreaterThan(0);
    for (const v of allPoints(paths)) expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
    expect(paths.every((p) => p.closed)).toBe(!shapeDef(kind).open);
  });

  it.each(CLOSED)('%s closes back to its start', (kind) => {
    for (const p of shapePaths(kind, W, H, defaultParams(kind))) {
      expect(p.closed).toBe(true);
      expect(lastPoint(p).x).toBeCloseTo(p.start.x, 9);
      expect(lastPoint(p).y).toBeCloseTo(p.start.y, 9);
    }
  });

  it('the spiral stays open', () => {
    const [p] = shapePaths('spiral', W, H, defaultParams('spiral'));
    expect(p.closed).toBe(false);
    expect(Math.hypot(lastPoint(p).x - p.start.x, lastPoint(p).y - p.start.y)).toBeGreaterThan(10);
  });

  it.each(CLOSED)('%s fits its box', (kind) => {
    const b = pathsBounds(shapePaths(kind, W, H, defaultParams(kind)), undefined, 0.01)!;
    const tx = W * 0.005;
    const ty = H * 0.005;
    expect(b.minX).toBeGreaterThanOrEqual(-tx);
    expect(b.minY).toBeGreaterThanOrEqual(-ty);
    expect(b.maxX).toBeLessThanOrEqual(W + tx);
    expect(b.maxY).toBeLessThanOrEqual(H + ty);
    const touched = [b.minX <= tx, b.minY <= ty, b.maxX >= W - tx, b.maxY >= H - ty].filter(Boolean).length;
    expect(touched).toBeGreaterThanOrEqual(EDGE_EXCEPTIONS[kind] ?? 3);
    // Arc and segment are half ellipses by default; everything else uses more of its box.
    expect(b.maxX - b.minX).toBeGreaterThan(W / 2);
    expect(b.maxY - b.minY).toBeGreaterThanOrEqual(H / 2 - 0.01);
  });

  it('is Y-up: the triangle apex is at the top and the heart point at the bottom', () => {
    const [tri] = shapePaths('triangle', 100, 80, defaultParams('triangle'));
    expect(tri.start).toEqual({ x: 50, y: 80 });
    expect(tri.segments.map((s) => s.to.y)).toEqual([0, 0, 80]);
    const heart = shapePaths('heart', 100, 80, defaultParams('heart'))[0];
    const bottom = allPoints([heart]).reduce((a, v) => (v.y < a.y ? v : a));
    expect(bottom).toEqual({ x: 50, y: 0 });
  });

  it('star, polygon and radial shapes fill their box exactly', () => {
    for (const [kind, w, h] of [
      ['star', 100, 50],
      ['polygon', 30, 90],
      ['cog', 80, 60],
      ['flower', 60, 80],
      ['cloud', 120, 70],
      ['squareStar', 50, 50],
    ] as const) {
      const b = pathsBounds(shapePaths(kind, w, h, defaultParams(kind)), undefined, 0.0005)!;
      expect(b.minX).toBeCloseTo(0, 2);
      expect(b.minY).toBeCloseTo(0, 2);
      expect(b.maxX).toBeCloseTo(w, 2);
      expect(b.maxY).toBeCloseTo(h, 2);
    }
    // First star point straight up: at the top edge, centred.
    const [star] = shapePaths('star', 100, 50, defaultParams('star'));
    expect(star.start.x).toBeCloseTo(50, 9);
    expect(star.start.y).toBeCloseTo(50, 9);
  });

  it('survives extreme parameters', () => {
    for (const kind of KINDS) {
      for (const v of [-10, 0, 1e6, Number.NaN]) {
        const params = Object.fromEntries(
          shapeDef(kind).params.map((p) => [p.key, p.type === 'bool' ? true : v]),
        );
        for (const pt of allPoints(shapePaths(kind, 50, 50, params)))
          expect(Number.isFinite(pt.x) && Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  it('donut, frame and cog have holes', () => {
    expect(shapePaths('donut', 100, 100, defaultParams('donut'))).toHaveLength(2);
    expect(shapePaths('frame', 100, 100, defaultParams('frame'))).toHaveLength(2);
    expect(shapePaths('cog', 100, 100, defaultParams('cog'))).toHaveLength(2);
    expect(shapePaths('cog', 100, 100, { ...defaultParams('cog'), hole: 0 })).toHaveLength(1);
  });

  it('parameters change the geometry', () => {
    const segs = (kind: ShapeKind, params: Record<string, number | boolean>) =>
      shapePaths(kind, 100, 100, params)[0].segments.length;
    expect(segs('doubleStar', { points: 5 })).toBe(20);
    expect(segs('doubleStar', { points: 9 })).toBe(36);
    expect(segs('cog', { teeth: 8 })).toBe(32);
    expect(segs('cog', { teeth: 12 })).toBe(48);
    expect(segs('star', { points: 7 })).toBe(14);
    expect(segs('polygon', { sides: 8 })).toBe(8);
    const one = segs('arrow', { head: 0.3, shaft: 0.4, double: false });
    const two = segs('arrow', { head: 0.3, shaft: 0.4, double: true });
    expect(two).toBeGreaterThan(one);
  });

  it('negative box sizes are treated as their magnitude', () => {
    expect(shapePaths('diamond', -40, -20)).toEqual(shapePaths('diamond', 40, 20));
  });
});

describe('shape glyphs', () => {
  // Loose limits: the numbers include bezier control points, which may sit just outside the outline.
  it.each(KINDS)('%s has a glyph within the 24×24 icon', (kind) => {
    const d = shapeGlyphPath(kind);
    expect(d).toMatch(/^M/);
    const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    expect(nums.length).toBeGreaterThan(3);
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(-2);
      expect(n).toBeLessThanOrEqual(26);
    }
    expect(d.endsWith('Z')).toBe(!shapeDef(kind).open);
  });

  it('caches glyphs', () => {
    expect(shapeGlyphPath('cog')).toBe(shapeGlyphPath('cog'));
  });
});
