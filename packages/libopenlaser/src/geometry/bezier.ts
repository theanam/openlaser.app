import type { Vec2 } from './types';

/** Default chord tolerance for flattening curves, mm (SPEC §6.1). */
export const DEFAULT_TOLERANCE = 0.01;

/** Below this the subdivision would only chase floating point noise. */
const MIN_TOLERANCE = 1e-4;
/** 2^18 segments per curve is far beyond any useful resolution; guards degenerate input. */
const MAX_DEPTH = 18;

/**
 * Flattens a cubic bezier by adaptive de Casteljau subdivision and appends the resulting points
 * (excluding `p0`, including `p3`) to `out`.
 *
 * A piece counts as flat when both control points lie within `tolerance` of its chord segment.
 * The curve stays inside the convex hull of its control points, so this bounds the chord error.
 */
export function flattenCubic(p0: Vec2, c1: Vec2, c2: Vec2, p3: Vec2, tolerance: number, out: Vec2[]): void {
  const tol = Math.max(Number.isFinite(tolerance) ? tolerance : DEFAULT_TOLERANCE, MIN_TOLERANCE);
  subdivide(p0, c1, c2, p3, tol * tol, out, 0);
}

function subdivide(p0: Vec2, c1: Vec2, c2: Vec2, p3: Vec2, tolSq: number, out: Vec2[], depth: number): void {
  if (
    depth >= MAX_DEPTH ||
    (distanceToSegmentSq(c1, p0, p3) <= tolSq && distanceToSegmentSq(c2, p0, p3) <= tolSq)
  ) {
    out.push({ x: p3.x, y: p3.y });
    return;
  }
  const p01 = mid(p0, c1);
  const p12 = mid(c1, c2);
  const p23 = mid(c2, p3);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const m = mid(p012, p123);
  subdivide(p0, p01, p012, m, tolSq, out, depth + 1);
  subdivide(m, p123, p23, p3, tolSq, out, depth + 1);
}

function mid(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Squared distance from `p` to the segment a–b. */
export function distanceToSegmentSq(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const ex = a.x + t * dx - p.x;
  const ey = a.y + t * dy - p.y;
  return ex * ex + ey * ey;
}

/** Point on a cubic bezier at parameter t (used by tests and hit-testing). */
export function cubicPoint(p0: Vec2, c1: Vec2, c2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p3.x, y: a * p0.y + b * c1.y + c * c2.y + d * p3.y };
}
