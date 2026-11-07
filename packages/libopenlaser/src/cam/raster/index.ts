import { isRotated } from '../../geometry/mat2d';
import type { ImageObject, ImageSettings, Layer } from '../../project/types';
import type { CamWarning, RasterSource, ToolpathRun } from '../types';
import { DEFAULT_IMAGE_SETTINGS } from './defaults';
import { gridSize, powerTable, processRaster } from './pipeline';
import { scanlineRuns } from './scanlines';

export { DEFAULT_IMAGE_SETTINGS } from './defaults';

const DEFAULT_PREVIEW_PIXELS = 1_500_000;

/**
 * Raster toolpath for one image object (SPEC §6.4). Image object space spans (0,0)–(width,height)
 * mm, Y-up; bitmap row 0 is the top edge (object y = height).
 *
 * Only translate + scale transforms are supported in v1. Rotated or skewed images produce no runs
 * and a blocking `rotated-image` warning, so a job never silently burns something different from
 * what the canvas shows.
 */
export function imageObjectToolpath(
  object: ImageObject,
  layer: Layer,
  source: RasterSource,
): { runs: ToolpathRun[]; warnings: CamWarning[] } {
  if (isRotated(object.transform)) {
    return {
      runs: [],
      warnings: [
        {
          code: 'rotated-image',
          message: `"${object.name}" is rotated. Rotated images are not supported yet; reset its rotation to engrave it.`,
          blocking: true,
          layerId: layer.id,
          objectId: object.id,
        },
      ],
    };
  }
  const settings = layer.image ?? DEFAULT_IMAGE_SETTINGS;
  const [a, , , d, e, f] = object.transform;
  const bedWidth = Math.abs(a) * object.width;
  const bedHeight = Math.abs(d) * object.height;
  if (!(bedWidth > 0 && bedHeight > 0 && source.width > 0 && source.height > 0 && settings.dpi > 0)) {
    return { runs: [], warnings: [] };
  }
  const { cols, rows } = gridSize(bedWidth, bedHeight, settings.dpi);
  const levels = processRaster(source, cols, rows, settings);
  const runs = scanlineRuns(
    { levels, cols, rows },
    // Column boundary k → object x = k·width/cols; row boundary k → object y = height − k·height/rows.
    { x0: e, dx: (a * object.width) / cols, y0: d * object.height + f, dy: (-d * object.height) / rows },
    {
      scanAngle: settings.scanAngle,
      bidirectional: settings.bidirectional,
      overscan: Math.max(0, settings.overscan),
      powerByLevel: powerTable(settings.algorithm, layer),
    },
  );
  return { runs, warnings: [] };
}

/**
 * The same pipeline at a capped resolution for the canvas. `burn` is 0..255 per pixel, relative
 * to the layer's max power (dithered pixels are 0 or 255), row 0 at the top.
 */
export function ditherPreview(
  source: RasterSource,
  settings: ImageSettings,
  layer: Pick<Layer, 'power' | 'minPower'>,
  widthMm: number,
  heightMm: number,
  maxPixels: number = DEFAULT_PREVIEW_PIXELS,
): { width: number; height: number; burn: Uint8ClampedArray } {
  let { cols, rows } = gridSize(Math.abs(widthMm), Math.abs(heightMm), settings.dpi);
  if (cols * rows > maxPixels) {
    const shrink = Math.sqrt(maxPixels / (cols * rows));
    cols = Math.max(1, Math.floor(cols * shrink));
    rows = Math.max(1, Math.floor(rows * shrink));
  }
  const levels = processRaster(source, cols, rows, settings);
  const table = powerTable(settings.algorithm, layer);
  const burnByLevel = new Uint8ClampedArray(256);
  for (let level = 0; level < 256; level++) {
    burnByLevel[level] = layer.power > 0 ? Math.round((255 * table[level]) / layer.power) : level;
  }
  const burn = new Uint8ClampedArray(levels.length);
  for (let i = 0; i < levels.length; i++) burn[i] = burnByLevel[levels[i]];
  return { width: cols, height: rows, burn };
}
