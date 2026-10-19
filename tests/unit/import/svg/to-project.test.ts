import { describe, expect, it } from 'vitest';
import { defaultLayer } from '$lib/import/layer-defaults';
import { buildProjectObjectsFromSvg, decodeDataUri } from '$lib/import/svg/to-project';
import type { SvgImportResult } from '$lib/import/svg/types';
import type { PathData } from '$lib/geometry/types';

const square: PathData = {
  closed: true,
  start: { x: 0, y: 0 },
  segments: [{ type: 'L', to: { x: 1, y: 0 } }],
};

function result(overrides: Partial<SvgImportResult> = {}): SvgImportResult {
  return {
    width: 100,
    height: 100,
    groups: [
      { color: '#c0392b', kind: 'stroke', paths: [square] },
      { color: '#00ff00', kind: 'stroke', paths: [square] },
      { color: '#0000ff', kind: 'fill', paths: [square, square] },
      { color: '#0000ff', kind: 'stroke', paths: [square] },
    ],
    images: [],
    ignored: {},
    warnings: [],
    ...overrides,
  };
}

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

describe('buildProjectObjectsFromSvg', () => {
  it('reuses layers by color and creates the rest by kind', () => {
    const existing = [
      defaultLayer({ id: 'cut', color: '#C0392B' }),
      defaultLayer({ id: 'photo', mode: 'image', color: '#00ff00' }),
    ];
    const { layersToAdd, objects, assets } = buildProjectObjectsFromSvg(result(), existing, ids(), {
      name: 'logo',
    });
    expect(assets).toEqual([]);
    // Image layers never receive vectors, so green gets a new line layer.
    expect(layersToAdd.map((l) => [l.mode, l.color, l.name])).toEqual([
      ['line', '#00ff00', 'Cut #00FF00'],
      ['fill', '#0000ff', 'Fill #0000FF'],
    ]);
    expect(layersToAdd[1].fill).toBeDefined();
    expect(objects.map((o) => [o.kind, o.layerId, o.name])).toEqual([
      ['vector', 'cut', 'logo #C0392B'],
      ['vector', layersToAdd[0].id, 'logo #00FF00'],
      ['vector', layersToAdd[1].id, 'logo #0000FF'],
      // Same color as the new fill layer: one color, one layer.
      ['vector', layersToAdd[1].id, 'logo #0000FF'],
    ]);
    for (const o of objects) expect(o.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('names new layers after palette colors', () => {
    const { layersToAdd } = buildProjectObjectsFromSvg(
      result({ groups: [{ color: '#4cc9f0', kind: 'fill', paths: [square] }] }),
      [],
      ids(),
    );
    expect(layersToAdd[0].name).toBe('Beam');
  });

  it('honours the import dialog mapping', () => {
    const existing = [defaultLayer({ id: 'chosen', mode: 'fill' })];
    const { layersToAdd, objects } = buildProjectObjectsFromSvg(result(), existing, ids(), {
      layerFor: () => 'chosen',
    });
    expect(layersToAdd).toEqual([]);
    expect(objects.every((o) => o.layerId === 'chosen')).toBe(true);
  });

  it('turns embedded images into assets and image objects on an image layer', async () => {
    const image = {
      href: 'data:image/png;base64,AAEC',
      x: 5,
      y: 6,
      width: 30,
      height: 20,
      transform: [1, 0, 0, 1, 5, 6] as [number, number, number, number, number, number],
    };
    const { layersToAdd, objects, assets } = buildProjectObjectsFromSvg(
      result({ groups: [], images: [image] }),
      [],
      ids(),
      { name: 'art' },
    );
    expect(layersToAdd).toHaveLength(1);
    expect(layersToAdd[0].mode).toBe('image');
    expect(assets).toHaveLength(1);
    expect(assets[0].mime).toBe('image/png');
    expect(Array.from(new Uint8Array(await assets[0].data.arrayBuffer()))).toEqual([0, 1, 2]);
    expect(objects[0]).toMatchObject({
      kind: 'image',
      assetId: assets[0].id,
      width: 30,
      height: 20,
      layerId: layersToAdd[0].id,
    });
  });
});

describe('decodeDataUri', () => {
  it('decodes base64 and percent-encoded payloads', async () => {
    const percent = decodeDataUri('data:text/plain,a%20b');
    expect(await percent?.blob.text()).toBe('a b');
    expect(decodeDataUri('data:image/png;base64,!!!')).toBeNull();
    expect(decodeDataUri('http://example.com/x.png')).toBeNull();
  });
});
