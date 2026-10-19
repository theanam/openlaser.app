import type { ImageSettings } from '../../project/types';
import type { GrayImage } from './grayscale';

export type ToneSettings = Pick<ImageSettings, 'brightness' | 'contrast' | 'gamma' | 'invert'>;

const NO_ADJUSTMENT: ToneSettings = { brightness: 0, contrast: 0, gamma: 1, invert: false };

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Applies brightness, contrast, gamma and invert (in that order) to the color, then composites
 * over white. Compositing last keeps transparent areas unburned even when the image is inverted.
 *
 * - brightness −100..100 shifts levels by up to ±255.
 * - contrast −100..100 uses the common `259(c+255) / 255(259−c)` curve around mid-gray.
 * - gamma follows image editors: `out = in^(1/gamma)`, so gamma > 1 lightens midtones.
 *
 * Returns tone values 0..255 where 255 is white (no burn).
 */
export function toneMap(image: GrayImage, settings: ToneSettings = NO_ADJUSTMENT): Float32Array {
  const { luma, alpha } = image;
  const count = luma.length;
  const out = new Float32Array(count);
  const shift = settings.brightness * 2.55;
  const c = settings.contrast * 2.55;
  const contrastFactor = (259 * (c + 255)) / (255 * (259 - c));
  const inverseGamma = 1 / settings.gamma;
  const applyGamma = settings.gamma !== 1;
  const adjust = shift !== 0 || settings.contrast !== 0 || applyGamma || settings.invert;
  for (let i = 0; i < count; i++) {
    const a = alpha ? alpha[i] : 1;
    if (a <= 1e-6) {
      out[i] = 255;
      continue;
    }
    let v = alpha ? luma[i] / a : luma[i];
    if (adjust) {
      v = clamp255(v + shift);
      v = clamp255(contrastFactor * (v - 128) + 128);
      if (applyGamma) v = 255 * Math.pow(v / 255, inverseGamma);
      if (settings.invert) v = 255 - v;
    }
    out[i] = clamp255(a * v + (1 - a) * 255);
  }
  return out;
}
