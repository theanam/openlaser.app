/* Turning a pixel-edge loop into a smooth subpath:
   1. Staircase removal: every lattice segment contributes its midpoint, so 1-pixel steps read as the
      slope they approximate. Vertices between two long segments stay, which keeps real corners square.
   2. Corners: lattice corners between long runs, plus points where the outline bends sharper than the
      threshold over a few pixels of arc length.
   3. Each run between corners is lightly smoothed and fitted with cubic Béziers (Schneider). Fitted pieces
      that are nearly straight become plain lines. */
import { fitCurve, type PathNode, type Subpath, type Vec } from './geom';

/** Lattice segments at least this long are edges in their own right; shorter ones are staircase steps. */
const LONG = 3;
/** Loops shorter than this (in pixels of outline) never get angle-detected corners. */
const SMALL_LOOP = 20;

export type CurveOptions = {
  /** Max distance in pixels between the curves and the outline points. */
  error: number;
  /** Bends sharper than this angle in degrees are corners; 0 turns corners off. */
  cornerAngle: number;
  /** Smoothing passes over the outline points before fitting (0–3). */
  smoothing: number;
};

/** Outline points for a lattice loop of turning vertices, and which of them are lattice corners. */
export function outlinePoints(loop: Int32Array): { points: Vec[]; lattice: boolean[] } {
  const n = loop.length / 2;
  const points: Vec[] = [];
  const lattice: boolean[] = [];
  const seg = (i: number) => {
    const j = (i + 1) % n;
    return Math.abs(loop[j * 2] - loop[i * 2]) + Math.abs(loop[j * 2 + 1] - loop[i * 2 + 1]);
  };
  for (let i = 0; i < n; i++) {
    const prev = seg((i + n - 1) % n);
    const next = seg(i);
    if (prev >= LONG && next >= LONG) {
      points.push([loop[i * 2], loop[i * 2 + 1]]);
      lattice.push(true);
    }
    const j = (i + 1) % n;
    points.push([(loop[i * 2] + loop[j * 2]) / 2, (loop[i * 2 + 1] + loop[j * 2 + 1]) / 2]);
    lattice.push(false);
  }
  return { points, lattice };
}

/** Point at arc distance `d` from point i, walking forward (dir 1) or backward (-1) around the closed polyline. */
function walk(points: Vec[], i: number, d: number, dir: 1 | -1): Vec {
  const n = points.length;
  let left = d;
  let a = points[i];
  for (let k = 1; k < n; k++) {
    const b = points[(i + dir * k + n * 2) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len >= left) {
      const t = left / len;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= len;
    a = b;
  }
  return a;
}

function angleAt(p: Vec, a: Vec, b: Vec) {
  const ux = a[0] - p[0];
  const uy = a[1] - p[1];
  const vx = b[0] - p[0];
  const vy = b[1] - p[1];
  const den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (!den) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / den))) * 180) / Math.PI;
}

function perimeter(points: Vec[]) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
}

const cornerReach = (len: number) => Math.min(4, len / 8);

/** The angle at each outline point between the outline on either side, in degrees (180 = straight). */
export function outlineAngles(points: Vec[], r = cornerReach(perimeter(points))): number[] {
  // Each side's direction points at the centroid of the outline over the next r pixels, which shrugs off
  // stair steps while still seeing where two edges meet.
  const side = (i: number, dir: 1 | -1): Vec => {
    let x = 0;
    let y = 0;
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const q = walk(points, i, r * f, dir);
      x += q[0] / 4;
      y += q[1] / 4;
    }
    return [x, y];
  };
  return points.map((p, i) => angleAt(p, side(i, -1), side(i, 1)));
}

/** Indices of corner points, in order. */
export function findCorners(points: Vec[], lattice: boolean[], cornerAngle: number): number[] {
  if (cornerAngle <= 0) return [];
  const n = points.length;
  const len = perimeter(points);
  const r = cornerReach(len);
  const angles = outlineAngles(points, r);
  const candidate = points.map(
    (_, i) => (lattice[i] && angles[i] < 135) || (len >= SMALL_LOOP && angles[i] <= cornerAngle),
  );
  // Keep the sharpest point of each run of neighboring candidates.
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!candidate[i]) continue;
    let sharpest = true;
    for (const dir of [-1, 1] as const) {
      let dist = 0;
      for (let k = 1; k < n && dist < r; k++) {
        const j = (i + dir * k + n) % n;
        const pj = points[j];
        const pk = points[(i + dir * (k - 1) + n) % n];
        dist += Math.hypot(pj[0] - pk[0], pj[1] - pk[1]);
        if (dist >= r) break;
        if (candidate[j] && (angles[j] < angles[i] || (angles[j] === angles[i] && j < i))) sharpest = false;
      }
    }
    if (sharpest) out.push(i);
  }
  return out;
}

