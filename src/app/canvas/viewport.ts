/**
 * Bed ↔ screen mapping. Bed space is Y-up with the origin at the machine's 0,0 corner; the screen is
 * Y-down. `offsetX/offsetY` is where the bed's top-left corner sits on screen, `zoom` is px per mm.
 */
import { invert } from '$lib/geometry/mat2d';
import type { Mat2D, Rect, Vec2 } from '$lib/geometry/types';
import type { MachineProfile } from '$lib/project/types';

export interface View {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface BedFrame {
  width: number;
  height: number;
  originCorner: MachineProfile['originCorner'];
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 200;

/** Bed x grows to the left on screen when the origin is on the right. */
export function flipsX(bed: BedFrame): boolean {
  return bed.originCorner === 'tr' || bed.originCorner === 'br';
}

/** Bed y grows downward on screen when the origin is at the top. */
export function yGrowsDown(bed: BedFrame): boolean {
  return bed.originCorner === 'tl' || bed.originCorner === 'tr';
}

/** The canvas transform taking bed mm to screen px. */
export function bedToScreenMatrix(view: View, bed: BedFrame): Mat2D {
  const z = view.zoom;
  const fx = flipsX(bed);
  const down = yGrowsDown(bed);
  return [
    fx ? -z : z,
    0,
    0,
    down ? z : -z,
    view.offsetX + (fx ? z * bed.width : 0),
    view.offsetY + (down ? 0 : z * bed.height),
  ];
}

export function bedToScreen(view: View, bed: BedFrame, p: Vec2): Vec2 {
  const m = bedToScreenMatrix(view, bed);
  return { x: m[0] * p.x + m[4], y: m[3] * p.y + m[5] };
}

export function screenToBed(view: View, bed: BedFrame, p: Vec2): Vec2 {
  const m = invert(bedToScreenMatrix(view, bed))!;
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Screen rectangle of a bed rectangle. */
export function bedRectToScreen(view: View, bed: BedFrame, r: Rect): Rect {
  const a = bedToScreen(view, bed, { x: r.minX, y: r.minY });
  const b = bedToScreen(view, bed, { x: r.maxX, y: r.maxY });
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

export function fitRect(
  viewport: { width: number; height: number },
  bed: BedFrame,
  target: Rect,
  padding = 48,
): View {
  const w = Math.max(target.maxX - target.minX, 1);
  const h = Math.max(target.maxY - target.minY, 1);
  const zoom = clampZoom(Math.min((viewport.width - padding * 2) / w, (viewport.height - padding * 2) / h));
  // Place the target's center at the viewport center.
  const probe: View = { zoom, offsetX: 0, offsetY: 0 };
  const c = bedToScreen(probe, bed, {
    x: (target.minX + target.maxX) / 2,
    y: (target.minY + target.maxY) / 2,
  });
  return { zoom, offsetX: viewport.width / 2 - c.x, offsetY: viewport.height / 2 - c.y };
}

export function fitBed(viewport: { width: number; height: number }, bed: BedFrame, padding = 48): View {
  return fitRect(viewport, bed, { minX: 0, minY: 0, maxX: bed.width, maxY: bed.height }, padding);
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Zooms by `factor`, keeping the screen point `anchor` fixed. */
export function zoomAt(view: View, factor: number, anchor: Vec2): View {
  const zoom = clampZoom(view.zoom * factor);
  const k = zoom / view.zoom;
  return {
    zoom,
    offsetX: anchor.x - (anchor.x - view.offsetX) * k,
    offsetY: anchor.y - (anchor.y - view.offsetY) * k,
  };
}

/** Grid/ruler spacing in mm so labels stay readable at the current zoom. */
export function niceStep(zoom: number, minPx = 60): number {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  return steps.find((s) => s * zoom >= minPx) ?? 1000;
}
