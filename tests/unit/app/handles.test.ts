import { describe, expect, it } from 'vitest';
import { apply } from '$lib/geometry/mat2d';
import {
  angleAround,
  handlesFor,
  hitHandle,
  normalizeRect,
  rectsIntersect,
  scaleFromDrag,
  snapAngle,
} from '$app/canvas/handles';

describe('selection handles', () => {
  it('places eight handles plus a rotate handle', () => {
    const handles = handlesFor({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, true);
    expect(handles).toHaveLength(9);
    expect(handles.find((h) => h.id === 'e')).toEqual({ id: 'e', x: 100, y: 25 });
    expect(handles.find((h) => h.id === 'rotate')?.y).toBeLessThan(0);
  });

  it('hits handles within the radius', () => {
    const handles = handlesFor({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, false);
    expect(hitHandle({ x: 98, y: 52 }, handles)?.id).toBe('se');
    expect(hitHandle({ x: 50, y: 25 }, handles)).toBeNull();
  });

  it('scales a corner drag about the pivot', () => {
    const m = scaleFromDrag('ne', { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 15 }, false);
    expect(apply(m, { x: 10, y: 10 })).toEqual({ x: 20, y: 15 });
    expect(apply(m, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('keeps aspect when asked', () => {
    const m = scaleFromDrag('ne', { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 15 }, true);
    expect(apply(m, { x: 10, y: 10 })).toEqual({ x: 20, y: 20 });
  });

  it('scales one axis from an edge handle', () => {
    const m = scaleFromDrag('e', { x: 0, y: 5 }, { x: 10, y: 5 }, { x: 30, y: 9 }, false);
    expect(apply(m, { x: 10, y: 10 })).toEqual({ x: 30, y: 10 });
  });

  it('measures and snaps angles', () => {
    expect(angleAround({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    expect(snapAngle(47)).toBe(45);
  });

  it('normalizes and intersects rects', () => {
    const r = normalizeRect({ x: 5, y: 9 }, { x: 1, y: 2 });
    expect(r).toEqual({ minX: 1, minY: 2, maxX: 5, maxY: 9 });
    expect(rectsIntersect(r, { minX: 4, minY: 8, maxX: 10, maxY: 10 })).toBe(true);
    expect(rectsIntersect(r, { minX: 6, minY: 0, maxX: 10, maxY: 1 })).toBe(false);
  });
});

describe('measure label', () => {
  it('reports distance, deltas and angle', async () => {
    const { measureLabel } = await import('$app/canvas/overlays');
    expect(measureLabel({ x: 0, y: 0 }, { x: 30, y: 40 })).toBe('50.00 mm · Δx 30.00 · Δy 40.00 · 53.1°');
  });
});

describe('selection size label', () => {
  it('reads width × height in mm with one decimal', async () => {
    const { sizeLabel } = await import('$app/canvas/overlays');
    expect(sizeLabel(120, 45.54)).toBe('120.0 × 45.5 mm');
  });
});
