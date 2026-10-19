import { describe, expect, it } from 'vitest';
import { apply } from '$lib/geometry/mat2d';
import { anchorOf, moveAnchorTo, resizeAbout, rotateAbout } from '$app/lib/selection';

const r = { minX: 10, minY: 20, maxX: 50, maxY: 40 };

describe('selection math', () => {
  it('finds anchor points with Y up', () => {
    expect(anchorOf(r, 'bl')).toEqual({ x: 10, y: 20 });
    expect(anchorOf(r, 'tr')).toEqual({ x: 50, y: 40 });
    expect(anchorOf(r, 'c')).toEqual({ x: 30, y: 30 });
  });

  it('moves the anchor to a position', () => {
    const m = moveAnchorTo(r, 'tl', { x: 0, y: 100 });
    expect(apply(m, { x: 10, y: 40 })).toEqual({ x: 0, y: 100 });
  });

  it('resizes about the anchor, keeping aspect when asked', () => {
    const m = resizeAbout(r, 'bl', { width: 80 }, true);
    expect(apply(m, { x: 50, y: 40 })).toEqual({ x: 90, y: 60 });
    expect(apply(m, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    const free = resizeAbout(r, 'bl', { width: 80 }, false);
    expect(apply(free, { x: 50, y: 40 })).toEqual({ x: 90, y: 40 });
  });

  it('rotates about the anchor', () => {
    const p = apply(rotateAbout(r, 'c', 90), { x: 50, y: 30 });
    expect(p.x).toBeCloseTo(30);
    expect(p.y).toBeCloseTo(50);
  });
});
