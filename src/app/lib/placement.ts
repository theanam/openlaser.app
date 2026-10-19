/** Where new art lands on the bed. */
import { multiply, transformRect, translation } from '$lib/geometry/mat2d';
import type { Mat2D, Rect } from '$lib/geometry/types';
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

/** Transform that makes `content` upright and centers it on the bed. */
export function placeCentered(bed: BedFrame, content: Rect, base: Mat2D = [1, 0, 0, 1, 0, 0]): Mat2D {
  const fixed = multiply(uprightFix(bed, transformRect(base, content)), base);
  const r = transformRect(fixed, content);
  const dx = bed.width / 2 - (r.minX + r.maxX) / 2;
  const dy = bed.height / 2 - (r.minY + r.maxY) / 2;
  return multiply(translation(dx, dy), fixed);
}
