import { describe, expect, it } from 'vitest';
import {
  isCounterClockwise,
  pointInPolygon,
  pointInRings,
  pointRectDistance,
  rectContains,
  rectDistance,
  ringBounds,
  signedArea,
  windingNumber,
} from '$lib/geometry/polygon';
import type { Vec2 } from '$lib/geometry/types';

const square = (x: number, y: number, s: number): Vec2[] => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe('area and orientation', () => {
  it('is positive for counter-clockwise rings', () => {
    expect(signedArea(square(0, 0, 10))).toBe(100);
    expect(signedArea([...square(0, 0, 10)].reverse())).toBe(-100);
    expect(isCounterClockwise(square(0, 0, 2))).toBe(true);
  });

  it('is zero for degenerate rings', () => {
    expect(
      signedArea([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe(0);
  });
});

describe('point in polygon', () => {
  const concave: Vec2[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 5, y: 3 },
    { x: 0, y: 10 },
  ];

  it('handles concave rings', () => {
    expect(pointInPolygon({ x: 2, y: 2 }, concave)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 8 }, concave)).toBe(false);
    expect(pointInPolygon({ x: -1, y: 2 }, concave)).toBe(false);
  });

  it('computes winding numbers with sign', () => {
    expect(windingNumber({ x: 5, y: 5 }, square(0, 0, 10))).toBe(1);
    expect(windingNumber({ x: 5, y: 5 }, [...square(0, 0, 10)].reverse())).toBe(-1);
    expect(windingNumber({ x: 15, y: 5 }, square(0, 0, 10))).toBe(0);
  });

  it('distinguishes even-odd from non-zero for overlapping rings', () => {
    const rings = [square(0, 0, 10), square(2, 2, 6)];
    expect(pointInRings({ x: 5, y: 5 }, rings, 'evenodd')).toBe(false);
    expect(pointInRings({ x: 5, y: 5 }, rings, 'nonzero')).toBe(true);
    expect(pointInRings({ x: 1, y: 1 }, rings, 'evenodd')).toBe(true);
  });
});

describe('rect helpers', () => {
  it('computes bounds, containment and distances', () => {
    const r = ringBounds(square(1, 2, 3));
    expect(r).toEqual({ minX: 1, minY: 2, maxX: 4, maxY: 5 });
    expect(rectContains({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, r)).toBe(true);
    expect(rectContains(r, { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(false);
    expect(rectDistance(r, { minX: 7, minY: 9, maxX: 8, maxY: 10 })).toBe(5);
    expect(pointRectDistance({ x: 2, y: 3 }, r)).toBe(0);
    expect(pointRectDistance({ x: 4, y: 9 }, r)).toBe(4);
  });
});
