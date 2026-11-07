import type { GrayImage } from './grayscale';

/**
 * Per-axis sampling taps: output sample i reads `index[offsets[i] .. offsets[i+1])` with the
 * matching weights. Separable filtering keeps the cost linear in the number of taps.
 */
interface AxisTaps {
  offsets: Int32Array;
  index: Int32Array;
  weight: Float32Array;
}

/**
 * Downsampling uses area averaging (each source pixel contributes by the length it overlaps the
 * output pixel), so detail is integrated instead of aliased. Upsampling uses bilinear
 * interpolation on pixel centers, which is exact when the sizes are equal.
 */
function axisTaps(srcLen: number, dstLen: number): AxisTaps {
  const offsets = new Int32Array(dstLen + 1);
  const index: number[] = [];
  const weight: number[] = [];
  const scale = srcLen / dstLen;
  for (let i = 0; i < dstLen; i++) {
    offsets[i] = index.length;
    if (dstLen < srcLen) {
      const lo = i * scale;
      const hi = (i + 1) * scale;
      const last = Math.min(srcLen, Math.ceil(hi - 1e-9));
      for (let j = Math.floor(lo); j < last; j++) {
        const coverage = Math.min(hi, j + 1) - Math.max(lo, j);
        if (coverage > 0) {
          index.push(j);
          weight.push(coverage / scale);
        }
      }
    } else {
      const s = Math.min(srcLen - 1, Math.max(0, (i + 0.5) * scale - 0.5));
      const j0 = Math.floor(s);
      const t = s - j0;
      index.push(j0);
      weight.push(1 - t);
      if (t > 0) {
        index.push(Math.min(j0 + 1, srcLen - 1));
        weight.push(t);
      }
    }
  }
  offsets[dstLen] = index.length;
  return { offsets, index: Int32Array.from(index), weight: Float32Array.from(weight) };
}

function resampleChannel(
  input: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  xTaps: AxisTaps,
  yTaps: AxisTaps,
): Float32Array {
  const horizontal = new Float32Array(dstW * srcH);
  for (let y = 0; y < srcH; y++) {
    const rowIn = y * srcW;
    const rowOut = y * dstW;
    for (let x = 0; x < dstW; x++) {
      let sum = 0;
      for (let t = xTaps.offsets[x]; t < xTaps.offsets[x + 1]; t++) {
        sum += input[rowIn + xTaps.index[t]] * xTaps.weight[t];
      }
      horizontal[rowOut + x] = sum;
    }
  }
  const output = new Float32Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const rowOut = y * dstW;
    for (let t = yTaps.offsets[y]; t < yTaps.offsets[y + 1]; t++) {
      const rowIn = yTaps.index[t] * dstW;
      const w = yTaps.weight[t];
      for (let x = 0; x < dstW; x++) output[rowOut + x] += horizontal[rowIn + x] * w;
    }
  }
  return output;
}

/** Resamples to `width × height` pixels (the engraving grid). Both sizes must be ≥ 1. */
export function resampleGray(image: GrayImage, width: number, height: number): GrayImage {
  if (width === image.width && height === image.height) return image;
  const xTaps = axisTaps(image.width, width);
  const yTaps = axisTaps(image.height, height);
  const run = (channel: Float32Array) =>
    resampleChannel(channel, image.width, image.height, width, height, xTaps, yTaps);
  return {
    width,
    height,
    luma: run(image.luma),
    alpha: image.alpha ? run(image.alpha) : null,
  };
}
