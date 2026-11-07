import type { Mat2D, Rect, Vec2 } from './types';

export const IDENTITY: Mat2D = [1, 0, 0, 1, 0, 0];

export function identity(): Mat2D {
  return [1, 0, 0, 1, 0, 0];
}

/** Returns m1 · m2: applying the result equals applying m2 first, then m1. */
export function multiply(m1: Mat2D, m2: Mat2D): Mat2D {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function apply(m: Mat2D, p: Vec2): Vec2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Applies only the linear part (for direction vectors). */
export function applyLinear(m: Mat2D, p: Vec2): Vec2 {
  return { x: m[0] * p.x + m[2] * p.y, y: m[1] * p.x + m[3] * p.y };
}

export function determinant(m: Mat2D): number {
  return m[0] * m[3] - m[1] * m[2];
}

export function invert(m: Mat2D): Mat2D | null {
  const det = determinant(m);
  if (Math.abs(det) < 1e-12) return null;
  const [a, b, c, d, e, f] = m;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function translation(tx: number, ty: number): Mat2D {
  return [1, 0, 0, 1, tx, ty];
}

export function scaling(sx: number, sy: number = sx): Mat2D {
  return [sx, 0, 0, sy, 0, 0];
}

/** Counter-clockwise rotation in Y-up space, degrees. */
export function rotation(degrees: number): Mat2D {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, 0, 0];
}

/** Rotation about a point. */
export function rotationAbout(degrees: number, cx: number, cy: number): Mat2D {
  return multiply(translation(cx, cy), multiply(rotation(degrees), translation(-cx, -cy)));
}

/** Scale about a point. */
export function scalingAbout(sx: number, sy: number, cx: number, cy: number): Mat2D {
  return multiply(translation(cx, cy), multiply(scaling(sx, sy), translation(-cx, -cy)));
}

export interface Decomposed {
  tx: number;
  ty: number;
  /** Degrees, counter-clockwise. */
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/** Decomposes into translate · rotate · scale (skew is folded into scaleY). */
export function decompose(m: Mat2D): Decomposed {
  const [a, b, c, d, e, f] = m;
  const scaleX = Math.hypot(a, b);
  const rot = Math.atan2(b, a);
  const det = a * d - b * c;
  const scaleY = scaleX === 0 ? Math.hypot(c, d) : det / scaleX;
  return { tx: e, ty: f, rotation: (rot * 180) / Math.PI, scaleX, scaleY };
}

/** True when the transform has rotation or skew (only translate + scale otherwise). */
export function isRotated(m: Mat2D, epsilon = 1e-9): boolean {
  return Math.abs(m[1]) > epsilon || Math.abs(m[2]) > epsilon;
}

export function transformRect(m: Mat2D, r: Rect): Rect {
  const corners = [
    apply(m, { x: r.minX, y: r.minY }),
    apply(m, { x: r.maxX, y: r.minY }),
    apply(m, { x: r.maxX, y: r.maxY }),
    apply(m, { x: r.minX, y: r.maxY }),
  ];
  return boundsOfPoints(corners) as Rect;
}

export function boundsOfPoints(points: Iterable<Vec2>): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function rectWidth(r: Rect): number {
  return r.maxX - r.minX;
}

export function rectHeight(r: Rect): number {
  return r.maxY - r.minY;
}
