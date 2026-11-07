import { describe, expect, it } from 'vitest';
import { apply } from 'libopenlaser/geometry';
import { shapeObject } from '$app/canvas/tools';
import { imagePlacement, uprightIn, uprightTextAt } from '$app/lib/placement';
import type { BedFrame } from '$app/canvas/viewport';

const bed = (originCorner: BedFrame['originCorner']): BedFrame => ({ width: 100, height: 100, originCorner });
const r = { minX: 10, minY: 20, maxX: 40, maxY: 30 };

/** Where object space's top-left (0, h) and top-right (w, h) land, for a w × h object. */
function corners(m: ReturnType<typeof uprightIn>, w: number, h: number) {
  return { topLeft: apply(m, { x: 0, y: h }), topRight: apply(m, { x: w, y: h }) };
}

describe('new art reads upright on every origin corner', () => {
  it('keeps art as drawn on a bottom-left bed', () => {
    expect(uprightIn(bed('bl'), r)).toEqual([1, 0, 0, 1, 10, 20]);
  });

  it.each([
    ['tl', { x: 10, y: 20 }, { x: 40, y: 20 }],
    ['tr', { x: 40, y: 20 }, { x: 10, y: 20 }],
    ['br', { x: 40, y: 30 }, { x: 10, y: 30 }],
  ] as const)('fills the rectangle with the top on screen on a %s bed', (corner, topLeft, topRight) => {
    // On top origins the screen shows small y at the top; on right origins, large x at the left.
    const m = uprightIn(bed(corner), r);
    expect(corners(m, 30, 10)).toEqual({ topLeft, topRight });
  });

  it('flips library shapes with the bed', () => {
    const heart = shapeObject({ library: 'heart' }, r, 'l', 'o', bed('tl'))!;
    expect(heart.transform).toEqual([1, 0, 0, -1, 10, 30]);
    expect(shapeObject('rect', r, 'l', 'o')!.transform).toEqual([1, 0, 0, 1, 10, 20]);
  });

  it('puts the top-left of new text at the click', () => {
    for (const corner of ['bl', 'tl', 'tr', 'br'] as const) {
      const m = uprightTextAt(bed(corner), { x: 50, y: 50 }, 8);
      expect(apply(m, { x: 0, y: 8 })).toEqual({ x: 50, y: 50 });
    }
    // On a top-left bed the text's baseline side sits below the click: larger y.
    expect(apply(uprightTextAt(bed('tl'), { x: 50, y: 50 }, 8), { x: 0, y: 0 }).y).toBe(58);
    expect(apply(uprightTextAt(bed('bl'), { x: 50, y: 50 }, 8), { x: 0, y: 0 }).y).toBe(42);
  });
});

describe('imported images', () => {
  it.each(['bl', 'tl', 'tr', 'br'] as const)('land centred and upright on a %s bed', (corner) => {
    const frame = { width: 115, height: 80, originCorner: corner };
    const m = imagePlacement(frame, { width: 40, height: 20 });
    // Image space is Y-up with row 0 at y = height: that row must be the one shown at the top.
    const topLeft = apply(m, { x: 0, y: 20 });
    const bottomRight = apply(m, { x: 40, y: 0 });
    const screenTop = (p: { y: number }) => (corner === 'tl' || corner === 'tr' ? p.y : frame.height - p.y);
    const screenLeft = (p: { x: number }) => (corner === 'tr' || corner === 'br' ? frame.width - p.x : p.x);
    expect(screenTop(topLeft)).toBeCloseTo(30);
    expect(screenLeft(topLeft)).toBeCloseTo(37.5);
    expect(screenTop(bottomRight)).toBeCloseTo(50);
    expect(screenLeft(bottomRight)).toBeCloseTo(77.5);
  });
});
