/** Selection handles: positions in screen space and the transforms a handle drag produces in bed space. */
import { scalingAbout } from '$lib/geometry/mat2d';
import type { Mat2D, Rect, Vec2 } from '$lib/geometry/types';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
}

export const HANDLE_SIZE = 8;
/** Gap between the selection and its dashed box, px. */
export const SELECTION_PAD = 6;
const ROTATE_OFFSET = 22;

/** The dashed selection box: the screen bounds grown by the pad. */
export function selectionBox(screen: Rect): Rect {
  return {
    minX: screen.minX - SELECTION_PAD,
    minY: screen.minY - SELECTION_PAD,
    maxX: screen.maxX + SELECTION_PAD,
    maxY: screen.maxY + SELECTION_PAD,
  };
}

export function handlesFor(box: Rect, rotatable: boolean): Handle[] {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const list: Handle[] = [
    { id: 'nw', x: box.minX, y: box.minY },
    { id: 'n', x: cx, y: box.minY },
    { id: 'ne', x: box.maxX, y: box.minY },
    { id: 'e', x: box.maxX, y: cy },
    { id: 'se', x: box.maxX, y: box.maxY },
    { id: 's', x: cx, y: box.maxY },
    { id: 'sw', x: box.minX, y: box.maxY },
    { id: 'w', x: box.minX, y: cy },
  ];
  if (rotatable) list.push({ id: 'rotate', x: cx, y: box.minY - ROTATE_OFFSET });
  return list;
}

export function hitHandle(point: Vec2, handles: Handle[], radius = HANDLE_SIZE): Handle | null {
  for (const h of handles) {
    if (Math.abs(point.x - h.x) <= radius && Math.abs(point.y - h.y) <= radius) return h;
  }
  return null;
}

const OPPOSITE: Record<Exclude<HandleId, 'rotate'>, Exclude<HandleId, 'rotate'>> = {
  nw: 'se',
  n: 's',
  ne: 'sw',
  e: 'w',
  se: 'nw',
  s: 'n',
  sw: 'ne',
  w: 'e',
};

export function oppositeHandle(id: Exclude<HandleId, 'rotate'>): Exclude<HandleId, 'rotate'> {
  return OPPOSITE[id];
}

/**
 * Scale for dragging handle `id` from `start` to `current` (both bed space) about `pivot` (bed
 * space, the opposite handle). Edge handles scale one axis unless `keepAspect`.
 */
export function scaleFromDrag(
  id: Exclude<HandleId, 'rotate'>,
  pivot: Vec2,
  start: Vec2,
  current: Vec2,
  keepAspect: boolean,
): Mat2D {
  const movesX = id !== 'n' && id !== 's';
  const movesY = id !== 'e' && id !== 'w';
  const ratio = (cur: number, orig: number, p: number) => {
    const d = orig - p;
    return Math.abs(d) < 1e-9 ? 1 : (cur - p) / d;
  };
  let sx = movesX ? ratio(current.x, start.x, pivot.x) : 1;
  let sy = movesY ? ratio(current.y, start.y, pivot.y) : 1;
  if (keepAspect) {
    const s = movesX && movesY ? (Math.abs(sx) > Math.abs(sy) ? sx : sy) : movesX ? sx : sy;
    sx = s;
    sy = s;
  }
  // Avoid collapsing to zero, which would make the transform singular.
  const guard = (s: number) => (Math.abs(s) < 1e-3 ? Math.sign(s || 1) * 1e-3 : s);
  return scalingAbout(guard(sx), guard(sy), pivot.x, pivot.y);
}

/** Angle in degrees (Y-up, counter-clockwise) of `p` around `center`. */
export function angleAround(center: Vec2, p: Vec2): number {
  return (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;
}

export function snapAngle(degrees: number, step = 15): number {
  return Math.round(degrees / step) * step;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function normalizeRect(a: Vec2, b: Vec2): Rect {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}
