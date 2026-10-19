import { describe, expect, it } from 'vitest';
import { orderPolylines } from '$lib/cam/ordering';
import { flattenPath } from '$lib/geometry/path';
import type { Polyline } from '$lib/geometry/types';
import { polyPath, rectPath } from './fixtures';

const rect = (x: number, y: number, w: number, h: number) => flattenPath(rectPath(x, y, w, h));
const open = (points: [number, number][]): Polyline => flattenPath(polyPath(points, false));
const key = (p: Polyline) => `${p.points[0].x},${p.points[0].y}`;

describe('orderPolylines', () => {
  it('cuts inner contours before the outline containing them', () => {
    const outer = rect(0, 0, 100, 100);
    const hole = rect(40, 40, 20, 20);
    const nested = rect(45, 45, 5, 5);
    const ordered = orderPolylines([outer, hole, nested], { x: 0, y: 0 });
    const areas = ordered.map((p) =>
      Math.round((p.points[2].x - p.points[0].x) * (p.points[2].y - p.points[0].y)),
    );
    expect(areas).toEqual([25, 400, 10000]);
  });

  it('burns score lines inside a part before cutting it out', () => {
    const outer = rect(0, 0, 50, 50);
    const score = open([
      [10, 10],
      [20, 20],
    ]);
    const ordered = orderPolylines([outer, score], { x: 0, y: 0 });
    expect(ordered[0].closed).toBe(false);
  });

  it('visits shapes nearest-first', () => {
    const far = rect(100, 0, 5, 5);
    const near = rect(10, 0, 5, 5);
    const mid = rect(50, 0, 5, 5);
    expect(orderPolylines([far, near, mid], { x: 0, y: 0 }).map(key)).toEqual(['10,0', '50,0', '100,0']);
  });

  it('reverses open paths when their end is closer', () => {
    const [line] = orderPolylines(
      [
        open([
          [100, 0],
          [10, 0],
        ]),
      ],
      { x: 0, y: 0 },
    );
    expect(line.points[0]).toEqual({ x: 10, y: 0 });
  });

  it('starts closed paths at the vertex nearest the head', () => {
    const [r] = orderPolylines([rect(10, 10, 5, 5)], { x: 20, y: 20 });
    expect(r.points[0]).toEqual({ x: 15, y: 15 });
    expect(r.points).toHaveLength(4);
  });

  it('is deterministic for ties', () => {
    const a = rect(10, 0, 5, 5);
    const b = rect(-15, 0, 5, 5);
    const first = orderPolylines([a, b], { x: 0, y: 0 });
    expect(first.map(key)).toEqual(['10,0', '-10,0']);
    expect(orderPolylines([a, b], { x: 0, y: 0 })).toEqual(first);
  });

  it('handles many parts with holes', () => {
    const shapes: Polyline[] = [];
    for (let i = 0; i < 20; i++) shapes.push(rect(i * 30, 0, 20, 20), rect(i * 30 + 5, 5, 10, 10));
    const ordered = orderPolylines(shapes, { x: 0, y: 0 });
    expect(ordered).toHaveLength(40);
    for (let i = 0; i < 20; i++) {
      const holeIndex = ordered.findIndex((p) => p.points.some((q) => q.x === i * 30 + 5 && q.y === 5));
      const outerIndex = ordered.findIndex((p) => p.points.some((q) => q.x === i * 30 && q.y === 0));
      expect(holeIndex).toBeLessThan(outerIndex);
    }
  });
});
