import { describe, expect, it } from 'vitest';
import { clipPolylines, difference, intersection, offsetRings, union } from '$lib/geometry/clipper';
import { pointInRings, signedArea } from '$lib/geometry/polygon';
import type { Vec2 } from '$lib/geometry/types';

const square = (x: number, y: number, s: number): Vec2[] => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];
const totalArea = (rings: Vec2[][]) => rings.reduce((sum, r) => sum + signedArea(r), 0);

describe('clipper wrapper', () => {
  it('returns millimetres, not scaled integers', () => {
    const [ring] = union([square(0.1234, 0, 1)]);
    expect(Math.min(...ring.map((p) => p.x))).toBeCloseTo(0.123, 6);
  });

  it('unions overlapping squares with non-zero', () => {
    const result = union([square(0, 0, 10), square(5, 0, 10)], 'nonzero');
    expect(result).toHaveLength(1);
    expect(totalArea(result)).toBeCloseTo(150);
  });

  it('turns a nested ring into a hole with even-odd regardless of orientation', () => {
    const result = union([square(0, 0, 10), square(2, 2, 6)], 'evenodd');
    expect(result).toHaveLength(2);
    expect(totalArea(result)).toBeCloseTo(64);
    expect(pointInRings({ x: 5, y: 5 }, result)).toBe(false);
    expect(pointInRings({ x: 1, y: 5 }, result)).toBe(true);
  });

  it('fills a same-direction nested ring with non-zero', () => {
    expect(totalArea(union([square(0, 0, 10), square(2, 2, 6)], 'nonzero'))).toBeCloseTo(100);
  });

  it('intersects and subtracts regions', () => {
    expect(totalArea(intersection([square(0, 0, 10)], [square(5, 5, 10)]))).toBeCloseTo(25);
    expect(totalArea(difference([square(0, 0, 10)], [square(5, 5, 10)]))).toBeCloseTo(75);
  });

  it('clips open polylines to a region', () => {
    const parts = clipPolylines(
      [
        [
          { x: -5, y: 5 },
          { x: 15, y: 5 },
        ],
      ],
      [square(0, 0, 10)],
    );
    expect(parts).toHaveLength(1);
    const xs = parts[0].map((p) => p.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 10]);
  });

  it('grows a single ring for positive offsets whatever its orientation', () => {
    expect(totalArea(offsetRings([square(0, 0, 10)], 1))).toBeCloseTo(144);
    expect(Math.abs(totalArea(offsetRings([[...square(0, 0, 10)].reverse()], 1)))).toBeCloseTo(144);
    expect(totalArea(offsetRings([square(0, 0, 10)], -1))).toBeCloseTo(64);
  });

  it('keeps square corners with the default miter join', () => {
    const [ring] = offsetRings([square(0, 0, 10)], 0.5);
    expect(ring).toHaveLength(4);
    expect(Math.min(...ring.map((p) => p.x))).toBeCloseTo(-0.5);
  });

  it('rounds corners with a round join', () => {
    const [ring] = offsetRings([square(0, 0, 10)], 2, { join: 'round' });
    expect(ring.length).toBeGreaterThan(8);
    expect(totalArea([ring])).toBeCloseTo(196 - 16 + Math.PI * 4, 0);
  });

  it('collapses rings that shrink away', () => {
    expect(offsetRings([square(0, 0, 2)], -1.5)).toEqual([]);
  });

  it('shrinks holes when a region grows', () => {
    const region = union([square(0, 0, 10), square(3, 3, 4)], 'evenodd');
    expect(totalArea(offsetRings(region, 0.5))).toBeCloseTo(121 - 9);
  });
});
