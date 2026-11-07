/* Shared building blocks for the shape generators: a small path builder, radial point helpers and the
   signature every generator implements. */
import type { PathNode, ShapeParams, Subpath, Vec } from './internal-types';

export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The box a generator draws into (Y-down), with its centre and shorter side precomputed. */
export type Box = { w: number; h: number; cx: number; cy: number; m: number };

/** Reads a numeric parameter, falling back when it is missing or not finite. */
export type Param = (key: string, fallback: number) => number;

export type ShapeGen = (box: Box, p: Param, params: ShapeParams) => Subpath[];

/** Small path builder with elliptical arcs approximated by cubics (≤ 90° per segment). */
export class PathBuilder {
  subpaths: Subpath[] = [];
  private cur: PathNode[] | null = null;

  private get last(): PathNode | null {
    return this.cur?.[this.cur.length - 1] ?? null;
  }

  move(x: number, y: number) {
    this.cur = [{ x, y, in: null, out: null }];
    this.subpaths.push({ closed: false, nodes: this.cur });
    return this;
  }

  line(x: number, y: number) {
    const l = this.last;
    if (!this.cur || !l) return this.move(x, y);
    // Skip zero-length edges so closing never produces a degenerate segment.
    if (Math.abs(l.x - x) < 1e-9 && Math.abs(l.y - y) < 1e-9) return this;
    this.cur.push({ x, y, in: null, out: null });
    return this;
  }

  cubic(c1: Vec, c2: Vec, x: number, y: number) {
    const l = this.last;
    if (!this.cur || !l) this.move(x, y);
    else {
      l.out = c1;
      this.cur.push({ x, y, in: c2, out: null });
    }
    return this;
  }

  /** Arc of the ellipse (cx, cy, rx, ry) from angle a0 to a1 (radians, y-down; a1 < a0 runs backwards). */
  arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number) {
    const pt = (a: number): Vec => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
    const start = pt(a0);
    if (!this.cur) this.move(start[0], start[1]);
    else this.line(start[0], start[1]);
    const sweep = a1 - a0;
    const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
    const d = sweep / n;
    const k = (4 / 3) * Math.tan(d / 4);
    for (let i = 0; i < n; i++) {
      const s = a0 + d * i;
      const e = s + d;
      const p0 = pt(s);
      const p3 = pt(e);
      this.cubic(
        [p0[0] - k * rx * Math.sin(s), p0[1] + k * ry * Math.cos(s)],
        [p3[0] + k * rx * Math.sin(e), p3[1] - k * ry * Math.cos(e)],
        p3[0],
        p3[1],
      );
    }
    return this;
  }

  poly(points: Vec[]) {
    points.forEach(([x, y], i) => (i ? this.line(x, y) : this.move(x, y)));
    return this.close();
  }

  /** Closes the current subpath, merging a final node that lands on the first one. */
  close() {
    const c = this.cur;
    if (c && c.length > 1) {
      const f = c[0];
      const l = c[c.length - 1];
      if (Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) {
        f.in = l.in;
        c.pop();
      }
    }
    if (c) this.subpaths[this.subpaths.length - 1].closed = true;
    this.cur = null;
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number) {
    this.cur = null;
    this.arc(cx, cy, rx, ry, 0, Math.PI * 2);
    return this.close();
  }
}

export const polygon = (points: Vec[]): Subpath[] => new PathBuilder().poly(points).subpaths;

/** Point at angle `a` on the ellipse inscribed in the box, scaled by relative radius `r` (1 = edge). */
export const onEllipse = ({ cx, cy, w, h }: Box, a: number, r: number): Vec => [
  cx + (Math.cos(a) * r * w) / 2,
  cy + (Math.sin(a) * r * h) / 2,
];

/** Points around the box's ellipse at the given radii, starting straight up. */
export function radial(box: Box, count: number, radius: (i: number) => number): Vec[] {
  return Array.from({ length: count }, (_, i) =>
    onEllipse(box, -Math.PI / 2 + (i * 2 * Math.PI) / count, radius(i)),
  );
}

/** Regular star (or polygon) vertices on the unit circle, first point straight up. */
export function starPoints(count: number, innerRatio: number, isPolygon: boolean): Vec[] {
  const total = isPolygon ? count : count * 2;
  return Array.from({ length: total }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / total;
    const r = isPolygon || i % 2 === 0 ? 1 : innerRatio;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}

/**
 * Smooth open curve through the points (Catmull-Rom style handles, a third of the neighbour span):
 * curvesmith's applyAutoHandles for an open subpath of all-auto nodes.
 */
export function smoothOpen(points: Vec[]): Subpath {
  const nodes = points.map(([x, y], i): PathNode => {
    const prev: Vec | undefined = points[i - 1];
    const next: Vec | undefined = points[i + 1];
    if (!prev || !next) {
      // Endpoints get a single handle pointing a third of the way to their only neighbour.
      const toward = (o: Vec | undefined): Vec | null =>
        o ? [x + (o[0] - x) / 3, y + (o[1] - y) / 3] : null;
      return { x, y, in: toward(prev), out: toward(next) };
    }
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const tl = Math.hypot(tx, ty) || 1;
    const dPrev = Math.hypot(x - prev[0], y - prev[1]) / 3;
    const dNext = Math.hypot(next[0] - x, next[1] - y) / 3;
    return {
      x,
      y,
      in: [x - (tx / tl) * dPrev, y - (ty / tl) * dPrev],
      out: [x + (tx / tl) * dNext, y + (ty / tl) * dNext],
    };
  });
  return { closed: false, nodes };
}
