import { apply, multiply, translation } from '../../geometry/mat2d';
import type { Mat2D, PathData, Segment } from '../../geometry/types';
import { numberAttr } from './numbers';
import { SHAPE_ELEMENTS, shapeToPaths } from './shapes';
import {
  type ElementStyle,
  type InheritedStyle,
  type Paint,
  resolveStyle,
  type StyleContext,
  visiblePaints,
} from './style';
import { parseTransform } from './transform';
import type { SvgColorGroup, SvgPaintKind } from './types';
import { parseViewBox, viewBoxTransform } from './units';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Containers whose children render. */
const CONTAINERS = new Set(['g', 'a', 'switch']);
/** Rendered elements we do not import; they are counted for the summary. */
const SKIPPED = new Set(['text', 'use', 'foreignObject']);
const RASTER_DATA_URI = /^data:image\/(png|jpe?g|webp|bmp|gif)[;,]/i;

/** An embedded image before the final Y flip: user-space box and its matrix to document mm (Y-down). */
export interface CollectedImage {
  href: string;
  width: number;
  height: number;
  /** Image space (0..width, 0..height user units, Y-up) → document mm, Y-down. */
  matrix: Mat2D;
}

/**
 * Walks the render tree once, transforming geometry to document mm (still Y-down) and grouping
 * it by paint. A shape with a stroke goes to its stroke color as a line group even when it is
 * also filled (cutting the outline is the common intent); fill-only shapes go to fill groups.
 */
export class SvgCollector {
  readonly groups = new Map<string, SvgColorGroup>();
  readonly images: CollectedImage[] = [];
  readonly ignored: Record<string, number> = {};

  constructor(private readonly context: StyleContext) {}

  walk(parent: Element, ctm: Mat2D, inherited: InheritedStyle): void {
    for (const el of Array.from(parent.children)) {
      if (el.namespaceURI !== SVG_NS && el.namespaceURI !== null) continue;
      const name = el.localName;
      if (SKIPPED.has(name)) {
        this.count(name);
        continue;
      }
      const isShape = SHAPE_ELEMENTS.has(name);
      if (!isShape && !CONTAINERS.has(name) && name !== 'svg' && name !== 'image') continue;
      const style = resolveStyle(el, inherited, this.context);
      if (style.notRendered) continue;
      this.countEffects(style);
      let matrix = multiply(ctm, parseTransform(el.getAttribute('transform')));
      if (name === 'svg') matrix = multiply(matrix, nestedViewport(el));
      if (isShape) {
        if (!style.hidden) this.addShape(el, matrix, style);
      } else if (name === 'image') {
        if (!style.hidden) this.addImage(el, matrix);
      } else {
        this.walk(el, matrix, style);
      }
    }
  }

  count(key: string): void {
    this.ignored[key] = (this.ignored[key] ?? 0) + 1;
  }

  private countEffects(style: ElementStyle): void {
    if (style.clipPath) this.count('clipPath');
    if (style.mask) this.count('mask');
    if (style.filter) this.count('filter');
  }

  private addShape(el: Element, matrix: Mat2D, style: ElementStyle): void {
    const { fill, stroke } = visiblePaints(style);
    let paint: Paint = stroke;
    let kind: SvgPaintKind = 'stroke';
    if (paint.kind === 'none' && el.localName !== 'line') {
      paint = fill;
      kind = 'fill';
    }
    if (paint.kind === 'none') return;
    if (paint.source !== 'solid') this.count(paint.source);
    const paths = shapeToPaths(el).map((path) => transformPath(path, matrix));
    if (paths.length === 0) return;
    // SVG fills subpaths as if closed, so fill geometry is closed explicitly.
    if (kind === 'fill') for (const path of paths) closePath(path);
    const key = `${kind}:${paint.color}`;
    const group = this.groups.get(key);
    if (group) group.paths.push(...paths);
    else this.groups.set(key, { color: paint.color, kind, paths });
  }

  private addImage(el: Element, matrix: Mat2D): void {
    const href = el.getAttribute('href') ?? el.getAttributeNS(XLINK_NS, 'href') ?? '';
    const width = numberAttr(el, 'width');
    const height = numberAttr(el, 'height');
    if (!RASTER_DATA_URI.test(href) || !(width > 0 && height > 0)) {
      this.count('image');
      return;
    }
    const x = numberAttr(el, 'x');
    const y = numberAttr(el, 'y');
    // Image space is Y-up with its origin at the box's bottom-left: (u, v) → (x + u, y + height − v).
    this.images.push({ href, width, height, matrix: multiply(matrix, [1, 0, 0, -1, x, y + height]) });
  }
}

/** Viewport of a nested `<svg>`: its x/y offset plus the viewBox fit into its width/height. */
function nestedViewport(el: Element): Mat2D {
  const offset = translation(numberAttr(el, 'x'), numberAttr(el, 'y'));
  const box = parseViewBox(el.getAttribute('viewBox'));
  if (!box) return offset;
  const width = numberAttr(el, 'width', box.width);
  const height = numberAttr(el, 'height', box.height);
  return multiply(offset, viewBoxTransform(box, width, height, el.getAttribute('preserveAspectRatio')));
}

export function transformPath(path: PathData, m: Mat2D): PathData {
  return {
    closed: path.closed,
    start: apply(m, path.start),
    segments: path.segments.map((s): Segment =>
      s.type === 'L'
        ? { type: 'L', to: apply(m, s.to) }
        : { type: 'C', c1: apply(m, s.c1), c2: apply(m, s.c2), to: apply(m, s.to) },
    ),
  };
}

function closePath(path: PathData): void {
  if (path.closed) return;
  const end = path.segments[path.segments.length - 1].to;
  if (end.x !== path.start.x || end.y !== path.start.y)
    path.segments.push({ type: 'L', to: { ...path.start } });
  path.closed = true;
}
