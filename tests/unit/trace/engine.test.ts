import { describe, expect, it } from 'vitest';
import { loopArea, traceLoops } from '$lib/trace/contour';
import { findCorners, loopToSubpath, outlinePoints } from '$lib/trace/curves';
import { kmeans, otsu, quantize, rng } from '$lib/trace/quantize';
import { findRegions, majority, mergeSpeckles } from '$lib/trace/regions';
import { borderLabel, boxBlur, curveOptions, traceImage } from '$lib/trace/trace';
import { TRACE_PRESETS, tracePreset } from '$lib/trace/presets';
import { flattenSubpath } from '$lib/trace/geom';
import type { TraceOptions } from '$lib/trace/types';
import { box, disc, insideLoops, picture } from './fixtures';

const maskOf = (w: number, h: number, f: (x: number, y: number) => boolean) => {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (f(x, y)) m[y * w + x] = 1;
  return m;
};

// The laser presets turn stacking off; the engine tests keep curvesmith's stacked default.
const opts = (patch: Partial<TraceOptions> = {}): TraceOptions => ({
  ...tracePreset('logo').options,
  stacked: true,
  ...patch,
});

describe('contour tracing', () => {
  it('traces a rectangle as one clockwise loop of four corners', () => {
    const loops = traceLoops(
      maskOf(6, 5, (x, y) => x >= 1 && x < 5 && y >= 1 && y < 4),
      6,
      5,
    );
    expect(loops).toHaveLength(1);
    expect([...loops[0]]).toEqual([1, 1, 5, 1, 5, 4, 1, 4]);
    expect(loopArea(loops[0])).toBe(12);
  });

  it('gives holes their own loop running the other way', () => {
    const ring = maskOf(7, 7, (x, y) => x >= 1 && x < 6 && y >= 1 && y < 6 && !(x === 3 && y === 3));
    const loops = traceLoops(ring, 7, 7);
    expect(loops).toHaveLength(2);
    expect(loops.map((l) => Math.sign(loopArea(l))).sort()).toEqual([-1, 1]);
  });

  it('keeps diagonal neighbors apart', () => {
    const loops = traceLoops(
      maskOf(2, 2, (x, y) => x === y),
      2,
      2,
    );
    expect(loops).toHaveLength(2);
  });

  it('reproduces any mask under the even-odd rule', () => {
    const random = rng(7);
    for (let trial = 0; trial < 20; trial++) {
      const w = 12;
      const h = 9;
      const m = maskOf(w, h, () => random() < 0.45);
      const loops = traceLoops(m, w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) expect(insideLoops(loops, x + 0.5, y + 0.5)).toBe(m[y * w + x] === 1);
    }
  });
});

