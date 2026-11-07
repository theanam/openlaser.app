/* Curvesmith's node-based path representation and curve fitting, kept private to the trace module so the
   engine ports unchanged. Coordinates are pixels, Y-down; to-paths.ts maps them to PathData. */

export type Vec = [number, number];

export type NodeKind = 'sharp' | 'smooth';

/** An anchor with optional absolute bezier handles on either side. */
export type PathNode = { x: number; y: number; in: Vec | null; out: Vec | null; kind: NodeKind };

export type Subpath = { closed: boolean; nodes: PathNode[] };

type Bez = [Vec, Vec, Vec, Vec];

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function normalize(a: Vec): Vec {
  const l = Math.hypot(a[0], a[1]);
  return l < 1e-12 ? [0, 0] : [a[0] / l, a[1] / l];
}

function bezierPoint(b: Bez, t: number): Vec {
  const mt = 1 - t;
  return [
    mt * mt * mt * b[0][0] + 3 * mt * mt * t * b[1][0] + 3 * mt * t * t * b[2][0] + t * t * t * b[3][0],
    mt * mt * mt * b[0][1] + 3 * mt * mt * t * b[1][1] + 3 * mt * t * t * b[2][1] + t * t * t * b[3][1],
  ];
}

/* Schneider's "An Algorithm for Automatically Fitting Digitized Curves" (Graphics Gems, 1990). */

function chordLengthParams(points: Vec[], first: number, last: number): number[] {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + dist(points[i], points[i - 1]));
  const total = u[u.length - 1] || 1;
  return u.map((x) => x / total);
}

function generateBezier(
  points: Vec[],
  first: number,
  last: number,
  u: number[],
  tHat1: Vec,
  tHat2: Vec,
): Bez {
  const p0 = points[first];
  const p3 = points[last];
  const C = [
    [0, 0],
    [0, 0],
  ];
  const X = [0, 0];
  for (let i = 0; i < u.length; i++) {
    const t = u[i];
    const mt = 1 - t;
    const a1 = mul(tHat1, 3 * mt * mt * t);
    const a2 = mul(tHat2, 3 * mt * t * t);
    C[0][0] += dot(a1, a1);
    C[0][1] += dot(a1, a2);
    C[1][0] += dot(a1, a2);
    C[1][1] += dot(a2, a2);
    const shortfall = sub(points[first + i], bezierPoint([p0, p0, p3, p3], t));
    X[0] += dot(a1, shortfall);
    X[1] += dot(a2, shortfall);
  }
  const det = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  let alpha1 = 0;
  let alpha2 = 0;
  if (Math.abs(det) > 1e-12) {
    alpha1 = (X[0] * C[1][1] - X[1] * C[0][1]) / det;
    alpha2 = (C[0][0] * X[1] - C[1][0] * X[0]) / det;
  }
  const segLen = dist(p0, p3);
  const eps = 1e-6 * segLen;
  if (alpha1 < eps || alpha2 < eps) {
    alpha1 = alpha2 = segLen / 3;
  }
  return [p0, add(p0, mul(tHat1, alpha1)), add(p3, mul(tHat2, alpha2)), p3];
}

function newtonRaphson(b: Bez, p: Vec, u: number): number {
  const d1: Vec[] = [0, 1, 2].map((i) => mul(sub(b[i + 1], b[i]), 3));
  const d2: Vec[] = [0, 1].map((i) => mul(sub(d1[i + 1], d1[i]), 2));
  const q = bezierPoint(b, u);
  const mt = 1 - u;
  const q1: Vec = add(add(mul(d1[0], mt * mt), mul(d1[1], 2 * mt * u)), mul(d1[2], u * u));
  const q2: Vec = add(mul(d2[0], mt), mul(d2[1], u));
  const diff = sub(q, p);
  const num = dot(diff, q1);
  const den = dot(q1, q1) + dot(diff, q2);
  if (Math.abs(den) < 1e-12) return u;
  return u - num / den;
}

function maxError(points: Vec[], first: number, last: number, b: Bez, u: number[]): [number, number] {
  let max = 0;
  let split = Math.floor((last - first + 1) / 2) + first;
  for (let i = first + 1; i < last; i++) {
    const d = dist(bezierPoint(b, u[i - first]), points[i]);
    if (d > max) {
      max = d;
      split = i;
    }
  }
  return [max, split];
}

