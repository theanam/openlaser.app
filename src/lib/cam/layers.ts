/** Per-layer toolpath generation: dispatches each output layer to line, fill or image mode. */
import type { Vec2 } from '../geometry/types';
import type { ImageObject, Layer, SceneObject, VectorObject } from '../project/types';
import { orderPolylines } from './ordering';
import { imageObjectToolpath } from './raster';
import { polylineToRun, repeatPasses, runEnd } from './toolpath';
import type { CamWarning, RasterSource, Toolpath, ToolpathRun } from './types';
import { DEFAULT_FILL_SETTINGS, fillRegion, fillRuns } from './vector/fill';
import { linePolylines } from './vector/line';

export interface LayerContext {
  assets: ReadonlyMap<string, RasterSource>;
  tolerance: number;
  optimizeOrder: boolean;
  /** Head position when this layer starts, for nearest-neighbour ordering. */
  position: Vec2;
}

export interface LayerResult {
  toolpath: Toolpath | null;
  warnings: CamWarning[];
}

/**
 * Builds one layer's toolpath. Objects that do not fit the layer's mode (vectors on an image
 * layer, images on a vector layer) are skipped: the UI keeps them apart, and burning them some
 * other way would surprise the user.
 */
export function layerToolpath(layer: Layer, objects: readonly SceneObject[], ctx: LayerContext): LayerResult {
  const warnings: CamWarning[] = [];
  const vectors: VectorObject[] = [];
  for (const object of objects) {
    if (object.kind === 'vector') vectors.push(object);
    else if (object.kind === 'text') {
      // Text burns as the outlines cached from its font; without them it would silently vanish.
      if (object.paths.length) vectors.push({ ...object, kind: 'vector', paths: object.paths });
      else if (object.text.trim())
        warnings.push({
          code: 'text-not-ready',
          message: `Text "${object.name}" has no outlines yet. Wait for its font to load, or check the connection.`,
          blocking: true,
          layerId: layer.id,
          objectId: object.id,
        });
    }
  }
  const images = objects.filter((o): o is ImageObject => o.kind === 'image');

  let runs: ToolpathRun[];
  if (layer.mode === 'line') {
    runs = lineRuns(layer, vectors, ctx);
  } else if (layer.mode === 'fill') {
    const region = fillRegion(vectors, ctx.tolerance);
    for (const objectId of region.openPathObjectIds) {
      const name = vectors.find((v) => v.id === objectId)?.name ?? objectId;
      warnings.push({
        code: 'open-path-fill',
        message: `"${name}" has open paths, which a fill ignores. Close them or move them to a line layer.`,
        blocking: false,
        layerId: layer.id,
        objectId,
      });
    }
    runs = fillRuns(region.rings, layer.fill ?? DEFAULT_FILL_SETTINGS, layer.power);
  } else {
    runs = [];
    for (const image of images) {
      const source = ctx.assets.get(image.assetId);
      if (!source) {
        warnings.push({
          code: 'missing-asset',
          message: `The image for "${image.name}" is missing, so it is left out of the job.`,
          blocking: true,
          layerId: layer.id,
          objectId: image.id,
        });
        continue;
      }
      const result = imageObjectToolpath(image, layer, source);
      runs.push(...result.runs);
      warnings.push(...result.warnings);
    }
  }

  const passes = repeatPasses(
    runs.filter((r) => r.points.length >= 4),
    layer.passes,
  );
  if (passes.length === 0) return { toolpath: null, warnings };
  return {
    toolpath: { layerId: layer.id, feed: layer.speed, runs: passes, airAssist: layer.airAssist },
    warnings,
  };
}

function lineRuns(layer: Layer, vectors: readonly VectorObject[], ctx: LayerContext): ToolpathRun[] {
  const polylines = linePolylines(vectors, layer.line?.kerfOffset ?? 0, ctx.tolerance);
  const ordered = ctx.optimizeOrder ? orderPolylines(polylines, ctx.position) : polylines;
  return ordered.map((p) => polylineToRun(p, layer.power));
}

/** Where the head is after a toolpath, for ordering the next layer. */
export function toolpathEnd(toolpath: Toolpath): Vec2 {
  return runEnd(toolpath.runs[toolpath.runs.length - 1]);
}
