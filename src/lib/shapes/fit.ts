/* Stretching generated outlines to fill their box. Radial shapes are built on the box's inscribed ellipse,
   so their drawn extent falls a little short of the box; for cutting, the box should be the real size. */
import type { Box } from './builder';
import type { PathNode, Subpath, Vec } from './internal-types';

/** Parameters in (0,1) where one axis of the cubic p0..p3 has a local extremum. */
function extremaT(p0: number, p1: number, p2: number, p3: number): number[] {
  // Derivative coefficients of the cubic: a·t² + b·t + c.
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      roots.push((-b + s) / (2 * a), (-b - s) / (2 * a));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

const cubicAt = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

/** Exact bounds [minX, minY, maxX, maxY] of the subpaths' outlines (not their control points). */
function bounds(subpaths: Subpath[]): [number, number, number, number] {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number) => {
    b[0] = Math.min(b[0], x);
    b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x);
    b[3] = Math.max(b[3], y);
  };
  for (const sp of subpaths) {
    const n = sp.nodes;
    n.forEach((node) => add(node.x, node.y));
    const edges = sp.closed ? n.length : n.length - 1;
    for (let i = 0; i < edges; i++) {
      const from = n[i];
      const to = n[(i + 1) % n.length];
      if (!from.out && !to.in) continue;
      const c1 = from.out ?? [from.x, from.y];
      const c2 = to.in ?? [to.x, to.y];
      const xs = [from.x, c1[0], c2[0], to.x] as const;
      const ys = [from.y, c1[1], c2[1], to.y] as const;
      for (const t of [...extremaT(...xs), ...extremaT(...ys)]) add(cubicAt(...xs, t), cubicAt(...ys, t));
    }
  }
  return b;
}

/** Maps the subpaths (anchors and handles) so their outline bounds fill the box exactly. */
export function fitToBox(subpaths: Subpath[], { w, h }: Box): Subpath[] {
  const [x0, y0, x1, y1] = bounds(subpaths);
  const sx = w / (x1 - x0 || 1);
  const sy = h / (y1 - y0 || 1);
  const map = (v: Vec | null): Vec | null => v && [(v[0] - x0) * sx, (v[1] - y0) * sy];
  return subpaths.map((sp) => ({
    closed: sp.closed,
    nodes: sp.nodes.map((n): PathNode => ({
      x: (n.x - x0) * sx,
      y: (n.y - y0) * sy,
      in: map(n.in),
      out: map(n.out),
    })),
  }));
}
