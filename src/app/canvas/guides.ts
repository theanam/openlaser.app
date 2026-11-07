/**
 * Smart guides: while a selection is dragged, its edges and centre snap to those of the other
 * objects and of the bed, and a guide line shows what it lines up with. Bed coordinates, mm.
 */
import type { Rect } from 'libopenlaser/geometry';

export interface Guide {
  /** 'x': a vertical line at x = at; 'y': a horizontal line at y = at. */
  axis: 'x' | 'y';
  at: number;
  /** Extent along the other axis. */
  from: number;
  to: number;
}

export interface Snap {
  dx: number;
  dy: number;
  guides: Guide[];
}

/** Screen pixels within which an edge or centre snaps. */
export const SNAP_PX = 6;

const lines = (r: Rect, axis: 'x' | 'y') =>
  axis === 'x' ? [r.minX, (r.minX + r.maxX) / 2, r.maxX] : [r.minY, (r.minY + r.maxY) / 2, r.maxY];

const span = (r: Rect, axis: 'x' | 'y'): [number, number] =>
  axis === 'x' ? [r.minY, r.maxY] : [r.minX, r.maxX];

/** The nearest alignment on one axis within `tolerance`, and the guides it makes. */
function snapAxis(moving: Rect, targets: readonly Rect[], axis: 'x' | 'y', tolerance: number) {
  let best = Infinity;
  for (const t of targets)
    for (const a of lines(moving, axis))
      for (const b of lines(t, axis)) {
        const d = b - a;
        if (Math.abs(d) <= tolerance && Math.abs(d) < Math.abs(best)) best = d;
      }
  if (!Number.isFinite(best)) return { offset: 0, guides: [] as Guide[] };
  const moved = lines(moving, axis).map((v) => v + best);
  // One guide per line, spanning everything that lines up on it.
  const guides = new Map<number, Guide>();
  for (const t of targets) {
    const [tFrom, tTo] = span(t, axis);
    for (const b of lines(t, axis)) {
      if (!moved.some((v) => Math.abs(v - b) < 1e-6)) continue;
      const key = Math.round(b * 1e4);
      const g = guides.get(key);
      guides.set(key, {
        axis,
        at: b,
        from: Math.min(g?.from ?? tFrom, tFrom),
        to: Math.max(g?.to ?? tTo, tTo),
      });
    }
  }
  return { offset: best, guides: [...guides.values()] };
}

/**
 * Snaps a selection box, already moved by the drag, to `targets` (the other objects and the bed).
 * A locked axis (Shift keeps the drag on one axis) does not snap.
 */
export function snapMove(
  moving: Rect,
  targets: readonly Rect[],
  tolerance: number,
  locked: { x?: boolean; y?: boolean } = {},
): Snap {
  const x = locked.x ? { offset: 0, guides: [] } : snapAxis(moving, targets, 'x', tolerance);
  const y = locked.y ? { offset: 0, guides: [] } : snapAxis(moving, targets, 'y', tolerance);
  // Guides span the box where it ends up.
  const shift = (g: Guide): Guide => {
    const along = g.axis === 'x' ? y.offset : x.offset;
    const [mFrom, mTo] = span(moving, g.axis).map((v) => v + along) as [number, number];
    return { ...g, from: Math.min(g.from, mFrom), to: Math.max(g.to, mTo) };
  };
  return { dx: x.offset, dy: y.offset, guides: [...x.guides, ...y.guides].map(shift) };
}

export const translateRect = (r: Rect, dx: number, dy: number): Rect => ({
  minX: r.minX + dx,
  minY: r.minY + dy,
  maxX: r.maxX + dx,
  maxY: r.maxY + dy,
});
