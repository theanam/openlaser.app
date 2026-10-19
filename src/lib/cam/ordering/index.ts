/**
 * Cut ordering for line layers (SPEC §6.2): inner contours before the contours that contain them,
 * then greedy nearest-neighbour travel. Open paths may be reversed and closed paths may start at any
 * vertex. Deterministic: ties go to the lower input index.
 */
import {
  pointInPolygon,
  pointRectDistance,
  rectContains,
  ringBounds,
  signedArea,
} from '../../geometry/polygon';
import type { Polyline, Rect, Vec2 } from '../../geometry/types';

interface Candidate {
  polyline: Polyline;
  bounds: Rect;
  /** Closed polylines containing this one. */
  containers: number[];
  /** Unfinished polylines inside this one; it becomes available at 0. */
  pendingInner: number;
}

export function orderPolylines(polylines: readonly Polyline[], start: Vec2): Polyline[] {
  const candidates = buildContainment(polylines.filter((p) => p.points.length > 0));
  const done = new Array<boolean>(candidates.length).fill(false);
  const out: Polyline[] = [];
  let position = start;
  for (let step = 0; step < candidates.length; step++) {
    const pick =
      nearestAvailable(candidates, done, position, true) ??
      nearestAvailable(candidates, done, position, false);
    if (!pick) break;
    done[pick.index] = true;
    const ordered = enterAt(candidates[pick.index].polyline, pick.entry);
    out.push(ordered);
    position = exitPoint(ordered);
    for (const c of candidates[pick.index].containers) candidates[c].pendingInner--;
  }
  return out;
}

/**
 * Containment between polylines: B is inside closed A when A's bounds hold B's, A is larger, and
 * B's first vertex lies inside A. Open polylines are never containers but can be contained, so a
 * score line inside a part is burned before the part is cut free.
 */
function buildContainment(polylines: readonly Polyline[]): Candidate[] {
  const candidates: Candidate[] = polylines.map((polyline) => ({
    polyline,
    bounds: ringBounds(polyline.points),
    containers: [],
    pendingInner: 0,
  }));
  const areas = polylines.map((p) => (p.closed ? Math.abs(signedArea(p.points)) : 0));
  candidates.forEach((outer, j) => {
    if (!outer.polyline.closed || outer.polyline.points.length < 3) return;
    candidates.forEach((inner, i) => {
      if (i === j || areas[i] >= areas[j] || !rectContains(outer.bounds, inner.bounds)) return;
      if (!pointInPolygon(inner.polyline.points[0], outer.polyline.points)) return;
      inner.containers.push(j);
      outer.pendingInner++;
    });
  });
  return candidates;
}

interface Pick {
  index: number;
  /** Vertex index to start at; −1 means traverse an open polyline in reverse. */
  entry: number;
}

function nearestAvailable(
  candidates: readonly Candidate[],
  done: readonly boolean[],
  from: Vec2,
  respectNesting: boolean,
): Pick | null {
  let best: Pick | null = null;
  let bestDistance = Infinity;
  candidates.forEach((c, index) => {
    if (done[index] || (respectNesting && c.pendingInner > 0)) return;
    // The bounds distance is a lower bound for any entry point, so far candidates are skipped cheaply.
    if (pointRectDistance(from, c.bounds) >= bestDistance) return;
    const { entry, distance } = bestEntry(c.polyline, from);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { index, entry };
    }
  });
  return best;
}

function bestEntry(polyline: Polyline, from: Vec2): { entry: number; distance: number } {
  const pts = polyline.points;
  if (!polyline.closed) {
    const toStart = dist(from, pts[0]);
    const toEnd = dist(from, pts[pts.length - 1]);
    return toEnd < toStart ? { entry: -1, distance: toEnd } : { entry: 0, distance: toStart };
  }
  let entry = 0;
  let distance = Infinity;
  pts.forEach((p, i) => {
    const d = dist(from, p);
    if (d < distance) {
      distance = d;
      entry = i;
    }
  });
  return { entry, distance };
}

function enterAt(polyline: Polyline, entry: number): Polyline {
  if (!polyline.closed)
    return entry === -1 ? { points: [...polyline.points].reverse(), closed: false } : polyline;
  if (entry === 0) return polyline;
  return { points: [...polyline.points.slice(entry), ...polyline.points.slice(0, entry)], closed: true };
}

/** Closed polylines return to their first point (see polylineToRun). */
function exitPoint(polyline: Polyline): Vec2 {
  return polyline.closed && polyline.points.length > 2
    ? polyline.points[0]
    : polyline.points[polyline.points.length - 1];
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
