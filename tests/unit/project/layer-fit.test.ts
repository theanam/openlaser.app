import { describe, expect, it } from 'vitest';
import { defaultLayer } from '$lib/import/layer-defaults';
import { createProject } from '$lib/project/factory';
import { deleteDestinations, layerAccepts } from '$lib/project/layer-fit';
import { addLayer, addObjects } from '$lib/project/operations';
import { rectanglePath } from '$lib/project/shapes';
import type { ImageObject, LayerMode, Project, VectorObject } from '$lib/project/types';

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

const image = (id: string, layerId: string): ImageObject => ({
  id,
  kind: 'image',
  layerId,
  name: id,
  locked: false,
  visible: true,
  transform: [1, 0, 0, 1, 0, 0],
  assetId: 'x',
  width: 10,
  height: 10,
});

function withLayers(modes: Array<[string, LayerMode]>): Project {
  return modes.reduce(
    (p, [id, mode]) => addLayer(p, defaultLayer({ id, mode })),
    createProject({ id: () => 'p' }),
  );
}

describe('layerAccepts', () => {
  it('matches images to image layers and everything else to line or fill', () => {
    expect(layerAccepts('image', 'image')).toBe(true);
    expect(layerAccepts('image', 'vector')).toBe(false);
    expect(layerAccepts('line', 'image')).toBe(false);
    expect(layerAccepts('line', 'text')).toBe(true);
    expect(layerAccepts('fill', 'vector')).toBe(true);
  });
});

describe('deleteDestinations', () => {
  it('lists layers that can take the objects, same mode first, nearest first', () => {
    let p = withLayers([
      ['fill1', 'fill'],
      ['cut1', 'line'],
      ['photo', 'image'],
      ['cut2', 'line'],
      ['cut3', 'line'],
    ]);
    p = addObjects(p, [rect('r', 'cut2')]);
    expect(deleteDestinations(p, 'cut2').map((l) => l.id)).toEqual(['cut3', 'cut1', 'fill1']);
  });

  it('is empty when no other layer fits', () => {
    let p = withLayers([
      ['photo', 'image'],
      ['cut', 'line'],
    ]);
    p = addObjects(p, [image('i', 'photo')]);
    expect(deleteDestinations(p, 'photo')).toEqual([]);
  });

  it('is empty for a layer without objects and for unknown layers', () => {
    const p = withLayers([
      ['a', 'line'],
      ['b', 'line'],
    ]);
    expect(deleteDestinations(p, 'a')).toEqual([]);
    expect(deleteDestinations(p, 'nope')).toEqual([]);
  });

  it('needs a layer that takes every kind on a mixed layer', () => {
    let p = withLayers([
      ['a', 'line'],
      ['b', 'line'],
      ['c', 'image'],
    ]);
    p = addObjects(p, [rect('r', 'a'), image('i', 'a')]);
    expect(deleteDestinations(p, 'a')).toEqual([]);
  });
});
