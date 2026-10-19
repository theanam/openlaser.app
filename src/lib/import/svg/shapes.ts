import type { PathData, Segment, Vec2 } from '../../geometry/types';
import { numberAttr, parseNumberList } from './numbers';
import { parsePathData } from './path-data';

/** Handle length for a quarter circle as a cubic (4/3·(√2−1)). */
const KAPPA = 0.5522847498307936;

export const SHAPE_ELEMENTS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

/** Geometry of a basic shape element as subpaths in its own user units. Empty for degenerate shapes. */
export function shapeToPaths(el: Element): PathData[] {
  switch (el.localName) {
    case 'path':
      return parsePathData(el.getAttribute('d'));
    case 'rect':
      return rectPaths(el);
    case 'circle': {
      const r = numberAttr(el, 'r');
      return ellipsePaths(numberAttr(el, 'cx'), numberAttr(el, 'cy'), r, r);
    }
    case 'ellipse':
      return ellipsePaths(
        numberAttr(el, 'cx'),
        numberAttr(el, 'cy'),
        numberAttr(el, 'rx'),
        numberAttr(el, 'ry'),
      );
    case 'line':
      return [
        {
          closed: false,
          start: { x: numberAttr(el, 'x1'), y: numberAttr(el, 'y1') },
          segments: [{ type: 'L', to: { x: numberAttr(el, 'x2'), y: numberAttr(el, 'y2') } }],
        },
      ];
    case 'polyline':
    case 'polygon':
      return polyPaths(parseNumberList(el.getAttribute('points')), el.localName === 'polygon');
    default:
      return [];
  }
}

function polyPaths(n: number[], closed: boolean): PathData[] {
  const count = Math.floor(n.length / 2);
  if (count < 2) return [];
  const segments: Segment[] = [];
  for (let i = 1; i < count; i++) segments.push({ type: 'L', to: { x: n[2 * i], y: n[2 * i + 1] } });
  if (closed && (n[0] !== n[2 * count - 2] || n[1] !== n[2 * count - 1])) {
    segments.push({ type: 'L', to: { x: n[0], y: n[1] } });
  }
  return [{ closed, start: { x: n[0], y: n[1] }, segments }];
}

/** Rect with optional rounded corners; rx/ry default to each other and clamp to half the size. */
function rectPaths(el: Element): PathData[] {
  const x = numberAttr(el, 'x');
  const y = numberAttr(el, 'y');
  const w = numberAttr(el, 'width');
  const h = numberAttr(el, 'height');
  if (!(w > 0 && h > 0)) return [];
  const rxAttr = el.hasAttribute('rx') ? numberAttr(el, 'rx', NaN) : NaN;
  const ryAttr = el.hasAttribute('ry') ? numberAttr(el, 'ry', NaN) : NaN;
  let rx =
    Number.isFinite(rxAttr) && rxAttr > 0 ? rxAttr : Number.isFinite(ryAttr) && ryAttr > 0 ? ryAttr : 0;
  let ry = Number.isFinite(ryAttr) && ryAttr > 0 ? ryAttr : rx;
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  const p = (px: number, py: number): Vec2 => ({ x: px, y: py });
  if (rx === 0 || ry === 0) {
    return [
      {
        closed: true,
        start: p(x, y),
        segments: [p(x + w, y), p(x + w, y + h), p(x, y + h), p(x, y)].map((to) => ({ type: 'L', to })),
      },
    ];
  }
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  const right = x + w;
  const bottom = y + h;
  const segments: Segment[] = [
    { type: 'L', to: p(right - rx, y) },
    { type: 'C', c1: p(right - rx + kx, y), c2: p(right, y + ry - ky), to: p(right, y + ry) },
    { type: 'L', to: p(right, bottom - ry) },
    { type: 'C', c1: p(right, bottom - ry + ky), c2: p(right - rx + kx, bottom), to: p(right - rx, bottom) },
    { type: 'L', to: p(x + rx, bottom) },
    { type: 'C', c1: p(x + rx - kx, bottom), c2: p(x, bottom - ry + ky), to: p(x, bottom - ry) },
    { type: 'L', to: p(x, y + ry) },
    { type: 'C', c1: p(x, y + ry - ky), c2: p(x + rx - kx, y), to: p(x + rx, y) },
  ];
  // Drop zero-length straight edges (fully rounded sides).
  const kept = segments.filter((s, i) => {
    if (s.type !== 'L') return true;
    const prev = i === 0 ? p(x + rx, y) : segments[i - 1].to;
    return prev.x !== s.to.x || prev.y !== s.to.y;
  });
  return [{ closed: true, start: p(x + rx, y), segments: kept }];
}

function ellipsePaths(cx: number, cy: number, rx: number, ry: number): PathData[] {
  if (!(rx > 0 && ry > 0)) return [];
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  const p = (px: number, py: number): Vec2 => ({ x: px, y: py });
  return [
    {
      closed: true,
      start: p(cx + rx, cy),
      segments: [
        { type: 'C', c1: p(cx + rx, cy + ky), c2: p(cx + kx, cy + ry), to: p(cx, cy + ry) },
        { type: 'C', c1: p(cx - kx, cy + ry), c2: p(cx - rx, cy + ky), to: p(cx - rx, cy) },
        { type: 'C', c1: p(cx - rx, cy - ky), c2: p(cx - kx, cy - ry), to: p(cx, cy - ry) },
        { type: 'C', c1: p(cx + kx, cy - ry), c2: p(cx + rx, cy - ky), to: p(cx + rx, cy) },
      ],
    },
  ];
}