describe('curve fitting', () => {
  const circle = (r: number) => {
    const s = r * 2 + 6;
    return {
      s,
      loop: traceLoops(
        maskOf(s, s, (x, y) => (x + 0.5 - s / 2) ** 2 + (y + 0.5 - s / 2) ** 2 < r * r),
        s,
        s,
      )[0],
    };
  };

  it('fits a circle with four smooth nodes at its extremes', () => {
    const { s, loop } = circle(40);
    const sp = loopToSubpath(loop, curveOptions({ smoothness: 40, corners: 55 }));
    expect(sp.closed).toBe(true);
    expect(sp.nodes).toHaveLength(4);
    expect(sp.nodes.every((n) => n.kind === 'smooth')).toBe(true);
    for (const p of flattenSubpath(sp, 0.5))
      expect(Math.abs(Math.hypot(p[0] - s / 2, p[1] - s / 2) - 40)).toBeLessThan(1.2);
  });

  it('keeps rectangles square, with plain line segments', () => {
    const loop = traceLoops(
      maskOf(30, 20, (x, y) => x >= 3 && x < 27 && y >= 2 && y < 18),
      30,
      20,
    )[0];
    const sp = loopToSubpath(loop, curveOptions({ smoothness: 40, corners: 55 }));
    expect(sp.nodes.map((n) => [n.x, n.y])).toEqual([
      [3, 2],
      [27, 2],
      [27, 18],
      [3, 18],
    ]);
    expect(sp.nodes.every((n) => n.kind === 'sharp' && !n.in && !n.out)).toBe(true);
  });

  it('turns stair-stepped diagonals into straight lines', () => {
    const tri = maskOf(60, 50, (x, y) => y >= 5 && y < 45 && Math.abs(x + 0.5 - 30) < (y + 0.5 - 5) * 0.7);
    const sp = loopToSubpath(traceLoops(tri, 60, 50)[0], curveOptions({ smoothness: 30, corners: 70 }));
    expect(sp.nodes).toHaveLength(3);
    expect(sp.nodes.every((n) => !n.in && !n.out)).toBe(true);
  });

  it('finds no corners when corners are off', () => {
    const loop = traceLoops(
      maskOf(20, 20, (x, y) => x >= 2 && x < 18 && y >= 2 && y < 18),
      20,
      20,
    )[0];
    const { points, lattice } = outlinePoints(loop);
    expect(findCorners(points, lattice, 0)).toEqual([]);
    expect(findCorners(points, lattice, 120)).toHaveLength(4);
  });

  it('maps smoothness and corners to fitting settings', () => {
    expect(curveOptions({ smoothness: 0, corners: 0 })).toMatchObject({ smoothing: 0, cornerAngle: 0 });
    const loose = curveOptions({ smoothness: 100, corners: 100 });
    expect(loose.error).toBeGreaterThan(curveOptions({ smoothness: 20, corners: 50 }).error);
    expect(loose.cornerAngle).toBeGreaterThan(curveOptions({ smoothness: 20, corners: 50 }).cornerAngle);
  });
});

describe('palette and regions', () => {
  it('finds the threshold between two tones', () => {
    const px = picture(40, 20, [240, 240, 240, 255], [box(0, 0, 20, 20, [20, 20, 20, 255])]);
    const t = otsu(px);
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThan(240);
  });

  it('clusters points with weighted k-means++', () => {
    const pts = new Float32Array([0, 0, 0, 0.01, 0, 0, 1, 1, 1, 0.99, 1, 1]);
    const centers = kmeans(pts, new Float32Array(4).fill(1), 2);
    const sorted = [centers[0], centers[3]].sort();
    expect(sorted[0]).toBeCloseTo(0.005, 3);
    expect(sorted[1]).toBeCloseTo(0.995, 3);
  });

  it('keeps flat colors and drops anti-aliased blends from the palette', () => {
    const px = picture(
      80,
      60,
      [250, 250, 250, 255],
      [disc(25, 30, 15, [220, 30, 40, 255]), box(45, 10, 75, 50, [30, 80, 200, 255])],
    );
    const { labels, palette } = quantize(px, 'color', 3);
    expect(palette).toHaveLength(3);
    const hexes = palette.map((c) => c.map((v) => Math.round(v / 10)).join(','));
    expect(hexes).toEqual(expect.arrayContaining(['25,25,25', '22,3,4', '3,8,20']));
    expect(labels.every((l) => l >= 0)).toBe(true);
  });

  it('labels transparent pixels -1 and black-and-white as ink/paper', () => {
    const px = picture(
      10,
      10,
      [0, 0, 0, 0],
      [box(0, 0, 5, 10, [0, 0, 0, 255]), box(5, 0, 10, 5, [255, 255, 255, 255])],
    );
    const { labels } = quantize(px, 'bw', 2);
    expect(labels[0]).toBe(0);
    expect(labels[6]).toBe(1);
    expect(labels[99]).toBe(-1);
  });

  it('flips lone pixels with a majority filter', () => {
    const l = new Int16Array(25);
    l[12] = 1;
    expect(majority(l, 5, 5)[12]).toBe(0);
  });

  it('merges specks and thin blended rims into their neighbors', () => {
    const w = 20;
    const l = new Int16Array(w * w);
    l[5 * w + 5] = 1; // a speck
    for (let y = 0; y < w; y++) {
      l[y * w + 12] = 2; // a 1-pixel rim between 0 and 3
      for (let x = 13; x < w; x++) l[y * w + x] = 3;
    }
    const palette: [number, number, number][] = [
      [255, 255, 255],
      [255, 0, 0],
      [128, 128, 128],
      [0, 0, 0],
    ];
    const out = mergeSpeckles(l, w, w, 4, palette);
    expect(out[5 * w + 5]).toBe(0);
    expect(new Set(out)).toEqual(new Set([0, 3]));
    expect(findRegions(out, w, w).regions).toHaveLength(2);
  });

  it('clears opaque islands surrounded by transparency', () => {
    const l = new Int16Array(25).fill(-1);
    l[12] = 0;
    expect(mergeSpeckles(l, 5, 5, 4, [[0, 0, 0]])[12]).toBe(-1);
  });

  it('blurs color but keeps alpha', () => {
    const px = picture(4, 1, [0, 0, 0, 255], [box(2, 0, 4, 1, [255, 255, 255, 128])]);
    const out = boxBlur(px, 1);
    expect(out.data[4]).toBeGreaterThan(0);
    expect(out.data[11]).toBe(128);
    expect(boxBlur(px, 0)).toBe(px);
  });
});

