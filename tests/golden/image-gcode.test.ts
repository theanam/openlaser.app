/**
 * Image goldens as emitted G-code (SPEC §12): a small synthetic photo compiled end to end.
 * The raster module's own goldens (raster.test.ts) pin the run geometry; these pin the output.
 */
import { describe, it } from 'vitest';
import { compileJob } from '$lib/cam';
import type { RasterSource } from '$lib/cam/types';
import { defaultLayer } from '$lib/import/layer-defaults';
import { createProject, defaultMachineProfile } from '$lib/project/factory';
import type { DitherAlgorithm } from '$lib/project/types';
import { expectGolden } from './helpers';

/** 16×10 radial falloff with a transparent corner. */
function photo(): RasterSource {
  const w = 16;
  const h = 10;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x - 7.5) / 8, (y - 4.5) / 5);
      const v = Math.max(0, Math.min(255, Math.round(d * 255)));
      data.set([v, v, v, x < 2 && y < 2 ? 0 : 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data };
}

function compile(algorithm: DitherAlgorithm, extra: { bidirectional?: boolean; overscan?: number } = {}) {
  const project = createProject({ id: () => 'p', now: '2026-01-01T00:00:00.000Z' });
  const layer = defaultLayer({ id: 'img', mode: 'image', speed: 2400, power: 60, minPower: 10 });
  layer.image = {
    ...layer.image!,
    dpi: 50.8,
    algorithm,
    bidirectional: extra.bidirectional ?? true,
    overscan: extra.overscan ?? 1,
  };
  project.layers.push(layer);
  project.objects.push({
    id: 'o',
    kind: 'image',
    layerId: 'img',
    name: 'photo',
    locked: false,
    visible: true,
    transform: [1, 0, 0, 1, 20, 30],
    assetId: 'a',
    width: 8,
    height: 5,
  });
  project.assets.a = { id: 'a', mime: 'image/png', name: 'photo.png', data: new Blob() };
  const profile = defaultMachineProfile({ id: 'm', maxS: 1000 });
  return compileJob({ project, profile, assets: new Map([['a', photo()]]) }).gcode;
}

describe('image G-code goldens', () => {
  it('floyd-steinberg photo', () => expectGolden('image-gcode-floyd-steinberg', compile('floyd-steinberg')));
  it('grayscale photo', () => expectGolden('image-gcode-grayscale', compile('grayscale')));
  it('unidirectional with wide overscan', () =>
    expectGolden('image-gcode-unidirectional', compile('atkinson', { bidirectional: false, overscan: 3 })));
});
