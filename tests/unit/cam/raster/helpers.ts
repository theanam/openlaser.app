import type { RasterSource } from '$lib/cam/types';

/** An RGBA image where every pixel comes from `pixel(x, y)` → [r, g, b, a]. */
export function makeSource(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): RasterSource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

/** Opaque gray image from a gray value per pixel. */
export function graySource(
  width: number,
  height: number,
  gray: (x: number, y: number) => number,
): RasterSource {
  return makeSource(width, height, (x, y) => {
    const g = gray(x, y);
    return [g, g, g, 255];
  });
}
