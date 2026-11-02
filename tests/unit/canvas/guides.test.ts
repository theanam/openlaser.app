import { describe, expect, it } from 'vitest';
import { snapMove } from '$app/canvas/guides';
import type { Rect } from '$lib/geometry/types';

const rect = (minX: number, minY: number, w: number, h: number): Rect => ({
  minX,
  minY,
  maxX: minX + w,
  maxY: minY + h,
});

describe('smart guides', () => {
  const other = rect(100, 100, 50, 20);

  it('snaps a nearby left edge to another object’s left edge, with a guide spanning both', () => {
    const snap = snapMove(rect(101.5, 10, 30, 30), [other], 2);
    expect(snap.dx).toBeCloseTo(-1.5);
    expect(snap.dy).toBe(0);
    expect(snap.guides).toEqual([{ axis: 'x', at: 100, from: 10, to: 120 }]);
  });

  it('snaps centres, and both axes at once', () => {
    // Centre x 126 → 125, top 119 → 120 (the other's bottom).
    const snap = snapMove(rect(116, 119, 20, 10), [other], 2);
    expect(snap.dx).toBeCloseTo(-1);
    expect(snap.dy).toBeCloseTo(1);
    expect(snap.guides.map((g) => [g.axis, g.at])).toEqual([
      ['x', 125],
      ['y', 120],
    ]);
  });

  it('picks the nearest match and leaves far boxes alone', () => {
    expect(snapMove(rect(0, 0, 10, 10), [other], 2)).toEqual({ dx: 0, dy: 0, guides: [] });
    const snap = snapMove(rect(149, 0, 10, 10), [other, rect(147.5, 300, 5, 5)], 2);
    // Right edge of `other` is 150 (1 away); the small box's centre 150 too; its left 147.5.
    expect(snap.dx).toBeCloseTo(1);
  });

  it('snaps to the bed’s edges and centre like any other box', () => {
    const bed = rect(0, 0, 400, 300);
    const snap = snapMove(rect(189, 50, 20, 20), [bed], 2);
    expect(snap.dx).toBeCloseTo(1);
    expect(snap.guides[0]).toMatchObject({ axis: 'x', at: 200 });
  });

  it('does not snap an axis Shift has locked', () => {
    const snap = snapMove(rect(101, 101, 30, 30), [other], 2, { x: true });
    expect(snap.dx).toBe(0);
    expect(snap.dy).toBeCloseTo(-1);
  });
});
