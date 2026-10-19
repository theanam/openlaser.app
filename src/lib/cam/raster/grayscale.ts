import type { RasterSource } from '../types';

/**
 * Single-channel working image. Luminance is stored premultiplied by alpha so that resampling
 * averages color by coverage (a half-transparent edge pixel does not darken its neighbours).
 */
export interface GrayImage {
  width: number;
  height: number;
  /** Luminance 0..255 multiplied by alpha. */
  luma: Float32Array;
  /** Coverage 0..1 per pixel, or null when the whole image is opaque. */
  alpha: Float32Array | null;
}

const R_WEIGHT = 0.2126;
const G_WEIGHT = 0.7152;
const B_WEIGHT = 0.0722;

/** RGBA → luminance (Rec. 709 weights) plus coverage. Opaque images skip the alpha channel. */
export function toGrayscale(source: RasterSource): GrayImage {
  const { width, height, data } = source;
  const count = width * height;
  const luma = new Float32Array(count);
  let opaque = true;
  for (let i = 0, p = 3; i < count; i++, p += 4) {
    if (data[p] !== 255) {
      opaque = false;
      break;
    }
  }
  const alpha = opaque ? null : new Float32Array(count);
  for (let i = 0, p = 0; i < count; i++, p += 4) {
    const y = R_WEIGHT * data[p] + G_WEIGHT * data[p + 1] + B_WEIGHT * data[p + 2];
    if (alpha) {
      const a = data[p + 3] / 255;
      alpha[i] = a;
      luma[i] = y * a;
    } else {
      luma[i] = y;
    }
  }
  return { width, height, luma, alpha };
}