/** [1,2,1] smoothing passes with both ends pinned (open) or wrapping around (closed). */
export function smoothRun(points: Vec[], passes: number, closed: boolean): Vec[] {
  let pts = points;
  const n = pts.length;
  if (n < 3) return pts;
  for (let p = 0; p < passes; p++) {
    pts = pts.map((q, i) => {
      if (!closed && (i === 0 || i === n - 1)) return q;
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      return [(a[0] + 2 * q[0] + b[0]) / 4, (a[1] + 2 * q[1] + b[1]) / 4] as Vec;
    });
  }
  return pts;
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const unit = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

/** Distance from p to the line through a and b. */
function offLine(p: Vec, a: Vec, b: Vec) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  if (!l) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / l;
}

/** Turn nearly straight segments into lines (no handles). */
function straighten(nodes: PathNode[], closed: boolean, tol: number) {
  const n = nodes.length;
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % n];
    const pa: Vec = [a.x, a.y];
    const pb: Vec = [b.x, b.y];
    const ho = a.out ?? pa;
    const hi = b.in ?? pb;
    if (offLine(ho, pa, pb) <= tol && offLine(hi, pa, pb) <= tol) {
      a.out = null;
      b.in = null;
      a.kind = 'sharp';
      b.kind = 'sharp';
    }
  }
}

/** How far the curve turns across one segment, in degrees. */
function turning(a: PathNode, b: PathNode) {
  const t0 = unit(sub(a.out ?? [b.x, b.y], [a.x, a.y]));
  const t1 = unit(sub([b.x, b.y], b.in ?? [a.x, a.y]));
  return (Math.acos(Math.max(-1, Math.min(1, t0[0] * t1[0] + t0[1] * t1[1]))) * 180) / Math.PI;
}

/** Index where the run has turned half of its total turning. */
function halfTurn(pts: Vec[]): number {
  const turns: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = unit(sub(pts[i], pts[i - 1]));
    const b = unit(sub(pts[i + 1], pts[i]));
    total += Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]));
    turns.push(total);
  }
  const i = turns.findIndex((t) => t >= total / 2);
  return Math.max(2, Math.min(pts.length - 3, i < 0 ? pts.length >> 1 : i));
}

/** Direction into the run from its first point, read a few pixels along so stair steps do not skew it. */
function endTangent(pts: Vec[]): Vec {
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const reach = Math.min(4, len / 3);
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d >= reach) return unit(sub(pts[i], pts[0]));
  }
  return unit(sub(pts[pts.length - 1], pts[0]));
}

/** Direction of an open run at index m, read over a few pixels on each side. */
function tangentAt(pts: Vec[], m: number, reach = 3): Vec {
  const along = (dir: 1 | -1) => {
    let d = 0;
    let i = m;
    while (i + dir >= 0 && i + dir < pts.length && d < reach) {
      d += Math.hypot(pts[i + dir][0] - pts[i][0], pts[i + dir][1] - pts[i][1]);
      i += dir;
    }
    return pts[i];
  };
  return unit(sub(along(1), along(-1)));
}

/** Most a single cubic may turn before the run is split at its middle and refitted. */
const MAX_TURN = 100;

/** Fit an open run; returns nodes from first point to last. Tangents point into the run at each end. */
function fitRun(pts: Vec[], error: number, t0?: Vec, t1?: Vec): PathNode[] {
  const a = pts[0];
  const z = pts[pts.length - 1];
  if (!t0 && !t1 && pts.every((p) => offLine(p, a, z) <= error * 0.75)) return [sharpNode(a), sharpNode(z)];
  const tangents: [Vec, Vec] = [t0 ?? endTangent(pts), t1 ?? endTangent([...pts].reverse())];
  const nodes = fitCurve(pts, error, false, tangents).nodes;
  if (nodes.length < 2) return [sharpNode(a), sharpNode(z)];
  if (pts.length >= 8 && nodes.some((n, i) => i > 0 && turning(nodes[i - 1], n) > MAX_TURN)) {
    const m = halfTurn(pts);
    const tm = tangentAt(pts, m);
    const a = fitRun(pts.slice(0, m + 1), error, t0, [-tm[0], -tm[1]]);
    const b = fitRun(pts.slice(m), error, tm, t1);
    const joint = a[a.length - 1];
    joint.out = b[0].out;
    joint.kind = 'smooth';
    return [...a, ...b.slice(1)];
  }
  return nodes;
}

