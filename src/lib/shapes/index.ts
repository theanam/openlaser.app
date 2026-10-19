/* Parametric shape library (ported from curvesmith). Every shape is generated inside its box from a small
   set of parameters, so it can be regenerated when the box or a parameter changes. */
import type { PathData } from '$lib/geometry/types';
import type { Box, ShapeGen } from './builder';
import { defaultParams, type ShapeKind } from './catalog';
import { toPathData, toSvgPath } from './convert';
import { CURVED } from './curved';
import type { ShapeParams, Subpath } from './internal-types';
import { POLYGONAL } from './polygonal';

export {
  SHAPES,
  SHAPE_GROUPS,
  defaultParams,
  isShapeKind,
  shapeDef,
  type ParamDef,
  type ShapeDef,
  type ShapeGroup,
  type ShapeKind,
} from './catalog';
export type { ShapeParams } from './internal-types';

const GENERATORS: Record<ShapeKind, ShapeGen> = { ...POLYGONAL, ...CURVED };

/** Y-down subpaths in the box (0,0)–(w,h); missing or non-finite params fall back to the defaults. */
function shapeSubpaths(kind: ShapeKind, width: number, height: number, params: ShapeParams): Subpath[] {
  const w = Math.max(Math.abs(width), 1e-6);
  const h = Math.max(Math.abs(height), 1e-6);
  const box: Box = { w, h, cx: w / 2, cy: h / 2, m: Math.min(w, h) };
  const p = (key: string, fallback: number) => {
    const v = params[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  };
  return GENERATORS[kind](box, p, params);
}

/**
 * The shape's outlines fitted to the box (0,0)–(width,height) in Y-up object space (mm). Closed outlines
 * end with an explicit segment back to their start; the spiral is the only open shape.
 */
export function shapePaths(
  kind: ShapeKind,
  width: number,
  height: number,
  params: ShapeParams = {},
): PathData[] {
  const h = Math.max(Math.abs(height), 1e-6);
  return shapeSubpaths(kind, width, height, params).map((sp) => toPathData(sp, h));
}

/** Glyph proportions for shapes that read better outside a square. */
const ASPECT: Partial<Record<ShapeKind, [number, number]>> = {
  arrow: [20, 13],
  chevron: [18, 16],
  parallelogram: [20, 13],
  trapezoid: [20, 14],
  segment: [20, 16],
  calloutRect: [20, 17],
  calloutEllipse: [20, 17],
  gem: [20, 16],
  shield: [16, 20],
  tear: [14, 20],
  bolt: [14, 20],
  arc: [20, 12],
  // Regular proportions, since star and polygon stretch to fill their box.
  star: [20, 19],
  polygon: [18, 20],
};

const glyphCache = new Map<ShapeKind, string>();

/** SVG path `d` for a centred 24×24 icon (Y-down), drawn from the real geometry with default params. */
export function shapeGlyphPath(kind: ShapeKind): string {
  const hit = glyphCache.get(kind);
  if (hit) return hit;
  const [w, h] = ASPECT[kind] ?? [20, 20];
  const d = toSvgPath(shapeSubpaths(kind, w, h, defaultParams(kind)), (24 - w) / 2, (24 - h) / 2);
  glyphCache.set(kind, d);
  return d;
}
