/** Interaction overlays drawn over the scene: selection handles, shape ghosts and the measure tool. */
import type { Rect, Vec2 } from '$lib/geometry/types';
import { HANDLE_SIZE, type Handle } from './handles';
import { drawDashedRect, type Palette } from './scene-render';
import { bedRectToScreen, bedToScreen, type BedFrame, type View } from './viewport';
import { normalizeRect } from './handles';

export function drawSelection(
  ctx: CanvasRenderingContext2D,
  box: Rect,
  handles: Handle[],
  palette: Palette,
): void {
  drawDashedRect(ctx, box, palette.beam);
  ctx.fillStyle = palette.bg;
  ctx.strokeStyle = palette.beam;
  ctx.lineWidth = 1;
  for (const h of handles) {
    if (h.id === 'rotate') {
      ctx.beginPath();
      ctx.moveTo(h.x, h.y + 5);
      ctx.lineTo(h.x, box.minY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      const s = HANDLE_SIZE;
      ctx.fillRect(h.x - s / 2, h.y - s / 2, s, s);
      ctx.strokeRect(h.x - s / 2 + 0.5, h.y - s / 2 + 0.5, s - 1, s - 1);
    }
  }
}

export function drawShapeGhost(
  ctx: CanvasRenderingContext2D,
  view: View,
  bed: BedFrame,
  shape: 'rect' | 'ellipse',
  a: Vec2,
  b: Vec2,
  color: string,
): void {
  const r = bedRectToScreen(view, bed, normalizeRect(a, b));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  if (shape === 'rect') ctx.rect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY);
  else {
    const rx = (r.maxX - r.minX) / 2;
    const ry = (r.maxY - r.minY) / 2;
    ctx.ellipse(r.minX + rx, r.minY + ry, rx, ry, 0, 0, Math.PI * 2);
  }
  ctx.stroke();
}

/** "84.20 mm · Δx 80.00 · Δy 26.30 · 18.2°" */
export function measureLabel(from: Vec2, to: Vec2): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return `${Math.hypot(dx, dy).toFixed(2)} mm · Δx ${dx.toFixed(2)} · Δy ${dy.toFixed(2)} · ${angle.toFixed(1)}°`;
}

export function drawMeasure(
  ctx: CanvasRenderingContext2D,
  view: View,
  bed: BedFrame,
  from: Vec2,
  to: Vec2,
  palette: Palette,
): void {
  const a = bedToScreen(view, bed, from);
  const b = bedToScreen(view, bed, to);
  ctx.strokeStyle = palette.beam;
  ctx.fillStyle = palette.beam;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const label = measureLabel(from, to);
  ctx.font = '500 11px "Geist Mono", ui-monospace, monospace';
  const w = ctx.measureText(label).width + 12;
  const x = (a.x + b.x) / 2 + 10;
  const y = (a.y + b.y) / 2 - 10;
  ctx.fillStyle = palette.surface;
  ctx.fillRect(x, y - 15, w, 22);
  ctx.strokeStyle = palette.border;
  ctx.strokeRect(x + 0.5, y - 14.5, w - 1, 21);
  ctx.fillStyle = palette.beam;
  ctx.fillText(label, x + 6, y);
}

/** "120.0 × 45.5 mm": one decimal, which is finer than a diode laser's kerf. */
export function sizeLabel(width: number, height: number): string {
  return `${width.toFixed(1)} × ${height.toFixed(1)} mm`;
}

/** Size of the selection, in a pill centred under its box. */
export function drawSizeLabel(
  ctx: CanvasRenderingContext2D,
  box: Rect,
  width: number,
  height: number,
  palette: Palette,
): void {
  const label = sizeLabel(width, height);
  ctx.font = '500 11px "Geist Mono", ui-monospace, monospace';
  const w = ctx.measureText(label).width + 14;
  const h = 20;
  const x = Math.round((box.minX + box.maxX) / 2 - w / 2);
  const y = Math.round(box.maxY + 8);
  ctx.fillStyle = palette.beam;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();
  ctx.fillStyle = palette.bg;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 7, y + h / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';
}
