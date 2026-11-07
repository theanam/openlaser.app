/** Project → LaserPecker job file and framing rectangle. Pure, so it runs in the CAM worker. */
import type { CamWarning, CompileInput } from '../types';
import { encodeRasterFile, type RasterFile } from './file';
import { rasterizeJob } from './raster';

export interface LaserPeckerJob {
  file: RasterFile | null;
  /** mm on the work area, top-left origin. */
  frame: { x: number; y: number; width: number; height: number } | null;
  layers: number;
  warnings: CamWarning[];
}

export function laserPeckerJob(
  input: CompileInput,
  options: { dpi: number; px: number; packed: boolean },
): LaserPeckerJob {
  const { bitmap, warnings, layers } = rasterizeJob(input, options.dpi);
  if (!bitmap) return { file: null, frame: null, layers, warnings };
  // Rounded to µm: the device takes 0.1 mm, and float noise would only clutter the numbers.
  const mm = (px: number) => Math.round((px * 25400) / options.dpi) / 1000;
  return {
    file: encodeRasterFile(bitmap, { px: options.px, packed: options.packed, name: input.project.name }),
    frame: { x: mm(bitmap.left), y: mm(bitmap.top), width: mm(bitmap.width), height: mm(bitmap.height) },
    layers,
    warnings,
  };
}
