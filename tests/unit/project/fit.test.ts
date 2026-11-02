import { describe, expect, it } from 'vitest';
import { bringOnBed, fitToBed, outsideBed } from '$lib/project/fit';
import { objectBox } from '$lib/project/orientation';
import { createProject } from '$lib/project/factory';
import type { Project, SceneObject } from '$lib/project/types';

const square = (id: string, x: number, y: number, size: number): SceneObject => ({
  id,
  kind: 'vector',
  locked: false,
  visible: true,
  name: id,
  layerId: 'l',
  transform: [1, 0, 0, 1, x, y],
  paths: [
    {
      closed: true,
      start: { x: 0, y: 0 },
      segments: [
        { type: 'L', to: { x: size, y: 0 } },
        { type: 'L', to: { x: size, y: size } },
        { type: 'L', to: { x: 0, y: size } },
      ],
    },
  ],
});

const project = (...objects: SceneObject[]): Project => ({ ...createProject(), objects });
const box = (p: Project, id: string) => objectBox(p.objects.find((o) => o.id === id)!)!;

describe('fitting the design to a smaller bed', () => {
  const big = { width: 400, height: 400 };
  const lp4 = { width: 160, height: 120 };

  it('leaves a design that already fits alone', () => {
    expect(fitToBed(project(square('a', 10, 10, 50)), big, lp4)).toBeNull();
  });

  it('moves a design that fits in size onto the bed', () => {
    const out = fitToBed(project(square('a', 300, 300, 50)), big, lp4)!;
    expect(box(out, 'a')).toMatchObject({ minX: 110, minY: 70, maxX: 160, maxY: 120 });
  });

  it('scales a design larger than the bed down as one group, keeping its layout', () => {
    const out = fitToBed(project(square('a', 0, 0, 100), square('b', 200, 0, 100)), big, lp4)!;
    const a = box(out, 'a');
    const b = box(out, 'b');
    // 300 mm wide on a 160 mm bed: scaled to 160/300.
    expect(a.maxX - a.minX).toBeCloseTo((100 * 160) / 300, 6);
    expect(b.maxX).toBeCloseTo(160, 6);
    expect(b.minX - a.maxX).toBeCloseTo((100 * 160) / 300, 6);
    expect(outsideBed(out.objects, lp4)).toEqual([]);
  });

  it('leaves objects that were already off the old bed where they are', () => {
    const stray = square('stray', 500, 500, 20);
    const out = fitToBed(project(square('a', 300, 10, 50), stray), big, lp4)!;
    expect(out.objects.find((o) => o.id === 'stray')).toBe(stray);
    expect(outsideBed(out.objects, lp4).map((o) => o.id)).toEqual(['stray']);
  });
});

describe('objects outside the bed', () => {
  it('finds objects reaching past any edge, art up to the edge counts as on', () => {
    const area = { width: 100, height: 100 };
    const objects = [square('in', 0, 0, 100), square('right', 90, 0, 20), square('below', 10, -5, 10)];
    expect(outsideBed(objects, area).map((o) => o.id)).toEqual(['right', 'below']);
  });
});

describe('bringing objects onto the bed', () => {
  it('moves only the given objects, scaling them down to fit', () => {
    const keep = square('keep', 0, 0, 10);
    const out = bringOnBed(project(keep, square('far', 500, 500, 200)), new Set(['far']), {
      width: 160,
      height: 120,
    })!;
    expect(out.objects[0]).toBe(keep);
    expect(box(out, 'far')).toMatchObject({ minX: 40, minY: 0, maxX: 160, maxY: 120 });
  });
});
