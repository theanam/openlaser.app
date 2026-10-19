import { describe, expect, it } from 'vitest';
import type { PathData } from '$lib/geometry/types';
import { tracePreset } from '$lib/trace/presets';
import { traceLayersToPaths } from '$lib/trace/to-paths';
import { traceImage } from '$lib/trace/trace';
import { box, picture } from './fixtures';

const points = (p: PathData) => [p.start, ...p.segments.map((s) => s.to)];

describe('traceLayersToPaths', () => {
  it('flips Y and scales the pixel box onto the millimetre box', () => {
    // 20×10 px, black 6×4 square in the top-left corner.
    const px = picture(20, 10, [255, 255, 255, 255], [box(0, 0, 6, 4, [0, 0, 0, 255])]);
    const result = traceImage(px, { ...tracePreset('lineart').options, speckle: 1 });
    const layers = traceLayersToPaths(result, 40, 20);
    expect(layers).toHaveLength(1);
    const pts = layers[0].paths.flatMap(points);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 5);
    expect(Math.max(...xs)).toBeCloseTo(12, 5);
    // Top of the image is y = 20 mm in Y-up space; the square is 4 px = 8 mm tall.
    expect(Math.max(...ys)).toBeCloseTo(20, 5);
    expect(Math.min(...ys)).toBeCloseTo(12, 5);
  });

  it('reports colors as #rrggbb with 0–1 rgb, bottom layer first', () => {
    const px = picture(30, 20, [255, 255, 255, 255], [box(5, 5, 25, 15, [255, 0, 0, 255])]);
    const result = traceImage(px, { ...tracePreset('logo').options, colors: 2 });
    const layers = traceLayersToPaths(result, 30, 20);
    expect(layers.map((l) => l.color)).toEqual(['#ffffff', '#ff0000']);
    for (const l of layers) {
      expect(l.color).toMatch(/^#[0-9a-f]{6}$/);
      for (const v of [l.rgb.r, l.rgb.g, l.rgb.b]) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of [l.rgb.r, l.rgb.g, l.rgb.b]) expect(v).toBeLessThanOrEqual(1);
      expect(l.area).toBeGreaterThan(0);
    }
  });

  it('ends closed paths back at their start', () => {
    const px = picture(30, 20, [255, 255, 255, 255], [box(5, 5, 25, 15, [0, 0, 0, 255])]);
    const layers = traceLayersToPaths(traceImage(px, tracePreset('lineart').options), 30, 20);
    const paths = layers.flatMap((l) => l.paths);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p.closed).toBe(true);
      expect(p.segments.at(-1)?.to).toEqual(p.start);
    }
  });

  it('skips layers without subpaths', () => {
    const layers = traceLayersToPaths(
      {
        width: 10,
        height: 10,
        nodes: 0,
        layers: [{ color: { r: 0, g: 0, b: 0 }, subpaths: [], area: 4 }],
      },
      10,
      10,
    );
    expect(layers).toEqual([]);
  });
});
