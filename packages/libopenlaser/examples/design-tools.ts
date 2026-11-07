/**
 * Build designs in code: parametric shapes, text outlines and bitmap tracing, each placed on a
 * layer as a vector object ready for the CAM.
 */
import { outlineText } from 'libopenlaser/fonts';
import { identity, translation, type PathData } from 'libopenlaser/geometry';
import { defaultLayer, makeId, type Layer, type VectorObject } from 'libopenlaser/project';
import { shapePaths } from 'libopenlaser/shapes';
import { trace, traceLayersToPaths, tracePreset, type Pixels } from 'libopenlaser/trace';

export const cutLayer: Layer = defaultLayer({ id: makeId(), mode: 'line', power: 80, speed: 600 });

function vector(name: string, paths: PathData[], x = 0, y = 0): VectorObject {
  const transform = x || y ? translation(x, y) : identity();
  return {
    id: makeId(),
    kind: 'vector',
    layerId: cutLayer.id,
    name,
    locked: false,
    visible: true,
    transform,
    paths,
  };
}

/** A 50 mm star at (20, 20) on the bed. Shapes are generated inside their box, in mm. */
export function star(): VectorObject {
  return vector('Star', shapePaths('star', 50, 50), 20, 20);
}

/**
 * Text as outlines, in any Google Font (downloaded from the Fontsource CDN and cached in
 * IndexedDB). HarfBuzz shapes complex scripts such as Bangla. Null when the font can't load.
 */
export async function textOutline(text: string): Promise<VectorObject | null> {
  const outline = await outlineText({
    text,
    fontFamily: 'Roboto',
    fontSize: 10,
    fontWeight: 400,
    italic: false,
    align: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
  });
  return outline ? vector(text, outline.paths) : null;
}

/**
 * Trace a bitmap (RGBA, like ImageData) into one vector object per colour, sized to `widthMm`.
 * Runs on a web worker when the page has one, else on the calling thread.
 */
export async function traceBitmap(image: Pixels, widthMm: number): Promise<VectorObject[]> {
  const result = await trace(image, tracePreset('logo').options);
  const heightMm = (widthMm * image.height) / image.width;
  return traceLayersToPaths(result, widthMm, heightMm).map((layer) => vector(layer.color, layer.paths));
}
