/**
 * A job as one black-and-white bitmap on a LaserPecker's pixel grid. Images go through the raster
 * pipeline at the device's resolution; line and fill layers are drawn from their toolpaths. The
 * device burns the whole bitmap at one power, so layer powers do not carry over.
 */
import { isRotated } from '../../geometry/mat2d';
import type { ImageObject, ImageSettings, MachineProfile } from '../../project/types';
import { compileJob } from '../compile';
import { layerJobObjects, outputLayers } from '../objects';
import { DEFAULT_IMAGE_SETTINGS } from '../raster/defaults';
import { processRaster } from '../raster/pipeline';
import type { CamWarning, CompileInput, Rect, RasterSource } from '../types';

export interface JobBitmap {
  /** Top-left pixel on the device's work area. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 1 = burn, row-major, row 0 at the top of the work area. */
  burn: Uint8Array;
  dpi: number;
}

export interface RasterizeResult {
  bitmap: JobBitmap | null;
  warnings: CamWarning[];
  /** Output layers with something to burn. */
  layers: number;
}

type Point = { x: number; y: number };

/** Bed mm to the device frame: origin top-left, y down, whatever corner the profile homes in. */
export function toDeviceFrame(profile: Pick<MachineProfile, 'originCorner' | 'bedWidth' | 'bedHeight'>) {
  const flipX = profile.originCorner === 'tr' || profile.originCorner === 'br';
  const flipY = profile.originCorner === 'bl' || profile.originCorner === 'br';
  return (x: number, y: number): Point => ({
    x: flipX ? profile.bedWidth - x : x,
    y: flipY ? profile.bedHeight - y : y,
  });
}

function deviceRect(rect: Rect, map: (x: number, y: number) => Point): Rect {
  const a = map(rect.minX, rect.minY);
  const b = map(rect.maxX, rect.maxY);
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

export function rasterizeJob(input: CompileInput, dpi: number): RasterizeResult {
  // The device engraves at bed positions: there is no head position to anchor a job to.
  const project = {
    ...input.project,
    jobSettings: { ...input.project.jobSettings, origin: 'absolute' as const },
  };
  const plan = compileJob({ ...input, project });
  const layers = new Set(plan.toolpaths.map((tp) => tp.layerId)).size;
  if (!plan.bounds) return { bitmap: null, warnings: plan.warnings, layers };

  const scale = dpi / 25.4;
  const map = toDeviceFrame(input.profile);
  const bounds = deviceRect(plan.bounds, map);
  const left = Math.max(0, Math.floor(bounds.minX * scale));
  const top = Math.max(0, Math.floor(bounds.minY * scale));
  const width = Math.max(1, Math.ceil(bounds.maxX * scale) - left);
  const height = Math.max(1, Math.ceil(bounds.maxY * scale) - top);
  if (width <= 0 || height <= 0) return { bitmap: null, warnings: plan.warnings, layers };
  const burn = new Uint8Array(width * height);
  const set = (gx: number, gy: number) => {
    // A point on the far edge of the bounds belongs to the last pixel, not the one past it.
    const x = gx - left === width ? width - 1 : gx - left;
    const y = gy - top === height ? height - 1 : gy - top;
    if (x >= 0 && y >= 0 && x < width && y < height) burn[y * width + x] = 1;
  };

  const imageLayers = new Set<string>();
  for (const layer of outputLayers(project)) {
    if (layer.mode !== 'image') continue;
    imageLayers.add(layer.id);
    for (const object of layerJobObjects(project, layer)) {
      const source = object.kind === 'image' ? input.assets.get(object.assetId) : undefined;
      if (object.kind !== 'image' || !source || isRotated(object.transform)) continue;
      paintImage(object, source, layer.image ?? DEFAULT_IMAGE_SETTINGS, { scale, map, set });
    }
  }

  for (const toolpath of plan.toolpaths) {
    if (imageLayers.has(toolpath.layerId)) continue;
    for (const run of toolpath.runs) {
      for (let i = 0; i + 3 < run.points.length; i += 2) {
        const power = Array.isArray(run.power) ? run.power[i / 2] : run.power;
        if (!(power > 0)) continue;
        const a = map(run.points[i], run.points[i + 1]);
        const b = map(run.points[i + 2], run.points[i + 3]);
        drawLine(a, b, scale, set);
      }
    }
  }

  if (!burn.includes(1)) return { bitmap: null, warnings: plan.warnings, layers };
  return { bitmap: { left, top, width, height, burn, dpi }, warnings: plan.warnings, layers };
}

interface Painter {
  scale: number;
  map: (x: number, y: number) => Point;
  set: (gx: number, gy: number) => void;
}

/** Dithers the image straight onto the device grid; the device has no grey levels. */
function paintImage(
  object: ImageObject,
  source: RasterSource,
  settings: ImageSettings,
  { scale, map, set }: Painter,
): void {
  const [a, , , d, e, f] = object.transform;
  // Object space is Y-up: the image's top-left is (0, height).
  const topLeft = map(e, d * object.height + f);
  const bottomRight = map(a * object.width + e, f);
  const x0 = Math.floor(Math.min(topLeft.x, bottomRight.x) * scale);
  const x1 = Math.ceil(Math.max(topLeft.x, bottomRight.x) * scale);
  const y0 = Math.floor(Math.min(topLeft.y, bottomRight.y) * scale);
  const y1 = Math.ceil(Math.max(topLeft.y, bottomRight.y) * scale);
  const cols = x1 - x0;
  const rows = y1 - y0;
  if (cols <= 0 || rows <= 0 || source.width <= 0 || source.height <= 0) return;
  const algorithm = settings.algorithm === 'grayscale' ? 'floyd-steinberg' : settings.algorithm;
  const levels = processRaster(source, cols, rows, { ...settings, algorithm });
  const mirrorX = topLeft.x > bottomRight.x;
  const mirrorY = topLeft.y > bottomRight.y;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (levels[r * cols + c] === 0) continue;
      set(x0 + (mirrorX ? cols - 1 - c : c), y0 + (mirrorY ? rows - 1 - r : r));
    }
  }
}

/** Marks every pixel the segment passes through, sampling at most half a pixel apart. */
function drawLine(a: Point, b: Point, scale: number, set: (gx: number, gy: number) => void): void {
  const ax = a.x * scale;
  const ay = a.y * scale;
  const dx = b.x * scale - ax;
  const dy = b.y * scale - ay;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    set(Math.floor(ax + dx * t), Math.floor(ay + dy * t));
  }
}
