/**
 * The Outline tool's geometry: one outline around everything selected, `offset` mm away.
 * Each object's filled area (even-odd, as it burns) is merged with the others, and the selection
 * is treated as a single unit: when the offset outlines do not touch, they are bridged with
 * smooth, rounded joins, so a logo and a key-ring hole always get one outline that wraps both.
 */
import { offsetOpen, offsetRings, union, type JoinStyle } from '../geometry/clipper';
import { apply } from '../geometry/mat2d';
import { flattenPaths } from '../geometry/path';
import { pointInPolygon } from '../geometry/polygon';
import type { PathData, Vec2 } from '../geometry/types';
import { textPlaceholderSize } from './outline';
import type { SceneObject } from './types';

export interface ContourOptions {
  /** mm; positive grows outward, negative insets, 0 traces the merged edge. */
  offset: number;
  corners: Extract<JoinStyle, 'round' | 'miter'>;
  /** Drop holes so only the outer edge remains (a key-ring blank, a sticker cut). */
  outerOnly: boolean;
}

export const DEFAULT_CONTOUR: ContourOptions = { offset: 3, corners: 'round', outerOnly: true };

/** Flattening tolerance, mm: well under a laser spot. */
const TOLERANCE = 0.02;
/** Rings smaller than this (mm²) are slivers from the boolean ops. */
const MIN_AREA = 0.01;

/** Bed-space outline of the objects, as closed paths. Empty when there is nothing to outline. */
export function contourPaths(objects: readonly SceneObject[], options: ContourOptions): PathData[] {
  const regions: Vec2[][] = [];
  const lines: Vec2[][] = [];
  for (const object of objects) {
    const { closed, open } = objectRings(object);
    // Each object's own area by even-odd, so letter counters stay holes inside that object.
    if (closed.length) regions.push(...union(closed, 'evenodd'));
    lines.push(...open);
  }
  const corners = { join: options.corners, miterLimit: 4 } as const;
  const area = union(regions, 'nonzero');
  let rings = offsetRings(area, options.offset, corners);
  // Open lines have no area; they join the outline as strokes as wide as the offset.
  if (lines.length && options.offset > 0)
    rings = union([...rings, ...offsetOpen(lines, options.offset)], 'nonzero');
  rings = clean(rings);
  if (outers(rings) > 1) rings = clean(bridge(rings));
  if (options.outerOnly) rings = rings.filter((r) => depth(r, rings) % 2 === 0);
  return rings.map(toPath);
}

const clean = (rings: Vec2[][]) => rings.filter((r) => r.length >= 3 && Math.abs(ringArea(r)) >= MIN_AREA);
const outers = (rings: Vec2[][]) => rings.filter((r) => depth(r, rings) % 2 === 0).length;

/** Morphological closing: grow by `radius`, then shrink back. Fills gaps narrower than ~2·radius. */
function close(rings: Vec2[][], radius: number): Vec2[][] {
  return offsetRings(offsetRings(rings, radius, { join: 'round' }), -radius, { join: 'round' });
}

/** Extra closing beyond the smallest one that connects, so bridges are full curves, not thin necks. */
const BRIDGE_EASE = 3;

/**
 * Joins separate outlines into one. Finds the smallest closing radius that leaves a single outer
 * edge (doubling, then bisecting), eases it out for a smooth bridge, and falls back to the convex
 * hull for parts too far apart to close.
 */
function bridge(rings: Vec2[][]): Vec2[][] {
  const points = rings.flat();
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const joined = (radius: number) => outers(clean(close(rings, radius))) === 1;
  let lo = 0;
  let hi = Math.max(diagonal / 16, 0.5);
  while (!joined(hi)) {
    lo = hi;
    hi *= 2;
    if (hi > diagonal * 2) return [convexHull(points)];
  }
  for (let i = 0; i < 10 && hi - lo > 0.05; i++) {
    const mid = (lo + hi) / 2;
    if (joined(mid)) hi = mid;
    else lo = mid;
  }
  const eased = close(rings, hi * BRIDGE_EASE);
  return outers(clean(eased)) === 1 ? eased : close(rings, hi);
}

/** Andrew's monotone chain. */
function convexHull(points: Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Vec2[]) => {
    const out: Vec2[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function objectRings(object: SceneObject): { closed: Vec2[][]; open: Vec2[][] } {
  if (object.kind === 'image' || (object.kind === 'text' && object.paths.length === 0)) {
    const size = object.kind === 'image' ? object : textPlaceholderSize(object);
    const box = [
      { x: 0, y: 0 },
      { x: size.width, y: 0 },
      { x: size.width, y: size.height },
      { x: 0, y: size.height },
    ].map((p) => apply(object.transform, p));
    return { closed: [box], open: [] };
  }
  const closed: Vec2[][] = [];
  const open: Vec2[][] = [];
  for (const line of flattenPaths(object.paths, object.transform, TOLERANCE)) {
    if (line.points.length < 2) continue;
    (line.closed && line.points.length >= 3 ? closed : open).push(line.points);
  }
  return { closed, open };
}

function ringArea(ring: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j]!.x + ring[i]!.x) * (ring[j]!.y - ring[i]!.y);
  return a / 2;
}

/** How many other rings enclose this one: even is an outer edge, odd a hole. */
function depth(ring: Vec2[], all: Vec2[][]): number {
  const probe = ring[0]!;
  return all.filter((other) => other !== ring && pointInPolygon(probe, other)).length;
}

function toPath(ring: Vec2[]): PathData {
  return {
    closed: true,
    start: { ...ring[0]! },
    segments: ring.slice(1).map((to) => ({ type: 'L' as const, to: { ...to } })),
  };
}
