import { describe, expect, it } from 'vitest';
import { apply } from '$lib/geometry/mat2d';
import type { Mat2D } from '$lib/geometry/types';
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

describe('keepsAspectByDefault', () => {
  const base = {
    id: 'x',
    layerId: 'l',
    name: 'x',
    locked: false,
    visible: true,
    transform: [1, 0, 0, 1, 0, 0] as Mat2D,
  };
  const vector = (extra: object = {}) => ({ ...base, kind: 'vector' as const, paths: [], ...extra });

  it('keeps proportions for text, images and imported art', async () => {
    const { keepsAspectByDefault } = await import('$app/lib/selection');
    expect(keepsAspectByDefault([vector()])).toBe(true);
    expect(keepsAspectByDefault([{ ...base, kind: 'image', assetId: 'a', width: 1, height: 1 }])).toBe(true);
    expect(keepsAspectByDefault([vector({ drawn: true }), vector()])).toBe(true);
  });

  it('lets drawn rectangles, ellipses and library shapes stretch', async () => {
    const { keepsAspectByDefault } = await import('$app/lib/selection');
    expect(keepsAspectByDefault([vector({ drawn: true })])).toBe(false);
    expect(keepsAspectByDefault([vector({ shape: { kind: 'star', params: {}, width: 1, height: 1 } })])).toBe(
      false,
    );
    expect(keepsAspectByDefault([])).toBe(false);
  });
});