function fitCubic(
  points: Vec[],
  first: number,
  last: number,
  tHat1: Vec,
  tHat2: Vec,
  error: number,
  out: Bez[],
  depth = 0,
) {
  if (last - first === 1) {
    const d = dist(points[first], points[last]) / 3;
    out.push([
      points[first],
      add(points[first], mul(tHat1, d)),
      add(points[last], mul(tHat2, d)),
      points[last],
    ]);
    return;
  }
  let u = chordLengthParams(points, first, last);
  let b = generateBezier(points, first, last, u, tHat1, tHat2);
  let [err, split] = maxError(points, first, last, b, u);
  if (err < error) {
    out.push(b);
    return;
  }
  if (err < error * 4) {
    for (let k = 0; k < 6; k++) {
      u = u.map((x, i) => newtonRaphson(b, points[first + i], x));
      b = generateBezier(points, first, last, u, tHat1, tHat2);
      [err, split] = maxError(points, first, last, b, u);
      if (err < error) {
        out.push(b);
        return;
      }
    }
  }
  if (depth > 32) {
    out.push(b);
    return;
  }
  const center = normalize(sub(points[split - 1], points[split + 1]));
  fitCubic(points, first, split, tHat1, center, error, out, depth + 1);
  fitCubic(points, split, last, mul(center, -1), tHat2, error, out, depth + 1);
}

/** Remove points closer than `minDist` to the previous kept point. */
function dedupe(points: Vec[], minDist = 0.5): Vec[] {
  const out: Vec[] = [];
  for (const p of points) if (!out.length || dist(out[out.length - 1], p) >= minDist) out.push(p);
  return out;
}

/**
 * Fit a polyline with cubic Béziers within `error` and return a subpath. `tangents` overrides the
 * unit tangents at the start and end (pointing into the curve), e.g. to keep a closed seam smooth.
 */
export function fitCurve(rawPoints: Vec[], error = 2, closed = false, tangents?: [Vec, Vec]): Subpath {
  const points = dedupe(rawPoints);
  if (points.length < 2) {
    const p = points[0] ?? [0, 0];
    return { closed: false, nodes: [{ x: p[0], y: p[1], in: null, out: null, kind: 'sharp' }] };
  }
  const tHat1 = tangents?.[0] ?? normalize(sub(points[1], points[0]));
  const tHat2 = tangents?.[1] ?? normalize(sub(points[points.length - 2], points[points.length - 1]));
  const beziers: Bez[] = [];
  fitCubic(points, 0, points.length - 1, tHat1, tHat2, error, beziers);
  const nodes: PathNode[] = [];
  beziers.forEach((b, i) => {
    if (i === 0) nodes.push({ x: b[0][0], y: b[0][1], in: null, out: b[1], kind: 'sharp' });
    else nodes[nodes.length - 1].out = b[1];
    nodes.push({ x: b[3][0], y: b[3][1], in: b[2], out: null, kind: 'smooth' });
  });
  nodes[nodes.length - 1].kind = 'sharp';
  if (closed && nodes.length > 2) {
    const last = nodes[nodes.length - 1];
    nodes.pop();
    nodes[0].in = last.in;
    nodes[0].kind = 'smooth';
  }
  return { closed, nodes };
}

/** Polyline through a subpath's segments, each cubic sampled evenly by its rough length. */
export function flattenSubpath(sp: Subpath, tolerance = 0.25): Vec[] {
  const nodes = sp.nodes;
  if (nodes.length === 1) return [[nodes[0].x, nodes[0].y]];
  const out: Vec[] = [[nodes[0].x, nodes[0].y]];
  const count = sp.closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < count; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    const p0: Vec = [a.x, a.y];
    const p3: Vec = [b.x, b.y];
    if (!a.out && !b.in) {
      out.push(p3);
      continue;
    }
    const c: Bez = [p0, a.out ?? p0, b.in ?? p3, p3];
    let l = 0;
    let prev = p0;
    for (let k = 1; k <= 8; k++) {
      const p = bezierPoint(c, k / 8);
      l += dist(prev, p);
      prev = p;
    }
    const n = Math.max(2, Math.min(256, Math.ceil(Math.sqrt(l / tolerance))));
    for (let k = 1; k <= n; k++) out.push(bezierPoint(c, k / n));
  }
  return out;
}
