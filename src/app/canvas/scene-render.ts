/** Draws the bed, grid and design objects onto a 2D canvas in screen space. */
import { multiply, translation } from '$lib/geometry/mat2d';
import type { Mat2D, PathData, Rect, Vec2 } from '$lib/geometry/types';
import type { ImageObject, Layer, Project, SceneObject, TextObject } from '$lib/project/types';
import { textPlaceholderSize, type OutlinedObject } from '$lib/project/outline';
import { inkOn } from './ink';
import { bedToScreen, bedToScreenMatrix, niceStep, type BedFrame, type View } from './viewport';

export interface Palette {
  bg: string;
  bed: string;
  gridMinor: string;
  gridMajor: string;
  border: string;
  textDim: string;
  beam: string;
  signal: string;
  signalSoft: string;
  surface: string;
  photo: string;
}

/** Reads the design tokens once per frame so theme switches apply instantly. */
export function readPalette(el: Element): Palette {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    bg: v('--ol-bg'),
    bed: v('--ol-bed'),
    gridMinor: v('--ol-grid-minor'),
    gridMajor: v('--ol-grid-major'),
    border: v('--ol-border'),
    textDim: v('--ol-text-dim'),
    beam: v('--ol-beam'),
    signal: v('--ol-signal'),
    signalSoft: v('--ol-signal-soft'),
    surface: v('--ol-surface'),
    photo: v('--ol-photo'),
  };
}

const toDOMMatrix = (m: Mat2D) => new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]);

/** Object-space Path2D per object, rebuilt only when its paths array changes. */
const pathCache = new WeakMap<PathData[], Path2D>();

export function objectPath(object: Pick<OutlinedObject, 'paths'>): Path2D {
  let path = pathCache.get(object.paths);
  if (!path) {
    path = new Path2D();
    for (const sub of object.paths) {
      path.moveTo(sub.start.x, sub.start.y);
      for (const seg of sub.segments) {
        if (seg.type === 'L') path.lineTo(seg.to.x, seg.to.y);
        else path.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.to.x, seg.to.y);
      }
      if (sub.closed) path.closePath();
    }
    pathCache.set(object.paths, path);
  }
  return path;
}

/** The object's path in screen space, so strokes keep a constant pixel width. */
export function screenPath(
  object: Pick<OutlinedObject, 'paths' | 'transform'>,
  view: View,
  bed: BedFrame,
): Path2D {
  const out = new Path2D();
  out.addPath(objectPath(object), toDOMMatrix(multiply(bedToScreenMatrix(view, bed), object.transform)));
  return out;
}

export function drawBed(
  ctx: CanvasRenderingContext2D,
  view: View,
  bed: BedFrame,
  palette: Palette,
  size: { width: number; height: number },
): void {
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, size.width, size.height);
  const a = bedToScreen(view, bed, { x: 0, y: 0 });
  const b = bedToScreen(view, bed, { x: bed.width, y: bed.height });
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  ctx.fillStyle = palette.bed;
  ctx.fillRect(x0, y0, w, h);

  const drawGrid = (step: number, color: string) => {
    if (step * view.zoom < 6) return;
    ctx.beginPath();
    for (let x = step; x < bed.width; x += step) {
      const sx = Math.round(bedToScreen(view, bed, { x, y: 0 }).x) + 0.5;
      ctx.moveTo(sx, y0);
      ctx.lineTo(sx, y0 + h);
    }
    for (let y = step; y < bed.height; y += step) {
      const sy = Math.round(bedToScreen(view, bed, { x: 0, y }).y) + 0.5;
      ctx.moveTo(x0, sy);
      ctx.lineTo(x0 + w, sy);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  drawGrid(10, palette.gridMinor);
  drawGrid(50, palette.gridMajor);

  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(w), Math.round(h));
}

export interface ImageLook {
  /** Tinted dithered preview, or the raw image while the preview computes. */
  bitmap: CanvasImageSource | null;
  caption: string;
}

