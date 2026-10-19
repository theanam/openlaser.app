import { DEFAULT_TOLERANCE, flattenCubic } from './bezier';
import { apply, boundsOfPoints, IDENTITY } from './mat2d';
import type { Mat2D, PathData, Polyline, Rect, Vec2 } from './types';

const DUPLICATE_EPSILON = 1e-9;

/**
 * Flattens a path to a polyline in the transform's target space. Control points are transformed
 * before flattening (exact for affine transforms), so `tolerance` is measured in target mm.
 * Consecutive duplicate points are dropped; closed polylines do not repeat their first point.
 */
export function flattenPath(
  path: PathData,
  transform: Mat2D = IDENTITY,
  tolerance = DEFAULT_TOLERANCE,
): Polyline {
  const raw: Vec2[] = [apply(transform, path.start)];
  for (const segment of path.segments) {
    const from = raw[raw.length - 1];
    if (segment.type === 'L') {
      raw.push(apply(transform, segment.to));
    } else {
      flattenCubic(
        from,
        apply(transform, segment.c1),
        apply(transform, segment.c2),
        apply(transform, segment.to),
        tolerance,
        raw,
      );
    }
  }
  const points: Vec2[] = [];
  for (const p of raw) {
    const last = points[points.length - 1];
    if (!last || !nearlyEqual(last, p)) points.push(p);
  }
  if (path.closed && points.length > 1 && nearlyEqual(points[0], points[points.length - 1])) points.pop();
  return { points, closed: path.closed };
}

export function flattenPaths(
  paths: PathData[],
  transform: Mat2D = IDENTITY,
  tolerance = DEFAULT_TOLERANCE,
): Polyline[] {
  return paths.map((p) => flattenPath(p, transform, tolerance));
}

export function polylinesBounds(polylines: Polyline[]): Rect | null {
  return boundsOfPoints(iteratePoints(polylines));
}

/** Bounds of paths after the transform, accurate to the flattening tolerance. */
export function pathsBounds(
  paths: PathData[],
  transform: Mat2D = IDENTITY,
  tolerance = DEFAULT_TOLERANCE,
): Rect | null {
  return polylinesBounds(flattenPaths(paths, transform, tolerance));
}

/** Length including the closing segment of closed polylines. */
export function polylineLength(polyline: Polyline): number {
  const pts = polyline.points;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (polyline.closed && pts.length > 2) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    total += Math.hypot(first.x - last.x, first.y - last.y);
  }
  return total;
}

function* iteratePoints(polylines: Polyline[]): Generator<Vec2> {
  for (const pl of polylines) yield* pl.points;
}

function nearlyEqual(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) <= DUPLICATE_EPSILON && Math.abs(a.y - b.y) <= DUPLICATE_EPSILON;
}
