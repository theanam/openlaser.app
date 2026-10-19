import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cubicPoint, distanceToSegmentSq, flattenCubic } from '$lib/geometry/bezier';
import type { Vec2 } from '$lib/geometry/types';

/** Max distance from sampled curve points to the flattened polyline. */
function maxDeviation(p0: Vec2, c1: Vec2, c2: Vec2, p3: Vec2, polyline: Vec2[]): number {
  let worst = 0;
  for (let i = 0; i <= 400; i++) {
    const p = cubicPoint(p0, c1, c2, p3, i / 400);
    let best = Infinity;
    for (let j = 1; j < polyline.length; j++)
      best = Math.min(best, distanceToSegmentSq(p, polyline[j - 1], polyline[j]));
    worst = Math.max(worst, Math.sqrt(best));
  }
  return worst;
}

describe('flattenCubic', () => {
  it('emits only the end point for a straight curve', () => {
    const out: Vec2[] = [];
    flattenCubic({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, 0.01, out);
    expect(out).toEqual([{ x: 3, y: 0 }]);
  });

  it('stays within the chord tolerance of the true curve', () => {
    const p0 = { x: 0, y: 0 };
    const c1 = { x: 0, y: 20 };
    const c2 = { x: 30, y: 20 };
    const p3 = { x: 30, y: 0 };
    const out: Vec2[] = [p0];
    flattenCubic(p0, c1, c2, p3, 0.01, out);
    expect(maxDeviation(p0, c1, c2, p3, out)).toBeLessThanOrEqual(0.01);
    expect(out[out.length - 1]).toEqual(p3);
  });

  it('adapts: a tighter tolerance yields more points, a flatter curve fewer', () => {
    const p0 = { x: 0, y: 0 };
    const p3 = { x: 30, y: 0 };
    const count = (c1: Vec2, c2: Vec2, tol: number) => {
      const out: Vec2[] = [];
      flattenCubic(p0, c1, c2, p3, tol, out);
      return out.length;
    };
    const curved = count({ x: 0, y: 20 }, { x: 30, y: 20 }, 0.01);
    expect(count({ x: 0, y: 20 }, { x: 30, y: 20 }, 0.001)).toBeGreaterThan(curved);
    expect(count({ x: 10, y: 1 }, { x: 20, y: 1 }, 0.01)).toBeLessThan(curved);
  });

  it('holds the tolerance for arbitrary curves', () => {
    const coord = fc.double({ min: -50, max: 50, noNaN: true });
    const point = fc.record({ x: coord, y: coord });
    fc.assert(
      fc.property(point, point, point, point, (p0, c1, c2, p3) => {
        const out: Vec2[] = [p0];
        flattenCubic(p0, c1, c2, p3, 0.05, out);
        expect(maxDeviation(p0, c1, c2, p3, out)).toBeLessThanOrEqual(0.05 + 1e-9);
      }),
      { numRuns: 60 },
    );
  });
});