describe('traceImage', () => {
  const scene = () =>
    picture(
      120,
      80,
      [250, 248, 240, 255],
      [disc(35, 40, 22, [220, 40, 60, 255]), box(70, 15, 110, 65, [30, 90, 200, 255])],
    );

  it('makes one layer per color, backdrop first and full size', () => {
    const r = traceImage(scene(), opts({ colors: 3 }));
    expect(r.layers).toHaveLength(3);
    expect(r.layers[0].color.r).toBeCloseTo(250 / 255, 1);
    const base = r.layers[0].subpaths[0].nodes.map((n) => [n.x, n.y]);
    expect(base).toEqual(
      expect.arrayContaining([
        [0, 0],
        [120, 0],
        [120, 80],
        [0, 80],
      ]),
    );
    expect(r.nodes).toBe(
      r.layers.reduce((n, l) => n + l.subpaths.reduce((m, s) => m + s.nodes.length, 0), 0),
    );
  });

  it('drops the border color on request', () => {
    const r = traceImage(scene(), opts({ colors: 3, ignoreBackground: true }));
    expect(r.layers).toHaveLength(2);
    expect(borderLabel(new Int16Array([1, 1, 1, 1, 0, 1, 1, 1, 1]), 3, 3)).toBe(1);
  });

  it('traces only the ink in black and white', () => {
    const r = traceImage(scene(), opts({ mode: 'bw', threshold: -1 }));
    expect(r.layers).toHaveLength(1);
    expect(r.layers[0].color).toEqual({ r: 0, g: 0, b: 0 });
    expect(r.layers[0].subpaths).toHaveLength(2);
  });

  it('places side-by-side regions without overlap when not stacked', () => {
    const r = traceImage(scene(), opts({ colors: 3, stacked: false }));
    const area = r.layers.reduce((a, l) => a + l.area, 0);
    expect(area).toBe(120 * 80);
  });

  it('is deterministic and reports progress', () => {
    const seen: number[] = [];
    const a = traceImage(scene(), opts(), (p) => seen.push(p));
    const b = traceImage(scene(), opts());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(seen.at(-1)).toBe(1);
    expect(seen).toEqual([...seen].sort((x, y) => x - y));
  });

  it('has a working preset for every kind of image', () => {
    for (const p of TRACE_PRESETS)
      expect(traceImage(scene(), p.options).layers.length, p.id).toBeGreaterThan(0);
  });
});
