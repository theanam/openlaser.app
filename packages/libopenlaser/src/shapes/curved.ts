/* Generators for shapes with curved edges (Y-down box coordinates). Ported from curvesmith's multishape.
   Holes (donut) are separate subpaths, cut like any inner contour. */
import { DEG, PathBuilder, clamp, onEllipse, smoothOpen, type Box, type ShapeGen } from './builder';
import { fitToBox } from './fit';
import type { Subpath, Vec } from './internal-types';

/** Scalloped outline (flower petals, cloud bumps): valleys at `valley`, arcs bulging out to the edge,
    then stretched to the box because the bump peaks only approximate it. */
function scallops(box: Box, spans: number[], valley: number): Subpath[] {
  const b = new PathBuilder();
  const total = spans.reduce((s, x) => s + x, 0);
  let a = -Math.PI / 2;
  spans.forEach((sp, i) => {
    const span = (sp / total) * Math.PI * 2;
    const a1 = a + span;
    // Control radius so the bump peaks at the edge (cubic midpoint ≈ ¼·valley + ¾·Rc·cos(0.3·span)).
    const rc = (1 - 0.25 * valley) / (0.75 * Math.cos(0.3 * span));
    const p0 = onEllipse(box, a, valley);
    if (i === 0) b.move(p0[0], p0[1]);
    const p3 = onEllipse(box, a1, valley);
    b.cubic(onEllipse(box, a + span * 0.2, rc), onEllipse(box, a + span * 0.8, rc), p3[0], p3[1]);
    a = a1;
  });
  return fitToBox(b.close().subpaths, box);
}

