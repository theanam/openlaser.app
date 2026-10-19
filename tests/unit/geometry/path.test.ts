import { describe, expect, it } from 'vitest';
import { multiply, rotation, scaling, translation } from '$lib/geometry/mat2d';
import { flattenPath, pathsBounds, polylineLength } from '$lib/geometry/path';
import { circlePath, polyPath, rectPath } from '../cam/fixtures';

describe('flattenPath', () => {
  it('flattens a closed rectangle without repeating the first point', () => {
    const pl = flattenPath(rectPath(0, 0, 10, 5));
    expect(pl.closed).toBe(true);
    expect(pl.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ]);
  });

  it('keeps open paths open and drops duplicate points', () => {
    const pl = flattenPath(
      polyPath(
        [
          [0, 0],
          [5, 0],
          [5, 0],
          [5, 5],
        ],
        false,
      ),
    );
    expect(pl.closed).toBe(false);
    expect(pl.points).toHaveLength(3);
  });

  it('applies the transform before flattening', () => {
    const pl = flattenPath(rectPath(0, 0, 10, 5), multiply(translation(100, 50), scaling(2)));
    expect(pl.points[2]).toEqual({ x: 120, y: 60 });
  });

  it('measures the tolerance in transformed space', () => {
    const circle = circlePath(0, 0, 1);
    const small = flattenPath(circle, scaling(1), 0.01).points.length;
    const large = flattenPath(circle, scaling(50), 0.01).points.length;
    expect(large).toBeGreaterThan(small * 3);
    for (const p of flattenPath(circle, scaling(50), 0.01).points)
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(50, 1);
  });
});

describe('polylineLength', () => {
  it('includes the closing segment of closed polylines', () => {
    expect(polylineLength(flattenPath(rectPath(0, 0, 10, 5)))).toBeCloseTo(30);
    expect(
      polylineLength(
        flattenPath(
          polyPath(
            [
              [0, 0],
              [3, 4],
            ],
            false,
          ),
        ),
      ),
    ).toBeCloseTo(5);
  });

  it('approximates a circle circumference', () => {
    expect(polylineLength(flattenPath(circlePath(0, 0, 10), undefined, 0.001))).toBeCloseTo(
      2 * Math.PI * 10,
      1,
    );
  });
});

describe('pathsBounds', () => {
  it('bounds curves by their outline, not their control points', () => {
    const b = pathsBounds([circlePath(5, 5, 5)])!;
    expect(b.minX).toBeCloseTo(0, 3);
    expect(b.maxX).toBeCloseTo(10, 3);
    expect(b.maxY).toBeCloseTo(10, 3);
  });

  it('bounds rotated paths', () => {
    const b = pathsBounds([rectPath(0, 0, 10, 10)], rotation(45))!;
    expect(b.maxX - b.minX).toBeCloseTo(Math.SQRT2 * 10);
  });

  it('returns null without points', () => {
    expect(pathsBounds([])).toBeNull();
  });
});
