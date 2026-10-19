/* Label-map cleanup: a majority filter for ragged edges, then connected regions that are too small, or
   thin rims whose color sits between their neighbors (anti-aliasing), merge into the neighbor they share
   the longest border with. */
import { toOklab } from './oklab';
import type { Rgb } from './quantize';

/** One pass of a 3×3 majority filter: a pixel flips when at least 6 of its 8 neighbors agree on another label. */
export function majority(labels: Int16Array, w: number, h: number): Int16Array {
  const out = labels.slice();
  const counts = new Map<number, number>();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const self = labels[i];
      if (self < 0) continue;
      counts.clear();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const l = labels[i + dy * w + dx];
          if (l !== self && l >= 0) counts.set(l, (counts.get(l) ?? 0) + 1);
        }
      for (const [l, n] of counts) if (n >= 6) out[i] = l;
    }
  }
  return out;
}

export type Region = { label: number; area: number; perimeter: number; start: number; end: number };

/** 4-connected regions. `order` lists pixel indices region by region; `regionOf` maps pixel → region. */
export function findRegions(labels: Int16Array, w: number, h: number) {
  const total = w * h;
  const regionOf = new Int32Array(total).fill(-1);
  const order = new Int32Array(total);
  const regions: Region[] = [];
  let at = 0;
  for (let s = 0; s < total; s++) {
    if (regionOf[s] >= 0) continue;
    const label = labels[s];
    const id = regions.length;
    const start = at;
    regionOf[s] = id;
    order[at++] = s;
    let perimeter = 0;
    for (let q = start; q < at; q++) {
      const i = order[q];
      const x = i % w;
      const visit = (j: number, inside: boolean) => {
        if (!inside || labels[j] !== label) {
          perimeter++;
          return;
        }
        if (regionOf[j] < 0) {
          regionOf[j] = id;
          order[at++] = j;
        }
      };
      visit(i - 1, x > 0);
      visit(i + 1, x < w - 1);
      visit(i - w, i >= w);
      visit(i + w, i < total - w);
    }
    regions.push({ label, area: at - start, perimeter, start, end: at });
  }
  return { regions, regionOf, order };
}

function labDistance(a: Rgb, b: Rgb) {
  const p = new Float32Array(6);
  toOklab(Math.round(a[0]), Math.round(a[1]), Math.round(a[2]), p, 0);
  toOklab(Math.round(b[0]), Math.round(b[1]), Math.round(b[2]), p, 3);
  return Math.hypot(p[0] - p[3], p[1] - p[4], p[2] - p[5]);
}

/**
 * Merge regions smaller than `minArea`, and thin in-between rims, into their neighbors. Transparent
 * pixels (-1) never grow, but tiny opaque islands surrounded only by transparency are cleared.
 */
export function mergeSpeckles(
  labels: Int16Array,
  w: number,
  h: number,
  minArea: number,
  palette: Rgb[],
  passes = 2,
): Int16Array {
  const out = labels.slice();
  const between = new Map<string, boolean>();
  const isBetween = (c: number, a: number, b: number) => {
    const key = `${c}|${a}|${b}`;
    let v = between.get(key);
    if (v === undefined) {
      const ab = labDistance(palette[a], palette[b]);
      v = labDistance(palette[a], palette[c]) + labDistance(palette[c], palette[b]) < ab * 1.25 + 0.01;
      between.set(key, v);
    }
    return v;
  };
  for (let pass = 0; pass < passes; pass++) {
    const { regions, regionOf, order } = findRegions(out, w, h);
    const queue = regions
      .map((r, id) => ({ r, id }))
      .filter(({ r }) => r.label >= 0)
      .sort((a, b) => a.r.area - b.r.area);
    let changed = false;
    const tally = new Map<number, number>();
    for (const { r, id } of queue) {
      const small = r.area < minArea;
      const thin = (2 * r.area) / r.perimeter < 1.3;
      if (!small && !thin) continue;
      tally.clear();
      for (let q = r.start; q < r.end; q++) {
        const i = order[q];
        const x = i % w;
        const see = (j: number, ok: boolean) => {
          if (!ok || regionOf[j] === id) return;
          const l = out[j];
          if (l !== r.label) tally.set(l, (tally.get(l) ?? 0) + 1);
        };
        see(i - 1, x > 0);
        see(i + 1, x < w - 1);
        see(i - w, i >= w);
        see(i + w, i < w * h - w);
      }
      let best = -2;
      let bestN = 0;
      let second = -2;
      for (const [l, n] of tally) {
        if (l < 0) continue;
        if (n > bestN) {
          second = best;
          best = l;
          bestN = n;
        } else if (second === -2 || n > (tally.get(second) ?? 0)) second = l;
      }
      if (best === -2) {
        if (!small || !tally.has(-1)) continue;
        best = -1; // an opaque island in transparency
      } else if (!small && r.area >= minArea * 4) {
        // A long thin rim only goes when its color is a blend of the colors on either side.
        if (second < 0 || !isBetween(r.label, best, second)) continue;
      }
      for (let q = r.start; q < r.end; q++) out[order[q]] = best;
      changed = true;
    }
    if (!changed) break;
  }
  return out;
}
