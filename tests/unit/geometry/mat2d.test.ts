import { describe, expect, it } from 'vitest';
import {
  apply,
  decompose,
  invert,
  isRotated,
  multiply,
  rotation,
  scaling,
  transformRect,
  translation,
} from '$lib/geometry/mat2d';

describe('mat2d', () => {
  it('applies translate after scale when multiplied as T·S', () => {
    const m = multiply(translation(10, 5), scaling(2));
    expect(apply(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 7 });
  });

  it('inverts a transform', () => {
    const m = multiply(translation(3, -4), multiply(rotation(30), scaling(2, 0.5)));
    const inv = invert(m)!;
    const p = apply(inv, apply(m, { x: 7, y: -2 }));
    expect(p.x).toBeCloseTo(7, 9);
    expect(p.y).toBeCloseTo(-2, 9);
  });

  it('returns null for singular matrices', () => {
    expect(invert([0, 0, 0, 0, 1, 1])).toBeNull();
  });

  it('decomposes translate, rotate and scale', () => {
    const d = decompose(multiply(translation(5, 6), multiply(rotation(45), scaling(2, 3))));
    expect(d.tx).toBeCloseTo(5);
    expect(d.ty).toBeCloseTo(6);
    expect(d.rotation).toBeCloseTo(45);
    expect(d.scaleX).toBeCloseTo(2);
    expect(d.scaleY).toBeCloseTo(3);
  });

  it('detects rotation', () => {
    expect(isRotated(scaling(2, 3))).toBe(false);
    expect(isRotated(rotation(10))).toBe(true);
  });

  it('transforms rect bounds', () => {
    const r = transformRect(rotation(90), { minX: 0, minY: 0, maxX: 10, maxY: 5 });
    expect(r.minX).toBeCloseTo(-5);
    expect(r.maxX).toBeCloseTo(0);
    expect(r.minY).toBeCloseTo(0);
    expect(r.maxY).toBeCloseTo(10);
  });
});
