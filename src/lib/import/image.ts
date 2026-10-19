import type { RasterSource } from '../cam/types';
import { IMAGE_EXTENSIONS } from '../config/app';
import type { ImageDpi } from './image-metadata';

export { readImageDpi, sniffImageMime, type ImageDpi } from './image-metadata';

/** Used when an image carries no resolution metadata: 0.1 mm per pixel. */
export const DEFAULT_IMAGE_DPI = 254;

export const ACCEPTED_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/gif',
] as const;

/** True for file names with a raster image extension we accept (PNG, JPEG, WebP, AVIF, BMP, GIF). */
export function isImageFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export interface ImageSize {
  /** mm */
  width: number;
  height: number;
  /** True when the size was reduced to fit the bed. */
  clamped: boolean;
}

/**
 * Initial object size for an imported image (SPEC §5.2): pixel count at the embedded resolution,
 * or at 254 DPI without metadata, then scaled down uniformly to fit the bed if needed.
 */
export function defaultImageSize(
  pixels: { width: number; height: number },
  dpi: ImageDpi | null,
  bed: { width: number; height: number },
): ImageSize {
  const width = (pixels.width * 25.4) / (dpi?.x ?? DEFAULT_IMAGE_DPI);
  const height = (pixels.height * 25.4) / (dpi?.y ?? DEFAULT_IMAGE_DPI);
  const fit = Math.min(1, bed.width / width, bed.height / height);
  return { width: width * fit, height: height * fit, clamped: fit < 1 };
}

/**
 * Decodes an image (first frame for GIF) to RGBA in the browser. Kept separate from the pure
 * helpers above so they stay testable without a DOM. Colors are not premultiplied and no
 * color-space conversion is applied, so pixel values match the file.
 */
export async function decodeImage(blob: Blob): Promise<RasterSource> {
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a 2D canvas to decode the image.');
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: imageData.width, height: imageData.height, data: imageData.data };
  } finally {
    bitmap.close();
  }
}
