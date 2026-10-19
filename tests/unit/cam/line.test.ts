import { describe, expect, it } from 'vitest';
import { signedArea } from '$lib/geometry/polygon';
import { applyKerf, linePolylines, nestingDepths } from '$lib/cam/vector/line';
import { polylineToRun } from '$lib/cam/toolpath';
import { flattenPath } from '$lib/geometry/path';
import { circlePath, polyPath, rectPath, vectorObject } from './fixtures';

const width = (points: { x: number }[]) =>
  Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));

describe('line mode', () => {
  it('flattens every path of every object in document order', () => {
    const polylines = linePolylines(
      [
        vectorObject('a', 'l', [rectPath(0, 0, 10, 10), circlePath(50, 50, 5)]),
        vectorObject('b', 'l', [
          polyPath(
            [
              [0, 0],
              [1, 1],
            ],
            false,
          ),
        ]),
      ],
      0,
      0.01,
    );
    expect(polylines.map((p) => p.closed)).toEqual([true, true, false]);
    expect(polylines[0].points).toHaveLength(4);
    expect(polylines[1].points.length).toBeGreaterThan(20);
  });

  it('turns a polyline into one run that closes back on its start', () => {
    const run = polylineToRun(flattenPath(rectPath(0, 0, 10, 5)), 80);
    expect(run.points).toEqual([0, 0, 10, 0, 10, 5, 0, 5, 0, 0]);
    expect(run.power).toBe(80);
  });

  it('computes nesting depth of contours', () => {
    const rings = [
      rectPath(0, 0, 100, 100),
      rectPath(10, 10, 50, 50),
      rectPath(20, 20, 10, 10),
      rectPath(70, 70, 10, 10),
    ].map((p) => flattenPath(p).points);
    expect(nestingDepths(rings)).toEqual([0, 1, 2, 1]);
  });

  it('grows outlines and shrinks holes by the kerf', () => {
    const outline = flattenPath(rectPath(0, 0, 20, 20));
    const hole = flattenPath(rectPath(5, 5, 10, 10));
    const open = flattenPath(
      polyPath(
        [
          [1, 1],
          [2, 2],
        ],
        false,
      ),
    );
    const [grown, shrunk, kept] = applyKerf([outline, hole, open], 0.1);
    expect(width(grown.points)).toBeCloseTo(20.2, 6);
    expect(width(shrunk.points)).toBeCloseTo(9.8, 6);
    expect(Math.abs(signedArea(grown.points))).toBeCloseTo(20.2 * 20.2, 4);
    expect(kept).toBe(open);
  });

  it('shrinks outlines for a negative kerf and skips the offset when zero', () => {
    const [shrunk] = linePolylines([vectorObject('a', 'l', [rectPath(0, 0, 20, 20)])], -0.5, 0.01);
    expect(width(shrunk.points)).toBeCloseTo(19, 6);
    const [same] = linePolylines([vectorObject('a', 'l', [rectPath(0, 0, 20, 20)])], 0, 0.01);
    expect(same.points[0]).toEqual({ x: 0, y: 0 });
  });

  it('drops contours that a negative kerf collapses', () => {
    expect(linePolylines([vectorObject('a', 'l', [rectPath(0, 0, 1, 1)])], -1, 0.01)).toEqual([]);
  });
});
