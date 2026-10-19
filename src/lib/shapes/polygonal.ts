/* Generators for straight-edged shapes (Y-down box coordinates). Ported from curvesmith's multishape. */
import { PathBuilder, clamp, onEllipse, polygon, radial, starPoints, type ShapeGen } from './builder';
import { fitToBox } from './fit';
import type { Vec } from './internal-types';

export const POLYGONAL = {
  triangle: ({ w, h }, p) => {
    const apex = clamp(p('apex', 0.5), 0, 1);
    return polygon([
      [apex * w, 0],
      [w, h],
      [0, h],
    ]);
  },
  diamond: ({ w, h, cx }, p) => {
    const mid = clamp(p('middle', 0.5), 0.05, 0.95) * h;
    return polygon([
      [cx, 0],
      [w, mid],
      [cx, h],
      [0, mid],
    ]);
  },
  trapezoid: ({ w, h }, p) => {
    const inset = ((1 - clamp(p('top', 0.6), 0, 1)) * w) / 2;
    return polygon([
      [inset, 0],
      [w - inset, 0],
      [w, h],
      [0, h],
    ]);
  },
  parallelogram: ({ w, h }, p) => {
    const off = clamp(p('slant', 0.25), -0.95, 0.95) * w;
    return polygon(
      off >= 0
        ? [
            [off, 0],
            [w, 0],
            [w - off, h],
            [0, h],
          ]
        : [
            [0, 0],
            [w + off, 0],
            [w, h],
            [-off, h],
          ],
    );
  },
  gem: ({ w, h, cx }, p) => {
    const girdle = clamp(p('crown', 0.35), 0.05, 0.9) * h;
    const table = ((1 - clamp(p('table', 0.5), 0, 1)) * w) / 2;
    return polygon([
      [table, 0],
      [w - table, 0],
      [w, girdle],
      [cx, h],
      [0, girdle],
    ]);
  },
  polygon: (box, p) => {
    const sides = Math.round(clamp(p('sides', 6), 3, 64));
    return fitToBox(polygon(starPoints(sides, 1, true)), box);
  },
  star: (box, p) => {
    const points = Math.round(clamp(p('points', 5), 3, 64));
    const inner = clamp(p('inner', 0.48), 0.05, 0.95);
    return fitToBox(polygon(starPoints(points, inner, false)), box);
  },
  doubleStar: (box, p) => {
    const n = Math.round(clamp(p('points', 8), 3, 64));
    const inner = 1 - clamp(p('depth', 0.5), 0, 0.98);
    const second = clamp(p('secondary', 0.7), 0.05, 1);
    return polygon(radial(box, n * 4, (i) => (i % 4 === 0 ? 1 : i % 4 === 2 ? second : inner)));
  },
  squareStar: (box, p) => {
    const n = Math.round(clamp(p('points', 8), 3, 32));
    const inner = 1 - clamp(p('depth', 0.35), 0, 0.98);
    const tip = clamp(p('tip', 0.5), 0.05, 0.95);
    const step = (2 * Math.PI) / n;
    const pts: Vec[] = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * step;
      const half = (step / 2) * tip;
      pts.push(
        onEllipse(box, a - half / 2, 1),
        onEllipse(box, a + half / 2, 1),
        onEllipse(box, a + step / 2, inner),
      );
    }
    // Tips straddle the axes, so the outline would stop short of the box sides.
    return fitToBox(polygon(pts), box);
  },
  cog: (box, p) => {
    const { w, h, cx, cy } = box;
    const n = Math.round(clamp(p('teeth', 10), 4, 64));
    const rv = 1 - clamp(p('depth', 0.18), 0.02, 0.6);
    const tw = clamp(p('toothWidth', 0.45), 0.1, 0.9);
    const span = (2 * Math.PI) / n;
    const flank = span * 0.08;
    const pts: Vec[] = [];
    for (let i = 0; i < n; i++) {
      const base = -Math.PI / 2 + i * span - (span * tw) / 2;
      pts.push(
        onEllipse(box, base - flank, rv),
        onEllipse(box, base, 1),
        onEllipse(box, base + span * tw, 1),
        onEllipse(box, base + span * tw + flank, rv),
      );
    }
    const b = new PathBuilder().poly(pts);
    const hole = clamp(p('hole', 0.3), 0, 0.9);
    if (hole > 0.01) b.ellipse(cx, cy, (w / 2) * hole * rv, (h / 2) * hole * rv);
    // Teeth fall between the axis points; stretch so the box is the real cut size.
    return fitToBox(b.subpaths, box);
  },
  arrow: ({ w, h, cy }, p, params) => {
    const both = params.double === true;
    const hl = Math.min(clamp(p('head', 0.35), 0.02, 1) * w, both ? w / 2 : w);
    const st = ((1 - clamp(p('shaft', 0.4), 0.02, 1)) * h) / 2;
    const sb = h - st;
    return polygon(
      both
        ? [
            [0, cy],
            [hl, 0],
            [hl, st],
            [w - hl, st],
            [w - hl, 0],
            [w, cy],
            [w - hl, h],
            [w - hl, sb],
            [hl, sb],
            [hl, h],
          ]
        : [
            [0, st],
            [w - hl, st],
            [w - hl, 0],
            [w, cy],
            [w - hl, h],
            [w - hl, sb],
            [0, sb],
          ],
    );
  },
  chevron: ({ w, h, cy }, p) => {
    const d = Math.min(clamp(p('depth', 0.35), 0, 1) * h, w * 0.95);
    return polygon([
      [0, 0],
      [w - d, 0],
      [w, cy],
      [w - d, h],
      [0, h],
      [d, cy],
    ]);
  },
  cross: ({ w, h, cx, cy, m }, p) => {
    const t = (clamp(p('thickness', 0.33), 0.02, 1) * m) / 2;
    return polygon([
      [cx - t, 0],
      [cx + t, 0],
      [cx + t, cy - t],
      [w, cy - t],
      [w, cy + t],
      [cx + t, cy + t],
      [cx + t, h],
      [cx - t, h],
      [cx - t, cy + t],
      [0, cy + t],
      [0, cy - t],
      [cx - t, cy - t],
    ]);
  },
  bolt: ({ w, h }, p) => {
    const s = clamp(p('slant', 0.5), 0, 1);
    const pts: Vec[] = [
      [0.62, 0],
      [0.12 + 0.1 * (1 - s), 0.56],
      [0.46, 0.56],
      [0.32 - 0.12 * s, 1],
      [0.88 - 0.1 * (1 - s), 0.42],
      [0.54, 0.42],
      [0.8, 0],
    ];
    return polygon(pts.map(([x, y]) => [x * w, y * h]));
  },
  frame: ({ w, h, m }, p) => {
    const t = clamp(p('thickness', 0.15), 0.01, 0.49) * m;
    return [
      ...polygon([
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ]),
      ...polygon([
        [t, t],
        [w - t, t],
        [w - t, h - t],
        [t, h - t],
      ]),
    ];
  },
} satisfies Record<string, ShapeGen>;
