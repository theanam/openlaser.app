import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE_SETTINGS, ditherPreview, imageObjectToolpath } from '$lib/cam/raster';
import { gridSize, powerTable } from '$lib/cam/raster/pipeline';
import { rotation } from '$lib/geometry/mat2d';
import type { ImageObject, ImageSettings, Layer } from '$lib/project/types';
import { graySource, makeSource } from './helpers';

const layer = (image: Partial<ImageSettings> = {}, power = 60, minPower = 10): Layer => ({
  id: 'L1',
  name: 'Photo',
  color: '#B794F6',
  visible: true,
  output: true,
  mode: 'image',
  speed: 2400,
  power,
  minPower,
  passes: 1,
  airAssist: false,
  image: { ...DEFAULT_IMAGE_SETTINGS, bidirectional: false, overscan: 0, ...image },
});

const imageObject = (
  width: number,
  height: number,
  transform: ImageObject['transform'] = [1, 0, 0, 1, 0, 0],
): ImageObject => ({
  id: 'O1',
  kind: 'image',
  layerId: 'L1',
  name: 'photo.png',
  locked: false,
  visible: true,
  assetId: 'A1',
  width,
  height,
  transform,
});

describe('gridSize / powerTable', () => {
  it('derives square pixels from size and DPI', () => {
    expect(gridSize(100, 50, 254)).toEqual({ cols: 1000, rows: 500 });
    expect(gridSize(0.01, 0.01, 254)).toEqual({ cols: 1, rows: 1 });
  });

  it('maps grayscale levels between minPower and power', () => {
    const table = powerTable('grayscale', { power: 60, minPower: 10 });
    expect(table[0]).toBe(0);
    expect(table[255]).toBe(60);
    expect(table[1]).toBeCloseTo(10.2, 2);
    expect(powerTable('atkinson', { power: 60, minPower: 10 })[255]).toBe(60);
  });
});

describe('imageObjectToolpath', () => {
  it('rejects rotated images with a blocking warning and no runs', () => {
    const result = imageObjectToolpath(
      imageObject(10, 10, rotation(30)),
      layer(),
      graySource(2, 2, () => 0),
    );
    expect(result.runs).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      code: 'rotated-image',
      blocking: true,
      objectId: 'O1',
      layerId: 'L1',
    });
  });

  it('places rows top-down in Y-up bed space with translate + scale', () => {
    // 2×2 source: top row black, bottom row white. 2 mm × 2 mm object scaled ×2 and moved to (10, 20).
    const source = graySource(2, 2, (_, y) => (y === 0 ? 0 : 255));
    const object = imageObject(2, 2, [2, 0, 0, 2, 10, 20]);
    const { runs, warnings } = imageObjectToolpath(
      object,
      layer({ dpi: 25.4 / 2, algorithm: 'threshold' }),
      source,
    );
    expect(warnings).toEqual([]);
    // Bed size 4 × 4 mm at 2 mm pixels → 2 × 2 grid. Top row centre at y = 20 + 4 − 1 = 23.
    expect(runs).toEqual([{ points: [10, 23, 14, 23], power: [60] }]);
  });

  it('never burns transparent pixels', () => {
    const source = makeSource(4, 1, (x) => (x < 2 ? [0, 0, 0, 0] : [0, 0, 0, 255]));
    const { runs } = imageObjectToolpath(
      imageObject(4, 1),
      layer({ dpi: 25.4, algorithm: 'threshold' }),
      source,
    );
    expect(runs).toEqual([{ points: [2, 0.5, 4, 0.5], power: [60] }]);
  });

  it('maps grayscale pixels to power and skips white', () => {
    const source = graySource(3, 1, (x) => [0, 255, 128][x]);
    const { runs } = imageObjectToolpath(
      imageObject(3, 1),
      layer({ dpi: 25.4, algorithm: 'grayscale' }),
      source,
    );
    expect(runs[0].power).toEqual([60, 0, 34.9]);
  });

  it('pass-through thresholds at mid-gray and ignores tone settings', () => {
    const source = graySource(3, 1, (x) => [100, 140, 0][x]);
    const settings = {
      dpi: 25.4,
      passThrough: true,
      invert: true,
      brightness: 100,
      algorithm: 'atkinson' as const,
    };
    const { runs } = imageObjectToolpath(imageObject(3, 1), layer(settings), source);
    expect(runs).toEqual([{ points: [0, 0.5, 1, 0.5, 2, 0.5, 3, 0.5], power: [60, 0, 60] }]);
  });

  it('returns nothing for degenerate sizes', () => {
    expect(
      imageObjectToolpath(
        imageObject(0, 5),
        layer(),
        graySource(1, 1, () => 0),
      ).runs,
    ).toEqual([]);
  });

  it('compiles a 100 × 100 mm photo at 254 DPI quickly', () => {
    const source = graySource(800, 800, (x, y) => (x * 7 + y * 3) % 256);
    const started = performance.now();
    const { runs } = imageObjectToolpath(
      imageObject(100, 100),
      layer({ dpi: 254, bidirectional: true, overscan: 2.5 }),
      source,
    );
    const elapsed = performance.now() - started;
    expect(runs.length).toBe(1000);
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('ditherPreview', () => {
  it('caps the pixel count and keeps the aspect ratio', () => {
    const source = graySource(10, 10, () => 0);
    const preview = ditherPreview(
      source,
      DEFAULT_IMAGE_SETTINGS,
      { power: 50, minPower: 0 },
      200,
      100,
      20_000,
    );
    expect(preview.width * preview.height).toBeLessThanOrEqual(20_000);
    expect(preview.width / preview.height).toBeCloseTo(2, 1);
    expect(preview.burn.every((v) => v === 255)).toBe(true);
  });

  it('reports grayscale burn relative to max power', () => {
    const source = graySource(2, 1, (x) => (x === 0 ? 0 : 255));
    const settings = { ...DEFAULT_IMAGE_SETTINGS, dpi: 25.4, algorithm: 'grayscale' as const };
    const preview = ditherPreview(source, settings, { power: 50, minPower: 20 }, 2, 1);
    expect(Array.from(preview.burn)).toEqual([255, 0]);
  });
});
