/* The shape catalog: each parametric shape's label, group and editable parameters. Ported from
   curvesmith's shapeCatalog, with Star and Polygon given their own parameters here (curvesmith kept them
   on a separate node type). */
import type { ShapeParams } from './internal-types';

export type ShapeKind =
  | 'triangle'
  | 'diamond'
  | 'trapezoid'
  | 'parallelogram'
  | 'gem'
  | 'polygon'
  | 'star'
  | 'doubleStar'
  | 'squareStar'
  | 'flower'
  | 'cog'
  | 'arrow'
  | 'chevron'
  | 'cross'
  | 'bolt'
  | 'heart'
  | 'shield'
  | 'donut'
  | 'frame'
  | 'pie'
  | 'arc'
  | 'segment'
  | 'crescent'
  | 'spiral'
  | 'calloutRect'
  | 'calloutEllipse'
  | 'cloud'
  | 'tear';

export type ParamDef =
  | { key: string; label: string; type: 'percent'; default: number; min: number; max: number }
  | {
      key: string;
      label: string;
      type: 'count';
      default: number;
      min: number;
      max: number;
      options?: number[];
    }
  | { key: string; label: string; type: 'angle'; default: number; min?: number; max?: number }
  | { key: string; label: string; type: 'bool'; default: boolean };

export type ShapeGroup = 'Basic' | 'Stars & gears' | 'Arrows & symbols' | 'Rings & arcs' | 'Speech & nature';

export type ShapeDef = {
  kind: ShapeKind;
  label: string;
  group: ShapeGroup;
  params: ParamDef[];
  /** Open shapes (spirals) are cut as lines; they enclose no area. */
  open?: boolean;
};

const pct = (key: string, label: string, def: number, min = 0, max = 100): ParamDef => ({
  key,
  label,
  type: 'percent',
  default: def,
  min,
  max,
});
const count = (
  key: string,
  label: string,
  def: number,
  min: number,
  max: number,
  options?: number[],
): ParamDef => ({ key, label, type: 'count', default: def, min, max, options });
const angle = (key: string, label: string, def: number, min?: number, max?: number): ParamDef => ({
  key,
  label,
  type: 'angle',
  default: def,
  min,
  max,
});

const POINTS = [3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 20, 24, 32];

