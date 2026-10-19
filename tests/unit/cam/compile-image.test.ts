import { describe, expect, it, vi } from 'vitest';
import type { RasterSource } from '$lib/cam/types';
import { compileInput, imageObject, layer, project } from './fixtures';

// The raster pipeline has its own tests; here only the hand-off from compileJob matters.
vi.mock('$lib/cam/raster', () => ({
  imageObjectToolpath: vi.fn(() => ({
    runs: [{ points: [10, 10, 12, 10, 14, 10], power: [40, 80] }],
    warnings: [{ code: 'rotated-image', message: 'stub', blocking: true }],
  })),
}));

const { compileJob } = await import('$lib/cam');
const { imageObjectToolpath } = await import('$lib/cam/raster');

describe('compileJob with image layers', () => {
  const source: RasterSource = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  const imageLayer = layer({ id: 'img', mode: 'image', speed: 3000, passes: 2 });

  it('passes object, layer and source to the raster pipeline', () => {
    const img = imageObject('i', 'img', 'asset', 10, 10);
    const plan = compileJob(
      compileInput(project([imageLayer], [img]), { assets: new Map([['asset', source]]) }),
    );
    expect(imageObjectToolpath).toHaveBeenCalledWith(img, imageLayer, source);
    expect(plan.toolpaths[0]).toMatchObject({ layerId: 'img', feed: 3000 });
    expect(plan.toolpaths[0].runs).toHaveLength(2);
    expect(plan.gcode).toContain('G1 X12 F3000 S400');
    expect(plan.warnings.map((w) => w.code)).toEqual(['rotated-image']);
  });

  it('warns when the asset is missing', () => {
    const plan = compileJob(compileInput(project([imageLayer], [imageObject('i', 'img', 'gone', 10, 10)])));
    expect(plan.warnings.map((w) => w.code)).toEqual(['missing-asset', 'empty-job']);
    expect(plan.warnings[0]).toMatchObject({ blocking: true, objectId: 'i' });
  });
});
