/**
 * Thin wrapper over Clipper2 (clipper2-ts). Callers work in floating point millimetres; this module
 * scales to integer micrometres (×1000) for the robust integer engine and back again.
 */
import {
  booleanOp,
  ClipType,
  Clipper64,
  EndType,
  FillRule as ClipperFillRule,
  inflatePaths,
  JoinType,
  type Path64,
  type Paths64,
} from 'clipper2-ts';
import type { FillRule } from './polygon';
import type { Vec2 } from './types';

/** Integer units per mm: 1 µm resolution, far below any laser spot size. */
export const CLIPPER_SCALE = 1000;

export type JoinStyle = 'miter' | 'round' | 'square';

export interface OffsetOptions {
  join?: JoinStyle;
  /** Multiple of |delta| a miter may extend before it is squared off. Clipper's default is 2. */
  miterLimit?: number;
  /** Max deviation of round joins from a true arc, mm. */
  arcTolerance?: number;
}

export function union(rings: Vec2[][], fillRule: FillRule = 'evenodd'): Vec2[][] {
  return fromPaths(booleanOp(ClipType.Union, toPaths(rings), null, toFillRule(fillRule)));
}

export function intersection(subject: Vec2[][], clip: Vec2[][], fillRule: FillRule = 'evenodd'): Vec2[][] {
  return fromPaths(booleanOp(ClipType.Intersection, toPaths(subject), toPaths(clip), toFillRule(fillRule)));
}

export function difference(subject: Vec2[][], clip: Vec2[][], fillRule: FillRule = 'evenodd'): Vec2[][] {
  return fromPaths(booleanOp(ClipType.Difference, toPaths(subject), toPaths(clip), toFillRule(fillRule)));
}

/**
 * Clips open polylines to a closed region, returning the parts inside it.
 * Useful for scoring lines limited to a shape.
 */
export function clipPolylines(lines: Vec2[][], region: Vec2[][], fillRule: FillRule = 'evenodd'): Vec2[][] {
  const clipper = new Clipper64();
  clipper.addOpenSubject(toPaths(lines));
  clipper.addClip(toPaths(region));
  const closed: Paths64 = [];
  const open: Paths64 = [];
  clipper.execute(ClipType.Intersection, toFillRule(fillRule), closed, open);
  return fromPaths(open);
}

/**
 * Offsets closed rings as a region: outer rings grow and holes shrink for positive `delta`.
 * A single ring always grows for positive `delta`, whatever its orientation.
 * Returned rings may be fewer (collapsed) or more (split) than the input.
 */
export function offsetRings(rings: Vec2[][], delta: number, options: OffsetOptions = {}): Vec2[][] {
  if (delta === 0) return rings.map((r) => r.map((p) => ({ x: p.x, y: p.y })));
  const join = options.join ?? 'miter';
  const arcTolerance = (options.arcTolerance ?? 0.01) * CLIPPER_SCALE;
  const result = inflatePaths(
    toPaths(rings),
    delta * CLIPPER_SCALE,
    toJoinType(join),
    EndType.Polygon,
    options.miterLimit ?? 2,
    arcTolerance,
  );
  return fromPaths(result);
}

function toPaths(rings: Vec2[][]): Paths64 {
  return rings.map((ring): Path64 =>
    ring.map((p) => ({ x: Math.round(p.x * CLIPPER_SCALE), y: Math.round(p.y * CLIPPER_SCALE) })),
  );
}

function fromPaths(paths: Paths64): Vec2[][] {
  return paths.map((path) => path.map((p) => ({ x: p.x / CLIPPER_SCALE, y: p.y / CLIPPER_SCALE })));
}

function toFillRule(rule: FillRule): ClipperFillRule {
  return rule === 'evenodd' ? ClipperFillRule.EvenOdd : ClipperFillRule.NonZero;
}

function toJoinType(join: JoinStyle): JoinType {
  if (join === 'round') return JoinType.Round;
  if (join === 'square') return JoinType.Square;
  return JoinType.Miter;
}
