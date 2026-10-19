/**
 * Print template: the design as true vector SVG in millimetres, so the browser hands the printer
 * paths and curves at full resolution. Includes corner marks and a 50 mm scale bar for checking
 * the printer kept 1:1.
 */
import { multiply, translation, unionRect } from '$lib/geometry/mat2d';
import type { Rect } from '$lib/geometry/types';
import type { Asset, MachineProfile, Project } from '$lib/project/types';
import { escapeXml, hullBounds, objectToDisplay, pathsToSvgD } from './svg-paths';

export interface PrintSvg {
  svg: string;
  /** Size of the drawing in mm, marks and caption included. */
  width: number;
  height: number;
}

const MARGIN = 8;
const SCALE_BAR = 50;
const FOOTER = 14;

export function designPrintSvg(
  project: Project,
  profile: Pick<MachineProfile, 'bedWidth' | 'bedHeight' | 'originCorner'>,
  imageHref: (asset: Asset) => string,
): PrintSvg | null {
  const bed = { width: profile.bedWidth, height: profile.bedHeight, originCorner: profile.originCorner };
  const layers = new Map(project.layers.map((l) => [l.id, l]));
  const visible = project.objects.filter((o) => o.visible && layers.get(o.layerId)?.visible !== false);
  let bounds: Rect | null = null;
  for (const o of visible) {
    const m = objectToDisplay(bed, o.transform);
    const b =
      o.kind === 'vector' || o.kind === 'text'
        ? hullBounds(o.paths, m)
        : o.kind === 'image'
          ? hullBounds(
              [
                {
                  closed: false,
                  start: { x: 0, y: 0 },
                  segments: [
                    { type: 'L', to: { x: o.width, y: o.height } },
                    { type: 'L', to: { x: 0, y: o.height } },
                    { type: 'L', to: { x: o.width, y: 0 } },
                  ],
                },
              ],
              m,
            )
          : null;
    bounds = unionRect(bounds, b);
  }
  if (!bounds) return null;

  const width = bounds.maxX - bounds.minX + MARGIN * 2;
  const height = bounds.maxY - bounds.minY + MARGIN * 2 + FOOTER;
  const shift = translation(MARGIN - bounds.minX, MARGIN - bounds.minY);
  const parts: string[] = [];

  for (const o of visible) {
    const layer = layers.get(o.layerId);
    const color = escapeXml(layer?.color ?? '#000000');
    const m = multiply(shift, objectToDisplay(bed, o.transform));
    if (o.kind === 'vector' || o.kind === 'text') {
      const fill =
        layer?.mode === 'fill' ? `fill="${color}" fill-opacity="0.35" fill-rule="evenodd"` : 'fill="none"';
      parts.push(`<path d="${pathsToSvgD(o.paths, m)}" ${fill} stroke="${color}" stroke-width="0.2"/>`);
    } else if (o.kind === 'image') {
      const asset = project.assets[o.assetId];
      if (!asset) continue;
      // Image space is Y-up with row 0 at the top edge (y = height).
      const im = multiply(m, [1, 0, 0, -1, 0, o.height]);
      parts.push(
        `<image href="${escapeXml(imageHref(asset))}" x="0" y="0" width="${o.width}" height="${o.height}" preserveAspectRatio="none" transform="matrix(${im.join(' ')})"/>`,
      );
    }
  }

  const marks: string[] = [];
  const corners = [
    [MARGIN, MARGIN, -1, -1],
    [width - MARGIN, MARGIN, 1, -1],
    [MARGIN, height - FOOTER - MARGIN, -1, 1],
    [width - MARGIN, height - FOOTER - MARGIN, 1, 1],
  ];
  for (const [x, y, dx, dy] of corners) {
    marks.push(`<path d="M${x + dx * 2} ${y}h${dx * 4}M${x} ${y + dy * 2}v${dy * 4}"/>`);
  }
  const barY = height - FOOTER / 2;
  const bar = Math.min(SCALE_BAR, width - MARGIN * 2);
  const caption = `${escapeXml(project.name)} · ${(bounds.maxX - bounds.minX).toFixed(1)} × ${(bounds.maxY - bounds.minY).toFixed(1)} mm · 1:1`;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">`,
    `<g>${parts.join('')}</g>`,
    `<g stroke="#000" stroke-width="0.2" fill="none">${marks.join('')}<path d="M${MARGIN} ${barY}h${bar}M${MARGIN} ${barY - 1.5}v3M${MARGIN + bar} ${barY - 1.5}v3"/></g>`,
    `<g font-family="Geist, sans-serif" font-size="3" fill="#000"><text x="${MARGIN}" y="${barY - 2.5}">${bar} mm</text><text x="${width - MARGIN}" y="${barY + 1}" text-anchor="end">${caption}</text></g>`,
    '</svg>',
  ].join('');
  return { svg, width, height };
}