/** Extremes of a closed outline (leftmost, topmost, …), each at the middle of its flat run, with exact tangents. */
function extremes(pts: Vec[]): { i: number; t: Vec }[] {
  const n = pts.length;
  const found = new Map<number, Vec>();
  for (const axis of [0, 1] as const)
    for (const sign of [-1, 1]) {
      let best = Infinity;
      for (const p of pts) best = Math.min(best, sign * p[axis]);
      // The flat run of extreme points can wrap around index 0, so walk from a non-extreme point.
      const on = pts.map((p) => Math.abs(sign * p[axis] - best) < 1e-6);
      const off = on.indexOf(false);
      if (off < 0) continue;
      for (let k = 1; k <= n; k++) {
        const s = (off + k) % n;
        if (!on[s] || on[(s - 1 + n) % n]) continue;
        let len = 0;
        while (on[(s + len) % n] && len < n) len++;
        const i = (s + (len >> 1)) % n;
        const d = sub(pts[(i + 1) % n], pts[(i - 1 + n) % n]);
        const t: Vec = axis === 0 ? [0, Math.sign(d[1]) || 1] : [Math.sign(d[0]) || 1, 0];
        found.set(i, t);
        break;
      }
    }
  return [...found].map(([i, t]) => ({ i, t })).sort((a, b) => a.i - b.i);
}

/** Fit one closed lattice loop with curves. */
export function loopToSubpath(loop: Int32Array, opts: CurveOptions): Subpath {
  const { points, lattice } = outlinePoints(loop);
  const corners = findCorners(points, lattice, opts.cornerAngle);
  // Only near-flat handles: on long gentle arcs a looser test would turn curves into polygons.
  const tol = Math.min(0.25, opts.error * 0.25);
  let nodes: PathNode[];
  if (!corners.length) {
    const pts = smoothRun(points, opts.smoothing, true);
    if (pts.length < 4) return { closed: true, nodes: pts.map((p) => sharpNode(p)) };
    const ext = extremes(pts);
    if (ext.length < 2) {
      const t = unit(sub(pts[1], pts[pts.length - 1]));
      const sp = fitCurve([...pts, pts[0]], opts.error, true, [t, [-t[0], -t[1]]]);
      straighten(sp.nodes, true, tol);
      return sp;
    }
    nodes = [];
    ext.forEach((e, k) => {
      const next = ext[(k + 1) % ext.length];
      const run: Vec[] = [];
      for (let i = e.i; ; i = (i + 1) % pts.length) {
        run.push(pts[i]);
        if (i === next.i && run.length > 1) break;
      }
      const fitted = fitRun(run, opts.error, e.t, [-next.t[0], -next.t[1]]);
      if (nodes.length) nodes[nodes.length - 1].out = fitted[0].out;
      nodes.push(...(nodes.length ? fitted.slice(1) : fitted));
    });
    const last = nodes.pop()!;
    if (nodes.length) nodes[0].in = last.in;
    for (const n of nodes) n.kind = 'smooth';
  } else {
    nodes = [];
    for (let c = 0; c < corners.length; c++) {
      const from = corners[c];
      const to = corners[(c + 1) % corners.length];
      const run: Vec[] = [];
      for (let i = from; ; i = (i + 1) % points.length) {
        run.push(points[i]);
        if (i === to && run.length > 1) break;
      }
      const fitted = fitRun(smoothRun(run, opts.smoothing, false), opts.error);
      fitted[0].kind = 'sharp';
      if (nodes.length) nodes[nodes.length - 1].out = fitted[0].out;
      nodes.push(...(nodes.length ? fitted.slice(1) : fitted));
    }
    // The last run ends on the first corner: fold it into the first node.
    const last = nodes.pop()!;
    if (nodes.length) {
      nodes[0].in = last.in;
      nodes[0].kind = 'sharp';
    }
  }
  if (nodes.length < 2) return { closed: true, nodes: points.map((p) => sharpNode(p)) };
  straighten(nodes, true, tol);
  return { closed: true, nodes };
}

const sharpNode = (p: Vec): PathNode => ({ x: p[0], y: p[1], in: null, out: null, kind: 'sharp' });
