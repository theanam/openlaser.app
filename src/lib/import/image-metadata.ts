/**
 * Minimal, dependency-free readers for image headers: MIME sniffing and embedded resolution
 * (PNG pHYs, JPEG JFIF density, JPEG EXIF XResolution/YResolution).
 */

export interface ImageDpi {
  x: number;
  y: number;
}

/** Resolutions outside this range are treated as junk metadata and ignored. */
const MIN_DPI = 10;
const MAX_DPI = 10_000;

export function sniffImageMime(bytes: Uint8Array): string | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith([0x42, 0x4d])) return 'image/bmp';
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  // ISO-BMFF: 'ftyp' box at offset 4 with an AVIF brand (still image or sequence).
  if (
    startsWith([0x66, 0x74, 0x79, 0x70], 4) &&
    (startsWith([0x61, 0x76, 0x69, 0x66], 8) || startsWith([0x61, 0x76, 0x69, 0x73], 8))
  )
    return 'image/avif';
  return null;
}

/** Embedded resolution in dots per inch, or null when absent, aspect-only, or implausible. */
export function readImageDpi(bytes: Uint8Array): ImageDpi | null {
  const mime = sniffImageMime(bytes);
  const dpi = mime === 'image/png' ? readPngDpi(bytes) : mime === 'image/jpeg' ? readJpegDpi(bytes) : null;
  if (!dpi) return null;
  const plausible = (v: number) => Number.isFinite(v) && v >= MIN_DPI && v <= MAX_DPI;
  return plausible(dpi.x) && plausible(dpi.y) ? dpi : null;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

/** PNG chunks after the 8-byte signature: length(4) type(4) data crc(4). pHYs unit 1 = per metre. */
function readPngDpi(bytes: Uint8Array): ImageDpi | null {
  const dv = view(bytes);
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = dv.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    if (type === 'pHYs' && length >= 9 && offset + 17 <= bytes.length) {
      if (bytes[offset + 16] !== 1) return null;
      return { x: dv.getUint32(offset + 8) * 0.0254, y: dv.getUint32(offset + 12) * 0.0254 };
    }
    if (type === 'IDAT' || type === 'IEND') return null;
    offset += 12 + length;
  }
  return null;
}

/** Walks JPEG marker segments up to the image data. JFIF density wins over EXIF when both exist. */
function readJpegDpi(bytes: Uint8Array): ImageDpi | null {
  const dv = view(bytes);
  let offset = 2;
  let exif: ImageDpi | null = null;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = dv.getUint16(offset + 2);
    const body = offset + 4;
    if (marker === 0xe0 && ascii(bytes, body, 5) === 'JFIF\0' && body + 12 <= bytes.length) {
      const units = bytes[body + 7];
      const x = dv.getUint16(body + 8);
      const y = dv.getUint16(body + 10);
      if (units === 1) return { x, y };
      if (units === 2) return { x: x * 2.54, y: y * 2.54 };
    } else if (marker === 0xe1 && ascii(bytes, body, 6) === 'Exif\0\0') {
      exif = readExifDpi(bytes.subarray(body + 6, Math.min(bytes.length, offset + 2 + length)));
    }
    offset += 2 + length;
  }
  return exif;
}

const TAG_X_RESOLUTION = 0x011a;
const TAG_Y_RESOLUTION = 0x011b;
const TAG_RESOLUTION_UNIT = 0x0128;

/** Reads IFD0 resolution tags from a TIFF structure (the EXIF payload). Unit 2 = inch, 3 = cm. */
function readExifDpi(tiff: Uint8Array): ImageDpi | null {
  if (tiff.length < 8) return null;
  const dv = view(tiff);
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const little = order === 'II';
  const ifd = dv.getUint32(4, little);
  if (ifd + 2 > tiff.length) return null;
  const entries = dv.getUint16(ifd, little);
  let x: number | null = null;
  let y: number | null = null;
  let unit = 2;
  for (let n = 0; n < entries; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > tiff.length) break;
    const tag = dv.getUint16(entry, little);
    if (tag === TAG_RESOLUTION_UNIT) {
      unit = dv.getUint16(entry + 8, little);
    } else if (tag === TAG_X_RESOLUTION || tag === TAG_Y_RESOLUTION) {
      const valueOffset = dv.getUint32(entry + 8, little);
      if (valueOffset + 8 > tiff.length) continue;
      const denominator = dv.getUint32(valueOffset + 4, little);
      if (denominator === 0) continue;
      const value = dv.getUint32(valueOffset, little) / denominator;
      if (tag === TAG_X_RESOLUTION) x = value;
      else y = value;
    }
  }
  if (x === null) return null;
  const toDpi = unit === 3 ? 2.54 : unit === 2 ? 1 : 0;
  if (toDpi === 0) return null;
  return { x: x * toDpi, y: (y ?? x) * toDpi };
}
