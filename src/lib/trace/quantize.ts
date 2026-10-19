/* Palette extraction and per-pixel labels. Color and gray modes cluster in OKLab with k-means++ on a
   weighted sample: pixels on flat areas count more than pixels on edges, so anti-aliased blends between
   two colors rarely earn a palette entry of their own. Black and white uses a luma threshold. */
import { luma, toOklab } from './oklab';
import type { Pixels, TraceMode } from './types';

/** sRGB 0–255 per channel. */
export type Rgb = [number, number, number];

export type Quantized = {
  /** Palette index per pixel; -1 for transparent pixels. */
  labels: Int16Array;
  palette: Rgb[];
};

const MAX_SAMPLES = 60_000;
const FLAT = 30;

/** Small deterministic PRNG so the same image and settings always trace the same way. */
export function rng(seed = 0x9e3779b9) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const opaque = (d: Uint8ClampedArray, i: number) => d[i * 4 + 3] >= 128;

/** Otsu's threshold over the luma histogram of opaque pixels. */
export function otsu(px: Pixels): number {
  const hist = new Float64Array(256);
  const d = px.data;
  let n = 0;
  for (let i = 0; i < px.width * px.height; i++) {
    if (!opaque(d, i)) continue;
    hist[Math.round(luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]))]++;
    n++;
  }
  if (!n) return 128;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let at = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      at = t;
    }
  }
  return at + 0.5;
}

/** Weighted k-means++ in 3D. `pts` holds n×3 values. Returns k×3 centers (fewer if there are fewer points). */
export function kmeans(pts: Float32Array, weights: Float32Array, k: number, iterations = 10, seed?: number) {
  const n = weights.length;
  const random = rng(seed);
  k = Math.min(k, n);
  const centers = new Float32Array(k * 3);
  if (!k) return centers;
  const d2 = new Float32Array(n).fill(Infinity);
  const near = (i: number, c: number) => {
    const a = pts[i * 3] - centers[c * 3];
    const b = pts[i * 3 + 1] - centers[c * 3 + 1];
    const e = pts[i * 3 + 2] - centers[c * 3 + 2];
    return a * a + b * b + e * e;
  };
  // k-means++ seeding: each new center is drawn with probability ∝ weight × distance².
  let first = 0;
  let wsum = 0;
  for (let i = 0; i < n; i++) wsum += weights[i];
  let pick = random() * wsum;
  for (let i = 0; i < n; i++)
    if ((pick -= weights[i]) <= 0) {
      first = i;
      break;
    }
  centers.set(pts.subarray(first * 3, first * 3 + 3), 0);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      d2[i] = Math.min(d2[i], near(i, c - 1));
      total += d2[i] * weights[i];
    }
    if (total <= 0) return centers.slice(0, c * 3);
    pick = random() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++)
      if ((pick -= d2[i] * weights[i]) <= 0) {
        chosen = i;
        break;
      }
    centers.set(pts.subarray(chosen * 3, chosen * 3 + 3), c * 3);
  }
  const sums = new Float64Array(k * 4);
  for (let it = 0; it < iterations; it++) {
    sums.fill(0);
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = near(i, c);
        if (dd < bd) {
          bd = dd;
          best = c;
        }
      }
      const w = weights[i];
      sums[best * 4] += pts[i * 3] * w;
      sums[best * 4 + 1] += pts[i * 3 + 1] * w;
      sums[best * 4 + 2] += pts[i * 3 + 2] * w;
      sums[best * 4 + 3] += w;
    }
    let moved = 0;
    for (let c = 0; c < k; c++) {
      const w = sums[c * 4 + 3];
      if (!w) continue;
      for (let j = 0; j < 3; j++) {
        const v = sums[c * 4 + j] / w;
        moved = Math.max(moved, Math.abs(v - centers[c * 3 + j]));
        centers[c * 3 + j] = v;
      }
    }
    if (moved < 1e-4) break;
  }
  return centers;
}

