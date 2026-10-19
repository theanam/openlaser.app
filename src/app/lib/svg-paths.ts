/** PathData → SVG path strings. Beziers stay beziers, so printing and thumbnails remain true vectors. */
import { apply, multiply } from '$lib/geometry/mat2d';
import type { Mat2D, PathData, Rect } from '$lib/geometry/types';
import type { BedFrame } from '../canvas/viewport';
import { bedToScreenMatrix } from '../canvas/viewport';

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

/** SVG `d` for paths, transformed by `m` (object → output space). */
export function pathsToSvgD(paths: PathData[], m: Mat2D): string {
  const out: string[] = [];
  for (const path of paths) {
    const s = apply(m, path.start);
    out.push(`M${fmt(s.x)} ${fmt(s.y)}`);
    for (const seg of path.segments) {
      const to = apply(m, seg.to);
      if (seg.type === 'L') out.push(`L${fmt(to.x)} ${fmt(to.y)}`);
      else {
        const c1 = apply(m, seg.c1);
        const c2 = apply(m, seg.c2);
        out.push(`C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(to.x)} ${fmt(to.y)}`);
      }
    }
    if (path.closed) out.push('Z');
  }
  return out.join('');
}

export function segmentCount(paths: PathData[]): number {
  return paths.reduce((n, p) => n + p.segments.length, 0);
}

/** Bed mm → display mm (Y down, origin top-left of the bed as drawn on screen). */
export function bedToDisplay(bed: BedFrame): Mat2D {
  return bedToScreenMatrix({ zoom: 1, offsetX: 0, offsetY: 0 }, bed);
}

export function objectToDisplay(bed: BedFrame, transform: Mat2D): Mat2D {
  return multiply(bedToDisplay(bed), transform);
}

/** Conservative bounds from on-curve and control points (beziers stay inside their hull). */
export function hullBounds(paths: PathData[], m: Mat2D): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (x: number, y: number) => {
    const p = apply(m, { x, y });
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const path of paths) {
    visit(path.start.x, path.start.y);
    for (const seg of path.segments) {
      visit(seg.to.x, seg.to.y);
      if (seg.type === 'C') {
        visit(seg.c1.x, seg.c1.y);
        visit(seg.c2.x, seg.c2.y);
      }
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

export function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
}
