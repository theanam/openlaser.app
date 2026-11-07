import { describe, expect, it } from 'vitest';
import { apply } from 'libopenlaser/geometry/mat2d';
import { reorient } from 'libopenlaser/project/orientation';
import type { Project, SceneObject } from 'libopenlaser/project/types';
import { layer, project, rectPath, vectorObject } from '../cam/fixtures';

/** A 10 × 4 mm object whose top edge is y = 4 in its own space, placed at (20, 30). */
const art = (id: string, x: number, y: number): SceneObject =>
  vectorObject(id, 'l', [rectPath(0, 0, 10, 4)], [1, 0, 0, 1, x, y]);

const design = (corner?: Project['designCorner']) => ({
  ...project([layer({ id: 'l' })], [art('a', 20, 30), art('b', 40, 50)]),
  ...(corner ? { designCorner: corner } : {}),
});

/** Where the object's own top edge ends up in machine space, relative to its bottom edge. */
const topIsAbove = (o: SceneObject) =>
  apply(o.transform, { x: 0, y: 4 }).y > apply(o.transform, { x: 0, y: 0 }).y;

describe('keeping the design upright across home corners', () => {
  it('records the corner of a project that has none', () => {
    const p = reorient(design(), 'tl');
    expect(p.designCorner).toBe('tl');
    expect(p.objects).toEqual(design().objects);
  });

  it('changes nothing on the same corner', () => {
    const p = design('bl');
    expect(reorient(p, 'bl')).toBe(p);
  });

  it('mirrors the design about its centre when the top becomes the home side', () => {
    const p = reorient(design('bl'), 'tl');
    // On a top-left machine the screen shows small y at the top: the art's top must have smaller y.
    expect(p.objects.every((o) => !topIsAbove(o))).toBe(true);
    // Same machine area: the pair spans y 30–54 before and after, with the two swapped in y as the
    // screen flips too, so on screen they keep their order.
    const ys = p.objects.map((o) => apply(o.transform, { x: 0, y: 0 }).y).sort((a, b) => a - b);
    expect(ys).toEqual([34, 54]);
    expect(p.designCorner).toBe('tl');
  });

  it('mirrors x for machines homed on the right', () => {
    const p = reorient(design('bl'), 'br');
    const [a] = p.objects;
    expect(a.transform[0]).toBe(-1);
    expect(a.transform[3]).toBe(1);
  });

  it('comes back exactly when switching back, whatever happened in between', () => {
    const start = design('bl');
    const back = reorient(reorient(reorient(start, 'tl'), 'tr'), 'bl');
    expect(back.objects).toEqual(start.objects);
  });
});
