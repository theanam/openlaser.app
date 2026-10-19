/** Line mode (SPEC §6.2): flatten paths, apply kerf offset to closed contours. */
import { offsetRings } from '../../geometry/clipper';
import { flattenPaths } from '../../geometry/path';
import { pointInPolygon, ringBounds, rectContains, signedArea } from '../../geometry/polygon';
import type { Polyline, Vec2 } from '../../geometry/types';
import type { VectorObject } from '../../project/types';

/**
 * Flattened polylines of all objects in document order (object order, then path order).
 * With a non-zero kerf, closed contours are offset per object (see `applyKerf`); open paths are kept.
 */
export function linePolylines(
  objects: readonly VectorObject[],
  kerfOffset: number,
  tolerance: number,
): Polyline[] {
  const out: Polyline[] = [];
  for (const object of objects) {
    const polylines = flattenPaths(object.paths, object.transform, tolerance).filter(
      (p) => p.points.length > 1,
    );
    out.push(...(kerfOffset === 0 ? polylines : applyKerf(polylines, kerfOffset)));
  }
  return out;
}

/**
 * Offsets closed contours by the kerf so the cut part keeps its designed size.
 * Each contour is offset on its own; its direction comes from its nesting depth within the
 * object's closed contours: even depth (an outline) grows, odd depth (a hole) shrinks for a
 * positive kerf. Offsetting contours individually keeps overlapping shapes as separate cuts.
 */
export function applyKerf(polylines: readonly Polyline[], kerfOffset: number): Polyline[] {
  const closed = polylines.filter((p) => p.closed && p.points.length > 2);
  const depths = nestingDepths(closed.map((p) => p.points));
  const out: Polyline[] = [];
  let closedIndex = 0;
  for (const polyline of polylines) {
    if (!polyline.closed || polyline.points.length <= 2) {
      out.push(polyline);
      continue;
    }
    const delta = depths[closedIndex++] % 2 === 0 ? kerfOffset : -kerfOffset;
    for (const ring of offsetRings([polyline.points], delta)) {
      if (ring.length > 2) out.push({ points: ring, closed: true });
    }
  }
  return out;
}

/** For each ring, how many of the other rings contain it. */
export function nestingDepths(rings: readonly (readonly Vec2[])[]): number[] {
  const bounds = rings.map(ringBounds);
  const areas = rings.map((r) => Math.abs(signedArea(r)));
  return rings.map((ring, i) => {
    let depth = 0;
    for (let j = 0; j < rings.length; j++) {
      if (j === i || areas[j] <= areas[i] || !rectContains(bounds[j], bounds[i])) continue;
      if (pointInPolygon(ring[0], rings[j])) depth++;
    }
    return depth;
  });
}
