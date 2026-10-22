import { describe, expect, it } from 'vitest';
import { createProject } from '$lib/project/factory';
import {
  addLayer,
  addObjects,
  duplicateObjects,
  moveLayer,
  removeLayer,
  removeObjects,
  reorderObjects,
  setObjectsLayer,
  transformObjects,
  updateLayer,
} from '$lib/project/operations';
import { ellipsePath, rectanglePath } from '$lib/project/shapes';
import type { Layer, Project, VectorObject } from '$lib/project/types';

const layer = (id: string): Layer => ({
  id,
  name: id,
  color: '#C0392B',
  visible: true,
  output: true,
  mode: 'line',
  speed: 1000,
  power: 50,
  minPower: 0,
  passes: 1,
  airAssist: false,
});

const rect = (id: string, layerId: string): VectorObject => ({
  id,
  kind: 'vector',
  layerId,
  name: id,
  locked: false,
  visible: true,
  transform: [1, 0, 0, 1, 0, 0],
  paths: [rectanglePath(10, 10)],
});

function base(): Project {
  let p = createProject({ id: () => 'p' });
  p = addLayer(p, layer('a'));
  p = addLayer(p, layer('b'));
  p = addObjects(p, [rect('r1', 'a'), rect('r2', 'b')]);
  return p;
}

describe('project operations', () => {
  it('never mutates the input', () => {
    const p = base();
    const snapshot = JSON.stringify(p);
    updateLayer(p, 'a', { power: 99 });
    transformObjects(p, new Set(['r1']), [1, 0, 0, 1, 5, 5]);
    removeObjects(p, new Set(['r1']));
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('removes a layer with its objects', () => {
    const p = removeLayer(base(), 'a');
    expect(p.layers.map((l) => l.id)).toEqual(['b']);
    expect(p.objects.map((o) => o.id)).toEqual(['r2']);
  });

  it('reorders layers', () => {
    expect(moveLayer(base(), 0, 1).layers.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('transforms only unlocked selected objects in bed space', () => {
    let p = base();
    p = { ...p, objects: p.objects.map((o) => (o.id === 'r2' ? { ...o, locked: true } : o)) };
    p = transformObjects(p, new Set(['r1', 'r2']), [1, 0, 0, 1, 5, 7]);
    expect(p.objects[0].transform).toEqual([1, 0, 0, 1, 5, 7]);
    expect(p.objects[1].transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('duplicates with new ids and an offset', () => {
    let n = 0;
    const { project, ids } = duplicateObjects(base(), new Set(['r1']), () => `d${++n}`);
    expect(ids).toEqual(['d1']);
    expect(project.objects.at(-1)?.transform).toEqual([1, 0, 0, 1, 5, -5]);
  });

  it('moves objects to another layer and changes z-order', () => {
    let p = setObjectsLayer(base(), new Set(['r1']), 'b');
    expect(p.objects[0].layerId).toBe('b');
    p = reorderObjects(p, new Set(['r1']), 'front');
    expect(p.objects.map((o) => o.id)).toEqual(['r2', 'r1']);
  });

  it('drops assets no object uses', () => {
    let p = base();
    p = addObjects(
      p,
      [
        {
          id: 'i1',
          kind: 'image',
          layerId: 'a',
          name: 'i',
          locked: false,
          visible: true,
          transform: [1, 0, 0, 1, 0, 0],
          assetId: 'x',
          width: 1,
          height: 1,
        },
      ],
      [{ id: 'x', mime: 'image/png', name: 'x.png', data: new Blob() }],
    );
    expect(Object.keys(p.assets)).toEqual(['x']);
    expect(Object.keys(removeObjects(p, new Set(['i1'])).assets)).toEqual([]);
  });

  it('builds closed rectangle and ellipse paths', () => {
    const r = rectanglePath(20, 10, 2);
    expect(r.closed).toBe(true);
    expect(r.segments.at(-1)?.to).toEqual(r.start);
    const e = ellipsePath(20, 10);
    expect(e.segments.at(-1)?.to).toEqual(e.start);
  });
});

describe('layers persist', () => {
  it('keeps a layer when its last object goes', () => {
    const p = removeObjects(base(), new Set(['r1']));
    expect(p.layers.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it("moves a deleted layer's objects to the chosen layer", () => {
    const p = removeLayer(base(), 'a', 'b');
    expect(p.layers.map((l) => l.id)).toEqual(['b']);
    expect(p.objects.map((o) => [o.id, o.layerId])).toEqual([
      ['r1', 'b'],
      ['r2', 'b'],
    ]);
  });

  it('keeps an empty layer that was added on purpose', () => {
    const p = addLayer(base(), layer('lonely'));
    expect(p.layers.map((l) => l.id)).toEqual(['a', 'b', 'lonely']);
  });
});
