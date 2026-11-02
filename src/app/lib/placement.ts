/** Where new art lands on the bed. */
import { multiply, transformRect, translation } from '$lib/geometry/mat2d';
import type { Mat2D, Rect, Vec2 } from '$lib/geometry/types';
import { flipsX, yGrowsDown, type BedFrame } from '../canvas/viewport';

/**
 * Art arrives Y-up, which looks upright on a bottom-left origin machine. On other origins the
 * screen mirrors bed space, so this pre-flips the art to keep it reading the right way on screen
 * (and on the material).
 */
export function uprightFix(bed: BedFrame, content: Rect): Mat2D {
  let m: Mat2D = [1, 0, 0, 1, 0, 0];
  const cx = (content.minX + content.maxX) / 2;
  const cy = (content.minY + content.maxY) / 2;
  if (yGrowsDown(bed)) m = multiply([1, 0, 0, -1, 0, 2 * cy], m);
  if (flipsX(bed)) m = multiply([-1, 0, 0, 1, 2 * cx, 0], m);
  return m;
}

/**
 * Transform that fits Y-up object space (0,0)–(w,h) into the bed rectangle `r` reading upright on
 * screen: the object's top-left lands at the screen's top-left of `r`, whatever the origin corner.
 */
export function uprightIn(bed: BedFrame, r: Rect): Mat2D {
  const sx = flipsX(bed) ? -1 : 1;
  const sy = yGrowsDown(bed) ? -1 : 1;
  return [sx, 0, 0, sy, sx > 0 ? r.minX : r.maxX, sy > 0 ? r.minY : r.maxY];
}

/**
 * Text object space is Y-up with the block's top at `height`; this puts that top-left at `at`
 * as seen on screen, upright whatever the origin corner.
 */
export function uprightTextAt(bed: BedFrame, at: Vec2, height: number): Mat2D {
  const sx = flipsX(bed) ? -1 : 1;
  const sy = yGrowsDown(bed) ? -1 : 1;
  return [sx, 0, 0, sy, at.x, at.y - sy * height];
}

/**
 * Where a new image goes: centred on the bed and upright on screen. Images cannot rotate, but they
 * may mirror, which is all a top or right home corner needs.
 */
export function imagePlacement(bed: BedFrame, size: { width: number; height: number }): Mat2D {
  const x = bed.width / 2 - size.width / 2;
  const y = bed.height / 2 - size.height / 2;
  return uprightIn(bed, { minX: x, minY: y, maxX: x + size.width, maxY: y + size.height });
}

/** Transform that makes `content` upright and centers it on the bed. */
export function placeCentered(bed: BedFrame, content: Rect, base: Mat2D = [1, 0, 0, 1, 0, 0]): Mat2D {
  const fixed = multiply(uprightFix(bed, transformRect(base, content)), base);
  const r = transformRect(fixed, content);
  const dx = bed.width / 2 - (r.minX + r.maxX) / 2;
  const dy = bed.height / 2 - (r.minY + r.maxY) / 2;
  return multiply(translation(dx, dy), fixed);
}
