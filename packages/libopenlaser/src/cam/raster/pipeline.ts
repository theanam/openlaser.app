import type { ImageSettings, Layer } from '../../project/types';
import type { RasterSource } from '../types';
import { burnLevels, type BurnLevels } from './dither';
import { toGrayscale } from './grayscale';
import { resampleGray } from './resample';
import { toneMap } from './tone';

const PASS_THROUGH_THRESHOLD = 128;

/** Pixels of the engraving grid for a size in mm at a line density. Square pixels, at least 1×1. */
export function gridSize(widthMm: number, heightMm: number, dpi: number): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.round((widthMm * dpi) / 25.4)),
    rows: Math.max(1, Math.round((heightMm * dpi) / 25.4)),
  };
}

/**
 * Source bitmap → burn levels on a `cols × rows` grid (SPEC §6.4 steps 1–4).
 * Grayscale conversion runs before resampling: both steps are linear, so the result is the same
 * as resampling RGBA first, at a quarter of the cost.
 * Pass-through skips tone adjustments and dithering: the image is thresholded at mid-gray, or
 * mapped linearly when the algorithm is `grayscale`.
 */
export function processRaster(
  source: RasterSource,
  cols: number,
  rows: number,
  settings: ImageSettings,
): BurnLevels {
  const gray = resampleGray(toGrayscale(source), cols, rows);
  if (settings.passThrough) {
    const tone = toneMap(gray);
    const algorithm = settings.algorithm === 'grayscale' ? 'grayscale' : 'threshold';
    return burnLevels(tone, cols, rows, algorithm, PASS_THROUGH_THRESHOLD);
  }
  const tone = toneMap(gray, settings);
  return burnLevels(tone, cols, rows, settings.algorithm, settings.threshold);
}

/**
 * Power percent per burn level. Dithered output only uses 0 and 255 (full power). Grayscale maps
 * levels 1..255 linearly onto minPower..power (rounded to 0.01 %); level 0 (white) never burns.
 */
export function powerTable(
  algorithm: ImageSettings['algorithm'],
  layer: Pick<Layer, 'power' | 'minPower'>,
): Float64Array {
  const table = new Float64Array(256);
  for (let level = 1; level < 256; level++) {
    table[level] =
      algorithm === 'grayscale'
        ? Math.round((layer.minPower + ((layer.power - layer.minPower) * level) / 255) * 100) / 100
        : layer.power;
  }
  return table;
}
