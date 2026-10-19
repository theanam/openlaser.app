import { describe, expect, it } from 'vitest';
import { defaultLayer } from '$lib/import/layer-defaults';
import { createProject } from '$lib/project/factory';
import { rectanglePath } from '$lib/project/shapes';
import type { ImageObject } from '$lib/project/types';
import { displayColor, placeTrace, shadePower } from '$app/lib/trace-place';

function setup() {
  const project = createProject({ id: () => 'p' });
  project.layers.push(defaultLayer({ id: 'img', mode: 'image' }));
  const image: ImageObject = {
    id: 'i',
    kind: 'image',
    layerId: 'img',
    name: 'logo.png',
    locked: false,
    visible: true,
    transform: [1, 0, 0, 1, 50, 60],
    assetId: 'a',
    width: 40,
    height: 30,
  };
  project.objects.push(image);
  project.assets.a = { id: 'a', mime: 'image/png', name: 'logo.png', data: new Blob() };
  return { project, image };
}

let n = 0;
const makeId = () => `id${++n}`;
const black = { color: '#000000', rgb: { r: 0, g: 0, b: 0 }, area: 100, paths: [rectanglePath(10, 10)] };
const gray = { color: '#808080', rgb: { r: 0.5, g: 0.5, b: 0.5 }, area: 50, paths: [rectanglePath(5, 5)] };

describe('placing a trace', () => {
  it('puts one vector per traced color over the image, on new layers', () => {
    const { project, image } = setup();
    const out = placeTrace(
      project,
      image,
      [black, gray],
      { mode: 'fill', powerByShade: true, keepImage: false },
      makeId,
    );
    const vectors = out.project.objects.filter((o) => o.kind === 'vector');
    expect(vectors).toHaveLength(2);
    expect(vectors.every((v) => v.transform.join() === image.transform.join())).toBe(true);
    expect(out.project.layers.filter((l) => l.mode === 'fill').map((l) => l.name)).toEqual([
      'Trace 40%',
      'Trace 20%',
    ]);
    expect(out.project.objects.some((o) => o.id === 'i')).toBe(false);
    expect(out.project.assets.a).toBeUndefined();
    expect(out.project.layers.some((l) => l.id === 'img')).toBe(false);
  });

  it('grades power by shade and keeps the image hidden when asked', () => {
    const { project, image } = setup();
    const out = placeTrace(
      project,
      image,
      [black, gray],
      { mode: 'fill', powerByShade: true, keepImage: true },
      makeId,
    );
    const [l1, l2] = out.project.layers.filter((l) => l.name.startsWith('Trace'));
    expect(l1.power).toBe(40);
    expect(l2.power).toBe(20);
    expect(out.project.objects.find((o) => o.id === 'i')?.visible).toBe(false);
    expect(out.project.layers.some((l) => l.id === 'img')).toBe(true);
  });

  it('uses one plain layer for black and white traces', () => {
    const { project, image } = setup();
    const out = placeTrace(
      project,
      image,
      [black],
      { mode: 'line', powerByShade: true, keepImage: false },
      makeId,
    );
    const layer = out.project.layers.find((l) => l.name === 'Trace')!;
    expect(layer.mode).toBe('line');
    expect(layer.color).toBe(defaultLayer({ id: 'x', mode: 'line' }).color);
  });

  it('never turns white background regions into burn layers', () => {
    const { project, image } = setup();
    const white = { color: '#ffffff', rgb: { r: 1, g: 1, b: 1 }, area: 900, paths: [rectanglePath(40, 30)] };
    const out = placeTrace(
      project,
      image,
      [white, black],
      { mode: 'fill', powerByShade: true, keepImage: false },
      makeId,
    );
    expect(out.project.objects.filter((o) => o.kind === 'vector')).toHaveLength(1);
    expect(out.project.layers.find((l) => l.name === 'Trace')).toBeDefined();
  });

  it('lifts dark display colors and maps shade to power', () => {
    expect(displayColor({ r: 0, g: 0, b: 0 })).toBe('#737373');
    expect(displayColor({ r: 1, g: 0.5, b: 0 })).toBe('#FF8000');
    expect(shadePower({ r: 0, g: 0, b: 0 }, 40)).toBe(40);
    expect(shadePower({ r: 1, g: 1, b: 1 }, 40)).toBe(1);
  });
});

describe('grouping traced colors', () => {
  it('puts colors that burn alike on one layer', async () => {
    const { groupByPower } = await import('$app/lib/trace-place');
    const shade = (v: number, area = 1) => ({
      color: '',
      rgb: { r: v, g: v, b: v },
      area,
      paths: [rectanglePath(1, 1)],
    });
    // 24 gray levels collapse into power steps of 5%.
    const many = Array.from({ length: 24 }, (_, i) => shade(i / 30));
    const groups = groupByPower(many, 40, true);
    expect(groups.length).toBeLessThanOrEqual(9);
    expect(groups.map((g) => g.power)).toEqual([...groups.map((g) => g.power)].sort((a, b) => b - a));
    expect(groups.flatMap((g) => g.members)).toHaveLength(24);
  });

  it('uses one layer when power does not follow shade', async () => {
    const { groupByPower } = await import('$app/lib/trace-place');
    const shade = (v: number) => ({
      color: '',
      rgb: { r: v, g: v, b: v },
      area: 1,
      paths: [rectanglePath(1, 1)],
    });
    expect(groupByPower([shade(0), shade(0.4), shade(0.7)], 40, false)).toHaveLength(1);
  });
});
