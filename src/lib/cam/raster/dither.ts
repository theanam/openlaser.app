import type { DitherAlgorithm } from '../../project/types';

/**
 * Burn levels per pixel: 0 = no burn, 255 = full burn. Dithering algorithms produce only 0 or 255;
 * `grayscale` produces the whole range and the scanline stage maps it to minPower..power.
 */
export type BurnLevels = Uint8Array;

type DiffusionAlgorithm = 'floyd-steinberg' | 'atkinson' | 'jarvis' | 'stucki';

/** Error diffusion kernels as [dx, dy, weight]. dx is mirrored on right-to-left rows. */
const KERNELS: Record<DiffusionAlgorithm, ReadonlyArray<readonly [number, number, number]>> = {
  'floyd-steinberg': [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16],
    [0, 1, 5 / 16],
    [1, 1, 1 / 16],
  ],
  // Atkinson diffuses only 6/8 of the error on purpose: highlights and shadows stay clean.
  atkinson: [
    [1, 0, 1 / 8],
    [2, 0, 1 / 8],
    [-1, 1, 1 / 8],
    [0, 1, 1 / 8],
    [1, 1, 1 / 8],
    [0, 2, 1 / 8],
  ],
  jarvis: [
    [1, 0, 7 / 48],
    [2, 0, 5 / 48],
    [-2, 1, 3 / 48],
    [-1, 1, 5 / 48],
    [0, 1, 7 / 48],
    [1, 1, 5 / 48],
    [2, 1, 3 / 48],
    [-2, 2, 1 / 48],
    [-1, 2, 3 / 48],
    [0, 2, 5 / 48],
    [1, 2, 3 / 48],
    [2, 2, 1 / 48],
  ],
  stucki: [
    [1, 0, 8 / 42],
    [2, 0, 4 / 42],
    [-2, 1, 2 / 42],
    [-1, 1, 4 / 42],
    [0, 1, 8 / 42],
    [1, 1, 4 / 42],
    [2, 1, 2 / 42],
    [-2, 2, 1 / 42],
    [-1, 2, 2 / 42],
    [0, 2, 4 / 42],
    [1, 2, 2 / 42],
    [2, 2, 1 / 42],
  ],
};

/** Classic recursive 8×8 Bayer index matrix (values 0..63). */
const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20,
  62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

const MID_GRAY = 128;

/** `tone < threshold` burns. */
export function thresholdLevels(tone: Float32Array, threshold: number): BurnLevels {
  const out = new Uint8Array(tone.length);
  for (let i = 0; i < tone.length; i++) out[i] = tone[i] < threshold ? 255 : 0;
  return out;
}

/** Ordered dithering with the 8×8 Bayer matrix; thresholds are spread evenly over 0..255. */
export function orderedLevels(tone: Float32Array, width: number, height: number): BurnLevels {
  const out = new Uint8Array(tone.length);
  for (let y = 0; y < height; y++) {
    const bayerRow = (y & 7) * 8;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const limit = ((BAYER_8[bayerRow + (x & 7)] + 0.5) * 256) / 64;
      out[i] = tone[i] < limit ? 255 : 0;
    }
  }
  return out;
}

/** Linear burn intensity: black → 255, white → 0. */
export function grayscaleLevels(tone: Float32Array): BurnLevels {
  const out = new Uint8Array(tone.length);
  for (let i = 0; i < tone.length; i++) out[i] = Math.round(255 - tone[i]);
  return out;
}

/**
 * Error diffusion with serpentine scanning (even rows left→right, odd rows right→left with the
 * kernel mirrored), which avoids the diagonal "worm" artifacts of raster-order diffusion.
 */
export function diffusionLevels(
  tone: Float32Array,
  width: number,
  height: number,
  algorithm: DiffusionAlgorithm,
): BurnLevels {
  const kernel = KERNELS[algorithm];
  const taps = kernel.length;
  const kdx = Int32Array.from(kernel, (k) => k[0]);
  const kdy = Int32Array.from(kernel, (k) => k[1]);
  const kw = Float32Array.from(kernel, (k) => k[2]);
  const buffer = Float32Array.from(tone);
  const out = new Uint8Array(tone.length);
  for (let y = 0; y < height; y++) {
    const dir = y % 2 === 0 ? 1 : -1;
    for (let step = 0; step < width; step++) {
      const x = dir > 0 ? step : width - 1 - step;
      const i = y * width + x;
      const value = buffer[i];
      const burn = value < MID_GRAY;
      out[i] = burn ? 255 : 0;
      const error = value - (burn ? 0 : 255);
      if (error === 0) continue;
      for (let t = 0; t < taps; t++) {
        const nx = x + kdx[t] * dir;
        const ny = y + kdy[t];
        if (nx < 0 || nx >= width || ny >= height) continue;
        buffer[ny * width + nx] += error * kw[t];
      }
    }
  }
  return out;
}

export function burnLevels(
  tone: Float32Array,
  width: number,
  height: number,
  algorithm: DitherAlgorithm,
  threshold: number,
): BurnLevels {
  switch (algorithm) {
    case 'threshold':
      return thresholdLevels(tone, threshold);
    case 'ordered':
      return orderedLevels(tone, width, height);
    case 'grayscale':
      return grayscaleLevels(tone);
    default:
      return diffusionLevels(tone, width, height, algorithm);
  }
}
