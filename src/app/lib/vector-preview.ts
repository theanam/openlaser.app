/** An SVG drawing of imported outlines, for the import dialog's preview of files without one (DXF). */
import type { PathData } from '$lib/geometry/types';
import type { SvgImportResult } from '$lib/import/svg';

const f = (n: number) => +n.toFixed(3);

export function pathToD(p: PathData): string {
  const parts = [`M${f(p.start.x)} ${f(p.start.y)}`];
  for (const s of p.segments) {
    parts.push(
      s.type === 'L'
        ? `L${f(s.to.x)} ${f(s.to.y)}`
        : `C${f(s.c1.x)} ${f(s.c1.y)} ${f(s.c2.x)} ${f(s.c2.y)} ${f(s.to.x)} ${f(s.to.y)}`,
    );
  }
  if (p.closed) parts.push('Z');
  return parts.join('');
}

/** Y-up mm outlines drawn as hairlines, flipped into SVG's Y-down space. */
export function previewSvg(result: SvgImportResult): string {
  const w = Math.max(result.width, 1e-3);
  const h = Math.max(result.height, 1e-3);
  const pad = Math.max(w, h) * 0.02;
  const paths = result.groups
    .map(
      (g) =>
        `<path d="${g.paths.map(pathToD).join('')}" fill="none" stroke="${g.color}" stroke-width="1" vector-effect="non-scaling-stroke"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(-pad)} ${f(-pad)} ${f(w + 2 * pad)} ${f(h + 2 * pad)}" width="${f(w)}mm" height="${f(h)}mm"><g transform="matrix(1 0 0 -1 0 ${f(h)})">${paths}</g></svg>`;
}
