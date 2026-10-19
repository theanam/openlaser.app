import { describe, expect, it } from 'vitest';
import { flattenPath } from '$lib/geometry/path';
import { fillRegion, fillRuns } from '$lib/cam/vector/fill';
import { scanRegion, unitVector } from '$lib/cam/vector/scanline';
import { segmentPower } from '$lib/cam/toolpath';
import type { FillSettings } from '$lib/project/types';
import type { ToolpathRun } from '$lib/cam/types';
import { polyPath, rectPath, vectorObject } from './fixtures';

const ring = (x: number, y: number, w: number, h: number) => flattenPath(rectPath(x, y, w, h)).points;
const settings = (partial: Partial<FillSettings> = {}): FillSettings => ({
  interval: 1,
  angle: 0,
  bidirectional: true,
  overscan: 0,
  crossHatch: false,
  ...partial,
});
const burnLength = (runs: ToolpathRun[]) => {
  let total = 0;
  for (const run of runs) {
    for (let i = 0; i + 3 < run.points.length; i += 2) {
      if (segmentPower(run, i / 2) > 0)
        total += Math.hypot(run.points[i + 2] - run.points[i], run.points[i + 3] - run.points[i + 1]);
    }
  }
  return total;
};

describe('scanRegion', () => {
  it('places scanlines on the half-interval grid', () => {
    const lines = scanRegion([ring(0, 0, 10, 4)], 0, 1);
    expect(lines.map((l) => l.v)).toEqual([0.5, 1.5, 2.5, 3.5]);
    expect(lines[0].spans).toEqual([{ from: 0, to: 10 }]);
  });

  it('splits spans around holes', () => {
    const lines = scanRegion([ring(0, 0, 10, 10), [...ring(3, 3, 4, 4)].reverse()], 0, 1);
    expect(lines[5].spans).toEqual([
      { from: 0, to: 3 },
      { from: 7, to: 10 },
    ]);
    expect(lines[0].spans).toHaveLength(1);
  });

  it('scans at an angle', () => {
    const lines = scanRegion([ring(0, 0, 10, 10)], 45, 0.5);
    const covered = lines.reduce((sum, l) => sum + l.spans.reduce((s, sp) => s + sp.to - sp.from, 0), 0);
    expect(covered * 0.5).toBeCloseTo(100, 0);
  });

  it('returns nothing for a non-positive interval', () => {
    expect(scanRegion([ring(0, 0, 1, 1)], 0, 0)).toEqual([]);
  });

  it('has exact quarter-turn directions', () => {
    expect(unitVector(90)).toEqual({ cos: 0, sin: 1 });
    expect(unitVector(-90)).toEqual({ cos: 0, sin: -1 });
    expect(unitVector(180)).toEqual({ cos: -1, sin: 0 });
  });
});

describe('fillRegion', () => {
  it('resolves holes inside an object with even-odd', () => {
    const region = fillRegion([vectorObject('o', 'l', [rectPath(0, 0, 10, 10), rectPath(3, 3, 4, 4)])], 0.01);
    expect(burnLength(fillRuns(region.rings, settings(), 100))).toBeCloseTo(100 - 16);
  });

  it('keeps overlapping objects filled where they overlap', () => {
    const region = fillRegion(
      [vectorObject('a', 'l', [rectPath(0, 0, 10, 10)]), vectorObject('b', 'l', [rectPath(5, 0, 10, 10)])],
      0.01,
    );
    expect(burnLength(fillRuns(region.rings, settings(), 100))).toBeCloseTo(150);
  });

  it('reports objects with open paths', () => {
    const region = fillRegion(
      [
        vectorObject('o', 'l', [
          rectPath(0, 0, 1, 1),
          polyPath(
            [
              [0, 0],
              [5, 5],
            ],
            false,
          ),
        ]),
      ],
      0.01,
    );
    expect(region.openPathObjectIds).toEqual(['o']);
    expect(region.rings).toHaveLength(1);
  });
});

describe('fillRuns', () => {
  it('alternates direction when bidirectional', () => {
    const runs = fillRuns([ring(0, 0, 10, 3)], settings(), 50);
    expect(runs.map((r) => r.points)).toEqual([
      [0, 0.5, 10, 0.5],
      [10, 1.5, 0, 1.5],
      [0, 2.5, 10, 2.5],
    ]);
    expect(runs[0].power).toBe(50);
  });

  it('always scans forward when unidirectional', () => {
    const runs = fillRuns([ring(0, 0, 10, 3)], settings({ bidirectional: false }), 50);
    expect(runs.every((r) => r.points[0] === 0 && r.points[2] === 10)).toBe(true);
  });

  it('adds laser-off overscan at both ends', () => {
    const [first, second] = fillRuns([ring(0, 0, 10, 2)], settings({ overscan: 2 }), 50);
    expect(first.points).toEqual([-2, 0.5, 0, 0.5, 10, 0.5, 12, 0.5]);
    expect(first.power).toEqual([0, 50, 0]);
    expect(second.points).toEqual([12, 1.5, 10, 1.5, 0, 1.5, -2, 1.5]);
  });

  it('bridges short gaps with laser-off moves and splits long ones', () => {
    const rings = [ring(0, 0, 10, 1), ring(10.5, 0, 10, 1), ring(30, 0, 10, 1)];
    const runs = fillRuns(rings, settings(), 40);
    expect(runs).toHaveLength(2);
    expect(runs[0].points).toEqual([0, 0.5, 10, 0.5, 10.5, 0.5, 20.5, 0.5]);
    expect(runs[0].power).toEqual([40, 0, 40]);
    expect(runs[1].points).toEqual([30, 0.5, 40, 0.5]);
  });

  it('uses twice the overscan as the travel threshold when larger than 1 mm', () => {
    const rings = [ring(0, 0, 10, 1), ring(13, 0, 10, 1)];
    expect(fillRuns(rings, settings({ overscan: 1 }), 40)).toHaveLength(2);
    expect(fillRuns(rings, settings({ overscan: 2 }), 40)).toHaveLength(1);
  });

  it('runs reversed scanlines in reverse span order', () => {
    const rings = [ring(0, 0, 10, 2), ring(30, 0, 10, 2)];
    const runs = fillRuns(rings, settings(), 40);
    expect(runs.map((r) => r.points[0])).toEqual([0, 30, 40, 10]);
  });

  it('adds a cross-hatch pass at angle + 90°', () => {
    const runs = fillRuns([ring(0, 0, 4, 4)], settings({ crossHatch: true }), 40);
    expect(runs).toHaveLength(8);
    expect(runs[4].points).toEqual([3.5, 0, 3.5, 4]);
    expect(burnLength(runs)).toBeCloseTo(32);
  });

  it('keeps scanlines inside the region at 45°', () => {
    const runs = fillRuns([ring(0, 0, 10, 10)], settings({ angle: 45, interval: 0.5 }), 40);
    const coords = runs.flatMap((r) => r.points);
    expect(Math.min(...coords)).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...coords)).toBeLessThanOrEqual(10 + 1e-9);
    expect(burnLength(runs) * 0.5).toBeCloseTo(100, 0);
  });
});
