import type { Mat2D } from '../../geometry/types';
import { parseNumberList } from './numbers';

export const DEFAULT_SVG_DPI = 96;

/** Millimetres per unit for absolute CSS units. `px` depends on the import DPI. */
const MM_PER_UNIT: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, q: 0.25 };

/**
 * A root `width`/`height` value in mm. Unitless and px values use `dpi` (96 by default; some tools
 * export at 72). Percentages and font-relative units return null (the viewBox decides instead).
 */
export function parseLengthMm(value: string | null, dpi: number): number | null {
  if (value === null) return null;
  const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(value);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (!(amount > 0)) return null;
  if (unit === '' || unit === 'px') return (amount * 25.4) / dpi;
  const factor = MM_PER_UNIT[unit];
  return factor === undefined ? null : amount * factor;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function parseViewBox(value: string | null): ViewBox | null {
  const n = parseNumberList(value);
  if (n.length !== 4 || !(n[2] > 0) || !(n[3] > 0)) return null;
  return { x: n[0], y: n[1], width: n[2], height: n[3] };
}

/**
 * Maps viewBox user units onto a viewport of `width × height` (any unit), following
 * preserveAspectRatio: `none`, or an `x(Min|Mid|Max)Y(Min|Mid|Max)` alignment with `meet`
 * (default, fit inside) or `slice` (cover).
 */
export function viewBoxTransform(box: ViewBox, width: number, height: number, aspect: string | null): Mat2D {
  const sx = width / box.width;
  const sy = height / box.height;
  const [align = 'xMidYMid', mode = 'meet'] = (aspect ?? '').trim().split(/\s+/).filter(Boolean);
  if (align === 'none') return [sx, 0, 0, sy, -box.x * sx, -box.y * sy];
  const s = mode === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
  const fraction = (key: string) => (key === 'Min' ? 0 : key === 'Max' ? 1 : 0.5);
  const ax = fraction(align.slice(1, 4));
  const ay = fraction(align.slice(5, 8));
  return [s, 0, 0, s, -box.x * s + ax * (width - box.width * s), -box.y * s + ay * (height - box.height * s)];
}

export interface RootViewport {
  /** Root user units → document mm (Y-down). */
  matrix: Mat2D;
  /** Document size in mm; null when the file gives neither size nor viewBox. */
  width: number | null;
  height: number | null;
}

/**
 * Resolves the root `<svg>` size and user-unit scale. Physical width/height win and the viewBox is
 * fitted into them; a missing dimension follows the viewBox aspect ratio; with no size at all the
 * viewBox is read as px at `dpi`.
 */
export function rootViewport(svg: Element, dpi: number): RootViewport {
  const pxToMm = 25.4 / dpi;
  let width = parseLengthMm(svg.getAttribute('width'), dpi);
  let height = parseLengthMm(svg.getAttribute('height'), dpi);
  const box = parseViewBox(svg.getAttribute('viewBox'));
  if (!box) return { matrix: [pxToMm, 0, 0, pxToMm, 0, 0], width, height };
  if (width === null && height === null) {
    width = box.width * pxToMm;
    height = box.height * pxToMm;
  } else if (width === null) {
    width = ((height as number) * box.width) / box.height;
  } else if (height === null) {
    height = (width * box.height) / box.width;
  }
  return {
    matrix: viewBoxTransform(box, width, height as number, svg.getAttribute('preserveAspectRatio')),
    width,
    height,
  };
}