export const CURVED = {
  flower: (box, p) => {
    const n = Math.round(clamp(p('petals', 6), 3, 32));
    return scallops(box, Array<number>(n).fill(1), 1 - clamp(p('depth', 0.35), 0.02, 0.95));
  },
  cloud: (box, p) => {
    const n = Math.round(clamp(p('bumps', 9), 5, 32));
    const vary = clamp(p('variety', 0.45), 0, 1);
    // Alternate bump sizes in a fixed pattern so the cloud looks irregular but stays deterministic.
    const spans = Array.from(
      { length: n },
      (_, i) => 1 - vary * (i % 2 ? 0.45 : 0) - vary * (i % 3 === 2 ? 0.2 : 0),
    );
    return scallops(box, spans, 1 - clamp(p('bulge', 0.18), 0.02, 0.6));
  },
  donut: ({ w, h, cx, cy }, p) => {
    const hole = clamp(p('hole', 0.5), 0.02, 0.98);
    return new PathBuilder().ellipse(cx, cy, w / 2, h / 2).ellipse(cx, cy, (w / 2) * hole, (h / 2) * hole)
      .subpaths;
  },
  pie: ({ w, h, cx, cy }, p) => {
    const start = p('start', -90) * DEG;
    const sweep = clamp(p('sweep', 270), 1, 359.9) * DEG;
    return new PathBuilder()
      .move(cx, cy)
      .arc(cx, cy, w / 2, h / 2, start, start + sweep)
      .close().subpaths;
  },
  arc: ({ w, h, cx, cy }, p) => {
    const start = p('start', 180) * DEG;
    const sweep = clamp(p('sweep', 180), 1, 359.9) * DEG;
    const k = 1 - clamp(p('thickness', 0.3), 0.02, 0.98);
    return new PathBuilder()
      .arc(cx, cy, w / 2, h / 2, start, start + sweep)
      .arc(cx, cy, (w / 2) * k, (h / 2) * k, start + sweep, start)
      .close().subpaths;
  },
  segment: ({ w, h, cx, cy }, p) => {
    // Keep `amount` of the ellipse's height, measured from the bottom, cut by a straight chord.
    const amount = clamp(p('amount', 0.5), 0.02, 0.98);
    const chordY = h * (1 - amount);
    const a = Math.asin(clamp((chordY - cy) / (h / 2), -1, 1));
    return new PathBuilder().arc(cx, cy, w / 2, h / 2, a, Math.PI - a).close().subpaths;
  },
  crescent: ({ w, h, cx, cy }, p) => {
    // Unit circle minus a circle of radius r centred at (d, 0); traced as one outline so no hole is needed.
    const r = clamp(p('inner', 0.85), 0.2, 1.4);
    const d = clamp(p('offset', 0.45), 0.05, 1.9);
    const xi = (1 - r * r + d * d) / (2 * d);
    if (Math.abs(xi) >= 1) return new PathBuilder().ellipse(cx, cy, w / 2, h / 2).subpaths;
    const yi = Math.sqrt(1 - xi * xi);
    const top = Math.atan2(-yi, xi);
    const bottom = Math.atan2(yi, xi);
    const i1 = Math.atan2(-yi, xi - d);
    const i2 = Math.atan2(yi, xi - d);
    return new PathBuilder()
      .arc(cx, cy, w / 2, h / 2, bottom, top + 2 * Math.PI)
      .arc(cx + (d * w) / 2, cy, (r * w) / 2, (r * h) / 2, i1, i2 - 2 * Math.PI)
      .close().subpaths;
  },
  calloutRect: ({ w, h, m }, p) => {
    const tl = clamp(p('tailLength', 0.25), 0.02, 0.8) * h;
    const bh = h - tl;
    const r = Math.min(clamp(p('radius', 0.12), 0, 0.5) * m, bh / 2, w / 2);
    const tw = clamp(p('tailWidth', 0.18), 0.02, 0.9) * w;
    const bx = clamp(clamp(p('tailX', 0.3), 0, 1) * w, r + tw / 2, w - r - tw / 2);
    const tip = bx - tw / 2 + clamp(p('tailSkew', 0), -1, 1) * w * 0.25;
    const b = new PathBuilder().move(r, 0).line(w - r, 0);
    if (r) b.arc(w - r, r, r, r, -Math.PI / 2, 0);
    b.line(w, bh - r);
    if (r) b.arc(w - r, bh - r, r, r, 0, Math.PI / 2);
    b.line(bx + tw / 2, bh)
      .line(tip, h)
      .line(bx - tw / 2, bh)
      .line(r, bh);
    if (r) b.arc(r, bh - r, r, r, Math.PI / 2, Math.PI);
    b.line(0, r);
    if (r) b.arc(r, r, r, r, Math.PI, Math.PI * 1.5);
    return b.close().subpaths;
  },
  calloutEllipse: ({ w, h, cx }, p) => {
    const tl = clamp(p('tailLength', 0.25), 0.02, 0.8) * h;
    const ery = (h - tl) / 2;
    const pos = clamp(p('tailX', 0.3), 0, 1);
    // The tail leaves the ellipse at an angle that follows its tip along the bottom edge.
    const a = Math.PI / 2 + (0.5 - pos) * (Math.PI / 1.6);
    const half = (clamp(p('tailWidth', 0.18), 0.02, 0.9) * Math.PI) / 2;
    return new PathBuilder()
      .arc(cx, ery, w / 2, ery, a + half, a - half + 2 * Math.PI)
      .line(pos * w * 0.9 + w * 0.02, h)
      .close().subpaths;
  },
  tear: ({ w, h, cx }, p) => {
    // Tip at the top, round bottom. `point` makes the tip longer.
    const rr = 0.85 - clamp(p('point', 0.5), 0, 1) * 0.45;
    const c = 1 - rr;
    const alpha = Math.asin(rr / (c + 1));
    const ux = (x: number) => cx + (x / rr) * (w / 2);
    const uy = (y: number) => ((y + 1) / 2) * h;
    const tr: Vec = [Math.cos(-alpha) * rr, c + Math.sin(-alpha) * rr];
    return new PathBuilder()
      .move(cx, 0)
      .line(ux(tr[0]), uy(tr[1]))
      .arc(cx, uy(c), w / 2, (rr * h) / 2, -alpha, Math.PI + alpha)
      .close().subpaths;
  },
  heart: ({ w, h }, p) => {
    const dip = 0.12 + clamp(p('cleft', 0.5), 0, 1) * 0.22;
    const P = (x: number, y: number): Vec => [x * w, y * h];
    const b = new PathBuilder().move(...P(0.5, dip));
    const c = (a: Vec, bb: Vec, e: Vec) => b.cubic(P(...a), P(...bb), ...P(...e));
    c([0.5, dip - 0.12], [0.38, 0], [0.26, 0]);
    c([0.1, 0], [0, 0.13], [0, 0.32]);
    c([0, 0.58], [0.3, 0.76], [0.5, 1]);
    c([0.7, 0.76], [1, 0.58], [1, 0.32]);
    c([1, 0.13], [0.9, 0], [0.74, 0]);
    c([0.62, 0], [0.5, dip - 0.12], [0.5, dip]);
    return b.close().subpaths;
  },
  shield: ({ w, h, cx }, p) => {
    const k = clamp(1 - p('point', 0.55), 0.05, 0.95) * h;
    return new PathBuilder()
      .move(0, 0)
      .line(w, 0)
      .line(w, k)
      .cubic([w, k + (h - k) * 0.55], [w * 0.78, h * 0.9], cx, h)
      .cubic([w * 0.22, h * 0.9], [0, k + (h - k) * 0.55], 0, k)
      .close().subpaths;
  },
  spiral: (box, p) => {
    const turns = clamp(p('turns', 3), 0.5, 12);
    const inner = clamp(p('inner', 0.08), 0, 0.9);
    const steps = Math.max(4, Math.round(turns * 8));
    const pts = Array.from({ length: steps + 1 }, (_, i): Vec => {
      const t = i / steps;
      return onEllipse(box, -Math.PI / 2 + t * turns * 2 * Math.PI, inner + (1 - inner) * t);
    });
    return [smoothOpen(pts)];
  },
} satisfies Record<string, ShapeGen>;
