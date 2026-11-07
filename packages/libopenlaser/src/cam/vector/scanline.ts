/**
 * Scanline/region intersection for fill mode.
 *
 * Intersections are computed directly with an even-odd crossing rule rather than by clipping line
 * paths with Clipper: it is exact in floating point (no µm snapping of every scanline end), linear
 * in the number of crossings per line, and the region passed in is already a clean union, so
 * even-odd pairing of sorted crossings gives the filled spans.
 */
import type { Vec2 } from '../../geometry/types';

/** A filled interval along a scanline, in the rotated (u, v) frame. */
export interface Span {
  from: number;
  to: number;
}

export interface Scanline {
  /** Offset of the scanline perpendicular to the scan direction (rotated frame). */
  v: number;
  /** Sorted, non-overlapping spans along the scan direction. */
  spans: Span[];
}

interface Edge {
  vMin: number;
  vMax: number;
  /** u at vMin and du/dv, so u(v) = u0 + slope · (v − vMin). */
  u0: number;
  slope: number;
}

/** Spans shorter than this carry no burn and only add G-code lines. */
const MIN_SPAN = 1e-6;

/**
 * Intersects the region with parallel scanlines in the direction `angleDeg` (counter-clockwise
 * from +X), spaced by `interval`. Scanline offsets sit on a global grid at (k + ½)·interval in the
 * rotated frame, so separate jobs and cross-hatch passes line up and lines never run exactly
 * along axis-aligned edges placed on whole multiples of the interval.
 */
export function scanRegion(
  rings: readonly (readonly Vec2[])[],
  angleDeg: number,
  interval: number,
): Scanline[] {
  if (!(interval > 0)) return [];
  const { cos, sin } = unitVector(angleDeg);
  const edges: Edge[] = [];
  let vLow = Infinity;
  let vHigh = -Infinity;
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const av = -a.x * sin + a.y * cos;
      const bv = -b.x * sin + b.y * cos;
      if (av === bv) continue;
      const au = a.x * cos + a.y * sin;
      const bu = b.x * cos + b.y * sin;
      const [v0, u0, v1, u1] = av < bv ? [av, au, bv, bu] : [bv, bu, av, au];
      edges.push({ vMin: v0, vMax: v1, u0, slope: (u1 - u0) / (v1 - v0) });
      vLow = Math.min(vLow, v0);
      vHigh = Math.max(vHigh, v1);
    }
  }
  if (edges.length === 0) return [];
  edges.sort((e1, e2) => e1.vMin - e2.vMin);

  const scanlines: Scanline[] = [];
  const active: Edge[] = [];
  let next = 0;
  const kStart = Math.ceil(vLow / interval - 0.5);
  for (let k = kStart; (k + 0.5) * interval < vHigh; k++) {
    const v = (k + 0.5) * interval;
    while (next < edges.length && edges[next].vMin <= v) active.push(edges[next++]);
    const crossings: number[] = [];
    for (let i = active.length - 1; i >= 0; i--) {
      const e = active[i];
      if (e.vMax <= v) {
        active.splice(i, 1);
        continue;
      }
      crossings.push(e.u0 + e.slope * (v - e.vMin));
    }
    crossings.sort((p, q) => p - q);
    const spans: Span[] = [];
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      if (crossings[i + 1] - crossings[i] > MIN_SPAN)
        spans.push({ from: crossings[i], to: crossings[i + 1] });
    }
    if (spans.length > 0) scanlines.push({ v, spans });
  }
  return scanlines;
}

/** Direction of the scan. Quarter turns are exact so 0° and 90° fills carry no trig noise. */
export function unitVector(angleDeg: number): { cos: number; sin: number } {
  const quarter = angleDeg / 90;
  if (Number.isInteger(quarter)) {
    const q = ((quarter % 4) + 4) % 4;
    return { cos: [1, 0, -1, 0][q], sin: [0, 1, 0, -1][q] };
  }
  const r = (angleDeg * Math.PI) / 180;
  return { cos: Math.cos(r), sin: Math.sin(r) };
}

/** Maps a point (u along the scan direction, v across it) back to bed coordinates. */
export function fromScanFrame(u: number, v: number, cos: number, sin: number): Vec2 {
  return { x: u * cos - v * sin, y: u * sin + v * cos };
}
