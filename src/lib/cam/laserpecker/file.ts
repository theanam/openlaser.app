/**
 * The LaserPecker raster job file: a 64-byte header and the image, 1 byte or 1 bit per pixel.
 * Layout from the LaserPecker protocol notes by nerdocs
 * (https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md). Implemented independently from
 * that description; no code from pyrograph is included.
 */
import type { JobBitmap } from './raster';

export const HEADER_BYTES = 64;
/** Header tags: one byte per pixel, or one bit per pixel. */
export const TAG_BYTES = 0x10;
export const TAG_BITS = 0x60;
const NAME_OFFSET = 34;
const NAME_BYTES = 29;

export interface RasterFileOptions {
  /** The device's step code for the resolution. */
  px: number;
  /** 1-bit packing, for firmware that takes it. */
  packed: boolean;
  name: string;
}

export interface RasterFile {
  /** Derived from the image and its placement, so a changed job never reuses a stored id. */
  id: number;
  /** Header followed by the image. */
  data: Uint8Array;
  /** Pixel position on the work area. */
  x: number;
  y: number;
}

/**
 * Unpacked: 0x00 burns, 0xFF skips. Packed: MSB first, 0 burns, 1 skips, each row padded to a
 * whole byte with skip bits.
 */
export function encodePayload(bitmap: JobBitmap, packed: boolean): Uint8Array {
  const { width, height, burn } = bitmap;
  if (!packed) return burn.map((b) => (b ? 0x00 : 0xff));
  const stride = Math.ceil(width / 8);
  const out = new Uint8Array(stride * height).fill(0xff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (burn[y * width + x]) out[y * stride + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
  }
  return out;
}

/** FNV-1a, 32 bits, over several buffers. */
export function fnv1a(...parts: Uint8Array[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) hash = Math.imul(hash ^ part[i], 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** UTF-8, cut on a character boundary. */
function nameBytes(name: string): Uint8Array {
  const encoder = new TextEncoder();
  let bytes = encoder.encode(name);
  let chars = [...name];
  while (bytes.length > NAME_BYTES) {
    chars = chars.slice(0, -1);
    bytes = encoder.encode(chars.join(''));
  }
  return bytes;
}

export function encodeRasterFile(bitmap: JobBitmap, options: RasterFileOptions): RasterFile {
  const payload = encodePayload(bitmap, options.packed);
  const header = new Uint8Array(HEADER_BYTES);
  const view = new DataView(header.buffer);
  header[0] = options.packed ? TAG_BITS : TAG_BYTES;
  view.setUint16(1, bitmap.width);
  view.setUint16(3, bitmap.height);
  header[9] = options.px;
  view.setUint16(10, bitmap.left);
  view.setUint16(12, bitmap.top);
  view.setUint16(14, Math.floor(bitmap.dpi));
  // Geometry and image only: the name does not change what burns.
  const id = fnv1a(header.subarray(0, NAME_OFFSET), payload) || 1;
  view.setUint32(5, id);
  header.set(nameBytes(options.name), NAME_OFFSET);
  const data = new Uint8Array(HEADER_BYTES + payload.length);
  data.set(header);
  data.set(payload, HEADER_BYTES);
  return { id, data, x: bitmap.left, y: bitmap.top };
}