export function drawObjects(
  ctx: CanvasRenderingContext2D,
  project: Project,
  view: View,
  bed: BedFrame,
  images: (object: ImageObject, layer: Layer) => ImageLook,
  palette: Palette,
  /** Object drawn by something else right now (text being edited in place). */
  skip: string | null = null,
): void {
  const layers = new Map(project.layers.map((l) => [l.id, l]));
  const toScreen = bedToScreenMatrix(view, bed);
  for (const object of project.objects) {
    const layer = layers.get(object.layerId);
    if (!object.visible || !layer || !layer.visible || object.id === skip) continue;
    const ink = inkOn(layer.color, palette.bed);
    if (object.kind === 'text' && object.paths.length === 0) {
      drawTextPlaceholder(ctx, object, toScreen, ink);
    } else if (object.kind === 'vector' || object.kind === 'text') {
      const path = screenPath(object, view, bed);
      if (layer.mode === 'fill') {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = ink;
        ctx.fill(path, 'evenodd');
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = layer.mode === 'line' ? 1.4 : 1;
      ctx.stroke(path);
    } else if (object.kind === 'image') {
      drawImageObject(ctx, object, layer, toScreen, images(object, layer), palette);
    }
  }
}

/**
 * Faint impression of the design where the running job burns it: the output layers' objects moved
 * by the job's origin offset. Shows where a user or current origin put the job on the bed.
 */
export function drawJobGhost(
  ctx: CanvasRenderingContext2D,
  project: Project,
  offset: Vec2,
  view: View,
  bed: BedFrame,
  palette: Palette,
): void {
  const layers = new Map(project.layers.map((l) => [l.id, l]));
  const shift = translation(offset.x, offset.y);
  const toScreen = multiply(bedToScreenMatrix(view, bed), shift);
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  for (const object of project.objects) {
    const layer = layers.get(object.layerId);
    if (!object.visible || !layer?.output) continue;
    const ink = inkOn(layer.color, palette.bed);
    if ((object.kind === 'vector' || object.kind === 'text') && object.paths.length) {
      const path = screenPath(
        { paths: object.paths, transform: multiply(shift, object.transform) },
        view,
        bed,
      );
      if (layer.mode === 'fill') {
        ctx.fillStyle = ink;
        ctx.fill(path, 'evenodd');
      }
      ctx.strokeStyle = ink;
      ctx.stroke(path);
    } else {
      const size =
        object.kind === 'image'
          ? { width: object.width, height: object.height }
          : object.kind === 'text'
            ? textPlaceholderSize(object)
            : null;
      if (!size) continue;
      const m = multiply(toScreen, object.transform);
      const corners = [
        { x: 0, y: 0 },
        { x: size.width, y: 0 },
        { x: size.width, y: size.height },
        { x: 0, y: size.height },
      ].map((p) => applyM(m, p));
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = ink;
      ctx.beginPath();
      corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

/** Dashed box with the text while its font loads. */
function drawTextPlaceholder(
  ctx: CanvasRenderingContext2D,
  object: TextObject,
  toScreen: Mat2D,
  color: string,
): void {
  const { width, height } = textPlaceholderSize(object);
  const m = multiply(toScreen, object.transform);
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ].map((p) => applyM(m, p));
  ctx.beginPath();
  corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  const left = Math.min(...corners.map((c) => c.x));
  const top = Math.min(...corners.map((c) => c.y));
  ctx.font = '500 11px "Geist Sans", system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(`${object.text.split('\n')[0] || 'Text'} · loading ${object.fontFamily}…`, left + 4, top + 14);
}

function drawImageObject(
  ctx: CanvasRenderingContext2D,
  object: ImageObject,
  layer: Layer,
  toScreen: Mat2D,
  look: ImageLook,
  palette: Palette,
): void {
  // Bitmap rows run top-down; object space is Y-up with the image's top edge at y = height.
  const m = multiply(toScreen, multiply(object.transform, [1, 0, 0, -1, 0, object.height]));
  ctx.save();
  ctx.setTransform(ctx.getTransform().multiply(toDOMMatrix(m)));
  if (look.bitmap) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(look.bitmap, 0, 0, object.width, object.height);
  }
  ctx.restore();

  const corners = [
    { x: 0, y: 0 },
    { x: object.width, y: 0 },
    { x: object.width, y: object.height },
    { x: 0, y: object.height },
  ].map((p) => applyM(multiply(toScreen, object.transform), p));
  ctx.beginPath();
  corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = layer.color ? inkOn(layer.color, palette.bed) : palette.photo;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  const bottom = corners.reduce((a, b) => (b.y > a.y ? b : a));
  const left = Math.min(...corners.map((c) => c.x));
  ctx.font = '500 10px "Geist Mono", ui-monospace, monospace';
  ctx.fillStyle = inkOn(layer.color, palette.bed);
  ctx.fillText(look.caption, left, bottom.y + 14);
}

function applyM(m: Mat2D, p: Vec2): Vec2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Rulers along the top and left edges, labelled in bed mm. */
export function drawRulers(
  ctx: CanvasRenderingContext2D,
  view: View,
  bed: BedFrame,
  palette: Palette,
  size: { width: number; height: number },
): void {
  const thickness = 20;
  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, size.width, thickness);
  ctx.fillRect(0, 0, thickness, size.height);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, thickness + 0.5);
  ctx.lineTo(size.width, thickness + 0.5);
  ctx.moveTo(thickness + 0.5, 0);
  ctx.lineTo(thickness + 0.5, size.height);
  ctx.stroke();

  const step = niceStep(view.zoom);
  ctx.font = '400 10px "Geist Mono", ui-monospace, monospace';
  ctx.fillStyle = palette.textDim;
  ctx.textBaseline = 'middle';
  const decimals = step < 1 ? 1 : 0;
  for (let x = 0; x <= bed.width + 1e-9; x += step) {
    const sx = bedToScreen(view, bed, { x, y: 0 }).x;
    if (sx < thickness || sx > size.width) continue;
    ctx.fillRect(Math.round(sx), thickness - 5, 1, 5);
    ctx.fillText(x.toFixed(decimals), sx + 3, thickness / 2 - 1);
  }
  ctx.save();
  for (let y = 0; y <= bed.height + 1e-9; y += step) {
    const sy = bedToScreen(view, bed, { x: 0, y }).y;
    if (sy < thickness || sy > size.height) continue;
    ctx.fillRect(thickness - 5, Math.round(sy), 5, 1);
    ctx.save();
    ctx.translate(thickness / 2, sy - 3);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(y.toFixed(decimals), 0, 0);
    ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, thickness, thickness);
  ctx.textBaseline = 'alphabetic';
}

