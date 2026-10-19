import { apply, multiply, scaling } from '../../geometry/mat2d';
import type { Mat2D, PathData } from '../../geometry/types';
import { parseStylesheet } from './css';
import { resolveStyle, ROOT_STYLE, type StyleContext } from './style';
import { parseTransform } from './transform';
import { IGNORED_HINTS, type SvgImage, type SvgImportOptions, type SvgImportResult } from './types';
import { DEFAULT_SVG_DPI, rootViewport } from './units';
import { type CollectedImage, SvgCollector, transformPath } from './walk';

export { buildProjectObjectsFromSvg, type SvgProjectObjects, type SvgToProjectOptions } from './to-project';
export * from './types';
export { DEFAULT_SVG_DPI } from './units';

/**
 * Imports an SVG document (SPEC §5.1). Runs on the main thread because it needs DOMParser; the
 * result is plain data that can be posted to workers.
 *
 * Output is in mm, Y-up, with the document's bottom-left corner at (0,0): the drawing appears
 * upright on the Y-up bed. Throws an Error with a readable message when the text is not SVG.
 */
export function importSvg(text: string, options: SvgImportOptions = {}): SvgImportResult {
  const dpi = options.dpi && options.dpi > 0 ? options.dpi : DEFAULT_SVG_DPI;
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (doc.getElementsByTagName('parsererror').length > 0 || svg.localName !== 'svg') {
    throw new Error('This file is not a valid SVG document.');
  }

  const context: StyleContext = { rules: [], ids: new Map() };
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    const id = el.getAttribute('id');
    if (id && !context.ids.has(id)) context.ids.set(id, el);
    if (el.localName === 'style') {
      context.rules.push(...parseStylesheet(el.textContent ?? '', context.rules.length));
    }
  }

  const viewport = rootViewport(svg, dpi);
  const collector = new SvgCollector(context);
  const rootStyle = resolveStyle(svg, ROOT_STYLE, context);
  if (!rootStyle.notRendered) {
    collector.walk(svg, multiply(viewport.matrix, parseTransform(svg.getAttribute('transform'))), rootStyle);
  }

  const groups = [...collector.groups.values()];
  const extent = contentExtent(
    groups.flatMap((g) => g.paths),
    collector.images,
  );
  const width = viewport.width ?? extent.x;
  const height = viewport.height ?? extent.y;
  // SVG is Y-down; mirror about the document's horizontal center line so the art reads upright.
  const flip: Mat2D = [1, 0, 0, -1, 0, height];
  for (const group of groups) group.paths = group.paths.map((path) => transformPath(path, flip));

  return {
    width,
    height,
    groups,
    images: collector.images.map((image) => placeImage(image, flip)),
    ignored: collector.ignored,
    warnings: Object.entries(collector.ignored).map(
      ([key, count]) => `${count} × ${key}: ${IGNORED_HINTS[key]}`,
    ),
  };
}

/** Normalizes the matrix to unit scale so width/height carry the size in mm. */
function placeImage(image: CollectedImage, flip: Mat2D): SvgImage {
  const m = multiply(flip, image.matrix);
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  const transform = multiply(m, scaling(1 / sx, 1 / sy));
  const origin = apply(transform, { x: 0, y: 0 });
  return {
    href: image.href,
    x: origin.x,
    y: origin.y,
    width: image.width * sx,
    height: image.height * sy,
    transform,
  };
}

/** Far corner of all content (control points included), for documents without a size. */
function contentExtent(paths: PathData[], images: CollectedImage[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  const include = (p: { x: number; y: number }) => {
    if (p.x > x) x = p.x;
    if (p.y > y) y = p.y;
  };
  for (const path of paths) {
    include(path.start);
    for (const s of path.segments) {
      include(s.to);
      if (s.type === 'C') {
        include(s.c1);
        include(s.c2);
      }
    }
  }
  for (const image of images) {
    for (const [u, v] of [
      [0, 0],
      [image.width, 0],
      [0, image.height],
      [image.width, image.height],
    ]) {
      include(apply(image.matrix, { x: u, y: v }));
    }
  }
  return { x, y };
}
