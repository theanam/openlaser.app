/* Image Trace: pixels in, colored vector layers out. Pure and synchronous; the worker runs it off the main
   thread. Pipeline: denoise → palette and labels → cleanup → per-layer masks → loops → curves. */
import { loopToSubpath, type CurveOptions } from './curves';
import { traceLoops } from './contour';
import { quantize, type Rgb } from './quantize';
import { majority, mergeSpeckles } from './regions';
import type { Pixels, TraceLayer, TraceOptions, TraceResult } from './types';

/** Separable box blur of the color channels; alpha is kept. */
export function boxBlur(px: Pixels, radius: number): Pixels {
  const r = Math.round(radius);
  if (r <= 0) return px;
  const { width: w, height: h } = px;
  const src = px.data;
  const tmp = new Float32Array(w * h * 3);
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let n = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) {
        const i = (y * w + k) * 4;
        s0 += src[i];
        s1 += src[i + 1];
        s2 += src[i + 2];
        n++;
      }
      const o = (y * w + x) * 3;
      tmp[o] = s0 / n;
      tmp[o + 1] = s1 / n;
      tmp[o + 2] = s2 / n;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let n = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) {
        const o = (k * w + x) * 3;
        s0 += tmp[o];
        s1 += tmp[o + 1];
        s2 += tmp[o + 2];
        n++;
      }
      const i = (y * w + x) * 4;
      out[i] = s0 / n;
      out[i + 1] = s1 / n;
      out[i + 2] = s2 / n;
      out[i + 3] = src[i + 3];
    }
  return { width: w, height: h, data: out };
}

export function curveOptions(o: Pick<TraceOptions, 'smoothness' | 'corners'>): CurveOptions {
  const s = Math.max(0, Math.min(100, o.smoothness));
  return {
    error: 0.3 + (s / 100) * 1.8,
    smoothing: s < 25 ? 0 : s < 60 ? 1 : 2,
    cornerAngle: o.corners <= 0 ? 0 : 90 + Math.min(100, o.corners) * 0.7,
  };
}

/** The label that owns most of the image border, when it owns at least 40% of it. */
export function borderLabel(labels: Int16Array, w: number, h: number): number {
  const tally = new Map<number, number>();
  let n = 0;
  const see = (i: number) => {
    const l = labels[i];
    n++;
    if (l >= 0) tally.set(l, (tally.get(l) ?? 0) + 1);
  };
  for (let x = 0; x < w; x++) {
    see(x);
    see((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    see(y * w);
    see(y * w + w - 1);
  }
  let best = -1;
  let bestN = 0;
  for (const [l, c] of tally) if (c > bestN) [best, bestN] = [l, c];
  return bestN >= n * 0.4 ? best : -1;
}

export function traceImage(
  input: Pixels,
  o: TraceOptions,
  progress: (p: number) => void = () => {},
): TraceResult {
  const { width: w, height: h } = input;
  const px = boxBlur(input, o.denoise);
  const { labels: raw, palette } = quantize(px, o.mode, o.colors, o.threshold);
  progress(0.2);
  let labels = raw;
  if (o.speckle > 0) labels = majority(labels, w, h);
  labels = mergeSpeckles(labels, w, h, Math.max(1, o.speckle), palette);
  progress(0.4);

  // Area and bounds per label.
  const k = palette.length;
  const area = new Float64Array(k);
  const box = Array.from({ length: k }, () => [w, h, -1, -1]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = labels[y * w + x];
      if (l < 0) continue;
      area[l]++;
      const b = box[l];
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }

  // Bottom to top: the border color (when present), then by area, largest first.
  const bg = o.mode === 'bw' ? 1 : borderLabel(labels, w, h);
  const order = [...Array(k).keys()]
    .filter((l) => area[l] > 0)
    .sort((a, b) => (a === bg ? -1 : b === bg ? 1 : area[b] - area[a]));
  const rank = new Int16Array(k).fill(-1);
  order.forEach((l, r) => (rank[l] = r));
  const skip = (l: number) => (o.mode === 'bw' ? l !== 0 : o.ignoreBackground && l === bg);

  const curves = curveOptions(o);
  const layers: TraceLayer[] = [];
  let nodes = 0;
  order.forEach((label, r) => {
    progress(0.4 + (0.6 * r) / order.length);
    if (skip(label)) return;
    // Stacked layers reach a little under every region painted above them, so neighbors never leave a
    // gap, while each boundary still belongs to exactly one visible layer.
    const stacked = o.stacked && o.mode !== 'bw';
    // The lowest visible layer is the backdrop: it covers every region above it, edge to edge.
    const base = stacked && r === order.findIndex((l) => !skip(l));
    const grow = stacked ? (base ? Math.max(w, h) : STACK_OVERLAP) : 0;
    const b = box[label];
    const x0 = Math.max(0, b[0] - grow);
    const y0 = Math.max(0, b[1] - grow);
    const bw = Math.min(w - 1, b[2] + grow) - x0 + 1;
    const bh = Math.min(h - 1, b[3] + grow) - y0 + 1;
    let mask = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const l = labels[(y + y0) * w + x + x0];
        if (l === label || (base && l >= 0 && rank[l] > r)) mask[y * bw + x] = 1;
      }
    for (let g = 0; g < (base ? 0 : grow); g++) {
      const next = mask.slice();
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
          const i = y * bw + x;
          if (mask[i]) continue;
          const l = labels[(y + y0) * w + x + x0];
          if (l < 0 || rank[l] <= r) continue;
          if (
            (x > 0 && mask[i - 1]) ||
            (x < bw - 1 && mask[i + 1]) ||
            (y > 0 && mask[i - bw]) ||
            (y < bh - 1 && mask[i + bw]) ||
            (x > 0 && y > 0 && mask[i - bw - 1]) ||
            (x < bw - 1 && y > 0 && mask[i - bw + 1]) ||
            (x > 0 && y < bh - 1 && mask[i + bw - 1]) ||
            (x < bw - 1 && y < bh - 1 && mask[i + bw + 1])
          )
            next[i] = 1;
        }
      mask = next;
    }
    const subpaths = traceLoops(mask, bw, bh).map((loop) => {
      const sp = loopToSubpath(loop, curves);
      for (const n of sp.nodes) {
        n.x += x0;
        n.y += y0;
        if (n.in) n.in = [n.in[0] + x0, n.in[1] + y0];
        if (n.out) n.out = [n.out[0] + x0, n.out[1] + y0];
      }
      nodes += sp.nodes.length;
      return sp;
    });
    if (subpaths.length) layers.push({ color: toUnit(palette[label]), subpaths, area: area[label] });
  });
  progress(1);
  return { width: w, height: h, layers, nodes };
}

/** How far (in pixels) a stacked layer reaches under the layers above it. */
const STACK_OVERLAP = 2;

const toUnit = (c: Rgb) => ({ r: c[0] / 255, g: c[1] / 255, b: c[2] / 255 });
