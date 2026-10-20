import { describe, expect, it } from 'vitest';
import { pathsBounds } from '$lib/geometry/path';
import type { PathData, SceneObject, VectorObject, ImageObject } from '$lib/project/types';
import { contourPaths, DEFAULT_CONTOUR } from '$lib/project/contour';

const square = (x: number, y: number, s: number): PathData => ({
  closed: true,
  start: { x, y },
  segments: [
    { type: 'L', to: { x: x + s, y } },
    { type: 'L', to: { x: x + s, y: y + s } },
    { type: 'L', to: { x, y: y + s } },
  ],
});

let n = 0;
const vector = (
  paths: PathData[],
  transform: VectorObject['transform'] = [1, 0, 0, 1, 0, 0],
): VectorObject => ({
  id: `v${++n}`,
  kind: 'vector',
  layerId: 'l',
  name: 'v',
  locked: false,
  visible: true,
  transform,
  paths,
});

const box = (paths: PathData[]) => pathsBounds(paths, undefined, 0.001)!;

describe('contourPaths', () => {
  it('outlines one shape at the offset, with round corners by default', () => {
    const out = contourPaths([vector([square(0, 0, 10)])], DEFAULT_CONTOUR);
    expect(out).toHaveLength(1);
    expect(out[0]!.closed).toBe(true);
    const b = box(out);
    expect(b.minX).toBeCloseTo(-3, 1);
    expect(b.maxX).toBeCloseTo(13, 1);
    // Round corners: the corner point (-3,-3) sits outside the outline.
    expect(out[0]!.segments.length).toBeGreaterThan(8);
  });

  it('treats the selection as one unit: a logo and a far key-ring hole get one outline', () => {
    const logo = vector([square(0, 0, 20)]);
    const ring = vector([square(40, 8, 4)]);
    const out = contourPaths([logo, ring], { ...DEFAULT_CONTOUR, offset: 2 });
    expect(out).toHaveLength(1);
    const b = box(out);
    expect(b.minX).toBeCloseTo(-2, 1);
    expect(b.maxX).toBeCloseTo(46, 1);
    // The outline still hugs the logo: its far edge stays at the offset.
    expect(b.minY).toBeCloseTo(-2, 1);
    expect(b.maxY).toBeCloseTo(22, 1);
  });

  it('bridges parts in every arrangement, including far apart', () => {
    const parts = [vector([square(0, 0, 5)]), vector([square(200, 0, 5)]), vector([square(100, 150, 5)])];
    expect(contourPaths(parts, { ...DEFAULT_CONTOUR, offset: 1 })).toHaveLength(1);
    const touching = [vector([square(0, 0, 10)]), vector([square(12, 0, 10)])];
    expect(contourPaths(touching, { ...DEFAULT_CONTOUR, offset: 3 })).toHaveLength(1);
  });

  it('keeps only the outer edge, or the holes too when asked', () => {
    // A frame: outer square with an inner counter, as in a letter O.
    const frame = vector([square(0, 0, 30), square(10, 10, 10)]);
    expect(contourPaths([frame], { ...DEFAULT_CONTOUR, offset: 2 })).toHaveLength(1);
    const both = contourPaths([frame], { ...DEFAULT_CONTOUR, offset: 2, outerOnly: false });
    expect(both).toHaveLength(2);
    // The hole shrinks by the offset: 10 → 6 mm.
    const hole = both.map((p) => box([p])).find((b) => b.maxX - b.minX < 20)!;
    expect(hole.maxX - hole.minX).toBeCloseTo(6, 1);
  });

  it('follows the object transform, insets with a negative offset and does sharp corners', () => {
    const moved = vector([square(0, 0, 10)], [1, 0, 0, 1, 100, 50]);
    const inset = contourPaths([moved], { offset: -2, corners: 'miter', outerOnly: true });
    expect(box(inset)).toMatchObject({ minX: 102, minY: 52, maxX: 108, maxY: 58 });
    expect(inset[0]!.segments).toHaveLength(3);
  });

  it('turns open lines into strokes as wide as the offset', () => {
    const line = vector([
      { closed: false, start: { x: 0, y: 0 }, segments: [{ type: 'L', to: { x: 10, y: 0 } }] },
    ]);
    const out = contourPaths([line], { ...DEFAULT_CONTOUR, offset: 1 });
    const b = box(out);
    expect(b.minY).toBeCloseTo(-1, 1);
    expect(b.maxX).toBeCloseTo(11, 1);
    expect(contourPaths([line], { ...DEFAULT_CONTOUR, offset: 0 })).toEqual([]);
  });

  it('outlines images by their frame', () => {
    const image: ImageObject = {
      id: 'img',
      kind: 'image',
      layerId: 'l',
      name: 'photo',
      locked: false,
      visible: true,
      transform: [1, 0, 0, 1, 0, 0],
      assetId: 'a',
      width: 40,
      height: 20,
    };
    const b = box(contourPaths([image as SceneObject], { ...DEFAULT_CONTOUR, offset: 0 }));
    expect(b).toMatchObject({ minX: 0, minY: 0, maxX: 40, maxY: 20 });
  });
});