export const SHAPES: ShapeDef[] = [
  { kind: 'triangle', label: 'Triangle', group: 'Basic', params: [pct('apex', 'Apex', 50)] },
  { kind: 'diamond', label: 'Diamond', group: 'Basic', params: [pct('middle', 'Waist', 50, 5, 95)] },
  { kind: 'trapezoid', label: 'Trapezoid', group: 'Basic', params: [pct('top', 'Top', 60)] },
  {
    kind: 'parallelogram',
    label: 'Parallelogram',
    group: 'Basic',
    params: [pct('slant', 'Slant', 25, -95, 95)],
  },
  {
    kind: 'gem',
    label: 'Gem',
    group: 'Basic',
    params: [pct('table', 'Table', 50), pct('crown', 'Crown', 35, 5, 90)],
  },
  { kind: 'polygon', label: 'Polygon', group: 'Basic', params: [count('sides', 'Sides', 6, 3, 64, POINTS)] },
  {
    kind: 'star',
    label: 'Star',
    group: 'Stars & gears',
    params: [count('points', 'Points', 5, 3, 64, POINTS), pct('inner', 'Inner', 48, 5, 95)],
  },
  {
    kind: 'doubleStar',
    label: 'Double star',
    group: 'Stars & gears',
    params: [
      count('points', 'Points', 8, 3, 64, POINTS),
      pct('depth', 'Depth', 50, 0, 98),
      pct('secondary', 'Second', 70, 5),
    ],
  },
  {
    kind: 'squareStar',
    label: 'Square star',
    group: 'Stars & gears',
    params: [
      count('points', 'Points', 8, 3, 32, POINTS),
      pct('depth', 'Depth', 35, 0, 98),
      pct('tip', 'Tip', 50, 5, 95),
    ],
  },
  {
    kind: 'flower',
    label: 'Flower',
    group: 'Stars & gears',
    params: [count('petals', 'Petals', 6, 3, 32, POINTS), pct('depth', 'Depth', 35, 2, 95)],
  },
  {
    kind: 'cog',
    label: 'Cog',
    group: 'Stars & gears',
    params: [
      count('teeth', 'Teeth', 10, 4, 64, [6, 8, 10, 12, 16, 20, 24, 32, 48]),
      pct('depth', 'Depth', 18, 2, 60),
      pct('toothWidth', 'Tooth', 45, 10, 90),
      pct('hole', 'Hole', 30, 0, 90),
    ],
  },
  {
    kind: 'arrow',
    label: 'Arrow',
    group: 'Arrows & symbols',
    params: [
      pct('head', 'Head', 35, 2),
      pct('shaft', 'Shaft', 40, 2),
      { key: 'double', label: 'Both ends', type: 'bool', default: false },
    ],
  },
  { kind: 'chevron', label: 'Chevron', group: 'Arrows & symbols', params: [pct('depth', 'Depth', 35)] },
  {
    kind: 'cross',
    label: 'Cross',
    group: 'Arrows & symbols',
    params: [pct('thickness', 'Thickness', 33, 2)],
  },
  { kind: 'bolt', label: 'Lightning bolt', group: 'Arrows & symbols', params: [pct('slant', 'Slant', 50)] },
  { kind: 'heart', label: 'Heart', group: 'Arrows & symbols', params: [pct('cleft', 'Cleft', 50)] },
  { kind: 'shield', label: 'Shield', group: 'Arrows & symbols', params: [pct('point', 'Point', 55, 5, 95)] },
  { kind: 'donut', label: 'Donut', group: 'Rings & arcs', params: [pct('hole', 'Hole', 50, 2, 98)] },
  { kind: 'frame', label: 'Frame', group: 'Rings & arcs', params: [pct('thickness', 'Border', 15, 1, 49)] },
  {
    kind: 'pie',
    label: 'Pie',
    group: 'Rings & arcs',
    params: [angle('start', 'Start', -90), angle('sweep', 'Sweep', 270, 1, 359)],
  },
  {
    kind: 'arc',
    label: 'Arc',
    group: 'Rings & arcs',
    params: [
      angle('start', 'Start', 180),
      angle('sweep', 'Sweep', 180, 1, 359),
      pct('thickness', 'Width', 30, 2, 98),
    ],
  },
  { kind: 'segment', label: 'Segment', group: 'Rings & arcs', params: [pct('amount', 'Height', 50, 2, 98)] },
  {
    kind: 'crescent',
    label: 'Crescent',
    group: 'Rings & arcs',
    params: [pct('offset', 'Offset', 45, 5, 190), pct('inner', 'Inner', 85, 20, 140)],
  },
  {
    kind: 'spiral',
    label: 'Spiral',
    group: 'Rings & arcs',
    open: true,
    params: [count('turns', 'Turns', 3, 1, 12), pct('inner', 'Start', 8, 0, 90)],
  },
  {
    kind: 'calloutRect',
    label: 'Callout',
    group: 'Speech & nature',
    params: [
      pct('radius', 'Radius', 12, 0, 50),
      pct('tailX', 'Tail at', 30),
      pct('tailWidth', 'Tail width', 18, 2, 90),
      pct('tailLength', 'Tail length', 25, 2, 80),
      pct('tailSkew', 'Tail skew', 0, -100, 100),
    ],
  },
  {
    kind: 'calloutEllipse',
    label: 'Speech bubble',
    group: 'Speech & nature',
    params: [
      pct('tailX', 'Tail at', 30),
      pct('tailWidth', 'Tail width', 18, 2, 90),
      pct('tailLength', 'Tail length', 25, 2, 80),
    ],
  },
  {
    kind: 'cloud',
    label: 'Cloud',
    group: 'Speech & nature',
    params: [
      count('bumps', 'Bumps', 9, 5, 32),
      pct('bulge', 'Bulge', 18, 2, 60),
      pct('variety', 'Variety', 45),
    ],
  },
  { kind: 'tear', label: 'Tear', group: 'Speech & nature', params: [pct('point', 'Point', 50)] },
];

export const SHAPE_GROUPS: ShapeGroup[] = [
  'Basic',
  'Stars & gears',
  'Arrows & symbols',
  'Rings & arcs',
  'Speech & nature',
];

const BY_KIND = new Map<string, ShapeDef>(SHAPES.map((s) => [s.kind, s]));

export const isShapeKind = (s: string): s is ShapeKind => BY_KIND.has(s);

export function shapeDef(kind: ShapeKind): ShapeDef {
  const def = BY_KIND.get(kind);
  if (!def) throw new Error(`Unknown shape kind: ${kind}`);
  return def;
}

/** Parameter values as stored: percents are fractions (50% → 0.5), counts and angles as-is. */
export function defaultParams(kind: ShapeKind): ShapeParams {
  const out: ShapeParams = {};
  for (const p of shapeDef(kind).params) out[p.key] = p.type === 'percent' ? p.default / 100 : p.default;
  return out;
}