/** Laser head: Signal ring, four ticks and a centre dot (DESIGN §5). */
export function drawLaserHead(ctx: CanvasRenderingContext2D, at: Vec2, palette: Palette): void {
  ctx.strokeStyle = palette.signal;
  ctx.fillStyle = palette.signal;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(at.x, at.y, 9, 0, Math.PI * 2);
  ctx.moveTo(at.x, at.y - 18);
  ctx.lineTo(at.x, at.y - 11);
  ctx.moveTo(at.x, at.y + 11);
  ctx.lineTo(at.x, at.y + 18);
  ctx.moveTo(at.x - 18, at.y);
  ctx.lineTo(at.x - 11, at.y);
  ctx.moveTo(at.x + 11, at.y);
  ctx.lineTo(at.x + 18, at.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(at.x, at.y, 2, 0, Math.PI * 2);
  ctx.fill();
}

export function drawDashedRect(ctx: CanvasRenderingContext2D, r: Rect, color: string, fillAlpha = 0): void {
  if (fillAlpha > 0) {
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = color;
    ctx.fillRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY);
    ctx.globalAlpha = 1;
  }
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    Math.round(r.minX) + 0.5,
    Math.round(r.minY) + 0.5,
    Math.round(r.maxX - r.minX),
    Math.round(r.maxY - r.minY),
  );
  ctx.setLineDash([]);
}

export type { SceneObject };

/** Glow in each layer's own ink around the given objects (a row hovered in the Layers panel). */
export function drawObjectHighlight(
  ctx: CanvasRenderingContext2D,
  project: Project,
  ids: ReadonlySet<string>,
  view: View,
  bed: BedFrame,
  palette: Palette,
): void {
  const toScreen = bedToScreenMatrix(view, bed);
  const layers = new Map(project.layers.map((l) => [l.id, l]));
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  for (const object of project.objects) {
    if (!ids.has(object.id) || !object.visible) continue;
    const layer = layers.get(object.layerId);
    ctx.strokeStyle = layer ? inkOn(layer.color, palette.bed) : palette.beam;
    if ((object.kind === 'vector' || object.kind === 'text') && object.paths.length) {
      ctx.stroke(screenPath(object, view, bed));
    } else {
      const size =
        object.kind === 'image'
          ? { width: object.width, height: object.height }
          : object.kind === 'text'
            ? textPlaceholderSize(object)
            : null;
      if (!size) continue;
      const m = multiply(toScreen, object.transform);
      const corners = [
        { x: 0, y: 0 },
        { x: size.width, y: 0 },
        { x: size.width, y: size.height },
        { x: 0, y: size.height },
      ].map((p) => applyM(m, p));
      ctx.beginPath();
      corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}
