import { describe, expect, it } from 'vitest';
import { apply, transformRect } from '$lib/geometry/mat2d';
import { placeCentered } from '$app/lib/placement';

const content = { minX: 0, minY: 0, maxX: 40, maxY: 20 };

describe('placement', () => {
  it('centers art on a bottom-left bed without flipping', () => {
    const m = placeCentered({ width: 400, height: 300, originCorner: 'bl' }, content);
    expect(transformRect(m, content)).toEqual({ minX: 180, minY: 140, maxX: 220, maxY: 160 });
    expect(apply(m, { x: 0, y: 20 }).y).toBeGreaterThan(apply(m, { x: 0, y: 0 }).y);
  });

  it('flips art vertically for top-left origins so it reads upright', () => {
    const m = placeCentered({ width: 400, height: 300, originCorner: 'tl' }, content);
    expect(transformRect(m, content)).toEqual({ minX: 180, minY: 140, maxX: 220, maxY: 160 });
    // Content top (y=20) maps to smaller bed y, which is higher on a Y-down screen.
    expect(apply(m, { x: 0, y: 20 }).y).toBeLessThan(apply(m, { x: 0, y: 0 }).y);
  });

  it('mirrors X for right-hand origins', () => {
    const m = placeCentered({ width: 400, height: 300, originCorner: 'br' }, content);
    expect(apply(m, { x: 40, y: 0 }).x).toBeLessThan(apply(m, { x: 0, y: 0 }).x);
  });
});
