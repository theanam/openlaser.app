import type { Rect, Vec2 } from './types';

export type FillRule = 'evenodd' | 'nonzero';

/** Shoelace area. Positive for counter-clockwise rings in Y-up space. */
export function signedArea(ring: readonly Vec2[]): number {
  let sum = 0;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) sum += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y);
  return sum / 2;
}

export function isCounterClockwise(ring: readonly Vec2[]): boolean {
  return signedArea(ring) > 0;
}

/** Winding number of `ring` around `p` (0 when outside). Points on an edge are unspecified. */
export function windingNumber(p: Vec2, ring: readonly Vec2[]): number {
  let winding = 0;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[j];
    const b = ring[i];
    if (a.y <= p.y) {
      if (b.y > p.y && cross(a, b, p) > 0) winding++;
    } else if (b.y <= p.y && cross(a, b, p) < 0) {
      winding--;
    }
  }
  return winding;
}

/** Even-odd point-in-polygon test for a single ring. Points on an edge are unspecified. */
export function pointInPolygon(p: Vec2, ring: readonly Vec2[]): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[j];
    const b = ring[i];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Point-in-region test for a set of rings forming one compound shape. */
export function pointInRings(
  p: Vec2,
  rings: readonly (readonly Vec2[])[],
  rule: FillRule = 'evenodd',
): boolean {
  if (rule === 'evenodd') {
    let inside = false;
    for (const ring of rings) if (pointInPolygon(p, ring)) inside = !inside;
    return inside;
  }
  let winding = 0;
  for (const ring of rings) winding += windingNumber(p, ring);
  return winding !== 0;
}

export function ringBounds(ring: readonly Vec2[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function rectContains(outer: Rect, inner: Rect, epsilon = 1e-9): boolean {
  return (
    inner.minX >= outer.minX - epsilon &&
    inner.minY >= outer.minY - epsilon &&
    inner.maxX <= outer.maxX + epsilon &&
    inner.maxY <= outer.maxY + epsilon
  );
}

/** Distance between two rectangles, 0 when they overlap. */
export function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

/** Distance from a point to a rectangle, 0 inside. */
export function pointRectDistance(p: Vec2, r: Rect): number {
  const dx = Math.max(0, r.minX - p.x, p.x - r.maxX);
  const dy = Math.max(0, r.minY - p.y, p.y - r.maxY);
  return Math.hypot(dx, dy);
}

function cross(a: Vec2, b: Vec2, p: Vec2): number {
  return (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
}
