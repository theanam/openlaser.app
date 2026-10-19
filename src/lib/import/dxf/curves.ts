/** DXF curve primitives as openlaser path segments: arcs and ellipses as cubics, splines sampled. */
import type { Segment, Vec2 } from '../../geometry/types';

const TAU = Math.PI * 2;

/**
 * Elliptical arc from parameter t0 to t1 (radians, signed sweep) as cubic beziers of at most 90°.
 * `major` is the semi-major axis vector; the minor axis is `ratio` times it, turned 90° CCW.
 */
export function ellipseArc(
  center: Vec2,
  major: Vec2,
  ratio: number,
  t0: number,
  t1: number,
): { start: Vec2; segments: Segment[] } {
  const minor = { x: -major.y * ratio, y: major.x * ratio };
  const at = (t: number) => ({
    x: center.x + major.x * Math.cos(t) + minor.x * Math.sin(t),
    y: center.y + major.y * Math.cos(t) + minor.y * Math.sin(t),
  });
  const tangent = (t: number) => ({
    x: -major.x * Math.sin(t) + minor.x * Math.cos(t),
    y: -major.y * Math.sin(t) + minor.y * Math.cos(t),
  });
  const sweep = t1 - t0;
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
  const step = sweep / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const start = at(t0);
  const segments: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const a = t0 + i * step;
    const b = a + step;
    const p0 = at(a);
    const p3 = i === n - 1 && Math.abs(Math.abs(sweep) - TAU) < 1e-9 ? start : at(b);
    const d0 = tangent(a);
    const d1 = tangent(b);
    segments.push({
      type: 'C',
      c1: { x: p0.x + k * d0.x, y: p0.y + k * d0.y },
      c2: { x: p3.x - k * d1.x, y: p3.y - k * d1.y },
      to: p3,
    });
  }
  return { start, segments };
}

/** A polyline segment with a bulge (tan of a quarter of the included angle, positive = CCW). */
export function bulgeSegments(p1: Vec2, p2: Vec2, bulge: number): Segment[] {
  if (Math.abs(bulge) < 1e-9 || (p1.x === p2.x && p1.y === p2.y)) return [{ type: 'L', to: p2 }];
  const k = (1 - bulge * bulge) / (4 * bulge);
  const c = {
    x: (p1.x + p2.x) / 2 - (p2.y - p1.y) * k,
    y: (p1.y + p2.y) / 2 + (p2.x - p1.x) * k,
  };
  const r = Math.hypot(p1.x - c.x, p1.y - c.y);
  const a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
  const { segments } = ellipseArc(c, { x: r, y: 0 }, 1, a1, a1 + 4 * Math.atan(bulge));
  const last = segments[segments.length - 1]!;
  segments[segments.length - 1] = { ...last, to: p2 };
  return segments;
}

export interface SplineInput {
  degree: number;
  knots: number[];
  control: Vec2[];
  weights: number[];
  fit: Vec2[];
  closed: boolean;
}

const SAMPLES_PER_SPAN = 24;

/** NURBS by de Boor, sampled per knot span. Fit-point-only splines become Catmull-Rom cubics. */
export function splineSegments(s: SplineInput): { start: Vec2; segments: Segment[] } | null {
  if (s.control.length < 2) return s.fit.length >= 2 ? catmullRom(s.fit, s.closed) : null;
  const p = Math.max(1, Math.min(s.degree, s.control.length - 1));
  const n = s.control.length - 1;
  const knots = s.knots.length === n + p + 2 ? s.knots : clampedKnots(n, p);
  const w = s.control.map((_, i) => (s.weights[i] && s.weights[i]! > 0 ? s.weights[i]! : 1));
  const point = (u: number): Vec2 => {
    let k = p;
    while (k < n && knots[k + 1]! <= u) k++;
    const d = Array.from({ length: p + 1 }, (_, j) => {
      const c = s.control[j + k - p]!;
      const wj = w[j + k - p]!;
      return { x: c.x * wj, y: c.y * wj, w: wj };
    });
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const i = j + k - p;
        const denom = knots[i + p - r + 1]! - knots[i]!;
        const a = denom === 0 ? 0 : (u - knots[i]!) / denom;
        const lo = d[j - 1]!;
        const hi = d[j]!;
        d[j] = { x: (1 - a) * lo.x + a * hi.x, y: (1 - a) * lo.y + a * hi.y, w: (1 - a) * lo.w + a * hi.w };
      }
    }
    const r = d[p]!;
    return { x: r.x / r.w, y: r.y / r.w };
  };
  const segments: Segment[] = [];
  for (let k = p; k <= n; k++) {
    const u0 = knots[k]!;
    const u1 = knots[k + 1]!;
    if (u1 <= u0) continue;
    for (let i = 1; i <= SAMPLES_PER_SPAN; i++) {
      segments.push({ type: 'L', to: point(u0 + ((u1 - u0) * i) / SAMPLES_PER_SPAN) });
    }
  }
  return segments.length ? { start: point(knots[p]!), segments } : null;
}

function clampedKnots(n: number, p: number): number[] {
  const inner = n - p;
  return Array.from({ length: n + p + 2 }, (_, i) => (i <= p ? 0 : i > n ? 1 : (i - p) / (inner + 1)));
}

function catmullRom(points: Vec2[], closed: boolean): { start: Vec2; segments: Segment[] } {
  const pts = closed ? points : [points[0]!, ...points, points[points.length - 1]!];
  const get = (i: number) => (closed ? pts[(i + pts.length) % pts.length]! : pts[i]!);
  const segments: Segment[] = [];
  const from = closed ? 0 : 1;
  const to = closed ? pts.length : pts.length - 2;
  for (let i = from; i < to; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    segments.push({
      type: 'C',
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      to: p2,
    });
  }
  return { start: points[0]!, segments };
}
