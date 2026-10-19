/**
 * SPEC §12: optimized G-code must burn exactly what unoptimized G-code burns, checked by running
 * both through the GRBL simulator with the real driver and job runner.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compileJob } from '$lib/cam';
import type { RasterSource } from '$lib/cam/types';
import { defaultLayer } from '$lib/import/layer-defaults';
import { createProject, defaultMachineProfile } from '$lib/project/factory';
import { ellipsePath, rectanglePath } from '$lib/project/shapes';
import type { Project } from '$lib/project/types';
import { createRig } from '../machine/helpers';

const profile = defaultMachineProfile({ id: 'm', bedWidth: 400, bedHeight: 400, maxS: 1000 });

function gradient(width: number, height: number): RasterSource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = Math.round((x / (width - 1)) * 255);
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  return { width, height, data };
}

function project(params: {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  withImage: boolean;
}): Project {
  const p = createProject({ id: () => 'p', now: '2026-01-01T00:00:00.000Z' });
  const cut = defaultLayer({ id: 'cut', mode: 'line', speed: 1200, power: 80, passes: 2 });
  const fill = defaultLayer({ id: 'fill', mode: 'fill', speed: 3000, power: 40 });
  fill.fill = { ...fill.fill!, angle: params.angle, interval: 0.5 };
  p.layers.push(fill, cut);
  const base = { locked: false, visible: true } as const;
  p.objects.push({
    ...base,
    id: 'r',
    kind: 'vector',
    layerId: 'cut',
    name: 'r',
    transform: [1, 0, 0, 1, params.x, params.y],
    paths: [rectanglePath(params.w, params.h, 2)],
  });
  p.objects.push({
    ...base,
    id: 'e',
    kind: 'vector',
    layerId: 'fill',
    name: 'e',
    transform: [1, 0, 0, 1, params.x + 2, params.y + 2],
    paths: [ellipsePath(params.w - 4, params.h - 4)],
  });
  if (params.withImage) {
    const img = defaultLayer({ id: 'img', mode: 'image', speed: 2400, power: 60 });
    img.image = { ...img.image!, dpi: 50, algorithm: 'atkinson' };
    p.layers.push(img);
    p.objects.push({
      ...base,
      id: 'i',
      kind: 'image',
      layerId: 'img',
      name: 'i',
      transform: [1, 0, 0, 1, params.x, params.y],
      assetId: 'a',
      width: 12,
      height: 8,
    });
    p.assets.a = { id: 'a', mime: 'image/png', name: 'a.png', data: new Blob() };
  }
  return p;
}

async function burnsOf(lines: string[]) {
  const rig = await createRig({ profile: { bedWidth: 400, bedHeight: 400 } });
  const start = rig.sim.burns.length;
  const outcome = await rig.run(rig.runner.run(lines), 10 * 60 * 60 * 1000);
  expect(outcome).toBe('completed');
  expect(rig.sim.overflowCount).toBe(0);
  return rig.sim.burns.slice(start).map((b) => ({
    from: [+b.from.x.toFixed(3), +b.from.y.toFixed(3)],
    to: [+b.to.x.toFixed(3), +b.to.y.toFixed(3)],
    power: b.power,
  }));
}

describe('CAM output streamed through the simulator', () => {
  it('optimized and unoptimized G-code burn the same segments', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          x: fc.integer({ min: 5, max: 200 }),
          y: fc.integer({ min: 5, max: 200 }),
          w: fc.integer({ min: 12, max: 60 }),
          h: fc.integer({ min: 12, max: 60 }),
          angle: fc.constantFrom(0, 30, 45, 90),
          withImage: fc.boolean(),
        }),
        async (params) => {
          const input = { project: project(params), profile, assets: new Map([['a', gradient(24, 16)]]) };
          const optimized = compileJob({ ...input, gcode: { optimize: true } });
          const plain = compileJob({ ...input, gcode: { optimize: false } });
          expect(optimized.gcode.length).toBeGreaterThan(0);
          expect(optimized.gcode.every((l) => l.length < 80)).toBe(true);
          const [a, b] = await Promise.all([burnsOf(optimized.gcode), burnsOf(plain.gcode)]);
          expect(a.length).toBeGreaterThan(0);
          expect(a).toEqual(b);
        },
      ),
      { numRuns: 12, seed: 1729 },
    );
  }, 60_000);
});
