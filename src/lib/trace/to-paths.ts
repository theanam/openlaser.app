/* Boundary conversion from a trace (pixels, Y-down) to openlaser PathData (millimetres, Y-up). */
import type { PathData, Segment, Vec2 } from '$lib/geometry/types';
import type { PathNode, Subpath, Vec } from './geom';
import type { TraceResult } from './types';

export type TracedLayerPaths = {
  /** '#rrggbb'. */
  color: string;
  /** sRGB 0–1. */
  rgb: { r: number; g: number; b: number };
  /** Pixels covered by this color's own region. */
  area: number;
  paths: PathData[];
};

/** Edge between two nodes: a line unless either side carries a handle. */
function edge(from: PathNode, to: PathNode, map: (v: Vec) => Vec2): Segment {
  const end = map([to.x, to.y]);
  if (!from.out && !to.in) return { type: 'L', to: end };
  return { type: 'C', c1: map(from.out ?? [from.x, from.y]), c2: map(to.in ?? [to.x, to.y]), to: end };
}

/** Closed paths end with an explicit segment back to `start`, matching project/shapes.ts. */
function toPathData(sp: Subpath, map: (v: Vec) => Vec2): PathData {
  const nodes = sp.nodes;
  const segments: Segment[] = [];
  for (let i = 1; i < nodes.length; i++) segments.push(edge(nodes[i - 1], nodes[i], map));
  if (sp.closed && nodes.length > 1) segments.push(edge(nodes[nodes.length - 1], nodes[0], map));
  return { closed: sp.closed, start: map([nodes[0].x, nodes[0].y]), segments };
}

const hex2 = (v: number) =>
  Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, '0');

/** '#rrggbb' for an sRGB 0–1 color. */
export const toHex = (c: { r: number; g: number; b: number }) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;

/**
 * Maps the traced pixel box (0..width, 0..height, Y-down) onto (0..widthMm, 0..heightMm, Y-up).
 * Bottom layer first, like the trace; layers without paths are left out.
 */
export function traceLayersToPaths(
  result: TraceResult,
  widthMm: number,
  heightMm: number,
): TracedLayerPaths[] {
  const sx = widthMm / Math.max(1, result.width);
  const sy = heightMm / Math.max(1, result.height);
  const map = ([x, y]: Vec): Vec2 => ({ x: x * sx, y: heightMm - y * sy });
  const out: TracedLayerPaths[] = [];
  for (const layer of result.layers) {
    const paths = layer.subpaths.filter((sp) => sp.nodes.length > 0).map((sp) => toPathData(sp, map));
    if (!paths.length) continue;
    out.push({ color: toHex(layer.color), rgb: { ...layer.color }, area: layer.area, paths });
  }
  return out;
}
