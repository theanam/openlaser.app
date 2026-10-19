/* Boundary conversions from the internal node representation to openlaser PathData and SVG path text. */
import type { PathData, Segment, Vec2 } from '$lib/geometry/types';
import type { PathNode, Subpath, Vec } from './internal-types';

/** Edge between two nodes: a line unless either side carries a handle. */
function edge(from: PathNode, to: PathNode, map: (v: Vec) => Vec2): Segment {
  const end = map([to.x, to.y]);
  if (!from.out && !to.in) return { type: 'L', to: end };
  return { type: 'C', c1: map(from.out ?? [from.x, from.y]), c2: map(to.in ?? [to.x, to.y]), to: end };
}

/**
 * Converts a Y-down subpath to Y-up PathData by flipping about the box (y' = height − y).
 * Closed paths end with an explicit segment back to `start`, matching project/shapes.ts.
 */
export function toPathData(sp: Subpath, height: number): PathData {
  const map = ([x, y]: Vec): Vec2 => ({ x, y: height - y });
  const nodes = sp.nodes;
  const segments: Segment[] = [];
  for (let i = 1; i < nodes.length; i++) segments.push(edge(nodes[i - 1], nodes[i], map));
  if (sp.closed && nodes.length > 1) segments.push(edge(nodes[nodes.length - 1], nodes[0], map));
  return { closed: sp.closed, start: map([nodes[0].x, nodes[0].y]), segments };
}

const fmt = (v: number) => String(Math.round(v * 100) / 100);

/** SVG path data (Y-down) for the subpaths, offset by (dx, dy) and rounded to 0.01. */
export function toSvgPath(subpaths: Subpath[], dx: number, dy: number): string {
  const pt = ([x, y]: Vec) => `${fmt(x + dx)} ${fmt(y + dy)}`;
  const parts: string[] = [];
  for (const sp of subpaths) {
    const n = sp.nodes;
    parts.push(`M${pt([n[0].x, n[0].y])}`);
    const count = sp.closed ? n.length : n.length - 1;
    for (let i = 0; i < count; i++) {
      const a = n[i];
      const b = n[(i + 1) % n.length];
      if (!a.out && !b.in) parts.push(`L${pt([b.x, b.y])}`);
      else parts.push(`C${pt(a.out ?? [a.x, a.y])} ${pt(b.in ?? [b.x, b.y])} ${pt([b.x, b.y])}`);
    }
    if (sp.closed) parts.push('Z');
  }
  return parts.join('');
}
