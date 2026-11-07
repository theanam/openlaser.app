import type { ImageSettings } from '../../project/types';

/**
 * Default image settings. Owned by CAM because CAM interprets them; the importer's layer defaults
 * reuse this object so a new image layer and a layer without `image` settings behave the same.
 */
export const DEFAULT_IMAGE_SETTINGS: Readonly<ImageSettings> = Object.freeze({
  dpi: 254,
  algorithm: 'floyd-steinberg',
  threshold: 128,
  brightness: 0,
  contrast: 0,
  gamma: 1,
  invert: false,
  bidirectional: true,
  overscan: 2.5,
  scanAngle: 0,
  passThrough: false,
});