function flatAt(px: Pixels, x: number, y: number): boolean {
  const d = px.data;
  const i = (y * px.width + x) * 4;
  let diff = 0;
  const cmp = (j: number) => {
    diff = Math.max(
      diff,
      Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]),
    );
  };
  if (x > 0) cmp(i - 4);
  if (x < px.width - 1) cmp(i + 4);
  if (y > 0) cmp(i - px.width * 4);
  if (y < px.height - 1) cmp(i + px.width * 4);
  return diff < FLAT;
}

export function quantize(px: Pixels, mode: TraceMode, colors: number, threshold = -1): Quantized {
  const { width: w, height: h, data: d } = px;
  const total = w * h;
  const labels = new Int16Array(total);

  if (mode === 'bw') {
    const t = threshold < 0 ? otsu(px) : threshold;
    for (let i = 0; i < total; i++)
      labels[i] = !opaque(d, i) ? -1 : luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) < t ? 0 : 1;
    return {
      labels,
      palette: [
        [0, 0, 0],
        [255, 255, 255],
      ],
    };
  }

  const gray = mode === 'gray';
  const rgbOf = (i: number): Rgb => {
    if (!gray) return [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
    const g = Math.round(luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]));
    return [g, g, g];
  };

  // Sample on a grid so large images stay fast.
  let opaqueCount = 0;
  for (let i = 0; i < total; i++) if (opaque(d, i)) opaqueCount++;
  const stride = Math.max(1, Math.sqrt(opaqueCount / MAX_SAMPLES));
  const pts: number[] = [];
  const wts: number[] = [];
  const lab = new Float32Array(3);
  for (let fy = 0; fy < h; fy += stride) {
    const y = Math.floor(fy);
    for (let fx = 0; fx < w; fx += stride) {
      const x = Math.floor(fx);
      const i = y * w + x;
      if (!opaque(d, i)) continue;
      const [r, g, b] = rgbOf(i);
      toOklab(r, g, b, lab);
      pts.push(lab[0], lab[1], lab[2]);
      wts.push(flatAt(px, x, y) ? 1 : 0.3);
    }
  }
  const centers = kmeans(new Float32Array(pts), new Float32Array(wts), Math.max(1, Math.min(64, colors)));
  const k = centers.length / 3;
  if (!k) {
    labels.fill(-1);
    return { labels, palette: [] };
  }

  // Assign every pixel through a cache keyed by 6-bit channels.
  const cache = new Int16Array(1 << 18).fill(-1);
  const sums = new Float64Array(k * 8); // all r,g,b,n then flat r,g,b,n
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!opaque(d, i)) {
        labels[i] = -1;
        continue;
      }
      const [r, g, b] = rgbOf(i);
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let c = cache[key];
      if (c < 0) {
        toOklab(r, g, b, lab);
        let bd = Infinity;
        for (let j = 0; j < k; j++) {
          const a0 = lab[0] - centers[j * 3];
          const a1 = lab[1] - centers[j * 3 + 1];
          const a2 = lab[2] - centers[j * 3 + 2];
          const dd = a0 * a0 + a1 * a1 + a2 * a2;
          if (dd < bd) {
            bd = dd;
            c = j;
          }
        }
        cache[key] = c;
      }
      labels[i] = c;
      const o = c * 8 + (flatAt(px, x, y) ? 4 : 0);
      sums[o] += r;
      sums[o + 1] += g;
      sums[o + 2] += b;
      sums[o + 3]++;
      if (o % 8) {
        sums[c * 8] += r;
        sums[c * 8 + 1] += g;
        sums[c * 8 + 2] += b;
        sums[c * 8 + 3]++;
      }
    }
  }

  // Palette colors are the mean of each cluster's pixels, from flat areas when it has enough of them.
  const remap = new Int16Array(k).fill(-1);
  const palette: Rgb[] = [];
  for (let c = 0; c < k; c++) {
    const all = sums[c * 8 + 3];
    if (!all) continue;
    const flat = sums[c * 8 + 7];
    const o = flat >= Math.max(4, all * 0.1) ? c * 8 + 4 : c * 8;
    const n = sums[o + 3];
    remap[c] = palette.length;
    palette.push([sums[o] / n, sums[o + 1] / n, sums[o + 2] / n]);
  }
  for (let i = 0; i < total; i++) if (labels[i] >= 0) labels[i] = remap[labels[i]];
  return { labels, palette };
}
