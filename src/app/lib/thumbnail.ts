/** Small SVG previews of a project for the recent projects list. */
import type { MachineProfile, Project } from '$lib/project/types';
import { escapeXml, hullBounds, objectToDisplay, pathsToSvgD, segmentCount } from './svg-paths';

/** Above this many segments, objects are drawn as outlines of their bounds to keep thumbnails small. */
const DETAIL_BUDGET = 4000;

export function projectThumbnail(
  project: Project,
  profile: Pick<MachineProfile, 'bedWidth' | 'bedHeight' | 'originCorner'>,
): string {
  const bed = { width: profile.bedWidth, height: profile.bedHeight, originCorner: profile.originCorner };
  const colors = new Map(project.layers.map((l) => [l.id, l.color]));
  const stroke = Math.max(bed.width, bed.height) / 120;
  let budget = DETAIL_BUDGET;
  const parts: string[] = [];
  for (const object of project.objects) {
    if (!object.visible) continue;
    const color = escapeXml(colors.get(object.layerId) ?? '#9BA1A6');
    const m = objectToDisplay(bed, object.transform);
    if (object.kind === 'vector' || object.kind === 'text') {
      const count = segmentCount(object.paths);
      if (count <= budget) {
        budget -= count;
        parts.push(
          `<path d="${pathsToSvgD(object.paths, m)}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`,
        );
        continue;
      }
      const b = hullBounds(object.paths, m);
      if (b)
        parts.push(
          `<rect x="${b.minX}" y="${b.minY}" width="${b.maxX - b.minX}" height="${b.maxY - b.minY}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`,
        );
    } else if (object.kind === 'image') {
      const corners = [
        { x: 0, y: 0 },
        { x: object.width, y: object.height },
      ];
      const b = hullBounds(
        [{ closed: false, start: corners[0], segments: [{ type: 'L', to: corners[1] }] }],
        m,
      );
      if (b)
        parts.push(
          `<rect x="${b.minX}" y="${b.minY}" width="${b.maxX - b.minX}" height="${b.maxY - b.minY}" fill="${color}" fill-opacity="0.5"/>`,
        );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bed.width} ${bed.height}"><rect width="${bed.width}" height="${bed.height}" fill="#16181B"/>${parts.join('')}</svg>`;
}
