import { describe, expect, it } from 'vitest';
import type { PathData, Segment } from '$lib/geometry/types';
import { arcToCubics } from '$lib/import/svg/arc';
import { parsePathData } from '$lib/import/svg/path-data';

const ends = (path: PathData) => [path.start, ...path.segments.map((s) => s.to)].map((p) => [p.x, p.y]);

/** Point on a cubic at t. */
function cubicAt(from: { x: number; y: number }, s: Extract<Segment, { type: 'C' }>, t: number) {
  const u = 1 - t;
  const f = (a: number, b: number, c: number, d: number) =>
    u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  return { x: f(from.x, s.c1.x, s.c2.x, s.to.x), y: f(from.y, s.c1.y, s.c2.y, s.to.y) };
}

describe('parsePathData', () => {
  it('handles absolute and relative lines, H/V and implicit linetos', () => {
    const [path] = parsePathData('M10 10 20 10 l0 10 h-10 V 10');
    expect(ends(path)).toEqual([
      [10, 10],
      [20, 10],
      [20, 20],
      [10, 20],
      [10, 10],
    ]);
    expect(path.closed).toBe(false);
  });

  it('closes subpaths with an explicit segment and restarts at the subpath start', () => {
    const paths = parsePathData('M0 0 L10 0 L10 10 Z l5 5 z m1 1 h2');
    expect(paths).toHaveLength(3);
    expect(paths[0].closed).toBe(true);
    expect(paths[0].segments.at(-1)?.to).toEqual({ x: 0, y: 0 });
    expect(paths[1].start).toEqual({ x: 0, y: 0 });
    expect(paths[1].segments[0].to).toEqual({ x: 5, y: 5 });
    // After z the current point is the subpath start (0,0), so m1 1 moves to (1,1).
    expect(paths[2].start).toEqual({ x: 1, y: 1 });
  });

  it('parses compact number syntax', () => {
    const [path] = parsePathData('M.5.5-1-1e1,2E0 3');
    expect(ends(path)).toEqual([
      [0.5, 0.5],
      [-1, -10],
      [2, 3],
    ]);
  });

  it('reflects control points for S and T', () => {
    const [cubic] = parsePathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
    const s = cubic.segments[1] as Extract<Segment, { type: 'C' }>;
    expect(s.c1).toEqual({ x: 10, y: -10 });
    const [quad] = parsePathData('M0 0 Q5 10 10 0 T20 0');
    const t = quad.segments[1] as Extract<Segment, { type: 'C' }>;
    // Reflected quad control is (15,-10): cubic controls sit 2/3 of the way toward it.
    expect(t.c1.x).toBeCloseTo(10 + (2 / 3) * 5, 9);
    expect(t.c1.y).toBeCloseTo((2 / 3) * -10, 9);
  });

  it('raises quadratics to equivalent cubics', () => {
    const [path] = parsePathData('M0 0 Q10 20 20 0');
    const c = path.segments[0] as Extract<Segment, { type: 'C' }>;
    // Quadratic midpoint: 0.25·P0 + 0.5·Q + 0.25·P2 = (10, 10).
    const mid = cubicAt({ x: 0, y: 0 }, c, 0.5);
    expect(mid.x).toBeCloseTo(10, 9);
    expect(mid.y).toBeCloseTo(10, 9);
  });

  it('converts arcs with compact flags', () => {
    const [path] = parsePathData('M0 0a10 10 0 0110 10');
    expect(path.segments.at(-1)?.to).toEqual({ x: 10, y: 10 });
    expect(path.segments.every((s) => s.type === 'C')).toBe(true);
  });

  it('keeps everything before a syntax error', () => {
    const paths = parsePathData('M0 0 L10 0 L5 oops');
    expect(paths).toHaveLength(1);
    expect(paths[0].segments).toHaveLength(1);
  });

  it('drops lone movetos and empty input', () => {
    expect(parsePathData('M1 1 M2 2')).toEqual([]);
    expect(parsePathData('')).toEqual([]);
    expect(parsePathData(null)).toEqual([]);
  });
});

describe('arcToCubics', () => {
  it('approximates a semicircle closely', () => {
    const segments = arcToCubics(0, 0, 5, 5, 0, false, true, 10, 0);
    expect(segments).toHaveLength(2);
    let from = { x: 0, y: 0 };
    for (const s of segments) {
      const c = s as Extract<Segment, { type: 'C' }>;
      for (const t of [0.25, 0.5, 0.75]) {
        const p = cubicAt(from, c, t);
        // A 90° cubic deviates from the circle by at most ~0.03 % of the radius.
        expect(Math.abs(Math.hypot(p.x - 5, p.y) - 5)).toBeLessThan(5 * 3e-4);
      }
      from = c.to;
    }
    // sweep=1 is the positive-angle direction: from (0,0) around (5,0) it passes through (5,-5),
    // which is clockwise on a Y-down screen.
    expect(cubicAt({ x: 0, y: 0 }, segments[0] as Extract<Segment, { type: 'C' }>, 1).y).toBeCloseTo(-5, 6);
  });

  it('scales up radii that are too small', () => {
    const segments = arcToCubics(0, 0, 1, 1, 0, false, true, 10, 0);
    expect(segments.at(-1)?.to).toEqual({ x: 10, y: 0 });
    expect((segments[0] as Extract<Segment, { type: 'C' }>).to.y).toBeCloseTo(-5, 6);
  });

  it('chooses the large arc', () => {
    const small = arcToCubics(0, 0, 10, 10, 0, false, true, 10, 0);
    const large = arcToCubics(0, 0, 10, 10, 0, true, true, 10, 0);
    expect(large.length).toBeGreaterThan(small.length);
  });

  it('degenerates to a line for zero radius and to nothing for equal endpoints', () => {
    expect(arcToCubics(0, 0, 0, 5, 0, false, true, 10, 0)).toEqual([{ type: 'L', to: { x: 10, y: 0 } }]);
    expect(arcToCubics(3, 3, 5, 5, 0, false, true, 3, 3)).toEqual([]);
  });

  it('handles rotated ellipses', () => {
    const segments = arcToCubics(0, 0, 10, 5, 45, false, true, 10, 10);
    expect(segments.at(-1)?.to).toEqual({ x: 10, y: 10 });
  });
});
